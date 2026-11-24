-- Add a user (platform login) — run in Supabase → SQL Editor.
--
-- Fill in the five settings below, then run. It creates the login with the
-- email already confirmed (they can sign in straight away), sets their role,
-- and gives them access to the listed clients — the same result as
-- Admin → Users → Create account in the app.
--
-- All or nothing: if the email is already in use, a client name is not found,
-- or a setting is wrong, it stops with a message and writes nothing.
--
-- Roles:
--   user          — Linney staff; sees projects/surveys for the clients listed
--   super_admin   — Linney admin; sees everything (client list is ignored)
--   client_viewer — someone at the client; read-only, exactly ONE client
--
-- HOW TO FILL IN: type each value between the two $v$ markers, e.g.
--   new_full_name text := $v$Jane O'Brien$v$;
-- Apostrophes and quote marks are fine inside the markers. For clients, put
-- each name in its own pair of markers, separated by commas.

do $$
declare
  -- ===== SETTINGS =====================================================
  new_email     text   := $v$firstname.lastname@example.com$v$;
  new_full_name text   := $v$Firstname Lastname$v$;
  new_role      text   := $v$user$v$;                  -- user, super_admin or client_viewer
  new_password  text   := $v$ChangeMe-1234$v$;         -- at least 6 characters
  client_names  text[] := array[$v$Compass$v$];        -- e.g. array[$v$Compass$v$, $v$TUI$v$]
  -- ====================================================================

  uid uuid := gen_random_uuid();
  missing text;
begin
  new_email := lower(trim(new_email));
  new_full_name := trim(new_full_name);
  new_role := lower(trim(new_role));

  -- 1. Check the settings.
  if new_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or new_email like '%@example.com' then
    raise exception 'Set new_email to the person''s real email address. Nothing was created.';
  end if;
  if new_full_name = '' or new_full_name = 'Firstname Lastname' then
    raise exception 'Set new_full_name. Nothing was created.';
  end if;
  if new_role not in ('user', 'super_admin', 'client_viewer') then
    raise exception 'new_role must be user, super_admin or client_viewer. Nothing was created.';
  end if;
  if length(coalesce(new_password, '')) < 6 or new_password = 'ChangeMe-1234' then
    raise exception 'Set new_password to something of at least 6 characters (not the example). Nothing was created.';
  end if;
  if exists (select 1 from auth.users where lower(email) = new_email) then
    raise exception 'An account with % already exists — use Admin → Users to change it. Nothing was created.', new_email;
  end if;

  if new_role = 'super_admin' then
    client_names := '{}';   -- super admins see every client anyway
  end if;
  if new_role = 'client_viewer' and coalesce(cardinality(client_names), 0) <> 1 then
    raise exception 'A client_viewer must have exactly one client in client_names. Nothing was created.';
  end if;

  missing := (
    select string_agg(n, ', ')
    from unnest(client_names) n
    where not exists (select 1 from clients c where lower(c.name) = lower(trim(n)))
  );
  if missing is not null then
    raise exception 'No client called: %. Check the names under Admin → Clients. Nothing was created.', missing;
  end if;

  -- 2. The login itself.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    new_email, extensions.crypt(new_password, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', new_full_name),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), uid, uid::text, 'email',
    jsonb_build_object('sub', uid::text, 'email', new_email, 'email_verified', true),
    now(), now(), now()
  );

  -- 3. Their profile (normally created by the sign-up trigger; this makes sure)
  --    with the right role.
  insert into profiles (id, full_name, email, role)
  values (uid, new_full_name, new_email, new_role)
  on conflict (id) do update
    set full_name = excluded.full_name, email = excluded.email, role = excluded.role;

  -- 4. Client access.
  insert into profile_clients (profile_id, client_id)
  select uid, c.id from clients c
  where lower(c.name) in (select lower(trim(n)) from unnest(client_names) n)
  on conflict do nothing;

  -- 5. Show it in Admin → Activity.
  insert into admin_actions (actor_id, action, target, details)
  values (null, 'create_account', new_email, jsonb_build_object('role', new_role, 'via', 'SQL script'));
end;
$$;

-- The account as it now stands (newest first):
select p.full_name, p.email, p.role, p.active,
       coalesce(string_agg(c.name, ', ' order by c.name), '—') as clients,
       u.email_confirmed_at is not null as can_sign_in
from profiles p
join auth.users u on u.id = p.id
left join profile_clients pc on pc.profile_id = p.id
left join clients c on c.id = pc.client_id
group by p.id, u.email_confirmed_at, u.created_at
order by u.created_at desc
limit 5;
