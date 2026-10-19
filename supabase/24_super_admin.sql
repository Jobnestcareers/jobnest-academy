-- Super Admin: command centre, search, the full student record, staff notes,
-- extra retakes, more time to pay, fee reminders, staff workload and invites.

-- ---------- new columns and tables ----------
alter table applications add column if not exists fee_due_override date;
alter table staff add column if not exists last_seen_at timestamptz;
alter table staff add column if not exists invited_at timestamptz;

create table if not exists staff_notes (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  body text not null,
  by_email text not null,
  by_name text not null,
  at timestamptz not null default now()
);
alter table staff_notes enable row level security;
create index if not exists staff_notes_app on staff_notes(application_id, at desc);

-- ---------- helpers ----------
-- The cohort currently learning (the newest one with admitted students), else the current admissions cohort.
create or replace function private.ac_cohort() returns cohorts
language sql stable security definer set search_path = public, pg_temp as $$
  select c.* from cohorts c
  where c.id = coalesce((select cohort_id from applications where status = 'Admitted' and matric is not null order by admitted_at desc nulls last limit 1),
    (select id from cohorts where is_current order by id desc limit 1))
$$;

-- Week results for every admitted student of a cohort, worked out the same way the student portal does.
create or replace function private.week_table(p_cohort bigint)
returns table(application_id uuid, track_code text, week int, state text, avg int, quiz int, proj int, attempt int, last_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with pass as (select coalesce(nullif(private.setting('learn_pass', '70'), '')::int, 70) v),
  w as (
    select a.id, a.track_code, i.week,
      count(*) filter (where not i.opt) req,
      count(*) filter (where not i.opt and x.status is not null and x.status <> 'revise') done,
      bool_or(i.type = 'quiz') hasq, bool_or(i.proj) hasp,
      max(x.score) filter (where i.type = 'quiz') q,
      max(x.score) filter (where i.proj and x.status = 'graded') pr,
      coalesce(bool_or(i.proj and x.status = 'revise'), false) rev,
      max((x.data ->> 'attempt')::int) filter (where i.type = 'quiz') att,
      max(x.done_at) last_at
    from applications a join course_items i on i.track_code = a.track_code
    left join learn_progress x on x.application_id = a.id and x.key = i.key
    where a.cohort_id = p_cohort and a.status = 'Admitted' and a.matric is not null
    group by a.id, a.track_code, i.week)
  select w.id, w.track_code, w.week,
    case when w.week between 2 and 9 then
      case when w.rev then 'revise' when w.done < w.req then 'open' when w.hasp and w.pr is null then 'grading'
        when round(case when w.hasq and w.hasp then (w.q + w.pr) / 2.0 when w.hasp then w.pr when w.hasq then w.q else 100 end) >= (select v from pass) then 'pass'
        else 'fail' end
    else case when w.done >= w.req then 'pass' else 'open' end end,
    case when w.week between 2 and 9 and (w.q is not null or w.pr is not null) then
      round(case when w.hasq and w.hasp and w.q is not null and w.pr is not null then (w.q + w.pr) / 2.0 else coalesce(w.pr, w.q) end)::int end,
    w.q, w.pr, w.att, w.last_at
  from w
$$;

-- Each student's current week (the first week not passed), their last activity and their risk flags.
create or replace function private.student_status(p_cohort bigint)
returns table(application_id uuid, track_code text, cur int, last_at timestamptz, conf int, fee jsonb, failed_retake boolean, reasons text[])
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select * from private.week_table(p_cohort)),
  s as (
    select a.id, a.track_code, a.cohort_id,
      coalesce((select min(t.week) from t where t.application_id = a.id and t.state <> 'pass'), (select coalesce(max(t.week), 1) from t where t.application_id = a.id)) cur,
      greatest((select max(t.last_at) from t where t.application_id = a.id), (select max(h.at) from learn_history h where h.application_id = a.id)) last_at,
      (select k.conf from learn_checkins k where k.application_id = a.id order by k.week desc limit 1) conf,
      private.fee_lock(a) fee,
      exists (select 1 from t where t.application_id = a.id and t.state = 'fail' and coalesce(t.attempt, 1) >= 2) failed_retake
    from applications a where a.cohort_id = p_cohort and a.status = 'Admitted' and a.matric is not null)
  select s.id, s.track_code, s.cur, s.last_at, s.conf, s.fee, s.failed_retake,
    array_remove(array[
      case when s.fee is not null then 'Second instalment overdue' end,
      case when s.failed_retake then 'Failed a week after the retake' end,
      case when s.conf is not null and s.conf <= 2 then format('Confidence %s of 5', s.conf) end,
      case when (select c.start_date from cohorts c where c.id = s.cohort_id) <= private.today()
        and coalesce(s.last_at, '-infinity'::timestamptz) < now() - interval '7 days' then 'No activity for 7+ days' end], null)
  from s
$$;

-- Overdue fees respect a staff-given extension.
create or replace function private.fee_lock(a applications) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f jsonb; due date;
begin
  if a.plan is distinct from 'two' then return null; end if;
  f := private.fees(a);
  due := coalesce(a.fee_due_override, (f ->> 'due_date')::date);
  if a.paid_total >= (f ->> 'plan_total')::int or due >= private.today() then return null; end if;
  return jsonb_build_object('balance', (f ->> 'plan_total')::int - a.paid_total, 'due_date', due, 'ref', a.ref, 'token', a.token);
end $$;

-- ---------- command centre ----------
create or replace function public.super_overview() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; ad cohorts; p programmes; wk int; pass int; r jsonb; mode text;
begin
  s := private.require_role(array['super']);
  c := private.ac_cohort(); ad := private.current_cohort();
  select * into p from programmes where code = c.programme_code;
  wk := private.cur_week(c);
  pass := coalesce(nullif(private.setting('learn_pass', '70'), '')::int, 70);
  mode := case when private.setting('unlock_weeks', 'off') = 'on' then 'open' when private.setting('week_dates', 'on') = 'off' then 'progress' else 'normal' end;

  create temp table if not exists _st on commit drop as select * from private.student_status(c.id) limit 0;
  delete from _st; insert into _st select * from private.student_status(c.id);
  create temp table if not exists _wt on commit drop as select * from private.week_table(c.id) limit 0;
  delete from _wt; insert into _wt select * from private.week_table(c.id);

  r := jsonb_build_object(
    'me', s.full_name, 'mode', mode, 'today', private.today(),
    'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'start_date', c.start_date, 'week', wk, 'weeks', coalesce(p.weeks, 17)),
    'admissions', jsonb_build_object('id', ad.id, 'name', ad.name, 'open', ad.applications_open),
    'cohorts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.start_date desc) from cohorts x), '[]'::jsonb),
    'launch', (select coalesce(jsonb_agg(v), '[]'::jsonb) from (values
        (case when mode <> 'normal' then 'Testing mode is on (' || case mode when 'open' then 'all weeks open' else 'progress only' end || ')' end),
        (case when private.setting('signer_name', '') = '' then 'Admission letter signatory is empty' end),
        (case when private.setting('call_link', '') = '' then 'Discovery Call meeting link is empty' end),
        (case when private.setting('site_url', '') = '' then 'Academy address is empty' end)) t(v) where v is not null)
  );

  -- the journey from application to work
  r := r || jsonb_build_object('funnel', jsonb_build_array(
    jsonb_build_object('label', 'Applied', 'n', (select count(*) from applications)),
    jsonb_build_object('label', 'Passed readiness', 'n', (select count(*) from applications where score >= (select pass_mark from cohorts where id = applications.cohort_id))),
    jsonb_build_object('label', 'Call done', 'n', (select count(*) from applications where dc1_note is not null or rec is not null or status in ('Under review','Offer sent','Waitlisted','Admitted','Offer declined','Offer expired','Not selected','Deferred'))),
    jsonb_build_object('label', 'Offered', 'n', (select count(*) from applications where status in ('Offer sent','Admitted','Offer declined','Offer expired'))),
    jsonb_build_object('label', 'Admitted (paid)', 'n', (select count(*) from applications where status = 'Admitted')),
    jsonb_build_object('label', 'Active now', 'n', (select count(*) from _st where fee is null)),
    jsonb_build_object('label', 'Graduated', 'n', (select count(*) from applications where cert_id is not null)),
    jsonb_build_object('label', 'In work', 'n', (select count(*) from learn_outcomes where status in ('hired','internship','freelance')))));

  -- headline numbers, with the last 12 days for the small charts
  r := r || jsonb_build_object('kpis', jsonb_build_object(
    'students', (select count(*) from _st),
    'on_track', (select count(*) from _st where cur >= least(greatest(wk, 1), 17) or cur >= 17),
    'grading', (select count(*) from learn_progress x join applications a on a.id = x.application_id join course_items i on i.track_code = a.track_code and i.key = x.key where i.proj and x.status = 'submitted'),
    'grading_oldest', (select min(x.done_at) from learn_progress x join applications a on a.id = x.application_id join course_items i on i.track_code = a.track_code and i.key = x.key where i.proj and x.status = 'submitted'),
    'help_open', (select count(*) from support_requests where status <> 'Resolved'),
    'help_late', (select count(*) from support_requests where status <> 'Resolved' and created_at < now() - interval '1 day' and reply is null),
    'attend_past', (select count(*) from sessions x join applications a on a.cohort_id = x.cohort_id and a.status = 'Admitted' and (x.track_code is null or x.track_code = a.track_code) where x.cohort_id = c.id and x.starts_at < now()),
    'attend_yes', (select count(*) from attendance at join sessions x on x.id = at.session_id where x.cohort_id = c.id and x.starts_at < now() and (at.status in ('present','late') or (at.status is null and at.joined_at is not null))),
    'avg_score', (select round(avg(avg)) from _wt where avg is not null),
    'apps_admissions', (select count(*) from applications where cohort_id = ad.id),
    'apps_today', (select count(*) from applications where cohort_id = ad.id and created_at >= private.today()),
    'spark_apps', (select jsonb_agg((select count(*) from applications x where x.created_at::date = d) order by d) from generate_series(private.today() - 11, private.today(), interval '1 day') d),
    'spark_sub', (select jsonb_agg((select count(*) from learn_progress x where x.done_at::date = d) order by d) from generate_series(private.today() - 11, private.today(), interval '1 day') d),
    'spark_help', (select jsonb_agg((select count(*) from support_requests x where x.created_at::date = d) order by d) from generate_series(private.today() - 11, private.today(), interval '1 day') d),
    'spark_pay', (select jsonb_agg((select coalesce(sum(coalesce(y.amount_paid, y.amount)), 0) from payments y where y.status = 'success' and y.created_at::date = d) order by d) from generate_series(private.today() - 11, private.today(), interval '1 day') d)));

  -- money for the learning cohort
  r := r || jsonb_build_object('money', jsonb_build_object(
    'collected', (select coalesce(sum(paid_total), 0) from applications where cohort_id = c.id and status = 'Admitted'),
    'expected', (select coalesce(sum((private.fees(a) ->> 'plan_total')::int), 0) from applications a where a.cohort_id = c.id and a.status = 'Admitted'),
    'full_n', (select count(*) from applications where cohort_id = c.id and status = 'Admitted' and plan = 'full'),
    'full_sum', (select coalesce(sum(paid_total), 0) from applications where cohort_id = c.id and status = 'Admitted' and plan = 'full'),
    'two_n', (select count(*) from applications where cohort_id = c.id and status = 'Admitted' and plan = 'two'),
    'two_sum', (select coalesce(sum(paid_total), 0) from applications where cohort_id = c.id and status = 'Admitted' and plan = 'two'),
    'overdue', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'balance', (t.fee ->> 'balance')::int,
        'days', private.today() - (t.fee ->> 'due_date')::date) order by (t.fee ->> 'due_date')::date)
      from _st t join applications a on a.id = t.application_id where t.fee is not null), '[]'::jsonb)));

  -- seats by track (admissions cohort)
  r := r || jsonb_build_object('seats', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'track', t.name, 'seats', t.seats, 'paused', t.paused,
      'n', (select count(*) from applications a where a.cohort_id = ad.id and a.status = 'Admitted' and a.track_code = t.code),
      'n_learning', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.track_code = t.code)) order by t.sort, t.code)
    from tracks t where t.programme_code = ad.programme_code), '[]'::jsonb));

  -- share of each track's students who have passed each week
  r := r || jsonb_build_object('heat', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'track', t.name,
      'n', (select count(*) from _st x where x.track_code = t.code),
      'risk', (select count(*) from _st x where x.track_code = t.code and cardinality(x.reasons) > 0),
      'cells', (select jsonb_agg((select case when count(*) = 0 then null when count(*) filter (where w.state = 'pass') = 0 and g > (select coalesce(max(cur), 0) from _st x where x.track_code = t.code) then null
          else round(100.0 * count(*) filter (where w.state = 'pass') / count(*)) end from _wt w where w.track_code = t.code and w.week = g) order by g)
        from generate_series(1, coalesce(p.weeks, 17)) g)) order by t.sort, t.code)
    from tracks t where t.programme_code = c.programme_code), '[]'::jsonb));

  -- students to reach
  r := r || jsonb_build_object('risk', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric,
      'track', (select name from tracks where code = a.track_code), 'week', x.cur, 'reasons', to_jsonb(x.reasons), 'photo', a.photo is not null) order by cardinality(x.reasons) desc, a.surname)
    from (select * from _st where cardinality(reasons) > 0 order by cardinality(reasons) desc limit 8) x join applications a on a.id = x.application_id), '[]'::jsonb),
    'risk_n', (select count(*) from _st where cardinality(reasons) > 0));

  -- decisions waiting on someone
  r := r || jsonb_build_object('queue', coalesce((select jsonb_agg(q order by (q ->> 'rank')::int, q ->> 'oldest') from (
      select jsonb_build_object('cat', 'academy', 'rank', case when min(x.done_at) < now() - interval '2 days' then 1 else 2 end,
        'title', count(*) || ' ' || t.name || ' project' || case when count(*) = 1 then '' else 's' end || ' waiting for grading',
        'detail', 'Week results stay open until these are graded.', 'owner', coalesce((select string_agg(f.full_name, ', ') from staff f where f.active and f.role = 'facilitator' and f.track_code = t.code), 'No facilitator on this track'),
        'oldest', min(x.done_at), 'tab', 'grading', 'action', 'Open grading') q
      from learn_progress x join applications a on a.id = x.application_id join course_items i on i.track_code = a.track_code and i.key = x.key join tracks t on t.code = a.track_code
      where i.proj and x.status = 'submitted' group by t.code, t.name
      union all
      select jsonb_build_object('cat', 'money', 'rank', 1, 'title', count(*) || ' second instalment' || case when count(*) = 1 then '' else 's' end || ' overdue',
        'detail', '₦' || to_char(sum((fee ->> 'balance')::int), 'FM999,999,999') || ' outstanding. Learning is paused until they pay.', 'owner', 'Super Admin',
        'oldest', min((fee ->> 'due_date')::date)::timestamptz, 'tab', 'overview', 'action', 'Send reminders', 'act', 'fee-remind-all') from _st where fee is not null having count(*) > 0
      union all
      select jsonb_build_object('cat', 'academy', 'rank', 1,
        'title', case when count(*) = 1 then min(a.first_name || ' ' || a.surname) || ' failed a week after the retake' else count(*) || ' students failed a week after the retake' end,
        'detail', case when count(*) = 1 then 'Decide: give one more retake, repeat with the next cohort, or withdraw.'
          else (select string_agg(n, ', ') from (select a2.first_name || ' ' || a2.surname n from _st x2 join applications a2 on a2.id = x2.application_id where x2.failed_retake order by x2.last_at limit 3) z3)
            || case when count(*) > 3 then ' and ' || (count(*) - 3) || ' more' else '' end || '. Each needs a decision: one more retake, repeat with the next cohort, or withdraw.' end,
        'owner', coalesce((select string_agg(f.full_name, ', ') from staff f where f.active and f.role = 'cohort_manager'), 'Cohort Manager'),
        'oldest', min(x.last_at), 'tab', case when count(*) = 1 then 'student' else 'risk' end, 'id', case when count(*) = 1 then min(a.id::text) end, 'action', 'Decide')
        from _st x join applications a on a.id = x.application_id where x.failed_retake having count(*) > 0
      union all
      select jsonb_build_object('cat', 'admissions', 'rank', 2, 'title', count(*) || ' application' || case when count(*) = 1 then '' else 's' end || ' waiting for a decision',
        'detail', 'Calls are done. Send an offer, waitlist or decline.', 'owner', coalesce((select string_agg(f.full_name, ', ') from staff f where f.active and f.role = 'adm_admin'), 'Admissions Admin'),
        'oldest', min(updated_at), 'tab', 'decide', 'action', 'Review') from applications where status = 'Under review' having count(*) > 0
      union all
      select jsonb_build_object('cat', 'academy', 'rank', case when min(created_at) < now() - interval '1 day' then 1 else 2 end, 'title', count(*) || ' help request' || case when count(*) = 1 then '' else 's' end || ' not answered',
        'detail', count(*) filter (where created_at < now() - interval '1 day') || ' past the 1 working day reply time.', 'owner', 'Student Success',
        'oldest', min(created_at), 'tab', 'support', 'action', 'Reply') from support_requests where status <> 'Resolved' and reply is null having count(*) > 0
      union all
      select jsonb_build_object('cat', 'system', 'rank', 3, 'title', count(*) || ' email' || case when count(*) = 1 then '' else 's' end || ' failed to send',
        'detail', 'Usually a wrong email address. Fix the address, then resend.', 'owner', 'Super Admin', 'oldest', min(created_at), 'tab', 'emails', 'action', 'Open emails')
        from outbox where sent_at is null and error is not null having count(*) > 0
      union all
      select jsonb_build_object('cat', 'admissions', 'rank', 3, 'title', 'Call times running low',
        'detail', (select count(*) from slots where application_id is null and starts_at between now() and now() + interval '7 days') || ' free call slots in the next 7 days for ' || count(*) || ' applicants waiting to book.',
        'owner', coalesce((select string_agg(f.full_name, ', ') from staff f where f.active and f.role = 'adm_officer'), 'Admissions Officer'), 'oldest', min(updated_at), 'tab', 'times', 'action', 'Add times')
        from applications where status = 'Call to book'
        having count(*) > (select count(*) from slots where application_id is null and starts_at between now() and now() + interval '7 days')
      union all
      select jsonb_build_object('cat', 'academy', 'rank', 2, 'title', count(*) || ' student' || case when count(*) = 1 then '' else 's' end || ' without an internship placement',
        'detail', 'Internships start in Week 10.', 'owner', coalesce((select string_agg(f.full_name, ', ') from staff f where f.active and f.role = 'academy_admin'), 'Academy Admin'), 'oldest', null, 'tab', 'intern', 'action', 'Place them')
        from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and wk >= 8 and not exists (select 1 from placements pl where pl.application_id = a.id) having count(*) > 0
      union all
      select jsonb_build_object('cat', 'academy', 'rank', 3, 'title', count(*) || ' student' || case when count(*) = 1 then '' else 's' end || ' not in a pod',
        'detail', 'Pods keep students accountable each week.', 'owner', coalesce((select string_agg(f.full_name, ', ') from staff f where f.active and f.role = 'cohort_manager'), 'Cohort Manager'), 'oldest', null, 'tab', 'pods', 'action', 'Assign pods')
        from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and not exists (select 1 from pod_members m where m.application_id = a.id) having count(*) > 0
    ) z), '[]'::jsonb));

  -- who is carrying the load
  r := r || jsonb_build_object('staff', coalesce((select jsonb_agg(jsonb_build_object('email', f.email, 'name', f.full_name, 'role', f.role, 'track', (select name from tracks where code = f.track_code),
      'last_seen', f.last_seen_at, 'q', w.q, 'what', w.what, 'oldest', w.oldest) order by w.q desc nulls last, f.full_name)
    from staff f cross join lateral (select
      case f.role
        when 'facilitator' then (select count(*) from learn_progress x join applications a on a.id = x.application_id join course_items i on i.track_code = a.track_code and i.key = x.key where i.proj and x.status = 'submitted' and private.track_ok(f, a.track_code))
        when 'adm_admin' then (select count(*) from applications where status = 'Under review')
        when 'adm_officer' then (select count(*) from applications a where a.status = 'Call booked' and a.officer_email = f.email)
        when 'coach' then (select count(*) from coach_slots x where x.coach_email = f.email and x.application_id is not null and not exists (select 1 from call_results cr where cr.application_id = x.application_id))
        when 'cohort_manager' then (select count(*) from support_requests where status <> 'Resolved')
        when 'academy_admin' then (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and wk >= 8 and not exists (select 1 from placements pl where pl.application_id = a.id))
        else null end q,
      case f.role when 'facilitator' then 'to grade' when 'adm_admin' then 'to decide' when 'adm_officer' then 'calls booked' when 'coach' then 'calls to score'
        when 'cohort_manager' then 'help requests' when 'academy_admin' then 'to place' else '' end what,
      case f.role when 'facilitator' then (select min(x.done_at) from learn_progress x join applications a on a.id = x.application_id join course_items i on i.track_code = a.track_code and i.key = x.key where i.proj and x.status = 'submitted' and private.track_ok(f, a.track_code))
        when 'adm_admin' then (select min(updated_at) from applications where status = 'Under review') else null end oldest) w
    where f.active and f.role <> 'super'), '[]'::jsonb));

  -- what just happened
  r := r || jsonb_build_object('activity', coalesce((select jsonb_agg(e) from (select e from (
      select jsonb_build_object('at', l.at, 'who', coalesce((select full_name from staff where email = l.actor), l.actor), 'what', l.text) e from (select * from audit_log order by at desc limit 12) l
      union all
      select jsonb_build_object('at', y.created_at, 'who', 'Paystack', 'what', 'confirmed ₦' || to_char(coalesce(y.amount_paid, y.amount), 'FM999,999,999') || ' from ' || a.first_name || ' ' || a.surname || '.')
        from (select * from payments where status = 'success' order by created_at desc limit 6) y join applications a on a.id = y.application_id
      union all
      select jsonb_build_object('at', a.created_at, 'who', a.first_name || ' ' || a.surname, 'what', 'applied (' || a.ref || ').')
        from (select * from applications order by created_at desc limit 6) a
      union all
      select jsonb_build_object('at', q.created_at, 'who', a.first_name || ' ' || a.surname, 'what', 'asked for help: “' || q.subject || '”.')
        from (select * from support_requests order by created_at desc limit 4) q join applications a on a.id = q.application_id
    ) u order by e ->> 'at' desc limit 12) v), '[]'::jsonb));

  -- systems
  r := r || jsonb_build_object('systems', jsonb_build_object(
    'mail_today', (select count(*) from outbox where sent_at >= private.today()),
    'mail_pending', (select count(*) from outbox where sent_at is null and error is null),
    'mail_failed', (select count(*) from outbox where sent_at is null and error is not null),
    'mail_oldest_pending', (select min(created_at) from outbox where sent_at is null and error is null),
    'mail_last_sent', (select max(sent_at) from outbox),
    'pay_last', (select max(created_at) from payments where status = 'success'),
    'pay_failed_week', (select count(*) from payments where status = 'failed' and created_at > now() - interval '7 days'),
    'reminders_last', (select max(at) from reminders_sent)));
  return r;
end $$;

-- ---------- search ----------
create or replace function public.super_search(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; q text := lower(trim(coalesce(p_q, '')));
begin
  s := private.require_role(array['super']);
  if length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (
    select * from (
      select jsonb_build_object('kind', case when a.status = 'Admitted' then 'student' else 'application' end, 'id', a.id,
        'title', a.first_name || ' ' || a.surname, 'sub', coalesce(a.matric, a.ref) || ' · ' || a.status || coalesce(' · ' || (select name from tracks where code = a.track_code), '')) x
      from applications a
      where lower(a.first_name || ' ' || a.surname) like '%' || q || '%' or lower(a.email) like '%' || q || '%' or lower(a.ref) like '%' || q || '%'
        or lower(coalesce(a.matric, '')) like '%' || q || '%' or replace(a.phone, ' ', '') like '%' || replace(q, ' ', '') || '%'
      order by (a.status = 'Admitted') desc, a.surname limit 8) t1
    union all
    select * from (
      select jsonb_build_object('kind', 'staff', 'id', f.email, 'title', f.full_name, 'sub', f.email || ' · ' || f.role) x
      from staff f where lower(f.full_name) like '%' || q || '%' or f.email like '%' || q || '%' limit 4) t2) z), '[]'::jsonb);
end $$;

-- ---------- the full student record ----------
create or replace function public.acad_student360(p_app uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; a applications; c cohorts; st record; pl placements; f jsonb;
begin
  s := private.require_role(array['super','director','cohort_manager','academy_admin','facilitator','coach']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  select * into c from cohorts where id = a.cohort_id;
  select * into st from private.student_status(c.id) x where x.application_id = a.id;
  select * into pl from placements where application_id = a.id;
  f := private.fees(a);
  return jsonb_build_object(
    'id', a.id, 'first_name', a.first_name, 'surname', a.surname, 'email', a.email, 'phone', a.phone, 'city', a.city, 'photo', a.photo,
    'matric', a.matric, 'ref', a.ref, 'status', a.status, 'track_code', a.track_code, 'track', (select name from tracks where code = a.track_code),
    'cohort', c.name, 'start_date', c.start_date, 'cal_week', private.cur_week(c), 'linkedin', a.linkedin, 'bio', a.bio,
    'account', a.account_set_at is not null, 'cert_id', a.cert_id,
    'cur', st.cur, 'last_at', st.last_at, 'reasons', coalesce(to_jsonb(st.reasons), '[]'::jsonb), 'failed_retake', coalesce(st.failed_retake, false),
    'pass', coalesce(nullif(private.setting('learn_pass', '70'), '')::int, 70),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w.week, 'state', w.state, 'avg', w.avg, 'quiz', w.quiz, 'proj', w.proj, 'attempt', w.attempt,
        'title', (select title from course_weeks cw where cw.track_code = a.track_code and cw.week = w.week),
        'repeats', (select n from learn_attempts la where la.application_id = a.id and la.week = w.week)) order by w.week)
      from private.week_table(c.id) w where w.application_id = a.id), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(jsonb_build_object('week', k.week, 'conf', k.conf, 'note', k.note, 'at', k.at) order by k.week) from learn_checkins k where k.application_id = a.id), '[]'::jsonb),
    'attend', jsonb_build_object(
      'past', (select count(*) from sessions x where x.cohort_id = c.id and x.starts_at < now() and (x.track_code is null or x.track_code = a.track_code)),
      'yes', (select count(*) from attendance at join sessions x on x.id = at.session_id where at.application_id = a.id and x.starts_at < now() and (at.status in ('present','late') or (at.status is null and at.joined_at is not null)))),
    'ontime', jsonb_build_object('n', (select count(*) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key where x.application_id = a.id and i.proj and x.status in ('submitted','graded')),
      'late', (select count(*) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key where x.application_id = a.id and i.proj and x.cap < 1)),
    'admission', jsonb_build_object('applied', a.created_at, 'score', a.score, 'digital', a.score_digital, 'comms', a.score_comms, 'pass_mark', c.pass_mark,
      'dc1_at', a.dc1_at, 'dc1_note', a.dc1_note, 'officer', (select full_name from staff where email = a.officer_email), 'rec', a.rec,
      'decided_by', a.decided_by, 'decided_at', a.decided_at, 'admitted_at', a.admitted_at, 'edu', a.edu, 'nysc', a.nysc, 'situation', a.situation, 'motivation', a.motivation),
    'fees', jsonb_build_object('plan', a.plan, 'total', (f ->> 'plan_total')::int, 'paid', a.paid_total, 'due_date', coalesce(a.fee_due_override, (f ->> 'due_date')::date),
      'extended', a.fee_due_override is not null, 'locked', st.fee is not null),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('at', y.created_at, 'part', y.part, 'amount', coalesce(y.amount_paid, y.amount), 'reference', y.reference, 'status', y.status, 'channel', y.channel, 'by', y.recorded_by) order by y.created_at desc)
      from payments y where y.application_id = a.id), '[]'::jsonb),
    'placement', case when pl.application_id is null then null else private.placement_json(pl) end,
    'eval', (select to_jsonb(e) - 'application_id' from learn_evals e where e.application_id = a.id),
    'career', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'career'),
    'apps_n', (select jsonb_array_length(d.data) from learn_drafts d where d.application_id = a.id and d.key = 'apps' and jsonb_typeof(d.data) = 'array'),
    'call2', (select to_jsonb(r) - 'application_id' from call_results r where r.application_id = a.id),
    'outcome', (select to_jsonb(o) - 'application_id' from learn_outcomes o where o.application_id = a.id),
    'pod', (select jsonb_build_object('name', pd.name, 'n', (select count(*) from pod_members m2 where m2.pod_id = pd.id)) from pod_members m join pods pd on pd.id = m.pod_id where m.application_id = a.id),
    'team', coalesce((select jsonb_agg(jsonb_build_object('name', f2.full_name, 'role', f2.role) order by f2.role) from staff f2
      where f2.active and ((f2.role in ('facilitator','coach') and (f2.track_code is null or f2.track_code = a.track_code)) or f2.role = 'cohort_manager')), '[]'::jsonb),
    'support', coalesce((select jsonb_agg(jsonb_build_object('subject', r.subject, 'status', r.status, 'at', r.created_at) order by r.created_at desc) from support_requests r where r.application_id = a.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'by', n.by_name, 'at', n.at) order by n.at desc) from staff_notes n where n.application_id = a.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(h order by h ->> 'at' desc) from (
        select jsonb_build_object('at', x.at, 'text', coalesce((select title from course_items i where i.track_code = a.track_code and i.key = x.key) || ': ', '') || x.action, 'kind', 'Learning', 'by', x.by_name) h from learn_history x where x.application_id = a.id
        union all select jsonb_build_object('at', e.at, 'text', e.text, 'kind', 'Admissions', 'by', e.actor) from app_events e where e.application_id = a.id
        union all select jsonb_build_object('at', y.created_at, 'text', 'Payment ' || y.status || ': ₦' || to_char(coalesce(y.amount_paid, y.amount), 'FM999,999,999'), 'kind', 'Payment', 'by', null) from payments y where y.application_id = a.id
        union all select jsonb_build_object('at', r.created_at, 'text', 'Help request: ' || r.subject, 'kind', 'Support', 'by', null) from support_requests r where r.application_id = a.id
      ) z), '[]'::jsonb),
    'can', jsonb_build_object('money', s.role in ('super','director','cohort_manager'), 'retake', s.role in ('super','director','cohort_manager','facilitator')));
end $$;

-- ---------- staff actions on a student ----------
create or replace function public.acad_note_add(p_app uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['super','director','cohort_manager','academy_admin','facilitator','coach']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write the note first.' using errcode = 'P0001'; end if;
  insert into staff_notes(application_id, body, by_email, by_name) values (a.id, left(trim(p_body), 3000), s.email, s.full_name || ' · ' || s.role);
  return public.acad_student360(a.id);
end $$;

create or replace function public.acad_note_delete(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; n staff_notes;
begin
  s := private.require_role(array['super','director','cohort_manager','academy_admin','facilitator','coach']);
  select * into n from staff_notes where id = p_id;
  if n.id is null then raise exception 'Note not found.' using errcode = 'P0001'; end if;
  if n.by_email <> s.email and s.role <> 'super' then raise exception 'Only the person who wrote a note can delete it.' using errcode = 'P0001'; end if;
  delete from staff_notes where id = p_id;
  return public.acad_student360(n.application_id);
end $$;

-- One more assessment attempt for a week (after the retake was used).
create or replace function public.acad_grant_retake(p_app uuid, p_week int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; it course_items;
begin
  s := private.require_role(array['super','director','cohort_manager','facilitator']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  select * into it from course_items where track_code = a.track_code and week = p_week and type = 'quiz' limit 1;
  if it.key is null then raise exception 'That week has no assessment.' using errcode = 'P0001'; end if;
  if not exists (select 1 from learn_progress where application_id = a.id and key = it.key) then raise exception 'They haven''t taken this assessment yet.' using errcode = 'P0001'; end if;
  update learn_progress set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('attempt', 1, 'retake', false, 'granted', s.full_name) where application_id = a.id and key = it.key;
  delete from quiz_draws where application_id = a.id and key = it.key and attempt = 2;
  insert into learn_history(application_id, key, action, by_name) values (a.id, it.key, 'Given one more assessment attempt', s.full_name);
  insert into audit_log(actor, text) values (s.email, format('gave %s one more Week %s assessment attempt', a.matric, p_week));
  perform private.notify(a, 'message', 'You have one more attempt at the Week ' || p_week || ' assessment', 'Redo the week''s lessons, then retake the assessment.', '/learn/learning/' || p_week, null, null);
  return public.acad_student360(a.id);
end $$;

-- More time to pay the second instalment.
create or replace function public.acad_fee_extend(p_app uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['super','director','cohort_manager']);
  select * into a from applications where id = p_app;
  if a.id is null then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  if a.plan is distinct from 'two' then raise exception 'This student isn''t paying in instalments.' using errcode = 'P0001'; end if;
  if p_date is not null and p_date < private.today() then raise exception 'Choose a date from today onwards.' using errcode = 'P0001'; end if;
  update applications set fee_due_override = p_date where id = a.id;
  insert into audit_log(actor, text) values (s.email, case when p_date is null then format('removed the payment extension for %s', a.matric) else format('gave %s until %s to pay', a.matric, to_char(p_date, 'FMDD Mon YYYY')) end);
  if p_date is not null then
    perform private.notify(a, 'message', 'You have until ' || to_char(p_date, 'FMDD FMMonth') || ' to pay your balance', 'Your learning is open in the meantime.', '/learn', null, null);
  end if;
  return public.acad_student360(a.id);
end $$;

-- Remind students with an overdue balance (one student, or everyone when p_app is null).
create or replace function public.acad_fee_remind(p_app uuid default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; f jsonb; n int := 0;
begin
  s := private.require_role(array['super','director','cohort_manager']);
  for a in select * from applications where status = 'Admitted' and plan = 'two' and (p_app is null or id = p_app) loop
    f := private.fee_lock(a);
    if f is null then continue; end if;
    perform private.notify(a, 'payment', 'Your second instalment is overdue',
      'Pay ₦' || to_char((f ->> 'balance')::int, 'FM999,999,999') || ' to open your lessons again. Talk to Student Success if you need more time.',
      '/a/' || a.ref || '/' || a.token || '/pay', 'reminder', null, true);
    n := n + 1;
  end loop;
  insert into audit_log(actor, text) values (s.email, format('sent %s overdue payment reminder%s', n, case when n = 1 then '' else 's' end));
  return n;
end $$;

-- ---------- every student who needs a call ----------
create or replace function public.super_risk() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['super','director','cohort_manager']);
  c := private.ac_cohort();
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'phone', a.phone,
      'track', (select name from tracks where code = a.track_code), 'week', x.cur, 'last_at', x.last_at, 'conf', x.conf, 'reasons', to_jsonb(x.reasons),
      'note', (select n.body || ' · ' || n.by_name from staff_notes n where n.application_id = a.id order by n.at desc limit 1))
      order by cardinality(x.reasons) desc, a.surname)
    from private.student_status(c.id) x join applications a on a.id = x.application_id where cardinality(x.reasons) > 0), '[]'::jsonb);
end $$;

-- ---------- staff accounts ----------
create or replace function public.staff_ping() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update staff set last_seen_at = now() where email = (private.caller_staff()).email and (last_seen_at is null or last_seen_at < now() - interval '2 minutes');
end $$;

create or replace function public.super_staff2() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['super']);
  return jsonb_build_object(
    'staff', coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object('account', f.last_seen_at is not null or exists (select 1 from auth.users u where lower(u.email) = f.email),
        'track', (select name from tracks where code = f.track_code)) order by f.active desc, f.role, f.full_name) from staff f), '[]'::jsonb),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by sort, code) from tracks), '[]'::jsonb));
end $$;

create or replace function public.super_staff_invite(p_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; f staff; site text := private.setting('site_url', 'https://academy.jobnestcareers.com');
begin
  s := private.require_role(array['super']);
  select * into f from staff where email = lower(trim(p_email));
  if f.email is null then raise exception 'Add them as staff first.' using errcode = 'P0001'; end if;
  insert into outbox(to_email, template, subject, body, link, cta) values (f.email, 'staff_invite', 'You''ve been added to the Jobnest staff portal',
    'Hi ' || split_part(f.full_name, ' ', 1) || E',\n\n' || s.full_name || ' added you to the Jobnest staff portal as ' ||
    case f.role when 'super' then 'Super Admin' when 'adm_admin' then 'Admissions Admin' when 'adm_officer' then 'Admissions Officer' when 'director' then 'Programme Director'
      when 'cohort_manager' then 'Cohort Manager' when 'facilitator' then 'Facilitator' when 'coach' then 'Career Coach' else 'Academy Admin' end ||
    coalesce(' for ' || (select name from tracks where code = f.track_code), '') || E'.\n\nOpen the link, choose “First time? Set up your account” and use this email address: ' || f.email || '.',
    site || '/staff/signup', 'Set up my account');
  update staff set invited_at = now() where email = f.email;
  insert into audit_log(actor, text) values (s.email, 'sent a staff invite to ' || f.email);
  return public.super_staff2();
end $$;

-- ---------- who may call what ----------
revoke execute on function private.ac_cohort(), private.week_table(bigint), private.student_status(bigint) from public;
revoke execute on function public.super_overview(), public.super_search(text), public.acad_student360(uuid), public.acad_note_add(uuid, text), public.acad_note_delete(bigint),
  public.acad_grant_retake(uuid, int), public.acad_fee_extend(uuid, date), public.acad_fee_remind(uuid), public.staff_ping(), public.super_staff2(), public.super_staff_invite(text), public.super_risk() from public, anon;
grant execute on function public.super_overview(), public.super_search(text), public.acad_student360(uuid), public.acad_note_add(uuid, text), public.acad_note_delete(bigint),
  public.acad_grant_retake(uuid, int), public.acad_fee_extend(uuid, date), public.acad_fee_remind(uuid), public.staff_ping(), public.super_staff2(), public.super_staff_invite(text), public.super_risk() to authenticated;

notify pgrst, 'reload schema';

select 'Super Admin command centre installed' as done;
