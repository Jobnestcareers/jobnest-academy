# Jobnest Academy

The live Jobnest Academy platform for the 17-week Graduate Employability Programme: the public
Academy site, the applicant journey from application to paid admission, the student portal that
carries a student from Week 1 to graduation, and the staff portals that run it. Built from the
approved prototype.

## What's built

**Public site and admissions**
- Academy landing page with fees (full or 2 parts), tracks and programme pages, team from Settings,
  and a sample certificate.
- Application form with State and City/town dropdowns, a Zuri summary pre-fill link
  (`/apply/zuri/...`), and a random application number. Applicants continue later with that
  number and their surname.
- Timed readiness assessment drawn from a question bank (5 minutes by default, changeable in Settings).
- Discovery Call booking with the Teams link and Add to Google Calendar.
- Offers, Paystack payment (full or 2 parts), matric numbers, the one-page admission letter,
  reminders and expiry of unpaid offers.
- Automatic emails for every step through Resend.

**Student portal** (`/learn`, installable as a home-screen app)
- Home, My Learning with stages and weeks that open by progress and date, lessons,
  server-marked quizzes with timer and retake, tasks and assignments, Student Oath and check-ins.
- Client project with brief, rubric and supervisor messages.
- Internship placement and a weekly logbook that the host supervisor signs from a secure
  no-login link.
- Coaching: Discovery Call 2 booking with coach times and results, CV builder.
- My Career (from Week 14): readiness checklist, skills profile, portfolio, interview practice,
  career goals and talent-matching consent. Job search tools and Opportunities (from Week 16).
- Graduation step and page, certificate tab with PDF download, Add to LinkedIn and a public
  verify page (`/verify`, accepts the certificate code or the matric number).
- Job outcomes, 30/60/90-day alumni check-ins and an exit survey.
- Cohort and pod pages, cohort discussion and career chat, alerts, profile photo and ID card.
- An overdue second instalment pauses learning until it is paid.

**Staff portal** (`/portal`)
- A home page for every role: Super Admin command centre, Programme Director, Cohort Manager,
  Facilitator, Career Coach, Academy Admin, Admissions Admin and Admissions Officer.
- Needs attention queue, Student 360 record with notes, documents and check-ins, and global search.
- Applications, call times, payments (including recording a bank transfer), students and
  certificates, content, grading, live sessions and attendance, announcements, pods, discussion,
  internships and host organisations, job search, opportunities, outcomes and support.
- Staff & access with roles, permissions and invites; facilitators see only their track.
- Settings for links, fees, the team, testing modes and the pilot cohort.

**Pilot cohort for outside testers**
- The Super Admin starts a pilot under **Settings** and gets a private link (`/apply/pilot/CODE`).
- Testers apply into their own cohort (matric `GEP/26P/...`), so real applicants stay in Cohort 1.
- Testers can't pay through Paystack; admissions admits them with **Record a bank transfer**.
- Staff lists show a Pilot badge, and staff pages, live sessions and announcements follow the
  pilot while it runs.
- `supabase/cleanup_pilot.sql` deletes the pilot cohort and every tester and keeps everything else.

## How it fits together

| Part | Where | What it does |
| --- | --- | --- |
| `public/` | Netlify | The website people use. Plain HTML, CSS and JavaScript, no build step. |
| `supabase/setup.sql` | Supabase | The database: tables, the functions the website calls, and starting data. Built from the numbered files by `dev/build_sql.py`. |
| `website/` | Netlify (separate site) | The main Jobnest website for jobnestcareers.com. Set the Netlify base directory to `website`. |
| `dev/` | Your computer only | Tests and a local stand-in for Supabase. Not published. |

Every table is locked. The website can only call the database functions in
`supabase/`, and each function checks who is asking (applicant link,
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
The readiness assessment is timed (5 minutes by default, changeable in Settings): answers save as the
applicant goes, and the every-minute job submits any assessment left open after time runs out.

## Updating an existing database
A new database only needs `supabase/setup.sql`. An existing one needs each numbered file in
`supabase/` it hasn't had yet, run once in order (`04_email_sending.sql` up to `26_pilot.sql`).
Each file is safe to run again.

## Testing and launch tools
- **Settings → Testing** has three modes: Normal (progress and dates), Progress only (dates ignored)
  and All weeks open.
- `supabase/sample_course_content.sql` adds sample lessons, tasks and live classes for all 17 weeks.
- `supabase/cleanup_pilot.sql` removes the pilot cohort and its testers when pilot testing ends.
- `supabase/cleanup_test_data.sql` clears every application and the sample content before launch, so
  the first real student gets `GEP/27A/001`.

Both clean-up scripts start with a SELECT that shows what would be deleted. Run that first.

## Testing locally
Needs Postgres 16 and Python 3 with Playwright.
```
bash dev/reset_db.sh            # fresh local database with the real SQL
python3 dev/emulator.py 8787 &  # local stand-in for Supabase on http://localhost:8787
node dev/functions_server.mjs & # payment functions with a fake Paystack on :8788
bash dev/test_sql.sh            # database-level checks
bash dev/test_pay.sh            # payments, matric numbers, expiry and reminders
bash dev/test_portal.sh         # student portal, grading, attendance and track permissions
bash dev/test_timer.sh          # timed assessment: saving, time-outs and auto-submit
python3 dev/e2e.py 1280         # full journey in a browser, including paying (use 390 for phone)
```

## Build phases
1. Foundations and admissions ✅
2. Automatic emails ✅ (Resend, sent every minute by `netlify/functions/send-emails.mjs`)
3. Paystack payment, admission letter and matric numbers ✅
4. Student portal and learning ✅
5. Projects, internships, coaching and certificates ✅ (plus job search, graduation and alumni outcomes)
6. Staff role portals and the Super Admin command centre ✅
7. Pilot cohort with outside testers ✅ (now)
8. Launch: clear test data and open Cohort 1 (Jan 2027)
