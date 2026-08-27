# Site Survey — Digital Signage

Two-part app:
- `/` — public survey form. No account needed, anyone with the link can submit.
- `/dashboard` — reports view. Requires a logged-in account.

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
