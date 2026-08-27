-- Run this once in Supabase → SQL Editor, in addition to the previous two files.
-- Adds a separate Address field alongside Site Name.

alter table surveys add column if not exists address text;
