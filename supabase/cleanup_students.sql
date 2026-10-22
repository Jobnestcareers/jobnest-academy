-- Jobnest Academy: clear ALL applicant and student data.
-- Deletes every application and everything attached to it: payments, readiness checks, calls,
-- portal progress, quizzes, exams, results, projects, logbooks, placements, certificates,
-- coaching, messages, help requests, emails and student logins. The next student gets matric number 001.
-- KEEPS: staff accounts, Settings, programme, cohorts, tracks, course content, question banks,
-- email templates, live sessions, announcements, host organisations, exam days and the activity log.
-- This cannot be undone.

-- STEP 1. Check first: run only this SELECT to see what will be deleted.
select
  (select count(*) from applications)   as applications,
  (select count(*) from applications where status = 'Admitted') as students,
  (select count(*) from payments)       as payments,
  (select count(*) from outbox)         as emails,
  (select count(*) from exam_sittings)  as exam_sittings,
  (select count(*) from placements)     as placements,
  (select count(*) from auth.users where email like '%@students.jobnestcareers.com') as student_logins;

-- STEP 2. The clean-up. It runs as one block: either all of it happens or none of it does.
begin;
-- Everything below cascades from applications (payments, progress, exams, results, placements, messages...).
delete from applications;
-- Booked call and coaching times are freed, not deleted, by the line above. Clear any leftovers that point nowhere.
update slots set application_id = null where application_id is not null;
update coach_slots set application_id = null where application_id is not null;
-- Results are no longer published for any cohort, and cohort discussions start empty.
delete from results_published;
delete from discussion_posts;
delete from pod_members;
-- Any emails left in the send queue (for example ones not tied to an application).
delete from outbox;
-- Wrong-surname lookups and student sign-ins.
delete from continue_attempts;
delete from auth.users where email like '%@students.jobnestcareers.com';
-- Matric numbers start again at 001.
update cohorts set matric_next = 1;
insert into audit_log(actor, text) values ('System', 'All applicant and student data cleared');
commit;

-- STEP 3. Confirm: every count should be 0 and the next matric number 1.
select
  (select count(*) from applications)   as applications,
  (select count(*) from payments)       as payments,
  (select count(*) from outbox)         as emails,
  (select count(*) from exam_sittings)  as exam_sittings,
  (select count(*) from auth.users where email like '%@students.jobnestcareers.com') as student_logins,
  (select min(matric_next) from cohorts) as next_matric_number,
  (select count(*) from staff)          as staff_kept,
  (select count(*) from course_items)   as course_items_kept;
