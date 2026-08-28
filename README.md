# Site Survey — Digital Signage

Three-part app:
- `/` — public survey form. No account needed, anyone with the link can submit.
- `/dashboard` — reports view. Requires a logged-in account.
- `/admin` — user permissions. Requires a super admin account; the "Admin" nav link
  only shows up for super admins.

## 1. One-time Supabase setup

1. Open your Supabase project → **SQL Editor** → New query.
2. Paste in the contents of `supabase/schema.sql` and run it. This creates the `surveys`
   and `profiles` tables, the `survey-photos` storage bucket, and the access rules:
   anyone can submit a survey, only logged-in users can read them back.
3. Go to **Authentication → Users** and manually create your ~20 dashboard accounts
   (one per PM/reviewer) with an email + password. There's no public sign-up page —
   this is intentional, so only people you've added can see the dashboard.
4. Also run `supabase/002_add_delete_policy.sql` in the SQL Editor — this enables the
   "Delete Survey" button in the dashboard.
5. Also run `supabase/003_add_address_column.sql` — this adds the Address field.
6. Also run `supabase/004_registration_and_permissions.sql` — this adds:
   - Public self-registration restricted to @linney.com emails (applies even to
     accounts you add manually going forward)
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
10. **Enable email confirmations**: Supabase → Authentication → Providers → Email,
    make sure "Confirm email" is switched on (it's on by default for new projects).
11. **Set your redirect URLs**: Supabase → Authentication → URL Configuration — add
    both `http://localhost:3000/login` and your real Vercel URL (e.g.
    `https://your-app.vercel.app/login`) under Redirect URLs, so confirmation email
    links work in both places.
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
