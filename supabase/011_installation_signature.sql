-- Run this once in Supabase → SQL Editor, in addition to the previous migrations.
-- Adds an optional site sign-off (typed name + drawn signature) to install
-- confirmations. Whole-installation field, not per-screen.

alter table installations add column if not exists signature_path text;
alter table installations add column if not exists signed_by text;
