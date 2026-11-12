import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabaseServer';

// Drafts a list of upcoming events at the watched venues.
//
// NOTHING THIS RETURNS IS TRUSTED. Every event is written as 'suggested' and
// counts towards nothing until a person confirms it on /events. A model will
// state a fixture date confidently and be wrong, and the output of this is used
// to email a client about a specific day — so the job here is to draft and cite,
// not to decide.
//
// Three things guard that:
//   1. web search is on, so answers come from pages rather than recall
//   2. every event must carry a source note, which is what makes checking possible
//   3. the server re-validates dates and venues before writing anything
//
// A long web-search turn can stop with stop_reason 'pause_turn'. The SDK does
// not auto-resume, so without the loop below a search would silently come back
// half-finished with no error.

// Web research with several searches per venue takes a while.
export const maxDuration = 300;

const MODEL = 'claude-opus-5-5';
const MAX_CONTINUATIONS = 5;
// Keeps one run bounded in both time and cost.
const MAX_VENUES = 40;

const SYSTEM = `You research upcoming public events at named venues for a signage company.
Their content team needs to know what is on, far enough ahead to ask the client for artwork.

Rules:
- Use web search. Do not answer from memory — fixture lists and event calendars change.
- Only include an event if you found it on a page during this search. If you could not
  find a venue's schedule, return nothing for that venue. Returning nothing is correct
  and useful; guessing is not.
- Every event must have a source_note naming where you found it (the site or page).
- Dates must be in YYYY-MM-DD form, and must fall inside the requested range.
- Use the venue_ref number given for each venue. Do not invent venue references.
- Prefer events that would change what is shown on screens: matchdays, concerts,
  race meetings, large conferences, big hospitality days.
- Do not include routine opening hours or recurring daily trade.
- If an event runs across several days, give the first day as date and the last as end_date.
  For a single-day event leave end_date as an empty string.
- Call record_events exactly once when you have finished searching, with everything you found.
  If you found nothing at all, call it with an empty list.`;

const RECORD_EVENTS_TOOL = {
  name: 'record_events',
  description: 'Record the events found for the venues. Call exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            venue_ref: { type: 'integer' },
            date: { type: 'string' },
            end_date: { type: 'string' },
            title: { type: 'string' },
            event_type: { type: 'string' },
            source_note: { type: 'string' },
          },
          required: ['venue_ref', 'date', 'end_date', 'title', 'event_type', 'source_note'],
          additionalProperties: false,
        },
      },
    },
    required: ['events'],
    additionalProperties: false,
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request) {
  const supabase = await createClient();

  // This endpoint spends money and writes rows, so it checks the session itself
  // rather than relying on the page that calls it.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role === 'client_viewer') {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI drafting is not configured on this deployment — ANTHROPIC_API_KEY is not set. You can still add events by hand.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const from = ISO_DATE.test(body.from || '') ? body.from : null;
  const to = ISO_DATE.test(body.to || '') ? body.to : null;
  if (!from || !to || to < from) {
    return NextResponse.json({ error: 'Give a valid date range.' }, { status: 400 });
  }

  // RLS applies as this user, so the watch list is the one they can see.
  const { data: venues, error: venueErr } = await supabase
    .from('event_venues')
    .select('id, name, kind, town, search_hint, clients(name)')
    .eq('active', true)
    .order('name', { ascending: true })
    .limit(MAX_VENUES);

  if (venueErr) {
    return NextResponse.json({ error: `Could not read the watch list: ${venueErr.message}` }, { status: 500 });
  }
  if (!venues || venues.length === 0) {
    return NextResponse.json(
      { error: 'No venues on the watch list yet. Add the venues you want watched first.' },
      { status: 400 }
    );
  }

  // What we already have, so the model isn't asked to re-find it and the reader
  // isn't shown the same fixture twice.
  const { data: known } = await supabase
    .from('venue_events')
    .select('venue_id, event_date, title')
    .gte('event_date', from)
    .lte('event_date', to);

  const byRef = new Map(venues.map((v, i) => [i + 1, v]));
  const venueLines = venues.map((v, i) => {
    const bits = [v.kind, v.town, v.clients?.name ? `client: ${v.clients.name}` : null]
      .filter(Boolean).join(', ');
    return `${i + 1}. ${v.name}${bits ? ` (${bits})` : ''}${v.search_hint ? ` — ${v.search_hint}` : ''}`;
  }).join('\n');

  const knownLines = (known || []).length
    ? (known || []).map((k) => {
        const v = venues.find((x) => x.id === k.venue_id);
        return `- ${v ? v.name : 'venue'} ${k.event_date}: ${k.title}`;
      }).join('\n')
    : '(none yet)';

  const prompt = `Find public events between ${from} and ${to} at these venues:

${venueLines}

Already known, so do not repeat these:
${knownLines}

Search each venue's own fixtures or what's-on page where you can. Then call record_events once.`;

  const anthropic = new Anthropic();

  let messages = [{ role: 'user', content: prompt }];
  let drafted = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let failure = null;

  try {
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn += 1) {
      const res = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // Routes around a safety refusal rather than returning nothing. Research
        // like this is very unlikely to trip one, but the failure is silent
        // otherwise.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high' },
        thinking: { type: 'adaptive' },
        system: SYSTEM,
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: 24 },
          RECORD_EVENTS_TOOL,
        ],
        // Forced tool choice is rejected on this model, so the system prompt
        // names the tool instead and `strict` keeps the arguments valid.
        tool_choice: { type: 'auto' },
        messages,
      });

      inputTokens += res.usage?.input_tokens || 0;
      outputTokens += res.usage?.output_tokens || 0;

      if (res.stop_reason === 'refusal') {
        failure = 'The model declined this request.';
        break;
      }

      // The server-side search loop hit its iteration limit. Push the paused
      // turn back and it resumes where it left off — no extra user message.
      if (res.stop_reason === 'pause_turn') {
        messages = [...messages, { role: 'assistant', content: res.content }];
        continue;
      }

      const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'record_events');
      if (call) {
        drafted = Array.isArray(call.input?.events) ? call.input.events : [];
        break;
      }

      // Answered in prose without recording anything. Treat as nothing found
      // rather than trying to parse an essay into dates.
      const said = res.content.find((b) => b.type === 'text')?.text || '';
      failure = said.trim()
        ? `The model replied without recording any events: ${said.slice(0, 300)}`
        : 'The model returned nothing usable.';
      break;
    }
  } catch (err) {
    console.error(err);
    failure = err?.message || 'The request to the model failed.';
  }

  async function logRun(fields) {
    await supabase.from('event_ai_runs').insert({
      ran_by: user.id,
      from_date: from,
      to_date: to,
      venue_count: venues.length,
      model: MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      ...fields,
    });
  }

  if (failure || drafted === null) {
    await logRun({ ok: false, error: failure || 'No result', returned_count: 0, inserted_count: 0, skipped_count: 0 });
    return NextResponse.json({ error: failure || 'No result from the model.' }, { status: 502 });
  }

  // Re-validate everything. `strict` guarantees the shape, not the truth: a
  // date outside the range or an invented venue reference still has to be
  // thrown away here.
  const knownKeys = new Set(
    (known || []).map((k) => `${k.venue_id}|${k.event_date}|${(k.title || '').toLowerCase()}`)
  );
  const seen = new Set();
  const rows = [];
  let skipped = 0;

  for (const e of drafted) {
    const venue = byRef.get(Number(e.venue_ref));
    const date = typeof e.date === 'string' ? e.date.trim() : '';
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    const endRaw = typeof e.end_date === 'string' ? e.end_date.trim() : '';
    const end = ISO_DATE.test(endRaw) && endRaw >= date ? endRaw : null;

    if (!venue || !ISO_DATE.test(date) || date < from || date > to || !title) {
      skipped += 1;
      continue;
    }
    const key = `${venue.id}|${date}|${title.toLowerCase()}`;
    if (knownKeys.has(key) || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    rows.push({
      venue_id: venue.id,
      event_date: date,
      end_date: end,
      title: title.slice(0, 200),
      event_type: (e.event_type || '').trim().slice(0, 80) || null,
      source_note: (e.source_note || '').trim().slice(0, 500) || null,
      status: 'suggested',
      source: 'ai',
      created_by: user.id,
    });
  }

  let inserted = 0;
  if (rows.length) {
    const { data, error: insErr } = await supabase.from('venue_events').insert(rows).select('id');
    if (insErr) {
      await logRun({ ok: false, error: insErr.message, returned_count: drafted.length, inserted_count: 0, skipped_count: skipped });
      return NextResponse.json({ error: `Could not save the drafts: ${insErr.message}` }, { status: 500 });
    }
    inserted = (data || []).length;
  }

  await logRun({
    ok: true,
    returned_count: drafted.length,
    inserted_count: inserted,
    skipped_count: skipped,
  });

  return NextResponse.json({
    ok: true,
    returned: drafted.length,
    inserted,
    skipped,
    venues: venues.length,
  });
}
