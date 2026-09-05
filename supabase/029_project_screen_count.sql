-- Run this once in Supabase → SQL Editor, after 028.
--
-- Adds a screen count to projects so management can see how much hardware is
-- in the pipeline, not just how many jobs. A project count alone hides the
-- difference between twenty Starbucks menu boards and one Wembley video wall.
--
-- WHY A STORED NUMBER RATHER THAN A DERIVED ONE
-- The obvious alternative is to count screens in the linked survey. That only
-- works once a survey exists, which is the back half of the pipeline — and the
-- question "how many screens are coming?" is asked hardest at enquiry and
-- estimating stage, where the answer would always be zero. So this is the
-- forecast figure, maintained by the PM. The surveyed figure is shown next to
-- it on the project page as a cross-check once a survey is linked.
--
-- NULL IS NOT ZERO. Null means nobody has estimated it yet; zero would mean a
-- project genuinely involving no screens. The home page reports both — a total,
-- and how many projects are still unestimated — because a pipeline number that
-- silently treats "unknown" as "none" under-reports and stops being trusted.

alter table projects add column if not exists screen_count integer;

-- Guards against a fat finger and against an anonymous intake submission
-- posting a nonsense figure. 10000 is far beyond any real job and still leaves
-- room to be wrong.
alter table projects drop constraint if exists projects_screen_count_sane;
alter table projects add constraint projects_screen_count_sane
  check (screen_count is null or (screen_count >= 0 and screen_count <= 10000));

-- Partial index: the pipeline query only ever sums rows that have a figure.
create index if not exists projects_screen_count_idx
  on projects (screen_count) where screen_count is not null;

-- ============================================================
-- Re-state the intake insert policy
-- ============================================================
-- The policy from 026 doesn't enumerate columns, so without this a script
-- posting straight at PostgREST could set screen_count on an anonymous
-- request. The check constraint above already bounds the value; this keeps the
-- policy honest about every column a stranger is allowed to write, which is
-- the thing that has to be readable in six months.
drop policy if exists "Anyone can submit an intake request" on projects;
create policy "Anyone can submit an intake request"
  on projects for insert
  with check (
    source = 'intake'
    and status = 'new'
    and archived_at is null
    and jsonb_array_length(coalesce(attachments, '[]'::jsonb)) <= 10
    and length(coalesce(title, '')) between 1 and 300
    and length(coalesce(description, '')) <= 5000
    and (screen_count is null or screen_count between 0 and 500)
    and exists (
      select 1 from clients c
      where c.id = client_id and c.intake_enabled
    )
  );
