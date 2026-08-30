# Site Survey — Digital Signage

Five-part app:
- `/` — public site survey form. No account needed, anyone with the link can submit.
- `/dashboard` — site survey reports view. Requires a logged-in account.
- `/install` — public install-completion form (proof photos once a job's finished).
  No account needed, not linked to the original survey (different engineer
  companies often do the survey vs. the install).
- `/installations` — install confirmation reports view. Requires a logged-in
  account, same client-permission rules as `/dashboard`.
- `/admin/clients` — add/rename/delete clients, set each one's notification inbox.
- `/admin/accounts` — create accounts, manage roles and client access, reset
  passwords, deactivate/reactivate.
- `/admin/activity` — a log of who did what across the admin pages.

All three admin pages require a super admin account; `/admin` itself just
redirects to `/admin/clients`.

The left-hand sidebar shows a different set of links depending on who's looking:
anyone not logged in (engineers) only ever sees New Survey / New Install — there's
no client-side hiding to work around, those are genuinely the only two pages that
exist in the public route group (`app/(public)/`). A logged-in internal account
(User or Super Admin) also sees Surveys and Installations, plus New Survey/New
Install; a Client Viewer sees only Surveys and Installations, nothing else — they
have no reason to submit forms. Only a super admin additionally sees an expandable
Admin section (Clients / Accounts / Activity). That check happens once, server-side, in
`app/(app)/layout.js`.

## 1. One-time Supabase setup

1. Open your Supabase project → **SQL Editor** → New query.
2. Paste in the contents of `supabase/schema.sql` and run it. This creates the `surveys`
   and `profiles` tables, the `survey-photos` storage bucket, and the access rules:
   anyone can submit a survey, only logged-in users can read them back.
3. Go to **Authentication → Users** and manually create just **your own** account
   (email + password) — this is the one bootstrap account you need by hand, since
   you have to be logged in as a super admin before `/admin` → Create Account can
   make any others. Every other account gets created from `/admin` once you're
   set up (see **Creating accounts** below) — there's no public sign-up page.
4. Also run `supabase/002_add_delete_policy.sql` in the SQL Editor — this enables the
   "Delete Survey" button in the dashboard.
5. Also run `supabase/003_add_address_column.sql` — this adds the Address field.
6. Also run `supabase/004_registration_and_permissions.sql` — this adds:
   - A database-level restriction so only @linney.com emails can ever become
     accounts (self-registration used to exist and relied on this — it's since
     been removed in favor of admin-created accounts, see below, but the
     restriction is still a useful safety net)
   - A `clients` table and per-account permission groups
7. **Add your clients**: Supabase → Table Editor → `clients` → insert a row per
   client (just a name — e.g. "Manchester United", "Everton FC").
8. **Make your own account a super admin** (do this once, right after running the
   migration): Supabase → Authentication → Users → copy your user's ID, then in the
   SQL Editor run:
   ```sql
   update profiles set role = 'super_admin' where id = 'paste-your-id-here';
   ```
9. **Grant a non-admin account access to a client**: Table Editor → `profile_clients`
   → insert a row with that account's `profile_id` (from the `profiles` table) and
   the `client_id` of the client they should see. An account with no rows here (and
   not a super admin) sees an empty dashboard.
10. *(No longer required — was for self-registration's confirmation email, which
    no longer exists. Harmless to leave as-is.)*
11. *(Same as above — only matters if you add a password-reset flow later.)*
12. Also run `supabase/005_admin_user_management.sql` — this adds the `/admin` page:
    it mirrors each account's email onto `profiles` (needed to show a readable user
    list), and lets super admins view/edit every account's role and client access
    from inside the app instead of Supabase's Table Editor. After running it, step
    9 above can be done from `/admin` instead of by hand.
13. Also run `supabase/006_admin_client_management.sql` — this lets super admins
    add/rename/delete clients from `/admin` too, so step 7 above no longer needs
    Table Editor either.
14. Also run `supabase/007_edit_survey_policy.sql` — this adds an "Edit Survey"
    button on the report page, using the same client-permission rule as viewing
    and deleting. Engineers still have no accounts, so there's no self-service
    edit — corrections go through whichever PM has access to that survey.
15. Also run `supabase/008_survey_edit_history.sql` — this adds an "Edit History"
    list to the report (who edited the survey and when, on top of the engineer
    who originally submitted it).
16. Also run `supabase/009_client_notification_email.sql` — this adds a
    notification inbox field per client, settable from `/admin`. See
    **Email notifications** below to actually turn sending on — the column
    alone doesn't send anything.
17. Also run `supabase/010_installations.sql` — this creates the `installations`
    table and its own access rules (anyone can submit at `/install`, only
    accounts with access to that client can view/edit/delete at `/installations`).
    Reuses the same `survey-photos` storage bucket, so no storage changes needed.
18. Also run `supabase/011_installation_signature.sql` — this adds an optional
    "Site Sign-Off" to the install form: a typed name plus a drawn signature
    (finger/mouse), shown on the install report. Also reuses the `survey-photos`
    bucket (under a `signatures/` path prefix), no storage changes needed.
19. Also run `supabase/012_account_deactivation.sql` — adds an `active` flag
    to `profiles`, used by the Deactivate button in `/admin/accounts`.
20. Also run `supabase/013_client_viewer_role.sql` — adds a third role,
    `client_viewer`, for an external client's own contact to log in and see
    only their own client's data, read-only. Also tightens the edit/delete
    policies on `surveys`/`installations` so a client viewer with access can
    never update or delete, even though (like everyone with client access)
    they can view.
21. Also run `supabase/014_admin_action_log.sql` — creates the `admin_actions`
    table behind `/admin/activity` (who created accounts, changed roles, reset
    passwords, or edited clients).

## Creating accounts

There's no self-registration — every account is created by a super admin from
`/admin/accounts`: set a name, email, role, and (depending on role) which
clients they can see, all in one step. Three roles:
- **User** — internal staff, sees/edits whichever clients they're granted
  (multi-select checkboxes).
- **Super Admin** — sees and can edit everything, plus the Admin section.
- **Client Viewer** — for an external client's own contact. Scoped to exactly
  one client (a single dropdown, not checkboxes), and strictly read-only —
  no Edit/Delete buttons in the UI, and the database itself refuses any
  update/delete from that role even if someone tried to bypass the UI.

The same page also has, per account: **Reset Password** (generates a new
one-time password, for when someone's locked out) and **Deactivate**
(blocks sign-in immediately via Supabase Auth's own ban mechanism, without
deleting their account or history — Reactivate undoes it). All three of
these require `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings →
API Keys → the **service_role** secret — not the publishable one) set in
your environment, since they're privileged operations the publishable key
can't do. This is the same variable used by email notifications below, so
if you've already set that up, all of this works with no extra step.

Every account creation, password reset, deactivation, role change, and
client grant/revoke — plus client add/rename/delete — is logged to
`/admin/activity`, so if more than one person has super admin, there's a
record of who did what.

On both creation and reset, a one-time random password is shown once on
screen — pass it to the person directly (Slack, in person, etc.), since it's
never emailed and never shown again. This deliberately avoids depending on
email delivery at all for something as important as getting someone logged
in, given the built-in Supabase email sender has proven unreliable in testing.

## Email notifications (optional)

When a survey or install confirmation comes in, the app can email the
submitting client's team — e.g. Starbucks surveys go to the Starbucks team's
shared inbox, TUI installs go to TUI's. This needs its own email-sending
service — Supabase's built-in email is Auth-only (signups, password resets)
and can't send arbitrary notifications.

1. Create a free account at [resend.com](https://resend.com) and generate an API key.
2. In `.env.local` (and later, Vercel's Environment Variables), set:
   - `RESEND_API_KEY` — the key from step 1.
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API Keys →
     the **service_role** secret (not the publishable one). This must stay
     server-only — never prefix it with `NEXT_PUBLIC_`.
   - `NOTIFY_FROM_EMAIL` — leave as `onboarding@resend.dev` for testing, or
     switch to your own address once you verify a sending domain in Resend.
   - `NEXT_PUBLIC_APP_URL` — your live URL, so notification emails can link
     straight to the report (e.g. `https://your-app.vercel.app`).
3. In `/admin` → Clients, set a notification inbox for each client you want
   notified.

Until both `RESEND_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set, submissions
work exactly as before — notifications just silently don't send.

## 2. Local setup

```bash
npm install
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your two real values (from Supabase → Project Settings → API Keys):

```
NEXT_PUBLIC_SUPABASE_URL=https://mjncbkvdzissgxeidczk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Z-PKratfaMYrz3Mf3m3IwA_V10jIyka
```

Then run it locally:

```bash
npm run dev
```

Visit `http://localhost:3000` for the survey form, and `http://localhost:3000/login`
to sign in to the dashboard with one of the accounts you created in step 1.3.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel, "Import Project" from that repo.
3. Add the same two environment variables from `.env.local` in Vercel's project settings
   (Settings → Environment Variables).
4. Deploy. Every push to the repo's main branch will redeploy automatically.

## How the access model works

- The `surveys` table allows **anyone to insert** (submit) a row, but only
  **authenticated users to select** (read) rows — enforced in Postgres itself via
  Row Level Security, not just hidden in the app. Same rule on the photo storage bucket.
- This means even if someone finds the dashboard URL without logging in, the database
  itself refuses to hand back any survey data — `middleware.js` also redirects them
  to `/login` before the page loads.
