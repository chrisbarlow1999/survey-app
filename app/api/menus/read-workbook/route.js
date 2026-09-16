import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabaseServer';
import { readMenuWorkbook } from '../../../../lib/menuSheet';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;

// Turns an uploaded .xlsx into plain JSON for the import screen. It only reads;
// the browser writes the result through the normal client, so RLS still
// decides what lands in which venue. Internal staff only — the parse is cheap,
// but there's no reason to run arbitrary uploads for anyone else.
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role === 'client_viewer') {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  let file;
  try {
    const form = await request.formData();
    file = form.get('file');
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 });
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is over 10MB.' }, { status: 413 });
  }

  try {
    const result = await readMenuWorkbook(Buffer.from(await file.arrayBuffer()));
    if (!result.rangeSheets.length && !result.key) {
      return NextResponse.json({
        error: 'No range sheet or master schedule KEY found in that workbook. A range sheet has "Store Name within Linney MyScreens System" in cell E1; a KEY sheet starts MENU | KIOSK | STORE CODE | SCREENS | SCHEDULE CODE.',
      }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `Could not read that workbook: ${e.message}` }, { status: 422 });
  }
}
