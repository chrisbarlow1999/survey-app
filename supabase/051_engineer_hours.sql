-- Run this once in Supabase → SQL Editor, after 050 — and BEFORE deploying the
-- code that goes with it (the survey forms write engineer_hours, which doesn't
-- exist until this has run).
--
-- Survey resourcing moves from engineer DAYS to engineer HOURS, so a one-screen
-- job can be estimated — and charged — at 2 hours instead of a whole day.
--
--   • surveys.engineer_hours — hours on site per engineer. Total engineer-hours
--     (what's charged) = engineer_hours × engineer_count, the same way days
--     worked before.
--   • Existing estimates are converted at 7.5 hours per day.
--   • surveys.engineer_days is kept but no longer used by the app (the forms
--     clear it on save). The trigger below converts it if anything still writes
--     days — e.g. a form left open from before the deploy.
--   • Cost sheets now seed an "Engineer hour" line. It's added to the price list
--     priced from the existing "Engineer day" item ÷ 7.5 (and the same for each
--     client's own rate), so quotes come out the same for a full day.
--     Existing cost sheets are unchanged.

alter table surveys add column if not exists engineer_hours numeric;

alter table surveys drop constraint if exists surveys_engineer_hours_sane;
alter table surveys add constraint surveys_engineer_hours_sane
  check (engineer_hours is null or (engineer_hours >= 0 and engineer_hours <= 10000));

comment on column surveys.engineer_hours is
  'Estimated hours on site per engineer. Engineer-hours = engineer_hours × engineer_count. Replaces engineer_days (1 day = 7.5 hours).';

-- Convert what's there.
update surveys
set engineer_hours = round(engineer_days * 7.5, 2)
where engineer_days is not null and engineer_hours is null;

-- Anything that still writes days gets hours too.
create or replace function public.surveys_days_to_hours()
returns trigger
language plpgsql
as $$
begin
  if new.engineer_days is not null and (
       (tg_op = 'INSERT' and new.engineer_hours is null)
    or (tg_op = 'UPDATE' and new.engineer_days is distinct from old.engineer_days)
  ) then
    new.engineer_hours := round(new.engineer_days * 7.5, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists surveys_days_to_hours on surveys;
create trigger surveys_days_to_hours
  before insert or update on surveys
  for each row execute function public.surveys_days_to_hours();

-- ============================================================
-- Price list: Engineer hour
-- ============================================================
insert into price_items (name, unit, match_key, default_cost, default_price)
select 'Engineer hour', 'hour', 'engineer_hour',
       round(d.default_cost / 7.5, 2), round(d.default_price / 7.5, 2)
from (select 1) one
left join price_items d on d.match_key = 'engineer_day'
on conflict (match_key) do nothing;

insert into price_client_rates (price_item_id, client_id, cost, price)
select h.id, r.client_id, round(r.cost / 7.5, 2), round(r.price / 7.5, 2)
from price_client_rates r
join price_items d on d.id = r.price_item_id and d.match_key = 'engineer_day'
cross join price_items h
where h.match_key = 'engineer_hour'
on conflict (price_item_id, client_id) do nothing;

-- Check: how the old estimates converted.
select count(*) filter (where engineer_days is not null) as surveys_with_days,
       count(*) filter (where engineer_hours is not null) as surveys_with_hours
from surveys;
