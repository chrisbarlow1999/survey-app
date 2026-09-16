-- Run this once in Supabase → SQL Editor, after 034.
--
-- Records which engineering firm attended, on all three things an engineer can
-- submit. Linney mainly uses SCCI, EIT, Index and its own internal team, and
-- there was no way to answer "who did we send, and how often".
--
-- ONE COLUMN, NOT TWO
-- mount_type solves the same problem with a pair of columns (mount_type plus
-- mount_type_other for the free-text case). That works on a form but it's
-- awkward to report on, because every query has to coalesce the two. Here the
-- form resolves the choice before saving, so this column always holds the
-- company's actual name and a report can group on it directly.
--
-- THE LIST LIVES IN JS, NOT HERE
-- lib/engineerCompanies.js holds the options, the same way the project
-- workflow and the mount types do, so adding a firm is a one-line edit rather
-- than a migration. That's also why there is no foreign key or enum: a value
-- typed under "Other" has to be storable.
--
-- NULL MEANS NOT RECORDED, and every record created before this migration is
-- null. The report counts those separately rather than hiding them, because a
-- breakdown that silently omits two thirds of the history is worse than one
-- that admits the gap.

alter table surveys        add column if not exists engineer_company text;
alter table installations  add column if not exists engineer_company text;
alter table visits         add column if not exists engineer_company text;

comment on column surveys.engineer_company is
  'Engineering firm that attended. Free text so "Other" is storable; options live in lib/engineerCompanies.js. Null = not recorded (all pre-035 rows).';

-- The public forms are open to anyone, so bound the value. Long enough for a
-- real company name, short enough that this can never be used as free storage.
alter table surveys       drop constraint if exists surveys_engineer_company_len;
alter table surveys       add  constraint surveys_engineer_company_len
  check (engineer_company is null or length(engineer_company) between 1 and 80);

alter table installations drop constraint if exists installations_engineer_company_len;
alter table installations add  constraint installations_engineer_company_len
  check (engineer_company is null or length(engineer_company) between 1 and 80);

alter table visits        drop constraint if exists visits_engineer_company_len;
alter table visits        add  constraint visits_engineer_company_len
  check (engineer_company is null or length(engineer_company) between 1 and 80);

-- Partial indexes: the report only ever groups rows that carry a value.
create index if not exists surveys_engineer_company_idx
  on surveys (engineer_company) where engineer_company is not null;
create index if not exists installations_engineer_company_idx
  on installations (engineer_company) where engineer_company is not null;
create index if not exists visits_engineer_company_idx
  on visits (engineer_company) where engineer_company is not null;
