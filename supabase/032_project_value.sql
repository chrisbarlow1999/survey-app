-- Run this once in Supabase → SQL Editor, after 031.
--
-- Adds the quoted value of a project, so the pipeline can be reported in money
-- as well as in screens and job count.
--
-- WHY A FIGURE ON THE PROJECT AND NOT A PRICE PER MODEL
-- The obvious alternative is a price list keyed on screen model, multiplied by
-- the surveyed screen mix. That produces a confident number that is reliably
-- wrong: hardware is only part of a signage job, and mounts, cabling, access
-- equipment, travel and out-of-hours labour vary more between sites than the
-- screens do. A quoted figure a PM types in is the number the business
-- actually stands behind.
--
-- It also degrades honestly. A price list would silently value every unsurveyed
-- project at zero, which is most of the pipeline; a typed figure is either
-- there or plainly missing, and the app reports how many are missing.
--
-- If a stable per-model price ever does exist, it can seed this column rather
-- than replace it.
--
-- NULL IS NOT ZERO — same rule as screen_count. Null means nobody has quoted
-- it; zero would mean a job genuinely worth nothing. The home page reports the
-- two separately, because a pipeline total that treats "unquoted" as "£0"
-- under-reports and stops being trusted.

alter table projects add column if not exists value_gbp numeric(12,2);

comment on column projects.value_gbp is
  'Quoted or estimated job value in GBP. Null = not quoted yet, which is reported separately from zero.';

-- numeric(12,2) tops out at 9,999,999,999.99; this is the sanity bound that
-- catches a fat-fingered extra zero rather than the storage limit.
alter table projects drop constraint if exists projects_value_sane;
alter table projects add constraint projects_value_sane
  check (value_gbp is null or (value_gbp >= 0 and value_gbp <= 10000000));

-- Partial index: the pipeline totals only ever sum rows that carry a figure.
create index if not exists projects_value_gbp_idx
  on projects (value_gbp) where value_gbp is not null;

-- ============================================================
-- Re-state the intake insert policy
-- ============================================================
-- The policy doesn't enumerate columns, so without this a script posting
-- straight at PostgREST could put a value on an anonymous request — a client
-- pricing their own job. Same reasoning as install_date in migration 030.
drop policy if exists "Anyone can submit an intake request" on projects;
create policy "Anyone can submit an intake request"
  on projects for insert
  with check (
    source = 'intake'
    and status = 'new'
    and archived_at is null
    and install_date is null
    and value_gbp is null
    and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) <= 10
    and length(coalesce(title, '')) between 1 and 300
    and length(coalesce(description, '')) <= 5000
    and (screen_count is null or screen_count between 0 and 500)
    and exists (
      select 1 from clients c
      where c.id = client_id and c.intake_enabled
    )
  );
