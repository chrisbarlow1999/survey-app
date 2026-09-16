'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { seedItemsFromSurvey, sheetTotals } from '../lib/costSheet';

// Builds a quote from this survey and opens it.
//
// The seeding happens here, once, and the result is stored on the sheet — the
// sheet is not a live view of the survey. If the survey is later edited, or the
// catalogue is re-priced, an existing quote keeps the numbers it was built
// with, because a quote a client has seen must not change by itself.
export function CreateCostSheetButton({ survey, userId }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    setError('');

    if (!survey.client_id) {
      setError('This survey has no client set, and a cost sheet needs one. Set the client on the survey first.');
      setBusy(false);
      return;
    }

    const [{ data: catalogue }, { data: rates }] = await Promise.all([
      supabase.from('price_items')
        .select('id, name, unit, default_cost, default_price, match_key')
        .eq('active', true),
      supabase.from('price_client_rates')
        .select('price_item_id, cost, price')
        .eq('client_id', survey.client_id),
    ]);

    const items = seedItemsFromSurvey(survey, catalogue || [], rates || []);
    const totals = sheetTotals(items);

    const { data, error: insErr } = await supabase
      .from('cost_sheets')
      .insert({
        survey_id: survey.id,
        client_id: survey.client_id,
        title: survey.site_location || null,
        items,
        total_cost: totals.cost,
        total_price: totals.price,
        created_by: userId || null,
      })
      .select('id')
      .single();

    if (insErr || !data) {
      console.error(insErr);
      setError('Could not create a cost sheet from this survey.');
      setBusy(false);
      return;
    }

    router.push(`/cost-sheets/${data.id}`);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-ghost" type="button" disabled={busy} onClick={create}>
        {busy ? 'Building…' : 'Create cost sheet'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </>
  );
}
