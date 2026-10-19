-- Jobnest Academy: delete the PILOT (outside testers) when testing is over.
-- Deletes only the pilot cohort and everyone in it: applications, student logins, payments, progress,
-- placements, messages, help requests, alerts, emails, the pilot's live sessions and announcements.
-- KEEPS: Cohort 1 and every real applicant, staff accounts, settings, course content and question banks.
-- This cannot be undone.

-- 1. Check first: run just this SELECT to see what would be deleted.
select
  (select name from cohorts where is_pilot order by id desc limit 1)                                   as pilot_cohort,
  (select count(*) from applications a join cohorts c on c.id = a.cohort_id where c.is_pilot)         as pilot_applications,
  (select count(*) from applications a join cohorts c on c.id = a.cohort_id where c.is_pilot and a.matric is not null) as pilot_students,
  (select count(*) from applications a join cohorts c on c.id = a.cohort_id where not c.is_pilot)     as real_applications_kept;

-- 2. The clean-up. Everything below runs together: either all of it happens or none of it does.
begin;
delete from auth.users where email in (
  select lower(replace(a.matric, '/', '-')) || '@students.jobnestcareers.com'
  from applications a join cohorts c on c.id = a.cohort_id where c.is_pilot and a.matric is not null);
delete from attendance where session_id in (select x.id from sessions x join cohorts c on c.id = x.cohort_id where c.is_pilot);
delete from sessions where cohort_id in (select id from cohorts where is_pilot);
delete from announcements where cohort_id in (select id from cohorts where is_pilot);
delete from submissions where task_id in (select t.id from tasks t join cohorts c on c.id = t.cohort_id where c.is_pilot);
delete from tasks where cohort_id in (select id from cohorts where is_pilot);
delete from lessons where cohort_id in (select id from cohorts where is_pilot);
delete from applications where cohort_id in (select id from cohorts where is_pilot);
delete from pods where not exists (select 1 from pod_members m where m.pod_id = pods.id);
delete from cohorts where is_pilot;
delete from app_settings where key = 'pilot_code';
insert into audit_log(actor, text) values ('System', 'Pilot cohort and its testers deleted');
commit;

-- 3. Afterwards: in Settings, set Testing back to "Normal (live)".
