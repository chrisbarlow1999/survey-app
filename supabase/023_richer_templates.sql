-- Run this once in Supabase → SQL Editor, after 022.
--
-- Templates were tasks and nothing else. This lets one carry the rest of a
-- project's starting state — a standing description, a priority, the person who
-- normally owns this kind of job, and any files that should land on every
-- project made from it.

alter table project_templates add column if not exists description text;
alter table project_templates add column if not exists priority text not null default 'normal';
alter table project_templates add column if not exists default_owner_id uuid references profiles(id);
alter table project_templates add column if not exists attachments jsonb not null default '[]';

create index if not exists project_templates_default_owner_idx on project_templates (default_owner_id);

-- ============================================================
-- Apply the richer template on incoming client requests
-- ============================================================
-- Replaces the version from 022. Two rules about what it will and won't touch:
--
--   * Anything the requester actually filled in wins. Their description is the
--     whole point of the request, so a template description is only used when
--     they left it blank.
--   * Attachments are copied by PATH, not by duplicating the file. A trigger
--     can't copy objects in storage. That means a template's file is shared
--     with every project made from it — which is why deleting a template no
--     longer deletes its files (see the note at the bottom).
create or replace function public.apply_default_project_template()
returns trigger
language plpgsql security definer
as $$
declare
  tpl record;
begin
  -- A template scoped to this client wins over the catch-all one.
  select * into tpl
  from project_templates
  where is_default and client_id = new.client_id
  limit 1;

  if tpl is null then
    select * into tpl
    from project_templates
    where is_default and client_id is null
    limit 1;
  end if;

  if tpl is null then
    return new;
  end if;

  insert into project_tasks (project_id, title, position, due_date)
  select
    new.id,
    t.title,
    t.position,
    case when t.due_offset_days is null then null
         else (current_date + t.due_offset_days) end
  from project_template_tasks t
  where t.template_id = tpl.id;

  -- AFTER trigger, so the row is already in — these have to be an update, not
  -- an assignment to NEW.
  update projects
  set
    description = coalesce(nullif(new.description, ''), tpl.description),
    priority    = coalesce(tpl.priority, priority),
    owner_id    = coalesce(new.owner_id, tpl.default_owner_id),
    attachments = case
                    when jsonb_array_length(new.attachments) > 0
                      then new.attachments || coalesce(tpl.attachments, '[]'::jsonb)
                    else coalesce(tpl.attachments, '[]'::jsonb)
                  end
  where id = new.id;

  insert into project_activity (project_id, actor_name, action, detail)
  values (new.id, 'System', 'Template applied', tpl.name);

  return new;
end;
$$;

-- Trigger definition itself is unchanged from 022; recreated so this file can
-- be run on its own.
drop trigger if exists apply_template_on_intake on projects;
create trigger apply_template_on_intake
  after insert on projects
  for each row
  when (new.source = 'intake')
  execute function public.apply_default_project_template();

-- ============================================================
-- Note on deleting templates
-- ============================================================
-- Because attachments are shared by path, the app deliberately does NOT remove
-- a template's files from storage when the template is deleted — a live project
-- created from it may still be pointing at them. That leaves orphaned objects
-- in the bucket, which is cheap; the alternative is a project whose attachment
-- silently 404s, which is not.
