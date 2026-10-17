-- Student portal, Phase 1: weeks unlock in order, quizzes are marked by the server,
-- link tasks are graded by facilitators, and late work is capped (100% / 80% / 50%).

create table if not exists course_items (
  track_code text not null references tracks(code),
  week int not null check (week between 1 and 30),
  key text not null,
  type text not null,
  title text not null,
  proj boolean not null default false,   -- the week project (graded, counts toward the week result)
  opt boolean not null default false,    -- optional
  link boolean not null default false,   -- needs a link to the work
  staff boolean not null default false,  -- completed by staff, not the student
  answers int[],                         -- quiz answer key (never sent to students)
  primary key (track_code, key)
);
alter table course_items enable row level security;

create table if not exists learn_progress (
  application_id uuid not null references applications(id) on delete cascade,
  key text not null,
  week int not null,
  status text not null check (status in ('done','submitted','graded','revise')),
  link text,
  data jsonb,
  score int,            -- final score after any late cap
  cap numeric,          -- 1, 0.8 or 0.5 depending on when it was submitted
  grade int,            -- the facilitator's grade before the cap
  feedback text,
  done_at timestamptz not null default now(),
  graded_by text,
  graded_at timestamptz,
  primary key (application_id, key)
);
alter table learn_progress enable row level security;

create table if not exists learn_attempts (
  application_id uuid not null references applications(id) on delete cascade,
  week int not null, n int not null default 1,
  primary key (application_id, week)
);
alter table learn_attempts enable row level security;

create table if not exists learn_checkins (
  application_id uuid not null references applications(id) on delete cascade,
  week int not null, conf int not null check (conf between 1 and 5), note text,
  at timestamptz not null default now(),
  primary key (application_id, week)
);
alter table learn_checkins enable row level security;

create table if not exists learn_history (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  key text not null, action text not null, by_name text,
  at timestamptz not null default now()
);
alter table learn_history enable row level security;

insert into app_settings(key, value) values ('learn_pass', '70') on conflict (key) do nothing;

-- The programme's items for every track (from the approved prototype).
delete from course_items;
insert into course_items(track_code, week, key, type, title, proj, opt, link, staff, answers) values
('ADM', 1, 'w1-1', 'guide', 'How to navigate the platform', false, false, false, false, null),
('ADM', 1, 'w1-2', 'oath', 'Read & sign the Student Oath', false, false, false, false, null),
('ADM', 1, 'w1-3', 'task', 'Read the Student Handbook', false, false, false, false, null),
('ADM', 1, 'w1-4', 'task', 'Join your cohort community', false, true, false, false, null),
('ADM', 2, 'w2-1', 'lesson', 'Professional communication', false, false, false, false, null),
('ADM', 2, 'w2-2', 'lesson', 'Remote work etiquette', false, false, false, false, null),
('ADM', 2, 'w2-3', 'lesson', 'File organisation in Google Drive & OneDrive', false, false, false, false, null),
('ADM', 2, 'w2-4', 'quiz', 'Week 2 assessment', false, false, false, false, array[1,2,3,0,1]::int[]),
('ADM', 2, 'w2-5', 'task', 'Week project: rewrite a messy email', true, false, true, false, null),
('ADM', 3, 'w3-1', 'lesson', 'Time management', false, false, false, false, null),
('ADM', 3, 'w3-2', 'lesson', 'Task tracking with Trello & Notion', false, false, false, false, null),
('ADM', 3, 'w3-3', 'quiz', 'Workplace Readiness Quiz', false, false, false, false, array[1,2,1,2,1]::int[]),
('ADM', 3, 'w3-4', 'task', 'Week project: set up your clean digital workspace', true, false, true, false, null),
('ADM', 4, 'w4-1', 'lesson', 'Calendar & inbox management', false, false, false, false, null),
('ADM', 4, 'w4-2', 'quiz', 'Week 4 assessment', false, false, false, false, array[3,0,1]::int[]),
('ADM', 4, 'w4-3', 'task', 'Week project: Calendar & Inbox Management', true, false, true, false, null),
('ADM', 4, 'w4-4', 'task', 'Stretch challenge', false, true, true, false, null),
('ADM', 5, 'w5-1', 'lesson', 'Business documents in Google Docs & Word', false, false, false, false, null),
('ADM', 5, 'w5-2', 'quiz', 'Week 5 assessment', false, false, false, false, array[0,1,2]::int[]),
('ADM', 5, 'w5-3', 'task', 'Week project: Business Documents', true, false, true, false, null),
('ADM', 5, 'w5-4', 'task', 'Stretch challenge', false, true, true, false, null),
('ADM', 6, 'w6-1', 'lesson', 'Spreadsheets for admins', false, false, false, false, null),
('ADM', 6, 'w6-2', 'quiz', 'Week 6 assessment', false, false, false, false, array[1,2,3]::int[]),
('ADM', 6, 'w6-3', 'task', 'Week project: Spreadsheets for Admins', true, false, true, false, null),
('ADM', 6, 'w6-4', 'task', 'Stretch challenge', false, true, true, false, null),
('ADM', 7, 'w7-1', 'lesson', 'Travel, expenses & vendor coordination', false, false, false, false, null),
('ADM', 7, 'w7-2', 'quiz', 'Week 7 assessment', false, false, false, false, array[2,3,0]::int[]),
('ADM', 7, 'w7-3', 'task', 'Week project: module assignment', true, false, true, false, null),
('ADM', 7, 'w7-4', 'task', 'Technical competency check', false, false, false, false, null),
('ADM', 7, 'w7-5', 'task', 'Stretch challenge', false, true, true, false, null),
('ADM', 8, 'w8-1', 'task', 'Read your project brief', false, false, false, false, null),
('ADM', 8, 'w8-2', 'task', 'Submit your project plan', true, false, true, false, null),
('ADM', 8, 'w8-3', 'task', 'Check-in with your project supervisor', false, false, false, false, null),
('ADM', 9, 'w9-1', 'task', 'Submit your final project', true, false, true, false, null),
('ADM', 9, 'w9-2', 'task', 'Self-review against the rubric', false, false, false, false, null),
('ADM', 9, 'w9-3', 'task', 'Supervisor grading', false, false, false, true, null),
('ADM', 10, 'w10-1', 'task', 'Confirm your placement', false, false, false, false, null),
('ADM', 10, 'w10-2', 'logweek', 'Logbook entry · Week 1', false, false, false, false, null),
('ADM', 11, 'w11-1', 'logweek', 'Logbook entry · Week 2', false, false, false, false, null),
('ADM', 12, 'w12-1', 'logweek', 'Logbook entry · Week 3', false, false, false, false, null),
('ADM', 13, 'w13-1', 'logweek', 'Logbook entry · Week 4', false, false, false, false, null),
('ADM', 13, 'w13-2', 'task', 'Supervisor performance evaluation', false, false, false, true, null),
('ADM', 13, 'w13-3', 'task', 'Collect your internship certificate', false, false, false, false, null),
('ADM', 14, 'w14-1', 'task', 'ATS-compliant resume', false, false, true, false, null),
('ADM', 14, 'w14-2', 'task', 'LinkedIn profile makeover', false, false, true, false, null),
('ADM', 14, 'w14-3', 'task', 'Publish your portfolio', false, false, true, false, null),
('ADM', 14, 'w14-4', 'task', 'CV swap with a pod member', false, true, false, false, null),
('ADM', 15, 'w15-1', 'task', 'Book your 1-on-1 session', false, false, false, false, null),
('ADM', 15, 'w15-2', 'task', 'Mock interview simulation', false, false, false, false, null),
('ADM', 15, 'w15-3', 'task', 'Finalise your Job Search Action Plan', false, false, true, false, null),
('ADM', 16, 'w16-1', 'task', 'Record your elevator pitch', false, false, true, false, null),
('ADM', 16, 'w16-2', 'task', 'Send 10 cold outreach messages', false, false, false, false, null),
('ADM', 17, 'w17-1', 'task', 'Weekly job application tracker', false, false, true, false, null),
('ADM', 17, 'w17-2', 'task', 'Report your first interview invite', false, false, false, false, null),
('CSP', 1, 'w1-1', 'guide', 'How to navigate the platform', false, false, false, false, null),
('CSP', 1, 'w1-2', 'oath', 'Read & sign the Student Oath', false, false, false, false, null),
('CSP', 1, 'w1-3', 'task', 'Read the Student Handbook', false, false, false, false, null),
('CSP', 1, 'w1-4', 'task', 'Join your cohort community', false, true, false, false, null),
('CSP', 2, 'w2-1', 'lesson', 'Professional communication', false, false, false, false, null),
('CSP', 2, 'w2-2', 'lesson', 'Remote work etiquette', false, false, false, false, null),
('CSP', 2, 'w2-3', 'lesson', 'File organisation in Google Drive & OneDrive', false, false, false, false, null),
('CSP', 2, 'w2-4', 'quiz', 'Week 2 assessment', false, false, false, false, array[1,2,3,0,1]::int[]),
('CSP', 2, 'w2-5', 'task', 'Week project: rewrite a messy email', true, false, true, false, null),
('CSP', 3, 'w3-1', 'lesson', 'Time management', false, false, false, false, null),
('CSP', 3, 'w3-2', 'lesson', 'Task tracking with Trello & Notion', false, false, false, false, null),
('CSP', 3, 'w3-3', 'quiz', 'Workplace Readiness Quiz', false, false, false, false, array[1,2,1,2,1]::int[]),
('CSP', 3, 'w3-4', 'task', 'Week project: set up your clean digital workspace', true, false, true, false, null),
('CSP', 4, 'w4-1', 'lesson', 'Customer support fundamentals', false, false, false, false, null),
('CSP', 4, 'w4-2', 'quiz', 'Week 4 assessment', false, false, false, false, array[3,0,1]::int[]),
('CSP', 4, 'w4-3', 'task', 'Week project: Support Fundamentals', true, false, true, false, null),
('CSP', 4, 'w4-4', 'task', 'Stretch challenge', false, true, true, false, null),
('CSP', 5, 'w5-1', 'lesson', 'Working in a ticketing tool', false, false, false, false, null),
('CSP', 5, 'w5-2', 'quiz', 'Week 5 assessment', false, false, false, false, array[0,1,2]::int[]),
('CSP', 5, 'w5-3', 'task', 'Week project: Ticketing Tools', true, false, true, false, null),
('CSP', 5, 'w5-4', 'task', 'Stretch challenge', false, true, true, false, null),
('CSP', 6, 'w6-1', 'lesson', 'Live chat & email etiquette', false, false, false, false, null),
('CSP', 6, 'w6-2', 'quiz', 'Week 6 assessment', false, false, false, false, array[1,2,3]::int[]),
('CSP', 6, 'w6-3', 'task', 'Week project: Live Chat & Email Etiquette', true, false, true, false, null),
('CSP', 6, 'w6-4', 'task', 'Stretch challenge', false, true, true, false, null),
('CSP', 7, 'w7-1', 'lesson', 'CX metrics: CSAT, FRT and NPS', false, false, false, false, null),
('CSP', 7, 'w7-2', 'quiz', 'Week 7 assessment', false, false, false, false, array[2,3,0]::int[]),
('CSP', 7, 'w7-3', 'task', 'Week project: module assignment', true, false, true, false, null),
('CSP', 7, 'w7-4', 'task', 'Technical competency check', false, false, false, false, null),
('CSP', 7, 'w7-5', 'task', 'Stretch challenge', false, true, true, false, null),
('CSP', 8, 'w8-1', 'task', 'Read your project brief', false, false, false, false, null),
('CSP', 8, 'w8-2', 'task', 'Submit your project plan', true, false, true, false, null),
('CSP', 8, 'w8-3', 'task', 'Check-in with your project supervisor', false, false, false, false, null),
('CSP', 9, 'w9-1', 'task', 'Submit your final project', true, false, true, false, null),
('CSP', 9, 'w9-2', 'task', 'Self-review against the rubric', false, false, false, false, null),
('CSP', 9, 'w9-3', 'task', 'Supervisor grading', false, false, false, true, null),
('CSP', 10, 'w10-1', 'task', 'Confirm your placement', false, false, false, false, null),
('CSP', 10, 'w10-2', 'logweek', 'Logbook entry · Week 1', false, false, false, false, null),
('CSP', 11, 'w11-1', 'logweek', 'Logbook entry · Week 2', false, false, false, false, null),
('CSP', 12, 'w12-1', 'logweek', 'Logbook entry · Week 3', false, false, false, false, null),
('CSP', 13, 'w13-1', 'logweek', 'Logbook entry · Week 4', false, false, false, false, null),
('CSP', 13, 'w13-2', 'task', 'Supervisor performance evaluation', false, false, false, true, null),
('CSP', 13, 'w13-3', 'task', 'Collect your internship certificate', false, false, false, false, null),
('CSP', 14, 'w14-1', 'task', 'ATS-compliant resume', false, false, true, false, null),
('CSP', 14, 'w14-2', 'task', 'LinkedIn profile makeover', false, false, true, false, null),
('CSP', 14, 'w14-3', 'task', 'Publish your portfolio', false, false, true, false, null),
('CSP', 14, 'w14-4', 'task', 'CV swap with a pod member', false, true, false, false, null),
('CSP', 15, 'w15-1', 'task', 'Book your 1-on-1 session', false, false, false, false, null),
('CSP', 15, 'w15-2', 'task', 'Mock interview simulation', false, false, false, false, null),
('CSP', 15, 'w15-3', 'task', 'Finalise your Job Search Action Plan', false, false, true, false, null),
('CSP', 16, 'w16-1', 'task', 'Record your elevator pitch', false, false, true, false, null),
('CSP', 16, 'w16-2', 'task', 'Send 10 cold outreach messages', false, false, false, false, null),
('CSP', 17, 'w17-1', 'task', 'Weekly job application tracker', false, false, true, false, null),
('CSP', 17, 'w17-2', 'task', 'Report your first interview invite', false, false, false, false, null),
('DAT', 1, 'w1-1', 'guide', 'How to navigate the platform', false, false, false, false, null),
('DAT', 1, 'w1-2', 'oath', 'Read & sign the Student Oath', false, false, false, false, null),
('DAT', 1, 'w1-3', 'task', 'Read the Student Handbook', false, false, false, false, null),
('DAT', 1, 'w1-4', 'task', 'Join your cohort community', false, true, false, false, null),
('DAT', 2, 'w2-1', 'lesson', 'Professional communication', false, false, false, false, null),
('DAT', 2, 'w2-2', 'lesson', 'Remote work etiquette', false, false, false, false, null),
('DAT', 2, 'w2-3', 'lesson', 'File organisation in Google Drive & OneDrive', false, false, false, false, null),
('DAT', 2, 'w2-4', 'quiz', 'Week 2 assessment', false, false, false, false, array[1,2,3,0,1]::int[]),
('DAT', 2, 'w2-5', 'task', 'Week project: rewrite a messy email', true, false, true, false, null),
('DAT', 3, 'w3-1', 'lesson', 'Time management', false, false, false, false, null),
('DAT', 3, 'w3-2', 'lesson', 'Task tracking with Trello & Notion', false, false, false, false, null),
('DAT', 3, 'w3-3', 'quiz', 'Workplace Readiness Quiz', false, false, false, false, array[1,2,1,2,1]::int[]),
('DAT', 3, 'w3-4', 'task', 'Week project: set up your clean digital workspace', true, false, true, false, null),
('DAT', 4, 'w4-1', 'lesson', 'Spreadsheet foundations for analysts', false, false, false, false, null),
('DAT', 4, 'w4-2', 'quiz', 'Week 4 assessment', false, false, false, false, array[3,0,1]::int[]),
('DAT', 4, 'w4-3', 'task', 'Week project: Spreadsheet Foundations', true, false, true, false, null),
('DAT', 4, 'w4-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DAT', 5, 'w5-1', 'lesson', 'Cleaning messy data', false, false, false, false, null),
('DAT', 5, 'w5-2', 'quiz', 'Week 5 assessment', false, false, false, false, array[0,1,2]::int[]),
('DAT', 5, 'w5-3', 'task', 'Week project: Cleaning Messy Data', true, false, true, false, null),
('DAT', 5, 'w5-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DAT', 6, 'w6-1', 'lesson', 'Charts that answer a question', false, false, false, false, null),
('DAT', 6, 'w6-2', 'quiz', 'Week 6 assessment', false, false, false, false, array[1,2,3]::int[]),
('DAT', 6, 'w6-3', 'task', 'Week project: Charts That Answer Questions', true, false, true, false, null),
('DAT', 6, 'w6-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DAT', 7, 'w7-1', 'lesson', 'Building a simple dashboard', false, false, false, false, null),
('DAT', 7, 'w7-2', 'quiz', 'Week 7 assessment', false, false, false, false, array[2,3,0]::int[]),
('DAT', 7, 'w7-3', 'task', 'Week project: module assignment', true, false, true, false, null),
('DAT', 7, 'w7-4', 'task', 'Technical competency check', false, false, false, false, null),
('DAT', 7, 'w7-5', 'task', 'Stretch challenge', false, true, true, false, null),
('DAT', 8, 'w8-1', 'task', 'Read your project brief', false, false, false, false, null),
('DAT', 8, 'w8-2', 'task', 'Submit your project plan', true, false, true, false, null),
('DAT', 8, 'w8-3', 'task', 'Check-in with your project supervisor', false, false, false, false, null),
('DAT', 9, 'w9-1', 'task', 'Submit your final project', true, false, true, false, null),
('DAT', 9, 'w9-2', 'task', 'Self-review against the rubric', false, false, false, false, null),
('DAT', 9, 'w9-3', 'task', 'Supervisor grading', false, false, false, true, null),
('DAT', 10, 'w10-1', 'task', 'Confirm your placement', false, false, false, false, null),
('DAT', 10, 'w10-2', 'logweek', 'Logbook entry · Week 1', false, false, false, false, null),
('DAT', 11, 'w11-1', 'logweek', 'Logbook entry · Week 2', false, false, false, false, null),
('DAT', 12, 'w12-1', 'logweek', 'Logbook entry · Week 3', false, false, false, false, null),
('DAT', 13, 'w13-1', 'logweek', 'Logbook entry · Week 4', false, false, false, false, null),
('DAT', 13, 'w13-2', 'task', 'Supervisor performance evaluation', false, false, false, true, null),
('DAT', 13, 'w13-3', 'task', 'Collect your internship certificate', false, false, false, false, null),
('DAT', 14, 'w14-1', 'task', 'ATS-compliant resume', false, false, true, false, null),
('DAT', 14, 'w14-2', 'task', 'LinkedIn profile makeover', false, false, true, false, null),
('DAT', 14, 'w14-3', 'task', 'Publish your portfolio', false, false, true, false, null),
('DAT', 14, 'w14-4', 'task', 'CV swap with a pod member', false, true, false, false, null),
('DAT', 15, 'w15-1', 'task', 'Book your 1-on-1 session', false, false, false, false, null),
('DAT', 15, 'w15-2', 'task', 'Mock interview simulation', false, false, false, false, null),
('DAT', 15, 'w15-3', 'task', 'Finalise your Job Search Action Plan', false, false, true, false, null),
('DAT', 16, 'w16-1', 'task', 'Record your elevator pitch', false, false, true, false, null),
('DAT', 16, 'w16-2', 'task', 'Send 10 cold outreach messages', false, false, false, false, null),
('DAT', 17, 'w17-1', 'task', 'Weekly job application tracker', false, false, true, false, null),
('DAT', 17, 'w17-2', 'task', 'Report your first interview invite', false, false, false, false, null),
('DMK', 1, 'w1-1', 'guide', 'How to navigate the platform', false, false, false, false, null),
('DMK', 1, 'w1-2', 'oath', 'Read & sign the Student Oath', false, false, false, false, null),
('DMK', 1, 'w1-3', 'task', 'Read the Student Handbook', false, false, false, false, null),
('DMK', 1, 'w1-4', 'task', 'Join your cohort community', false, true, false, false, null),
('DMK', 2, 'w2-1', 'lesson', 'Professional communication', false, false, false, false, null),
('DMK', 2, 'w2-2', 'lesson', 'Remote work etiquette', false, false, false, false, null),
('DMK', 2, 'w2-3', 'lesson', 'File organisation in Google Drive & OneDrive', false, false, false, false, null),
('DMK', 2, 'w2-4', 'quiz', 'Week 2 assessment', false, false, false, false, array[1,2,3,0,1]::int[]),
('DMK', 2, 'w2-5', 'task', 'Week project: rewrite a messy email', true, false, true, false, null),
('DMK', 3, 'w3-1', 'lesson', 'Time management', false, false, false, false, null),
('DMK', 3, 'w3-2', 'lesson', 'Task tracking with Trello & Notion', false, false, false, false, null),
('DMK', 3, 'w3-3', 'quiz', 'Workplace Readiness Quiz', false, false, false, false, array[1,2,1,2,1]::int[]),
('DMK', 3, 'w3-4', 'task', 'Week project: set up your clean digital workspace', true, false, true, false, null),
('DMK', 4, 'w4-1', 'lesson', 'Marketing fundamentals & the funnel', false, false, false, false, null),
('DMK', 4, 'w4-2', 'quiz', 'Week 4 assessment', false, false, false, false, array[3,0,1]::int[]),
('DMK', 4, 'w4-3', 'task', 'Week project: Marketing Fundamentals', true, false, true, false, null),
('DMK', 4, 'w4-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DMK', 5, 'w5-1', 'lesson', 'Content creation with Canva', false, false, false, false, null),
('DMK', 5, 'w5-2', 'quiz', 'Week 5 assessment', false, false, false, false, array[0,1,2]::int[]),
('DMK', 5, 'w5-3', 'task', 'Week project: Content Creation with Canva', true, false, true, false, null),
('DMK', 5, 'w5-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DMK', 6, 'w6-1', 'lesson', 'Social media management', false, false, false, false, null),
('DMK', 6, 'w6-2', 'quiz', 'Week 6 assessment', false, false, false, false, array[1,2,3]::int[]),
('DMK', 6, 'w6-3', 'task', 'Week project: Social Media Management', true, false, true, false, null),
('DMK', 6, 'w6-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DMK', 7, 'w7-1', 'lesson', 'Paid ads & analytics basics', false, false, false, false, null),
('DMK', 7, 'w7-2', 'quiz', 'Week 7 assessment', false, false, false, false, array[2,3,0]::int[]),
('DMK', 7, 'w7-3', 'task', 'Week project: module assignment', true, false, true, false, null),
('DMK', 7, 'w7-4', 'task', 'Technical competency check', false, false, false, false, null),
('DMK', 7, 'w7-5', 'task', 'Stretch challenge', false, true, true, false, null),
('DMK', 8, 'w8-1', 'task', 'Read your project brief', false, false, false, false, null),
('DMK', 8, 'w8-2', 'task', 'Submit your project plan', true, false, true, false, null),
('DMK', 8, 'w8-3', 'task', 'Check-in with your project supervisor', false, false, false, false, null),
('DMK', 9, 'w9-1', 'task', 'Submit your final project', true, false, true, false, null),
('DMK', 9, 'w9-2', 'task', 'Self-review against the rubric', false, false, false, false, null),
('DMK', 9, 'w9-3', 'task', 'Supervisor grading', false, false, false, true, null),
('DMK', 10, 'w10-1', 'task', 'Confirm your placement', false, false, false, false, null),
('DMK', 10, 'w10-2', 'logweek', 'Logbook entry · Week 1', false, false, false, false, null),
('DMK', 11, 'w11-1', 'logweek', 'Logbook entry · Week 2', false, false, false, false, null),
('DMK', 12, 'w12-1', 'logweek', 'Logbook entry · Week 3', false, false, false, false, null),
('DMK', 13, 'w13-1', 'logweek', 'Logbook entry · Week 4', false, false, false, false, null),
('DMK', 13, 'w13-2', 'task', 'Supervisor performance evaluation', false, false, false, true, null),
('DMK', 13, 'w13-3', 'task', 'Collect your internship certificate', false, false, false, false, null),
('DMK', 14, 'w14-1', 'task', 'ATS-compliant resume', false, false, true, false, null),
('DMK', 14, 'w14-2', 'task', 'LinkedIn profile makeover', false, false, true, false, null),
('DMK', 14, 'w14-3', 'task', 'Publish your portfolio', false, false, true, false, null),
('DMK', 14, 'w14-4', 'task', 'CV swap with a pod member', false, true, false, false, null),
('DMK', 15, 'w15-1', 'task', 'Book your 1-on-1 session', false, false, false, false, null),
('DMK', 15, 'w15-2', 'task', 'Mock interview simulation', false, false, false, false, null),
('DMK', 15, 'w15-3', 'task', 'Finalise your Job Search Action Plan', false, false, true, false, null),
('DMK', 16, 'w16-1', 'task', 'Record your elevator pitch', false, false, true, false, null),
('DMK', 16, 'w16-2', 'task', 'Send 10 cold outreach messages', false, false, false, false, null),
('DMK', 17, 'w17-1', 'task', 'Weekly job application tracker', false, false, true, false, null),
('DMK', 17, 'w17-2', 'task', 'Report your first interview invite', false, false, false, false, null);

-- Late caps: full marks until Friday 17:00 WAT of the week, 80% until Sunday 23:59, then 50%.
create or replace function private.learn_cap(c cohorts, w int, at timestamptz) returns numeric
language sql stable as $$
  select case
    when at <= ((c.start_date + (w - 1) * 7 + 4) + time '17:00') at time zone 'Africa/Lagos' then 1
    when at <= ((c.start_date + (w - 1) * 7 + 6) + time '23:59') at time zone 'Africa/Lagos' then 0.8
    else 0.5 end
$$;

create or replace function private.learn_item(a applications, p_key text) returns course_items
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare it course_items;
begin
  select * into it from course_items where track_code = a.track_code and key = p_key;
  if it.key is null then raise exception 'That item was not found.' using errcode = 'P0001'; end if;
  return it;
end $$;

create or replace function private.learn_row(x learn_progress) returns jsonb
language sql immutable as $$
  select jsonb_build_object('status', x.status, 'link', x.link, 'data', x.data, 'score', x.score, 'cap', x.cap,
    'grade', x.grade, 'feedback', x.feedback, 'at', x.done_at, 'graded_by', x.graded_by, 'graded_at', x.graded_at)
$$;

-- Student: everything the portal needs about my progress.
create or replace function public.learn_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  return jsonb_build_object(
    'track', a.track_code,
    'start_date', c.start_date,
    'pass_mark', coalesce(nullif(private.setting('learn_pass', '70'), '')::int, 70),
    'unlock_all', private.setting('unlock_weeks', 'off') = 'on',
    'progress', coalesce((select jsonb_object_agg(x.key, private.learn_row(x)) from learn_progress x where x.application_id = a.id), '{}'::jsonb),
    'attempts', coalesce((select jsonb_object_agg(t.week, t.n) from learn_attempts t where t.application_id = a.id), '{}'::jsonb),
    'checkins', coalesce((select jsonb_object_agg(k.week, jsonb_build_object('conf', k.conf, 'note', k.note, 'at', k.at)) from learn_checkins k where k.application_id = a.id), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('key', h.key, 'action', h.action, 'by', h.by_name, 'at', h.at) order by h.at) from learn_history h where h.application_id = a.id), '[]'::jsonb),
    'now', now());
end $$;

-- Student: mark a lesson, guide or simple task done (or undo), or sign the oath.
create or replace function public.learn_done(p_key text, p_done boolean, p_data jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; x learn_progress;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.staff then raise exception 'Staff complete this step.' using errcode = 'P0001'; end if;
  if it.type = 'quiz' or it.link then raise exception 'Submit this one from its own page.' using errcode = 'P0001'; end if;
  select * into x from learn_progress where application_id = a.id and key = p_key;
  if p_done then
    if it.type = 'oath' and coalesce(trim(p_data ->> 'sig'), '') = '' then raise exception 'Sign with your full name.' using errcode = 'P0001'; end if;
    insert into learn_progress(application_id, key, week, status, data) values (a.id, p_key, it.week, 'done', p_data)
    on conflict (application_id, key) do update set status = 'done', data = coalesce(excluded.data, learn_progress.data), done_at = now();
    insert into learn_history(application_id, key, action) values (a.id, p_key, case when it.type = 'oath' then 'Signed' else 'Completed' end);
  else
    if it.type = 'oath' then raise exception 'A signed oath can''t be undone.' using errcode = 'P0001'; end if;
    delete from learn_progress where application_id = a.id and key = p_key and status = 'done';
  end if;
  return public.learn_state();
end $$;

-- Student: submit (or resubmit) a link to my work.
create or replace function public.learn_submit(p_key text, p_link text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; it course_items; x learn_progress; u text;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  it := private.learn_item(a, p_key);
  if not it.link then raise exception 'This item doesn''t take a link.' using errcode = 'P0001'; end if;
  u := private.clean_url(p_link);
  if u is null then raise exception 'Paste a full link, starting with https://' using errcode = 'P0001'; end if;
  select * into x from learn_progress where application_id = a.id and key = p_key;
  if x.status = 'graded' then raise exception 'This has already been graded.' using errcode = 'P0001'; end if;
  insert into learn_progress(application_id, key, week, status, link, cap)
  values (a.id, p_key, it.week, case when it.proj then 'submitted' else 'done' end, u, private.learn_cap(c, it.week, now()))
  on conflict (application_id, key) do update set status = excluded.status, link = u, cap = excluded.cap, done_at = now(), feedback = learn_progress.feedback;
  insert into learn_history(application_id, key, action) values (a.id, p_key, case when x.key is null then 'Submitted' else 'Resubmitted' end);
  return public.learn_state();
end $$;

-- Student: undo a submission that hasn't been graded yet.
create or replace function public.learn_unsubmit(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  delete from learn_progress where application_id = a.id and key = p_key and status in ('submitted','done');
  return public.learn_state();
end $$;

-- Student: answer a quiz. One attempt; marked here so the answers never reach the browser.
create or replace function public.learn_quiz(p_key text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; n int; ok int := 0; i int; sc int;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.type <> 'quiz' then raise exception 'That isn''t a quiz.' using errcode = 'P0001'; end if;
  if exists (select 1 from learn_progress where application_id = a.id and key = p_key) then
    raise exception 'You have already taken this quiz.' using errcode = 'P0001';
  end if;
  n := coalesce(array_length(it.answers, 1), 0);
  if jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) <> n then raise exception 'Answer every question.' using errcode = 'P0001'; end if;
  for i in 1..n loop
    if (p_answers ->> (i - 1))::int = it.answers[i] then ok := ok + 1; end if;
  end loop;
  sc := round(100.0 * ok / greatest(n, 1));
  insert into learn_progress(application_id, key, week, status, score, cap, data)
  values (a.id, p_key, it.week, 'done', sc, 1, jsonb_build_object('answers', p_answers, 'correct', to_jsonb(it.answers)));
  insert into learn_history(application_id, key, action) values (a.id, p_key, format('Quiz score %s%%', sc));
  return public.learn_state();
end $$;

-- Student: weekly check-in.
create or replace function public.learn_checkin(p_week int, p_conf int, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  insert into learn_checkins(application_id, week, conf, note) values (a.id, p_week, p_conf, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (application_id, week) do update set conf = excluded.conf, note = excluded.note, at = now();
  return public.learn_state();
end $$;

-- Student: repeat a week that wasn't passed. Its work resets.
create or replace function public.learn_repeat(p_week int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  delete from learn_progress where application_id = a.id and week = p_week;
  insert into learn_attempts(application_id, week, n) values (a.id, p_week, 2)
  on conflict (application_id, week) do update set n = learn_attempts.n + 1;
  insert into learn_history(application_id, key, action) values (a.id, 'w' || p_week, 'Started the week again');
  return public.learn_state();
end $$;

-- Staff: work waiting for grading, plus steps staff complete.
create or replace function public.acad_learn_queue() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  return jsonb_build_object(
    'work', coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric,
        'track', a.track_code, 'week', i.week, 'key', i.key, 'title', i.title, 'link', x.link, 'at', x.done_at, 'cap', x.cap,
        'status', x.status, 'grade', x.grade, 'score', x.score, 'feedback', x.feedback, 'graded_by', x.graded_by) order by x.status <> 'submitted', x.done_at)
      from learn_progress x join applications a on a.id = x.application_id
      join course_items i on i.track_code = a.track_code and i.key = x.key
      where i.proj and private.track_ok(s, a.track_code)), '[]'::jsonb),
    'staff_steps', coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric,
        'track', a.track_code, 'week', i.week, 'key', i.key, 'title', i.title, 'done', x.key is not null) order by i.week, a.surname)
      from applications a join course_items i on i.track_code = a.track_code and i.staff
      left join learn_progress x on x.application_id = a.id and x.key = i.key
      where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb));
end $$;

-- Staff: grade a week project (or ask for changes).
create or replace function public.acad_learn_grade(p_app uuid, p_key text, p_status text, p_grade int, p_feedback text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; it course_items; x learn_progress;
begin
  s := private.require_role(array['director','cohort_manager','facilitator']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'You can''t grade that work.' using errcode = 'P0001'; end if;
  it := private.learn_item(a, p_key);
  select * into x from learn_progress where application_id = a.id and key = p_key for update;
  if x.key is null then raise exception 'Nothing has been submitted yet.' using errcode = 'P0001'; end if;
  if p_status not in ('graded','revise') then raise exception 'Choose Grade or Ask for changes.' using errcode = 'P0001'; end if;
  if p_status = 'revise' and coalesce(trim(p_feedback), '') = '' then raise exception 'Tell them what to change.' using errcode = 'P0001'; end if;
  if p_status = 'graded' and (p_grade is null or p_grade < 0 or p_grade > 100) then raise exception 'Enter a grade from 0 to 100.' using errcode = 'P0001'; end if;
  update learn_progress set status = p_status, grade = case when p_status = 'graded' then p_grade end,
    score = case when p_status = 'graded' then round(p_grade * coalesce(cap, 1)) end,
    feedback = nullif(trim(coalesce(p_feedback, '')), ''), graded_by = s.full_name, graded_at = now()
  where application_id = a.id and key = p_key returning * into x;
  insert into learn_history(application_id, key, action, by_name) values (a.id, p_key,
    case when p_status = 'graded' then format('Graded %s%%', x.score) else 'Changes requested' end, s.full_name);
  perform private.queue_mail(a, 'graded', jsonb_build_object('task', it.title,
    'result', case when p_status = 'graded' then format('was graded: %s%%', x.score) else 'needs another try' end,
    'feedback', coalesce(x.feedback, 'No extra comments.')), private.site() || '/#/learn/assignments');
  return private.learn_row(x);
end $$;

-- Staff: complete (or undo) a step staff are responsible for.
create or replace function public.acad_learn_mark(p_app uuid, p_key text, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; it course_items;
begin
  s := private.require_role(array['director','cohort_manager','facilitator']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'You can''t update that student.' using errcode = 'P0001'; end if;
  it := private.learn_item(a, p_key);
  if not it.staff then raise exception 'Students complete this step themselves.' using errcode = 'P0001'; end if;
  if p_done then
    insert into learn_progress(application_id, key, week, status, graded_by, graded_at) values (a.id, p_key, it.week, 'done', s.full_name, now())
    on conflict (application_id, key) do nothing;
    insert into learn_history(application_id, key, action, by_name) values (a.id, p_key, 'Completed by staff', s.full_name);
  else
    delete from learn_progress where application_id = a.id and key = p_key;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Staff: progress summary per student (Students tab).
create or replace function public.acad_learn_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin','adm_admin']);
  return coalesce((select jsonb_object_agg(a.id, jsonb_build_object(
      'done', (select count(*) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key where x.application_id = a.id and not i.opt and x.status in ('done','graded','submitted')),
      'total', (select count(*) from course_items i where i.track_code = a.track_code and not i.opt),
      'avg', (select round(avg(x.score)) from learn_progress x where x.application_id = a.id and x.score is not null),
      'to_grade', (select count(*) from learn_progress x where x.application_id = a.id and x.status = 'submitted')))
    from applications a where a.status = 'Admitted' and a.matric is not null), '{}'::jsonb);
end $$;

revoke execute on function private.learn_cap(cohorts, int, timestamptz), private.learn_item(applications, text), private.learn_row(learn_progress) from public;
revoke execute on function public.learn_state(), public.learn_done(text, boolean, jsonb), public.learn_submit(text, text), public.learn_unsubmit(text),
  public.learn_quiz(text, jsonb), public.learn_checkin(int, int, text), public.learn_repeat(int),
  public.acad_learn_queue(), public.acad_learn_grade(uuid, text, text, int, text), public.acad_learn_mark(uuid, text, boolean), public.acad_learn_stats() from public, anon;
grant execute on function public.learn_state(), public.learn_done(text, boolean, jsonb), public.learn_submit(text, text), public.learn_unsubmit(text),
  public.learn_quiz(text, jsonb), public.learn_checkin(int, int, text), public.learn_repeat(int),
  public.acad_learn_queue(), public.acad_learn_grade(uuid, text, text, int, text), public.acad_learn_mark(uuid, text, boolean), public.acad_learn_stats() to authenticated;

notify pgrst, 'reload schema';

select 'Student portal (Phase 1) installed' as done, (select count(*) from course_items) as course_items;
