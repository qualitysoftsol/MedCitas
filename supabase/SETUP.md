# MedCitas — Supabase Setup Guide

Follow these steps **in order**. Each step uses the Supabase Dashboard.

---

## Step 1 — Run schema migration

1. Open **Supabase Dashboard → SQL Editor → New query**
2. Paste the entire contents of `migrations/001_schema.sql`
3. Click **Run**
4. Expected result: "Success. No rows returned."

This creates 5 enums and 6 tables: `profiles`, `ips_fotos`, `slots`, `appointments`, `resultados`, `notifications`.

---

## Step 2 — Run RLS policies

1. Open a **New query** in SQL Editor
2. Paste the entire contents of `migrations/002_rls.sql`
3. Click **Run**
4. Expected result: "Success. No rows returned."

---

## Step 3 — Run auth trigger

1. Open a **New query** in SQL Editor
2. Paste the entire contents of `migrations/003_auth_trigger.sql`
3. Click **Run**
4. Expected result: "Success. No rows returned."

This creates the `handle_new_user` trigger that auto-populates `profiles` whenever a new user registers through the app.

---

## Step 4 — Create admin user

### 4a. Create the user in the dashboard

1. Go to **Supabase Dashboard → Authentication → Users**
2. Click **"Add user" → "Create new user"**
3. Enter your admin email and a strong password
4. Click **"Create user"**

### 4b. Insert the admin profile via SQL

1. Open `migrations/004_admin_user.sql` and **replace `admin@medcitas.co`** with the exact email you used above
2. Open a **New query** in SQL Editor
3. Paste the updated contents of `migrations/004_admin_user.sql`
4. Click **Run**
5. Expected result: "Success. 1 row affected." (or similar)

> **Why this step?** The `handle_new_user` trigger only fires for users who sign up through the app. Users created manually in the dashboard do not trigger it, so the profile row must be inserted manually.

---

## Step 5 — Create the `ips-fotos` Storage bucket

### 5a. Create the bucket

1. Go to **Supabase Dashboard → Storage**
2. Click **"New bucket"**
3. Set:
   - **Name:** `ips-fotos`
   - **Public bucket:** checked (enabled)
4. Click **"Save"**

### 5b. Add Storage RLS policies

Go to **Storage → ips-fotos → Policies → "New policy" → "For full customization"**

**Policy 1 — Public read:**
- Policy name: `public_read`
- Allowed operation: `SELECT`
- Target roles: *(leave empty — applies to all)*
- USING expression: `true`

**Policy 2 — IPS writes own folder:**
- Policy name: `ips_writes_own`
- Allowed operations: `INSERT`, `UPDATE`, `DELETE`
- Target roles: `authenticated`
- USING expression: `(storage.foldername(name))[1] = auth.uid()::text OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`

Note: After creating this policy, admin users can manage photos for any IPS.

---

## Step 6 — Enable Realtime for notifications

1. Go to **Supabase Dashboard → Database → Replication**
2. Find the `notifications` table
3. Enable **Realtime** for it (toggle the switch)

This allows the app to receive live push notifications without polling.

---

## Step 7 — Configure environment variables

Open the `.env` file in the project root and fill in the two Supabase values:

```
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

Find these values in: **Supabase Dashboard → Settings → API**
- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public** key → `VITE_SUPABASE_ANON_KEY`

---

## Step 8 — Verify

Go to **Supabase Dashboard → Table Editor**. Confirm all 6 tables are visible:

- `profiles`
- `ips_fotos`
- `slots`
- `appointments`
- `resultados`
- `notifications`

Setup is complete. The app is now ready to connect to Supabase.

---

## Step 9: Run migration 005 (notifications DELETE policy)

Open SQL Editor → New query, paste content of `supabase/migrations/005_fix_notifications_delete.sql`, run it.

---

## Step 10: Run migration 006 (slot uniqueness constraint)

Open SQL Editor → New query, paste content of `supabase/migrations/006_slot_unique.sql`, run it.

---

## Step 11: Run migration 007 (auth trigger — direccion + servicios fix)

Open SQL Editor → New query, paste content of `supabase/migrations/007_trigger_direccion_servicios.sql`, run it.

This updates the `handle_new_user` trigger to:
- Save the IPS `direccion` (physical address) into the profile on registration
- Read `servicios` from metadata (was previously reading the legacy `departamentos_medicos` key)

---

## Step 12: Run migration 008 (storage bucket — public + policies)

Open SQL Editor → New query, paste content of `supabase/migrations/008_storage_public.sql`, run it.

This ensures the `ips-fotos` bucket is public and has the correct storage policies so that empresa and particular users can view IPS photos. If you already created the bucket manually via the dashboard without "Public bucket" checked, this migration will fix it.

---

## Step 13: Password recovery ("olvidé mi contraseña")

The recovery email is **not** sent by Supabase's built-in template. It is sent by the
`reset-password` Edge Function through Resend, so it matches the branding of the other
MedCitas emails and does not depend on Supabase's default SMTP (which is rate limited to a
couple of emails per hour and only delivers to project team members).

### 13a. Allow the redirect URL

1. Go to **Supabase Dashboard → Authentication → URL Configuration**
2. Under **Redirect URLs**, add:
   - `http://localhost:8080/reset-password` (local development)
   - `https://<your-production-domain>/reset-password` (once production exists)

> Without this, Supabase silently ignores the redirect and the recovery link lands on the
> Site URL instead of the password form.

### 13b. Set the Edge Function secrets

Go to **Supabase Dashboard → Edge Functions → Secrets** and confirm these are set:

| Secret | Value | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | Resend API key | already used by `notify-appointment` |
| `ALLOWED_REDIRECT_ORIGINS` | `http://localhost:8080` | origins allowed to receive the recovery link; add production later, comma-separated |
| `SITE_URL` | *(leave it alone)* | shared with `notify-appointment`/`notify-resultado`, where it is the "Ver en plataforma" link. Here it is only the fallback used when `ALLOWED_REDIRECT_ORIGINS` is unset, so set that one instead of repointing this |
| `RESEND_TEST_EMAIL` | your own address | **see the warning below** |

> **While Resend has no verified domain:** the account can only send to the address that owns
> it. Keep `RESEND_TEST_EMAIL` set so every recovery email is redirected there — otherwise
> Resend rejects the send and the user never receives anything. Once a domain is verified in
> Resend, **delete** `RESEND_TEST_EMAIL` and change the `from` address in the function from
> `onboarding@resend.dev` to an address on that domain.

### 13c. Deploy the function

```
supabase functions deploy reset-password
```

Writing the file under `supabase/functions/` does not publish it — without this deploy the
app calls a function that does not exist and the request fails with a 404.

The function answers identically whether or not the email belongs to a registered account, so
it cannot be used to discover which addresses exist. Recovery links expire after 1 hour and
work only once.
