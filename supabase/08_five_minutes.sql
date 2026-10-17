-- Jobnest Academy: readiness assessment takes 5 minutes (run once in Supabase → SQL Editor). Safe to run again.
alter table cohorts alter column assess_minutes set default 5;
update cohorts set assess_minutes = 5 where is_current;
update email_templates set body = replace(body, '10-minute readiness assessment', '5-minute readiness assessment') where key = 'received';
select name, assess_minutes from cohorts where is_current;
