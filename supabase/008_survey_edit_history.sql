-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Tracks who edited a survey (and when) after the engineer originally submitted it.
-- "Created by" is already the engineer_first/engineer_last on the survey itself —
-- this just adds the trail of PM edits on top of that.

alter table surveys add column if not exists edit_history jsonb not null default '[]';
