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
Existing databases need `supabase/06_portal.sql` and then `supabase/07_timer_tour.sql` run once.
The readiness assessment is timed (10 minutes by default, changeable in Settings): answers save as the
applicant goes, and the every-minute job submits any assessment left open after time runs out.

## Programme, examinations and grading (update 28)
The programme follows the Programme & Grading Policy: 20 weeks in 8 stages and three tracks
(Business Operations, People & Talent, Customer Success & Growth).

- **Weekly assessments:** 10 (Weeks 2–11), 5 questions each, one attempt, no resits. Each correct answer is 0.8 marks (max 40). They close when the examination week starts.
- **Examinations (Week 12):** Fundamental, 30 questions in 30 minutes, on Monday or Tuesday. Core Skill Learning, 40 questions for the learner's track in 45 minutes, on Wednesday (Business Operations), Thursday or Friday. Questions are drawn at random per candidate. Score = correct ÷ 70 × 60. Staff can authorise a resit per candidate; it replaces the earlier score.
- **Practical project (Weeks 13–14):** the final project is graded out of 100 with the project rubric.
- **Final score** = (assessments + examinations + project) ÷ 2, truncated to one decimal (never rounded up). Distinction 80–100, Merit 60–79, Pass 50–59, Fail below 50.
- A result stays **Pending** while any score is missing, unless the Programme Director approves an exception. Learners see their final score only after the Programme Director publishes results. Every correction needs a reason and is logged.
- Staff pages: **Results** (table, export, publish, per-student corrections, resits, exceptions) and **Examinations** (timetable, time limits, start window, publish).

Existing databases run, in order: `supabase/28_programme_v2.sql`, `supabase/28b_course_v2.sql`, `supabase/28c_question_banks.sql`.

**Update 29 (weekly deadline):** run `supabase/29_sunday_deadline.sql` after update 28. Weekly work is due Sunday at 18:00 WAT. Late tasks are accepted and marked late (no mark cut, since tasks don't count towards the final result). Each weekly assessment closes on Sunday 18:00 of its week; not taken = Missed, 0 marks. The "due tomorrow" reminder moves to Saturday morning.

**Update 30 (live classes):** run `supabase/30_live_classes.sql` after update 29. Every topic is a live class that facilitators set up in Staff → Live classes (topic, time, link, lesson notes, slides, resources, recording, chapters). Fundamentals classes (Weeks 2–3) are for everyone and set by the Cohort Manager; Core classes are per track. Learners open the class screen 20 minutes before, join, and enter the 4-digit class code the facilitator shows (Present within 15 minutes, Late after; both count). Missed a class: watch the recording and pass a 3-question catch-up check within 48 hours for half. Excused absences aren't counted. Final score = (attendance 10 + weekly assessments 30 + examinations 60 + project 100) ÷ 2. Facilitators write questions in Staff → Questions; the Programme Director approves them; a question locks once a learner has been given it. Slides and resources upload to the public Storage bucket `class-files` (20 MB per file), which the update creates.
Course content lives in `dev/course_v2/content.mjs` (run `node dev/course_v2/build.mjs`) and questions in
`dev/quiz_bank_v2.py` (run `python3 dev/quiz_bank_v2.py`). Then `python3 dev/build_sql.py` rebuilds `setup.sql`.
Sample files for the week tasks live in `public/samples/` (made by `python3 dev/course_v2/samples.py`; all people and companies are fictional). Any file named `w<week>-*.txt` or `.csv` in `public/samples/<track>/` or `common/` appears in that week's Resources after `node dev/course_v2/build.mjs`.
Test with `bash dev/test_grading.sh` after the other SQL tests.

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
bash dev/test_grading.sh        # assessments, examinations, project, final grade, publishing
python3 dev/e2e.py 1280         # full journey in a browser, including paying (use 390 for phone)
```

## Build phases
1. Foundations and admissions ✅ (this version)
2. Automatic emails ✅ (Resend, sent every minute by `netlify/functions/send-emails.mjs`)
3. Paystack payment, admission letter and matric numbers ✅
4. Student portal and learning ✅
5. Projects, internships, coaching and certificates
