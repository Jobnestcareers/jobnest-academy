-- Jobnest Academy: clear TEST data before launch.
-- Deletes every application and everything attached to it, so the first real student gets GEP/27A/001.
-- KEEPS: staff accounts, settings, programme, cohort, tracks, the readiness question bank and email templates.
-- Run ONLY before real applicants arrive. This cannot be undone.

-- 1. Check first: run just this SELECT to see what would be deleted.
select
  (select count(*) from applications)                     as applications,
  (select count(*) from payments)                         as payments,
  (select count(*) from outbox)                           as emails,
  (select count(*) from slots)                            as call_times,
  (select count(*) from lessons)                          as lessons,
  (select count(*) from tasks)                            as tasks,
  (select count(*) from sessions)                         as live_sessions,
  (select count(*) from announcements)                    as announcements,
  (select count(*) from auth.users where email like '%@students.jobnestcareers.com') as student_logins;

-- 2. The clean-up. Everything below runs together: either all of it happens or none of it does.
begin;
delete from attendance;
delete from submissions;
delete from payments;
delete from outbox;
delete from app_events;
delete from slots;
delete from applications;
delete from announcements;
delete from sessions;
delete from tasks;
delete from lessons;
delete from audit_log;
delete from auth.users where email like '%@students.jobnestcareers.com';
update cohorts set matric_next = 1;
insert into audit_log(actor, text) values ('System', 'Test data cleared before launch');
commit;

-- 3. Confirm: every count should be 0 and the next matric number 1.
select
  (select count(*) from applications) as applications,
  (select count(*) from payments)     as payments,
  (select count(*) from outbox)       as emails,
  (select min(matric_next) from cohorts) as next_matric_number;
