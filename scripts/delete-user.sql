-- Delete a user (platform login) — run in Supabase → SQL Editor.
--
-- PERMANENT. Their login, profile and client access are removed for good.
-- If you might want them back, deactivate them instead (Admin → Users →
-- Deactivate) — that blocks sign-in but keeps everything, and can be undone.
--
-- What happens to things they were linked to:
--   • Projects they own → handed to hand_over_to (below), or left with no owner.
--   • Anything they created, noted or decided (projects, notes, cost sheets,
--     menus, change requests…) stays; it just no longer points at their account.
--     Notes keep the author's name, which is stored separately.
--   • Admin Activity entries they made stay, shown as "Unknown".
--
-- HOW TO RUN — two passes:
--   1. Fill in the settings, leave just_check as true, and run. It stops with
--      a red message listing exactly what WOULD change. Nothing is written.
--   2. If that looks right, set just_check to false and run again to delete.
--
-- Type each value between the two $v$ markers. Leave hand_over_to as $v$$v$
-- (nothing between the markers) to leave their projects unowned.

do $$
declare
  -- ===== SETTINGS =====================================================
  delete_email text    := $v$firstname.lastname@example.com$v$;
  hand_over_to text    := $v$$v$;                -- email of who takes over their projects (optional)
  just_check   boolean := true;                  -- true = preview only, false = really delete
  -- ====================================================================

  uid uuid;
  who text;
  their_role text;
  heir uuid;
  r record;
  n integer;
  report text := '';
begin
  delete_email := lower(trim(delete_email));
  hand_over_to := lower(trim(hand_over_to));

  -- 1. Find the account.
  if delete_email like '%@example.com' or delete_email = '' then
    raise exception 'Set delete_email to the email of the account to delete. Nothing was changed.';
  end if;

  uid := (select id from auth.users where lower(email) = delete_email);
  if uid is null then
    raise exception 'No account with the email %. Nothing was changed.', delete_email;
  end if;

  who := coalesce((select nullif(trim(full_name), '') from profiles where id = uid), delete_email);
  their_role := (select role from profiles where id = uid);

  if their_role = 'super_admin' and not exists (
    select 1 from profiles where role = 'super_admin' and active and id <> uid
  ) then
    raise exception '% is the only active super admin — make someone else a super admin first. Nothing was changed.', who;
  end if;

  if hand_over_to <> '' then
    heir := (
      select p.id from profiles p join auth.users u on u.id = p.id
      where lower(u.email) = hand_over_to and p.role in ('user', 'super_admin') and p.active
    );
    if heir is null then
      raise exception 'hand_over_to (%) is not an active Linney staff account. Nothing was changed.', hand_over_to;
    end if;
    if heir = uid then
      raise exception 'hand_over_to can''t be the person being deleted. Nothing was changed.';
    end if;
  end if;

  -- 2. Unhook everything that points at their account. Found automatically, so
  --    tables added by future migrations are covered too.
  for r in
    select con.conrelid::regclass as tbl, a.attname as col, a.attnotnull as required
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and cardinality(con.conkey) = 1
      and con.confdeltype in ('a', 'r')          -- the ones that would block the delete
      and con.connamespace <> 'auth'::regnamespace
      and con.conrelid <> 'public.profiles'::regclass
    order by 1, 2
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using uid;
    continue when n = 0;

    if heir is not null and (
         (r.tbl = 'public.projects'::regclass and r.col = 'owner_id')
      or (r.tbl = 'public.project_templates'::regclass and r.col = 'default_owner_id')
    ) then
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col) using heir, uid;
      report := report || format(E'\n  %s.%s: %s row(s) handed over to %s', r.tbl, r.col, n, hand_over_to);
    elsif r.required then
      raise exception '%.% has % row(s) that must point at a real account, so % can''t be deleted. Deactivate them instead. Nothing was changed.',
        r.tbl, r.col, n, who;
    else
      execute format('update %s set %I = null where %I = $1', r.tbl, r.col, r.col) using uid;
      report := report || format(E'\n  %s.%s: %s row(s) unlinked', r.tbl, r.col, n);
    end if;
  end loop;

  n := (select count(*) from profile_clients where profile_id = uid);
  report := format(E'%s (%s, %s), with access to %s client(s).', who, delete_email, their_role, n)
         || case when report = '' then E'\nNothing else points at their account.' else report end;

  if just_check then
    -- Raising an error rolls back the unhooking above, so this pass writes nothing.
    raise exception E'CHECK ONLY — nothing was changed. Running with just_check = false would delete:\n%', report;
  end if;

  -- 3. Delete. Removing the login removes their profile, client access and
  --    sign-in sessions with it.
  delete from auth.users where id = uid;

  insert into admin_actions (actor_id, action, target, details)
  values (null, 'delete_account', delete_email, jsonb_build_object('role', their_role, 'via', 'SQL script', 'handed_over_to', nullif(hand_over_to, '')));

  raise notice E'Deleted %', report;
end;
$$;

-- Accounts still in the system:
select p.full_name, p.email, p.role, p.active
from profiles p
order by p.role, p.full_name;
