-- Jobnest Academy: SAMPLE course content for testing (all 17 weeks).
-- Adds lessons, a task (assessment) and a live class for every week, plus internship logbook tasks.
-- Safe to run more than once: it removes earlier sample content first.
-- Before launch, the clean-up script removes all of it.
-- Tip: turn on Settings > Testing > "Open all portal weeks" so testers can see every week now.

do $$
declare c cohorts;
begin
  select * into c from cohorts where is_current order by id desc limit 1;
  if c.id is null then raise exception 'No current cohort found.'; end if;
  delete from lessons where cohort_id = c.id and created_by = 'sample';
  delete from submissions where task_id in (select id from tasks where cohort_id = c.id and created_by = 'sample');
  delete from tasks where cohort_id = c.id and created_by = 'sample';
  delete from attendance where session_id in (select id from sessions where cohort_id = c.id and created_by = 'sample');
  delete from sessions where cohort_id = c.id and created_by = 'sample';

  insert into lessons(cohort_id, track_code, week, sort, kind, title, body, url)
  select * from (values
    (c.id, null, 1, 0, 'lesson', 'Welcome to the Graduate Employability Programme', 'How the 17 weeks work, what''s expected each week, and how you''ll be supported. Read this first.', null),
    (c.id, null, 1, 1, 'video', 'Tour of your student portal', 'A short walkthrough of Weeks, Tasks, Live sessions and Announcements.', null),
    (c.id, null, 1, 2, 'reading', 'Learning online: habits that work', 'Set a weekly timetable, find a quiet spot, and plan your 15 hours.', 'https://edu.gcfglobal.org/en/onlinelearning/'),
    (c.id, null, 2, 0, 'lesson', 'Professional communication', 'Writing clear emails and messages at work: subject lines, tone and follow-ups.', 'https://edu.gcfglobal.org/en/email-basics/'),
    (c.id, null, 2, 1, 'reading', 'Digital tools you''ll use every day', 'Google Drive, Docs and Sheets basics.', 'https://edu.gcfglobal.org/en/googledriveanddocs/'),
    (c.id, null, 2, 2, 'video', 'Time management for remote work', 'Plan your week and track your tasks.', null),
    (c.id, null, 3, 0, 'lesson', 'Working in teams', 'How to collaborate, give updates and ask for help.', null),
    (c.id, null, 3, 1, 'reading', 'Spreadsheet basics', 'Cells, formulas and simple tables.', 'https://edu.gcfglobal.org/en/googlespreadsheets/'),
    (c.id, null, 3, 2, 'link', 'Problem-solving at work', 'A short guide to breaking problems down.', null),
    (c.id, null, 4, 0, 'lesson', 'Core skill 1: key concepts', 'This week''s main concepts for your track. Follow the track lesson below too.', null),
    (c.id, null, 4, 1, 'video', 'Core skill 1: guided practice', 'Watch and follow along with the facilitator.', null),
    (c.id, 'DAT', 4, 9, 'lesson', 'Data Analysis: cleaning and charting data (part 1)', 'Your track lesson for this week.', null),
    (c.id, 'DMK', 4, 9, 'lesson', 'Digital Marketing: planning social content (part 1)', 'Your track lesson for this week.', null),
    (c.id, 'CSP', 4, 9, 'lesson', 'Customer Support: handling tickets well (part 1)', 'Your track lesson for this week.', null),
    (c.id, 'ADM', 4, 9, 'lesson', 'Administrative Support: organising calendars and files (part 1)', 'Your track lesson for this week.', null),
    (c.id, null, 5, 0, 'lesson', 'Core skill 2: key concepts', 'This week''s main concepts for your track. Follow the track lesson below too.', null),
    (c.id, null, 5, 1, 'video', 'Core skill 2: guided practice', 'Watch and follow along with the facilitator.', null),
    (c.id, 'DAT', 5, 9, 'lesson', 'Data Analysis: cleaning and charting data (part 2)', 'Your track lesson for this week.', null),
    (c.id, 'DMK', 5, 9, 'lesson', 'Digital Marketing: planning social content (part 2)', 'Your track lesson for this week.', null),
    (c.id, 'CSP', 5, 9, 'lesson', 'Customer Support: handling tickets well (part 2)', 'Your track lesson for this week.', null),
    (c.id, 'ADM', 5, 9, 'lesson', 'Administrative Support: organising calendars and files (part 2)', 'Your track lesson for this week.', null),
    (c.id, null, 6, 0, 'lesson', 'Core skill 3: key concepts', 'This week''s main concepts for your track. Follow the track lesson below too.', null),
    (c.id, null, 6, 1, 'video', 'Core skill 3: guided practice', 'Watch and follow along with the facilitator.', null),
    (c.id, 'DAT', 6, 9, 'lesson', 'Data Analysis: cleaning and charting data (part 3)', 'Your track lesson for this week.', null),
    (c.id, 'DMK', 6, 9, 'lesson', 'Digital Marketing: planning social content (part 3)', 'Your track lesson for this week.', null),
    (c.id, 'CSP', 6, 9, 'lesson', 'Customer Support: handling tickets well (part 3)', 'Your track lesson for this week.', null),
    (c.id, 'ADM', 6, 9, 'lesson', 'Administrative Support: organising calendars and files (part 3)', 'Your track lesson for this week.', null),
    (c.id, null, 7, 0, 'lesson', 'Core skill 4: key concepts', 'This week''s main concepts for your track. Follow the track lesson below too.', null),
    (c.id, null, 7, 1, 'video', 'Core skill 4: guided practice', 'Watch and follow along with the facilitator.', null),
    (c.id, 'DAT', 7, 9, 'lesson', 'Data Analysis: cleaning and charting data (part 4)', 'Your track lesson for this week.', null),
    (c.id, 'DMK', 7, 9, 'lesson', 'Digital Marketing: planning social content (part 4)', 'Your track lesson for this week.', null),
    (c.id, 'CSP', 7, 9, 'lesson', 'Customer Support: handling tickets well (part 4)', 'Your track lesson for this week.', null),
    (c.id, 'ADM', 7, 9, 'lesson', 'Administrative Support: organising calendars and files (part 4)', 'Your track lesson for this week.', null),
    (c.id, null, 8, 0, 'lesson', 'Meet your client project', 'The brief, the client''s goal, and what a great result looks like.', null),
    (c.id, null, 8, 1, 'reading', 'Planning a project', 'Break the work into steps and agree deadlines with your team.', null),
    (c.id, null, 9, 0, 'lesson', 'Presenting your work', 'How to present results clearly to a client.', null),
    (c.id, null, 9, 1, 'video', 'Getting and using feedback', 'Turn feedback into a better final version.', null),
    (c.id, null, 10, 0, 'lesson', 'Internship week 1: what to focus on', 'Settle in: learn the team, tools and expectations.', null),
    (c.id, null, 10, 1, 'reading', 'Your internship logbook: how to fill it', 'Each day, note what you did, what you learned and any challenge. Ask your supervisor to check it at the end of each week.', null),
    (c.id, null, 11, 0, 'lesson', 'Internship week 2: what to focus on', 'Take on real tasks and ask for feedback.', null),
    (c.id, null, 12, 0, 'lesson', 'Internship week 3: what to focus on', 'Finish strong and ask your supervisor for a short reference.', null),
    (c.id, null, 13, 0, 'lesson', 'Reflecting on your internship', 'Turn your internship into stories you can tell in interviews.', null),
    (c.id, null, 14, 0, 'lesson', 'Writing a CV that gets interviews', 'Structure, action verbs and results.', 'https://edu.gcfglobal.org/en/resumewriting/'),
    (c.id, null, 14, 1, 'link', 'Building your LinkedIn profile', 'Headline, About section and skills.', null),
    (c.id, null, 14, 2, 'lesson', 'Putting your portfolio together', 'Show your client project and internship work.', null),
    (c.id, null, 15, 0, 'lesson', 'Preparing for Discovery Call 2', 'Review your progress and plan your job search with Admissions.', null),
    (c.id, null, 16, 0, 'lesson', 'Your 60-second personal pitch', 'Who you are, what you can do, and what you''re looking for.', null),
    (c.id, null, 16, 1, 'reading', 'Interview practice', 'Common questions and how to answer with examples.', 'https://edu.gcfglobal.org/en/jobsearchandnetworking/'),
    (c.id, null, 17, 0, 'lesson', 'Applying with confidence', 'Tailor each application and follow up.', null),
    (c.id, null, 17, 1, 'lesson', 'What happens after graduation', 'Certificates, alumni support and staying in touch.', null)
  ) v;
  update lessons set created_by = 'sample' where cohort_id = c.id and created_by is null;

  insert into tasks(cohort_id, track_code, week, title, brief, due_at)
  select * from (values
    (c.id, null, 1, 'Set your goals for the 17 weeks', 'Write 3 goals for the programme and your plan for 15 hours a week. Submit a link to a Google Doc.', ((c.start_date + 6) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 2, 'Write a professional email', 'Write an email introducing yourself to a new manager. Submit a link to it in a Google Doc.', ((c.start_date + 13) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 3, 'Fundamentals check', 'Build a simple weekly budget in Google Sheets with at least 3 formulas. Submit the link.', ((c.start_date + 20) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 4, 'Core skill practice 1', 'Complete this week''s practice exercise for your track and submit a link to your work.', ((c.start_date + 27) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 5, 'Core skill practice 2', 'Complete this week''s practice exercise for your track and submit a link to your work.', ((c.start_date + 34) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 6, 'Core skill practice 3', 'Complete this week''s practice exercise for your track and submit a link to your work.', ((c.start_date + 41) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 7, 'Core skill practice 4', 'Complete this week''s practice exercise for your track and submit a link to your work.', ((c.start_date + 48) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 8, 'Client project plan', 'Submit your project plan: goal, steps, deadlines and who does what.', ((c.start_date + 55) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 9, 'Client project: final delivery', 'Submit your final project and a one-page summary for the client.', ((c.start_date + 62) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 10, 'Internship logbook: week 1', 'Submit a link to your logbook (a Google Doc) for this week: what you did each day, what you learned, one challenge, and your supervisor''s name and comment.', ((c.start_date + 69) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 11, 'Internship logbook: week 2', 'Submit a link to your logbook (a Google Doc) for this week: what you did each day, what you learned, one challenge, and your supervisor''s name and comment.', ((c.start_date + 76) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 12, 'Internship logbook: week 3', 'Submit a link to your logbook (a Google Doc) for this week: what you did each day, what you learned, one challenge, and your supervisor''s name and comment.', ((c.start_date + 83) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 13, 'Internship reflection', 'Write a one-page reflection: your biggest achievement, what you learned, and your supervisor''s feedback.', ((c.start_date + 90) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 14, 'CV, LinkedIn and portfolio', 'Submit links to your CV, your LinkedIn profile and your portfolio.', ((c.start_date + 97) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 15, 'Job search plan', 'Submit your job search plan: 10 target roles or companies and your weekly targets.', ((c.start_date + 104) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 16, 'Record your personal pitch', 'Record a 60-second video pitch and submit the link.', ((c.start_date + 111) + time '23:59') at time zone 'Africa/Lagos'),
    (c.id, null, 17, 'Final reflection', 'Write about what you''ve learned in 17 weeks and your next 3 steps.', ((c.start_date + 118) + time '23:59') at time zone 'Africa/Lagos')
  ) v;
  update tasks set created_by = 'sample' where cohort_id = c.id and created_by is null;

  insert into sessions(cohort_id, track_code, title, kind, starts_at, minutes, link, host)
  select * from (values
    (c.id, null, 'Orientation: welcome session', 'orientation', ((c.start_date + 2) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 2 live class: The Fundamentals', 'class', ((c.start_date + 9) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 3 live class: The Fundamentals', 'class', ((c.start_date + 16) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 4 live class: Core Skill Learning', 'class', ((c.start_date + 23) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 5 live class: Core Skill Learning', 'class', ((c.start_date + 30) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 6 live class: Core Skill Learning', 'class', ((c.start_date + 37) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 7 live class: Core Skill Learning', 'class', ((c.start_date + 44) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 8 live class: Client Project', 'class', ((c.start_date + 51) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 9 live class: Client Project', 'class', ((c.start_date + 58) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 10 live class: Internship', 'class', ((c.start_date + 65) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 11 live class: Internship', 'class', ((c.start_date + 72) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 12 live class: Internship', 'class', ((c.start_date + 79) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 13 live class: Internship', 'class', ((c.start_date + 86) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 14 live class: CV, LinkedIn & Portfolio', 'class', ((c.start_date + 93) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 15 live class: Discovery Call 2', 'class', ((c.start_date + 100) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 16 live class: Job Search & Personal Pitch', 'class', ((c.start_date + 107) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator'),
    (c.id, null, 'Week 17 live class: Job Search & Personal Pitch', 'class', ((c.start_date + 114) + time '19:00') at time zone 'Africa/Lagos', 60, nullif(private.setting('call_link',''),''), 'Facilitator')
  ) v;
  update sessions set created_by = 'sample' where cohort_id = c.id and created_by is null;

  delete from announcements where cohort_id = c.id and created_by = 'sample';
  insert into announcements(cohort_id, title, body, created_by)
  values (c.id, 'Sample content for testing', 'Every week now has sample lessons, a task and a live class so you can test the whole portal. Real content will replace it before launch.', 'sample');
end $$;

select (select count(*) from lessons where created_by = 'sample') as lessons,
       (select count(*) from tasks where created_by = 'sample') as tasks,
       (select count(*) from sessions where created_by = 'sample') as live_classes;
