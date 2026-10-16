# Jobnest Academy

The live Jobnest Academy platform: the public Academy site, the applicant journey
(apply → readiness check → Discovery Call booking → status), and the staff portals
(Admissions Officer, Admissions Admin, Super Admin). Built from the approved prototype.

## How it fits together

| Part | Where | What it does |
| --- | --- | --- |
| `public/` | Netlify | The website people use. Plain HTML, CSS and JavaScript, no build step. |
| `supabase/setup.sql` | Supabase | The database: tables, the functions the website calls, and starting data. |
| `dev/` | Your computer only | Tests and a local stand-in for Supabase. Not published. |

Every table is locked. The website can only call the database functions in
`supabase/02_functions.sql`, and each function checks who is asking (applicant link,
staff role) before it reads or changes anything.

## First-time setup

### 1. Database (Supabase)
1. Open `supabase/setup.sql`. Near the top of the starting data, replace
   `CHANGE-ME@example.com` and `CHANGE ME` with **your** email and name. That email becomes the first Super Admin.
2. In Supabase: **SQL Editor → New query**, paste the whole file, press **Run**.
3. In Supabase: **Authentication → URL Configuration**
   - **Site URL:** `https://academy.jobnestcareers.com`
   - **Redirect URLs:** add `https://academy.jobnestcareers.com/**` and your Netlify address, e.g. `https://jobnest-academy.netlify.app/**`

### 2. Public key
Put the Supabase **anon / publishable** key in `public/assets/config.js`. It is safe to publish.
Never put the `service_role` / secret key in this repository.

### 3. Website (Netlify)
1. **Add new site → Import an existing project → GitHub →** `jobnest-academy`.
2. Leave the build command empty. The publish folder (`public`) comes from `netlify.toml`.
3. **Domain management →** add `academy.jobnestcareers.com` and follow Netlify's DNS steps.

### 4. Your account
Open the site, go to **Staff sign-in → First time? Set up your account**, and use the
email you put in step 1. Then add your team under **Staff accounts**.

## Testing locally
Needs Postgres 16 and Python 3 with Playwright.
```
bash dev/reset_db.sh            # fresh local database with the real SQL
python3 dev/emulator.py 8787 &  # local stand-in for Supabase on http://localhost:8787
bash dev/test_sql.sh            # database-level checks
python3 dev/e2e.py 1280         # full journey in a browser (use 375 for phone)
```

## Build phases
1. Foundations and admissions ✅ (this version)
2. Automatic emails (an email service sends what is now queued in **Emails**)
3. Paystack payment, admission letter and matric numbers
4. Student portal and learning
5. Projects, internships, coaching and certificates
