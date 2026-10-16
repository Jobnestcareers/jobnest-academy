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

## Automatic emails
Emails are written by the database into the `outbox` table and sent every minute by the
Netlify function `netlify/functions/send-emails.mjs` through Resend. In Netlify → **Site configuration →
Environment variables**, add:

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | API key from resend.com (sending access) |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **Secret** key (`sb_secret_...`) |
| `EMAIL_FROM` | `Jobnest Academy Admissions <admissions@jobnestcareers.com>` |
| `EMAIL_REPLY_TO` | `info@jobnestcareers.com` |

Then redeploy. Existing databases also need `supabase/04_email_sending.sql` run once.

## Payments (Paystack)
An applicant with an offer chooses **full payment** or **2 parts** and pays on Paystack's own page.
`netlify/functions/pay.mjs` starts the payment, `pay-return.mjs` checks it with Paystack when they come back,
and `paystack-webhook.mjs` is Paystack's backup confirmation. The first successful payment admits them,
gives a matric number (e.g. `GEP/27A/001`) and opens the printable admission letter. Every minute the
email function also expires unpaid offers and sends payment reminders.

| Name | Value |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | Paystack → Settings → API Keys & Webhooks → **Secret key** (`sk_test_...` while testing, `sk_live_...` when activated) |

In Paystack, set the **Webhook URL** to `https://academy.jobnestcareers.com/.netlify/functions/paystack-webhook`.
Existing databases need `supabase/05_payments.sql` run once. Staff see everything under **Payments**,
and can record a bank transfer made outside Paystack or give someone more time to pay.

## Student portal
Admitted students set a password from their application page (or the set-up email staff send from
**Academy → Students**), then sign in at `/#/learn/signin` with their matric number. Behind the scenes their
login is a private address made from the matric number (`gep-27a-001@students.jobnestcareers.com`),
created by `netlify/functions/student-account.mjs` with the Supabase secret key, so Supabase never has to
send them email. Staff add lessons, links and tasks under **Content**, mark work under **Grading**,
schedule classes and take attendance under **Live sessions**, and post **Announcements**. A facilitator
given a track under **Staff accounts** only sees and marks that track.
Existing databases need `supabase/06_portal.sql` run once.

## Testing locally
Needs Postgres 16 and Python 3 with Playwright.
```
bash dev/reset_db.sh            # fresh local database with the real SQL
python3 dev/emulator.py 8787 &  # local stand-in for Supabase on http://localhost:8787
node dev/functions_server.mjs & # payment functions with a fake Paystack on :8788
bash dev/test_sql.sh            # database-level checks
bash dev/test_pay.sh            # payments, matric numbers, expiry and reminders
bash dev/test_portal.sh         # student portal, grading, attendance and track permissions
python3 dev/e2e.py 1280         # full journey in a browser, including paying (use 390 for phone)
```

## Build phases
1. Foundations and admissions ✅ (this version)
2. Automatic emails ✅ (Resend, sent every minute by `netlify/functions/send-emails.mjs`)
3. Paystack payment, admission letter and matric numbers ✅
4. Student portal and learning ✅
5. Projects, internships, coaching and certificates
