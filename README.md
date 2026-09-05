# Site Survey — Digital Signage

There are three record types an engineer can submit without an account — a site
survey, an install confirmation, and a visit (callout/repair) — each with its own
gated dashboard and report.

- `/` — public site survey form. No account needed, anyone with the link can submit.
  Screens are grouped into **areas**: an area is a place ("Bar wall") sharing one
  photo, screen size, orientation and mount type, and holding one or more screens
  that each have their own power/data answers and notes.
- `/dashboard` — site survey reports view. Requires a logged-in account.
  Paginated (25 per page), with search/client/date filters, sort options, an
  "Archived" toggle, and CSV export. The export fetches the whole filtered set
  rather than just the visible page.
- `/install` — public install-completion form (proof photos once a job's finished).
  Same area/screen grouping as the survey, with a proof photo per screen.
  No account needed, not linked to the original survey (different engineer
  companies often do the survey vs. the install).
- `/installations` — install confirmation reports view. Requires a logged-in
  account, same client-permission rules as `/dashboard`.
- `/visit` — public engineer visit form (callouts/repairs). No account needed.
  One or more issues, each with a photo of the problem, what was done to fix it,
  and a photo of the screen working, then the engineer signs it off themselves.
- `/visits` — engineer visit reports view. Requires a logged-in account, same
  client-permission rules as `/dashboard`.
- `/sites` — groups every survey, install confirmation and engineer visit by
  site name, so you can see everything that's happened at a location in one
  place. Purely a text match on the name (trimmed, lowercased) — there's no real
  database link between a survey and its later install, by design (see
  `/install` above).
- `/projects` — the project management side: every job as a project with a status,
  owner, due date, task list, notes and activity trail. Internal staff only.
  Create one manually, or let it arrive through a client request link.
- `/projects/board` — the same projects as a kanban board, one column per status.
  Drag a card to move it.
- `/request/<slug>` — a client's own public request form. No account needed. Creates
  a project against that client with status "New Request". Links are listed, shared
  and switched on under Admin → Request Links.
- `/admin/clients` — add/rename/delete clients, set each one's notification inbox.
- `/admin/request-links` — every client's request-form link in one place, with
  copy/preview buttons, an on/off switch, and how many requests each has brought in.
- `/admin/templates` — the starting state for a project: a task checklist plus a
  default description, priority, owner and files. Optionally auto-applied to
  projects raised through a client request link.
- `/admin/accounts` — create accounts, manage roles and client access, reset
  passwords, deactivate/reactivate.
- `/admin/activity` — a log of who did what across the admin pages.

All five admin pages require a super admin account; `/admin` itself just
redirects to `/admin/clients`.

The left-hand sidebar is grouped into collapsible sections — **Forms** (New
Survey / New Install / New Visit) and **Site Visits** (Surveys / Installations /
Engineer Visits / Site History) — with **Projects** as a single link above them
and an **Admin** section (Clients / Request Links / Templates / Accounts / Activity) for
super admins only. Whichever group holds the current page starts open.

Who sees what: anyone not logged in (engineers) only ever gets the Forms group —
there's no client-side hiding to work around, those are genuinely the only pages
that exist in the public route group (`app/(public)/`). A logged-in internal
account (User or Super Admin) gets Projects, Forms and Site Visits; a Client
Viewer gets Site Visits alone — no submission forms, and no Projects, since
those carry internal assignments and commentary. That check happens once,
server-side, in `app/(app)/layout.js`.

All three nav variants come from one definition in `lib/nav.js`, shared by both
layouts and by `AppShell`'s client-side session upgrade — they used to be three
hand-synced copies.

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
22. Also run `supabase/015_archive.sql` — adds `archived_at` to `surveys` and
    `installations`, powering the Archive/Restore buttons (a soft delete: the
    record is hidden from the default list but recoverable, unlike Delete).
23. Also run `supabase/016_attachments.sql` — adds an `attachments` column to
    both tables for record-level files (floor plans, PDFs, spec sheets) that
    sit alongside the per-area photos. Reuses the `survey-photos` bucket
    under an `attachments/` prefix, so no storage changes needed.
24. Also run `supabase/017_engineer_visits.sql` — creates the `visits` table
    and its access rules (anyone can submit at `/visit`; only accounts with
    access to that client can view/edit/delete at `/visits`). Same
    `survey-photos` bucket, no storage changes. Unlike the other two types,
    engineer visits deliberately do **not** send a notification email.
25. Also run `supabase/018_projects.sql` — creates `projects`, `project_tasks`
    and `project_activity`, adds `slug`/`intake_enabled` to `clients`, and adds a
    nullable `project_id` to surveys, installations and visits. It also widens
    the `profiles` read policy so internal staff can see each other's names —
    without that, the project Owner dropdown is empty for everyone except a
    super admin.
26. Also run `supabase/019_client_slug_backfill.sql` — gives every client that
    existed before 018 a request-form URL. Without it their slug stays null, so
    their request link can't be switched on from the admin page. It does not
    switch any form on.
27. Also run `supabase/020_project_owner.sql` — adds `owner_id` to `projects`
    and drops `assignee_id` from `project_tasks`. That drop is destructive and
    intentional: it discards any per-task assignments already entered. The
    profiles read policy from 018 is still needed — it now feeds the project
    Owner dropdown.
28. Also run `supabase/021_project_notes.sql` — creates `project_notes`, the
    chat-style log on a project. Separate from `project_activity`: that one is
    written by the app, this one by people.
29. Also run `supabase/022_project_templates.sql` — creates `project_templates`
    and `project_template_tasks`, plus the trigger that copies a default
    template's tasks onto any project raised through a client request link.
30. Also run `supabase/023_richer_templates.sql` — lets a template carry a
    default description, priority, owner and files, not just tasks, and
    replaces the auto-apply trigger with one that copies them too.

No migration is needed for the areas change — `locations` is a jsonb column and
the shape inside it changed. Rows written before it will render with no screens
and no markers, so **delete existing surveys and install confirmations** rather
than trying to read them.

## Client PDF vs Internal PDF

Each report has two export buttons, both producing a PDF via the browser's
print dialog:

- **Client PDF** — the version to send to a client for approval. Hides
  internal-only fields: the engineer name and phone number, "Engineer Days (est.)",
  "Engineers Required", and the free-text "Additional Information" block
  (which tends to collect internal commentary not meant for clients).
- **Internal PDF** — everything, unchanged.

Page 1 of both is the cover sheet: report type, site and client, then the full
summary (engineer, phone, date, site contact, address, resourcing, additional
info, attachments, sign-off). Each area then gets its own page.

The switch works by flagging the document with a `client-print` class for the
duration of the print dialog; the print stylesheet hides anything marked
`internal-only` while that flag is set. To make a field client-hidden, add
`className="... internal-only"` to it — nothing else needs changing.

Note: the per-screen **Notes** field (wall construction, extra support
needed) *is* included in the Client PDF, on the basis that it's technical
detail a client needs when approving an install. Mark it `internal-only` too
if that's not what you want.

Attachments (floor plans etc.) are added by PMs from the Edit screen, not by
engineers on the public form — engineers don't have those documents.

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

## Projects

The project management side, replacing what Microsoft Planner was doing.

A **project** is one piece of work for one client — a rollout, a refit, a
single screen. It carries a status, priority, due date, description,
attachments, a task list and an activity trail. Statuses are defined in
`lib/projectStatus.js` rather than a database check constraint, so the workflow
can be reshaped without a migration while it beds in.

**Two ways a project starts:**

1. **Manually**, from `/projects/new`, by whoever picks the work up.
2. **Through a client request link.** Each client gets a slug (`/request/compass`)
   which you switch on under Admin → Clients. Anyone with the link can raise a
   request without an account; it lands as a project against that client with
   status "New Request" and a **Request** badge so you can tell it apart from
   one your team raised. Turning the toggle off closes the form without losing
   the link, and that's enforced in Postgres, not just the UI — an anonymous
   insert is only accepted for a client with intake switched on.

**Ownership** sits on the project, not the task. One internal person owns a
project and is answerable for it; a new project defaults to whoever created it.
The list can be filtered by owner, including "Unassigned" to find work nobody has
picked up. Handing a project over is written to the activity feed like a status
change is.

**Tasks** are a flat checklist under the project — title, optional due date,
done or not. They have no owner of their own: per-task assignees were tried first
and made no sense, since the engineers have no accounts and every task ended up
owned by the same PM anyway. Overdue tasks show their date in red, and completing
one records who did it and when.

**Linking site records.** Surveys, installs and visits each have a nullable
`project_id`, set from a picker on the record's own page. It's a PM action after
the fact because engineers filling in the public forms have no idea which
project a job belongs to. Only projects for the same client are offered.
This is unrelated to Site History, which is still a plain text match on site
name and still doesn't link a survey to its install.

**Client visibility.** `client_viewer` accounts can't see projects at all —
every policy in migration 018 requires `is_internal_staff()`. Projects carry
internal commentary and internal assignments, so a client-facing view is a
separate decision to make deliberately rather than inherit.

**Not built yet:** no email when a task is assigned or falls due (that needs the
Resend domain verification, same blocker as the survey notifications), no board
/ drag-and-drop view, no CSV export of projects, and no spam protection on the
public request form.

### Project views

Two views over the same data, switchable from the tabs at the top; filters carry
across when you switch.

- **List** — paginated, sortable, searchable, with the archive filter and the
  stats strip. The view for finding one specific project.
- **Board** — a column per status, cards showing client, site, task progress,
  note count, due date and owner initials. Drag a card into another column to
  move the project; that writes the same activity line as changing the status on
  the detail page, so the trail doesn't depend on which screen you used.

The board isn't paginated — a board showing the first 25 cards is worse than no
board — but it is capped at 300 with a banner telling you to filter if you hit
it. There's no manual card ordering inside a column; cards sort by due date then
newest.

The statuses are the board's columns, defined in `lib/projectStatus.js`. **One
constraint:** the anonymous intake policy in migration 018 pins client-raised
projects to the status keyed `new`, so keep a status with that key or client
request forms start failing. A project saved with a status that's since been
removed from the list still appears in List view and raises a banner on the
board rather than silently vanishing.

### Editing a project

The detail page edits in place, Planner-style: click a field, change it, it
saves. No Edit button for day-to-day changes. Selects (status, owner, client,
priority, due date) save on change; text fields commit on Enter or blur and
abandon on Escape. Saves are optimistic and roll back if the write is refused.

Changes worth reading later — status, owner, client, priority, due date — write a
line to Activity. Retyping an address doesn't.

There is no Edit screen at all any more — attachments are added and removed on
the project page too. `/projects/new` is the only form left, and it only creates.

### Notes vs Activity

Two different logs, deliberately kept apart:

- **Notes** — written by people. The running commentary that never fits a field:
  dates being chased, what the client said on the phone, why something is on
  hold. Enter posts, Shift+Enter makes a new line. You can edit and delete your
  own; a super admin can delete anyone's, which is the escape hatch for someone
  leaving mid-thread.
- **Activity** — written by the app. The automatic audit trail of status moves,
  owner changes, tasks and record links. Collapsed by default.

Notes deliberately don't write to Activity, or every message would appear twice.

### Project templates

A template is a named checklist — "order hardware", "arrange survey", "book
install" — managed under **Admin → Templates**. A template can apply to all
clients or be scoped to one; a client-scoped template beats the all-clients one.

Templates land on a project two ways:

- **Automatically**, when a client raises a request through their link. Mark a
  template "auto-apply to requests" and every incoming request for that scope
  starts with those tasks on it. This is done by a database trigger, not app
  code — the person submitting a request is anonymous and the task insert policy
  requires internal staff, so they can't write their own tasks. The trigger runs
  as definer and does it for them.
- **Manually**, from a dropdown on the New Project form.

The trigger only fires for `source = 'intake'`, so a PM who picks a template in
the form doesn't get the checklist twice. Deleting a template leaves projects
already created from it untouched.

A template carries more than a checklist: a default description, priority, owner
and files. Anything the request or the create form already supplies wins — a
template description is only used when the requester left theirs blank. Each
template task can also carry a "due in N days" offset, turned into a real due
date when the template is applied.

**Template files are shared, not duplicated.** A Postgres trigger can't copy an
object in storage, so a project made from a template points at the template's
file by path. That's why deleting a template — or removing a file from one —
deliberately leaves the file in the bucket: a live project may still reference
it. The cost is the odd orphaned object; the alternative is an attachment that
silently 404s on a client's project.
