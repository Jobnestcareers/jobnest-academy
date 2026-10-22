-- Jobnest Academy update 28: Programme & Grading Policy (Oct 2026).
-- 20 weeks in 8 stages, three tracks (Business Operations, People & Talent, Customer Success & Growth),
-- 10 weekly assessments (5 questions, 4 marks each, no resits), two timed examinations (Fundamental 30 questions in 30 minutes,
-- Core Skill Learning 40 questions in 45 minutes, by track and day), a practical project out of 100, and
-- Final = (Assessments /40 + Exams /60 + Project /100) / 2, graded Distinction / Merit / Pass / Fail.
-- Run 28_programme_v2.sql, then 28b_course_v2.sql, then 28c_question_banks.sql.

-- ---------- 1. Tracks: Administrative Support -> Business Operations, Customer Support -> Customer Success & Growth,
--               new People & Talent, Data Analysis and Digital Marketing close ----------
alter table course_items add column if not exists paper text;
alter table course_items add column if not exists final boolean not null default false;
alter table applications add column if not exists cert_class text;
alter table cohorts add column if not exists exam_week_start date;   -- set to move the examination week (a Monday). Empty = Week 12.

insert into tracks(code, programme_code, name, seats, sort) values
  ('BOP', 'GEP', 'Business Operations', 30, 1), ('PTA', 'GEP', 'People & Talent', 30, 2), ('CSG', 'GEP', 'Customer Success & Growth', 30, 3)
on conflict (code) do update set name = excluded.name, sort = excluded.sort, paused = false;

delete from quiz_bank where track_code in ('ADM', 'CSP', 'DAT', 'DMK');
delete from course_items where track_code in ('ADM', 'CSP', 'DAT', 'DMK');
delete from course_weeks where track_code in ('ADM', 'CSP', 'DAT', 'DMK');
-- Content made only for the closed tracks goes with them.
delete from lessons where track_code in ('DAT', 'DMK');
delete from tasks where track_code in ('DAT', 'DMK');
delete from sessions where track_code in ('DAT', 'DMK');
delete from announcements where track_code in ('DAT', 'DMK');
delete from opportunities where track_code in ('DAT', 'DMK');
delete from pod_members where pod_id in (select id from pods where track_code in ('DAT', 'DMK'));
delete from pods where track_code in ('DAT', 'DMK');
-- Staff limited to a closed track are switched off (an empty track would give them every track). Super Admin re-enables them with a new track.
insert into audit_log(actor, text)
select 'system', format('update 28: %s (%s) was limited to a closed track and has been switched off', full_name, email)
from staff where track_code in ('DAT', 'DMK') and active;
update staff set active = false where track_code in ('DAT', 'DMK') and role <> 'super';
update staff set track_code = null where track_code in ('DAT', 'DMK');
-- Students on a closed track keep their place but need a new track (Admissions: Students list).
insert into audit_log(actor, text)
select 'system', format('update 28: %s %s (%s) was on a closed track and needs a new track', first_name, surname, coalesce(matric, ref))
from applications where track_code in ('DAT', 'DMK');
update applications set track_code = null where track_code in ('DAT', 'DMK');

do $$
declare r record;
begin
  for r in select k.conrelid::regclass as t, a.attname as c from pg_constraint k
           join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
           where k.confrelid = 'tracks'::regclass and k.contype = 'f' loop
    execute format('update %s set %I = %L where %I = %L', r.t, r.c, 'BOP', r.c, 'ADM');
    execute format('update %s set %I = %L where %I = %L', r.t, r.c, 'CSG', r.c, 'CSP');
  end loop;
end $$;
update host_orgs set tracks = replace(replace(tracks, 'ADM', 'BOP'), 'CSP', 'CSG') where tracks is not null;
delete from tracks where code in ('ADM', 'CSP', 'DAT', 'DMK');

-- Fee for the 20-week programme: ₦180,000 in full, or ₦190,000 in two parts (₦95,000 + ₦95,000).
-- 6% extra gives ₦190,800, which update 27 rounds to the nearest ₦5,000: ₦190,000. Staff can still change both in Settings.
update programmes set weeks = 20, fee = 180000, inst_pct = 6,
  tagline = 'From graduate to work-ready in 20 weeks: core skills, examinations, a practical project, an internship and job-search coaching.'
where code = 'GEP';

update email_templates set body = replace(body, 'all 17 weeks', 'all 20 weeks') where key = 'complete';
update email_templates set body = replace(body, 'your client project', 'your practical project') where key = 'message';

-- Weekly assessments are always 5 questions. Learners get one attempt.
insert into app_settings(key, value) values ('quiz_size', '5') on conflict (key) do update set value = '5';

-- ---------- 2. Examination timetable, sittings, resits, corrections, exceptions, publishing ----------
create table if not exists exam_schedule (
  track_code text primary key references tracks(code) on delete cascade,
  fund_day int not null default 1 check (fund_day in (1, 2)),       -- 1 Monday, 2 Tuesday of the examination week
  core_day int not null default 3 check (core_day in (3, 4, 5))     -- 3 Wednesday, 4 Thursday, 5 Friday
);
alter table exam_schedule enable row level security;
insert into exam_schedule(track_code, fund_day, core_day) values ('BOP', 1, 3), ('PTA', 1, 4), ('CSG', 2, 5)
on conflict (track_code) do nothing;
insert into app_settings(key, value) values
  ('exam_open', '09:00'), ('exam_close', '16:00'), ('exam_fund_minutes', '30'), ('exam_core_minutes', '45'), ('exam_published', 'off')
on conflict (key) do nothing;

create table if not exists exam_sittings (
  application_id uuid not null references applications(id) on delete cascade,
  paper text not null check (paper in ('fund', 'core')),
  attempt int not null default 1,
  qids int[] not null,
  answers jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  submitted_at timestamptz,
  correct int,
  late boolean not null default false,
  primary key (application_id, paper, attempt)
);
alter table exam_sittings enable row level security;

create table if not exists exam_resits (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  paper text not null check (paper in ('fund', 'core')),
  exam_date date not null,
  reason text not null,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  used_at timestamptz
);
alter table exam_resits enable row level security;

-- An authorised correction replaces a calculated score. component = an assessment key (w5-2), 'exam-fund', 'exam-core' or 'project'.
-- value: correct answers for assessments (0-5) and exams (0-30, 0-40), marks for the project (0-100).
create table if not exists score_overrides (
  application_id uuid not null references applications(id) on delete cascade,
  component text not null,
  value numeric not null,
  reason text not null,
  by_name text not null,
  at timestamptz not null default now(),
  primary key (application_id, component)
);
alter table score_overrides enable row level security;

create table if not exists score_changes (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  component text not null,
  old_value numeric,
  new_value numeric,
  reason text not null,
  by_name text not null,
  at timestamptz not null default now()
);
alter table score_changes enable row level security;

-- An approved exception lets a result be calculated with missing components counted as zero.
create table if not exists result_exceptions (
  application_id uuid primary key references applications(id) on delete cascade,
  reason text not null,
  approved_by text not null,
  at timestamptz not null default now()
);
alter table result_exceptions enable row level security;

create table if not exists results_published (
  cohort_id bigint primary key references cohorts(id) on delete cascade,
  published_at timestamptz not null default now(),
  by_name text not null
);
alter table results_published enable row level security;

-- ---------- 3. Helpers ----------
create or replace function private.test_mode() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select private.setting('unlock_weeks', 'off') = 'on' or private.setting('week_dates', 'on') = 'off'
$$;

-- Monday of the examination week: the cohort's chosen date, otherwise the Monday of Week 12.
create or replace function private.exam_monday(c cohorts) returns date
language sql immutable as $$ select coalesce(c.exam_week_start, date_trunc('week', c.start_date + 77)::date) $$;

-- Weekly assessments close when the examination week starts.
create or replace function private.assess_close(c cohorts) returns timestamptz
language sql stable as $$ select (private.exam_monday(c) + time '00:00') at time zone 'Africa/Lagos' $$;

create or replace function private.grade_band(f numeric) returns jsonb
language sql immutable as $$
  select case when f is null then null
    when f >= 80 then jsonb_build_object('letter', 'A', 'class', 'Distinction')
    when f >= 60 then jsonb_build_object('letter', 'B', 'class', 'Merit')
    when f >= 50 then jsonb_build_object('letter', 'C', 'class', 'Pass')
    else jsonb_build_object('letter', 'F', 'class', 'Fail') end
$$;

create or replace function private.exam_minutes(p text) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p = 'fund' then coalesce(nullif(private.setting('exam_fund_minutes', '30'), '')::int, 30)
              else coalesce(nullif(private.setting('exam_core_minutes', '45'), '')::int, 45) end
$$;

create or replace function private.exam_n(p text) returns int
language sql immutable as $$ select case when p = 'fund' then 30 else 40 end $$;

-- Correct answers in a sitting: from its saved answers once it is submitted or its time has run out.
create or replace function private.sitting_correct(a applications, s exam_sittings) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case when s.submitted_at is null and now() <= s.deadline + interval '90 seconds' then null
    when s.correct is not null then s.correct
    else (select count(*)::int from unnest(s.qids) with ordinality u(qid, n)
          join quiz_bank b on b.track_code = a.track_code and b.key = 'exam-' || s.paper and b.qid = u.qid
          where nullif(s.answers ->> (u.n::int - 1), '')::int = b.a) end
$$;

-- The day a learner sits a paper: an unused resit date, otherwise their track's day in the examination week.
create or replace function private.exam_date(a applications, p text) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select r.exam_date from exam_resits r where r.application_id = a.id and r.paper = p and r.used_at is null order by r.id desc limit 1),
    (select private.exam_monday(c) + (case when p = 'fund' then coalesce(x.fund_day, 1) else coalesce(x.core_day, 3) end) - 1
     from cohorts c left join exam_schedule x on x.track_code = a.track_code where c.id = a.cohort_id))
$$;

-- Everything about one paper for one learner.
create or replace function private.exam_info(a applications, p text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d date; op timestamptz; cl timestamptz; s exam_sittings; rs exam_resits; st text; ok int; test boolean := private.test_mode();
begin
  d := private.exam_date(a, p);
  op := (d + private.setting('exam_open', '09:00')::time) at time zone 'Africa/Lagos';
  cl := (d + private.setting('exam_close', '16:00')::time) at time zone 'Africa/Lagos';
  select * into s from exam_sittings where application_id = a.id and paper = p order by attempt desc limit 1;
  select * into rs from exam_resits where application_id = a.id and paper = p and used_at is null order by id desc limit 1;
  ok := case when s.application_id is null then null else private.sitting_correct(a, s) end;
  st := case
    when s.application_id is not null and ok is null then 'In progress'
    when s.application_id is not null and rs.id is null then 'Graded'
    when a.track_code is null then 'Not scheduled'
    when test or now() between op and cl then 'Open'
    when now() < op then 'Upcoming'
    else 'Missed' end;
  return jsonb_build_object('paper', p, 'title', case when p = 'fund' then 'Fundamental Examination' else 'Core Skill Learning Examination' end,
    'date', d, 'opens', op, 'closes', cl, 'minutes', private.exam_minutes(p), 'questions', private.exam_n(p),
    'status', st, 'attempt', s.attempt, 'correct', ok, 'started_at', s.started_at, 'deadline', s.deadline,
    'submitted_at', coalesce(s.submitted_at, case when ok is not null then s.deadline end), 'late', s.late,
    'resit', case when rs.id is null then null else jsonb_build_object('date', rs.exam_date, 'reason', rs.reason) end,
    'previous', case when rs.id is not null and s.application_id is not null then ok end);
end $$;

-- The learner's full result. Pure calculation, so every dashboard and export shows the same numbers.
create or replace function private.result(a applications) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; assess jsonb := '[]'::jsonb; it record; x learn_progress; ov numeric; st text; cor numeric; n_taken int := 0; n_missed int := 0;
  n_pending int := 0; a_marks numeric := 0; fi jsonb; ci jsonb; fc numeric; cc numeric; e numeric; pi course_items; px learn_progress; p numeric; pst text;
  exc result_exceptions; missing text[] := '{}'; complete boolean; f numeric; band jsonb; pub results_published; closed boolean; drawing boolean;
begin
  select * into c from cohorts where id = a.cohort_id;
  closed := now() >= private.assess_close(c) and not private.test_mode();
  for it in select i.key, i.week, i.title from course_items i where i.track_code = a.track_code and i.type = 'quiz' order by i.week loop
    select * into x from learn_progress where application_id = a.id and key = it.key;
    select value into ov from score_overrides where application_id = a.id and component = it.key;
    drawing := exists (select 1 from quiz_draws w where w.application_id = a.id and w.key = it.key and w.submitted_at is null and now() <= w.deadline + interval '90 seconds');
    cor := coalesce(ov, (x.data ->> 'correct')::numeric, case when x.key is not null then round(coalesce(x.score, 0) * 5 / 100.0) end,
      -- started but never submitted before the time ran out: no answers were sent, so 0 correct
      case when exists (select 1 from quiz_draws w where w.application_id = a.id and w.key = it.key and w.submitted_at is null and now() > w.deadline + interval '90 seconds') then 0 end);
    st := case when cor is not null then 'Graded' when drawing then 'In progress' when closed then 'Missed' else 'Pending' end;
    if st = 'Graded' then n_taken := n_taken + 1; a_marks := a_marks + cor * 0.8;
    elsif st = 'Missed' then n_missed := n_missed + 1;
    else n_pending := n_pending + 1; end if;
    assess := assess || jsonb_build_object('key', it.key, 'week', it.week, 'title', it.title, 'status', st, 'correct', cor,
      'marks', case when cor is null then null else round(cor * 0.8, 1) end, 'corrected', ov is not null, 'taken_at', x.done_at);
  end loop;
  a_marks := least(40, a_marks);

  fi := private.exam_info(a, 'fund'); ci := private.exam_info(a, 'core');
  fc := coalesce((select value from score_overrides where application_id = a.id and component = 'exam-fund'), case when fi ->> 'status' = 'Graded' then (fi ->> 'correct')::numeric end);
  cc := coalesce((select value from score_overrides where application_id = a.id and component = 'exam-core'), case when ci ->> 'status' = 'Graded' then (ci ->> 'correct')::numeric end);
  if fc is not null and cc is not null then e := least(60, trunc((fc + cc) * 60 / 70.0, 2)); end if;

  select * into pi from course_items where track_code = a.track_code and final limit 1;
  select * into px from learn_progress where application_id = a.id and key = pi.key;
  p := coalesce((select value from score_overrides where application_id = a.id and component = 'project'),
                case when px.status = 'graded' then coalesce(px.grade, px.score) end);
  pst := case when p is not null then 'Graded' when px.status = 'revise' then 'Revision requested' when px.key is not null then 'Submitted' else 'Not submitted' end;

  if n_pending > 0 then missing := missing || format('%s weekly assessment%s not taken yet', n_pending, case when n_pending = 1 then '' else 's' end); end if;
  if fc is null then missing := missing || ('Fundamental Examination ' || case fi ->> 'status' when 'Missed' then 'missed' when 'In progress' then 'in progress' else 'not sat yet' end); end if;
  if cc is null then missing := missing || ('Core Skill Learning Examination ' || case ci ->> 'status' when 'Missed' then 'missed' when 'In progress' then 'in progress' else 'not sat yet' end); end if;
  if p is null then missing := missing || ('Practical project ' || lower(pst)); end if;
  select * into exc from result_exceptions where application_id = a.id;
  complete := cardinality(missing) = 0 or exc.application_id is not null;
  if complete then
    f := least(100, trunc((a_marks + coalesce(e, trunc((coalesce(fc, 0) + coalesce(cc, 0)) * 60 / 70.0, 2)) + coalesce(p, 0)) / 2, 1));
    band := private.grade_band(f);
  end if;
  select * into pub from results_published where cohort_id = a.cohort_id;
  return jsonb_build_object(
    'assessments', assess, 'assess_taken', n_taken, 'assess_missed', n_missed, 'assess_pending', n_pending,
    'assess_score', round(a_marks, 1), 'assess_max', 40, 'assess_close', private.assess_close(c),
    'fund', fi || jsonb_build_object('score', fc, 'corrected', exists (select 1 from score_overrides where application_id = a.id and component = 'exam-fund')),
    'core', ci || jsonb_build_object('score', cc, 'corrected', exists (select 1 from score_overrides where application_id = a.id and component = 'exam-core')),
    'exam_score', e, 'exam_max', 60,
    'project', jsonb_build_object('key', pi.key, 'week', pi.week, 'status', pst, 'score', p, 'feedback', px.feedback, 'rubric', px.data -> 'rubric',
      'graded_by', px.graded_by, 'graded_at', px.graded_at, 'submitted_at', case when px.key is not null then px.done_at end,
      'corrected', exists (select 1 from score_overrides where application_id = a.id and component = 'project')),
    'project_max', 100,
    'status', case when complete then 'Complete' else 'Pending' end, 'missing', to_jsonb(missing),
    'exception', case when exc.application_id is null then null else jsonb_build_object('reason', exc.reason, 'by', exc.approved_by, 'at', exc.at) end,
    'final', f, 'grade', band -> 'letter', 'class', band -> 'class',
    'published', pub.cohort_id is not null, 'published_at', pub.published_at);
end $$;

-- What a learner may see: component scores always, the final score and grade only once results are published.
create or replace function private.result_for_student(a applications) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when (r ->> 'published')::boolean then r else r || jsonb_build_object('final', null, 'grade', null, 'class', null) end
  from (select private.result(a) as r) t
$$;

-- ---------- 4. Learner: assessments (one attempt, 5 questions, close at the examination week) ----------
create or replace function public.learn_quiz_start(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; it course_items; d quiz_draws; mins int;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  it := private.learn_item(a, p_key);
  if it.type <> 'quiz' then raise exception 'That isn''t an assessment.' using errcode = 'P0001'; end if;
  if exists (select 1 from learn_progress where application_id = a.id and key = p_key) then
    raise exception 'You''ve already taken this assessment. Each assessment has one attempt.' using errcode = 'P0001';
  end if;
  if now() >= private.assess_close(c) and not private.test_mode()
     and not exists (select 1 from quiz_draws w where w.application_id = a.id and w.key = p_key and w.submitted_at is null) then
    raise exception 'This assessment closed when the examination week started.' using errcode = 'P0001';
  end if;
  perform private.seq_check(a, it);
  select * into d from quiz_draws where application_id = a.id and key = p_key order by attempt desc limit 1;
  if d.application_id is not null and d.submitted_at is null then return private.quiz_public(a, d); end if;
  if d.application_id is not null then raise exception 'You''ve already taken this assessment.' using errcode = 'P0001'; end if;
  mins := coalesce(nullif(private.setting('quiz_minutes', '10'), '')::int, 10);
  insert into quiz_draws(application_id, key, attempt, qids, deadline)
  values (a.id, p_key, 1, (select array_agg(qid) from (
      select qid from quiz_bank where track_code = a.track_code and key = p_key order by random() limit 5) s), now() + make_interval(mins => mins))
  returning * into d;
  if d.qids is null or array_length(d.qids, 1) < 5 then raise exception 'This assessment isn''t ready yet. Tell Student Success.' using errcode = 'P0001'; end if;
  insert into learn_history(application_id, key, action) values (a.id, p_key, 'Started the assessment');
  return private.quiz_public(a, d);
end $$;

create or replace function public.learn_quiz(p_key text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; d quiz_draws; ok int := 0; i int; sc int; late boolean; rev jsonb := '[]'::jsonb; b quiz_bank; ans int; n int;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.type <> 'quiz' then raise exception 'That isn''t an assessment.' using errcode = 'P0001'; end if;
  if exists (select 1 from learn_progress where application_id = a.id and key = p_key) then raise exception 'You''ve already taken this assessment.' using errcode = 'P0001'; end if;
  select * into d from quiz_draws where application_id = a.id and key = p_key and submitted_at is null order by attempt desc limit 1 for update;
  if d.application_id is null then raise exception 'Start the assessment first.' using errcode = 'P0001'; end if;
  late := now() > d.deadline + interval '90 seconds';
  n := array_length(d.qids, 1);
  for i in 1..n loop
    select * into b from quiz_bank where track_code = a.track_code and key = p_key and qid = d.qids[i];
    ans := case when late then null else nullif(p_answers ->> (i - 1), '')::int end;
    if ans = b.a then ok := ok + 1; end if;
    rev := rev || jsonb_build_object('q', b.q, 'o', to_jsonb(b.o), 'a', b.a, 'ans', ans);
  end loop;
  sc := round(100.0 * ok / greatest(n, 1));
  update quiz_draws set submitted_at = now() where application_id = a.id and key = p_key and attempt = d.attempt;
  insert into learn_progress(application_id, key, week, status, score, cap, data)
  values (a.id, p_key, it.week, 'done', sc, 1, jsonb_build_object('attempt', 1, 'review', rev, 'last', sc, 'late', late, 'correct', ok, 'total', n));
  insert into learn_history(application_id, key, action) values (a.id, p_key,
    format('Assessment: %s of %s correct (%s marks)', ok, n, trim(to_char(ok * 0.8, 'FM990.0'))) || case when late then ' (time ran out)' else '' end);
  return public.learn_state();
end $$;

create or replace function public.learn_quiz_retry(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Each weekly assessment has one attempt. There are no resits.' using errcode = 'P0001';
end $$;

create or replace function public.learn_repeat(p_week int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Weeks can''t be repeated. Your assessment scores count towards your final result.' using errcode = 'P0001';
end $$;

create or replace function public.acad_grant_retake(p_app uuid, p_week int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Weekly assessments have no resits under the grading policy. To fix a wrong mark, use Correct score on the Results page.' using errcode = 'P0001';
end $$;

-- ---------- 5. Learner: examinations ----------
create or replace function private.exam_public(a applications, s exam_sittings) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('paper', s.paper, 'attempt', s.attempt, 'deadline', s.deadline, 'now', now(), 'answers', s.answers,
    'qs', (select jsonb_agg(jsonb_build_object('q', b.q, 'o', to_jsonb(b.o)) order by u.n)
           from unnest(s.qids) with ordinality u(qid, n) join quiz_bank b on b.track_code = a.track_code and b.key = 'exam-' || s.paper and b.qid = u.qid))
$$;

create or replace function public.learn_exam_start(p_paper text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; info jsonb; s exam_sittings; rs exam_resits; att int; prev int[]; n int; rules course_items;
begin
  a := private.require_student();
  if p_paper not in ('fund', 'core') then raise exception 'Unknown paper.' using errcode = 'P0001'; end if;
  if private.fee_lock(a) is not null then raise exception 'Your second instalment is overdue. Pay the balance to continue.' using errcode = 'P0001'; end if;
  if private.setting('exam_published', 'off') <> 'on' and not private.test_mode() then
    raise exception 'The examination timetable hasn''t been published yet.' using errcode = 'P0001';
  end if;
  select * into rules from course_items where track_code = a.track_code and week = 12 and type = 'task' order by key limit 1;
  if rules.key is not null and not exists (select 1 from learn_progress where application_id = a.id and key = rules.key) then
    raise exception 'Read the examination rules first.' using errcode = 'P0001';
  end if;
  select * into s from exam_sittings where application_id = a.id and paper = p_paper order by attempt desc limit 1 for update;
  if s.application_id is not null and private.sitting_correct(a, s) is null then return private.exam_public(a, s); end if;
  info := private.exam_info(a, p_paper);
  if info ->> 'status' <> 'Open' then
    raise exception '%', case info ->> 'status'
      when 'Graded' then 'You''ve already sat this examination.'
      when 'Upcoming' then format('This examination opens on %s at %s.', to_char((info ->> 'date')::date, 'FMDay FMDD FMMonth'), private.setting('exam_open', '09:00'))
      when 'Missed' then 'The time to start this examination has passed. Speak to Student Success about a resit.'
      else 'This examination isn''t available.' end using errcode = 'P0001';
  end if;
  select * into rs from exam_resits where application_id = a.id and paper = p_paper and used_at is null order by id desc limit 1;
  att := coalesce(s.attempt, 0) + 1;
  n := private.exam_n(p_paper);
  select coalesce(array_agg(q), '{}') into prev from exam_sittings w, unnest(w.qids) q where w.application_id = a.id and w.paper = p_paper;
  insert into exam_sittings(application_id, paper, attempt, qids, deadline)
  values (a.id, p_paper, att, (select array_agg(qid) from (
      select qid from quiz_bank where track_code = a.track_code and key = 'exam-' || p_paper order by (qid = any(prev)), random() limit n) z),
    now() + make_interval(mins => private.exam_minutes(p_paper)))
  returning * into s;
  if s.qids is null or array_length(s.qids, 1) < n then raise exception 'This examination isn''t ready yet. Tell Student Success.' using errcode = 'P0001'; end if;
  if rs.id is not null then update exam_resits set used_at = now() where id = rs.id; end if;
  insert into learn_history(application_id, key, action) values (a.id, 'exam-' || p_paper,
    format('Started the %s%s', info ->> 'title', case when att > 1 then ' (authorised resit)' else '' end));
  return private.exam_public(a, s);
end $$;

-- Save answers as the learner goes, so nothing is lost if the connection drops.
create or replace function public.learn_exam_save(p_paper text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; s exam_sittings;
begin
  a := private.require_student();
  select * into s from exam_sittings where application_id = a.id and paper = p_paper and submitted_at is null order by attempt desc limit 1 for update;
  if s.application_id is null or now() > s.deadline + interval '90 seconds' then return jsonb_build_object('saved', false); end if;
  update exam_sittings set answers = coalesce(p_answers, '[]'::jsonb) where application_id = a.id and paper = p_paper and attempt = s.attempt;
  return jsonb_build_object('saved', true);
end $$;

create or replace function public.learn_exam_submit(p_paper text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; s exam_sittings; it course_items; ok int; v_late boolean;
begin
  a := private.require_student();
  select * into s from exam_sittings where application_id = a.id and paper = p_paper and submitted_at is null order by attempt desc limit 1 for update;
  if s.application_id is null then raise exception 'There''s no examination in progress.' using errcode = 'P0001'; end if;
  v_late := now() > s.deadline + interval '90 seconds';
  if not v_late then update exam_sittings set answers = coalesce(p_answers, '[]'::jsonb) where application_id = a.id and paper = p_paper and attempt = s.attempt returning * into s; end if;
  s.submitted_at := now();
  s.correct := null;
  ok := private.sitting_correct(a, s);
  update exam_sittings set submitted_at = least(now(), deadline + interval '90 seconds'), correct = ok, late = v_late
  where application_id = a.id and paper = p_paper and attempt = s.attempt;
  select * into it from course_items where track_code = a.track_code and type = 'exam' and paper = p_paper;
  if it.key is not null then
    insert into learn_progress(application_id, key, week, status, score, cap, data)
    values (a.id, it.key, it.week, 'done', round(100.0 * ok / private.exam_n(p_paper)), 1, jsonb_build_object('correct', ok, 'total', private.exam_n(p_paper)))
    on conflict (application_id, key) do update set status = 'done', score = excluded.score, data = excluded.data, done_at = now();
  end if;
  insert into learn_history(application_id, key, action) values (a.id, 'exam-' || p_paper,
    format('Submitted the %s: %s of %s correct', case when p_paper = 'fund' then 'Fundamental Examination' else 'Core Skill Learning Examination' end, ok, private.exam_n(p_paper))
    || case when v_late then ' (time ran out)' else '' end);
  return public.learn_state();
end $$;

create or replace function public.learn_results() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return private.result_for_student(a);
end $$;

-- Learner state now carries the examination timetable and results.
create or replace function public.learn_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  return jsonb_build_object(
    'track', a.track_code,
    'start_date', c.start_date,
    'unlock_all', private.setting('unlock_weeks', 'off') = 'on',
    'ignore_dates', private.setting('week_dates', 'on') = 'off',
    'exam_published', private.setting('exam_published', 'off') = 'on' or private.test_mode(),
    'progress', coalesce((select jsonb_object_agg(x.key, private.learn_row(x)) from learn_progress x where x.application_id = a.id), '{}'::jsonb),
    'attempts', '{}'::jsonb,
    'checkins', coalesce((select jsonb_object_agg(k.week, jsonb_build_object('conf', k.conf, 'note', k.note, 'at', k.at)) from learn_checkins k where k.application_id = a.id), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('key', h.key, 'action', h.action, 'by', h.by_name, 'at', h.at) order by h.at) from learn_history h where h.application_id = a.id), '[]'::jsonb),
    'results', private.result_for_student(a),
    'now', now());
end $$;

-- Graduation: examinations count as done once sat or missed (a missed paper shows on the result instead).
create or replace function public.grad_complete() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; n int;
begin
  a := private.require_student();
  if exists (select 1 from learn_history where application_id = a.id and key = 'complete') then return jsonb_build_object('sent', false); end if;
  select count(*) into n from course_items i
  where i.track_code = a.track_code and not i.opt and i.type not in ('exam', 'quiz')
    and not exists (select 1 from learn_progress x where x.application_id = a.id and x.key = i.key and x.status in ('done','graded'));
  if n > 0 then return jsonb_build_object('sent', false, 'left', n); end if;
  insert into learn_history(application_id, key, action) values (a.id, 'complete', 'Completed the programme');
  perform private.queue_mail(a, 'complete', '{}'::jsonb, private.site() || '/learn/graduate');
  return jsonb_build_object('sent', true);
end $$;

-- Staff dashboards: a week is finished when its required steps are done. There is no pass mark or repeat any more.
create or replace function private.week_table(p_cohort bigint)
returns table(application_id uuid, track_code text, week int, state text, avg int, quiz int, proj int, attempt int, last_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with w as (
    select a.id, a.track_code, i.week,
      count(*) filter (where not i.opt) req,
      count(*) filter (where not i.opt and x.status is not null and x.status <> 'revise') done,
      max(x.score) filter (where i.type = 'quiz') q,
      max(x.score) filter (where i.proj and x.status = 'graded') pr,
      coalesce(bool_or(i.proj and x.status = 'revise'), false) rev,
      max(x.done_at) last_at
    from applications a join course_items i on i.track_code = a.track_code
    left join learn_progress x on x.application_id = a.id and x.key = i.key
    where a.cohort_id = p_cohort and a.status = 'Admitted' and a.matric is not null
    group by a.id, a.track_code, i.week)
  select w.id, w.track_code, w.week,
    case when w.rev then 'revise' when w.done < w.req then 'open' else 'pass' end,
    null::int, w.q, w.pr, 1, w.last_at
  from w
$$;

-- ---------- 6. Staff: results, corrections, resits, exceptions, publishing, examination settings ----------
create or replace function private.results_staff() returns staff
language sql stable security definer set search_path = public, pg_temp as $$
  select private.require_role(array['director','cohort_manager','academy_admin','facilitator'])
$$;

create or replace function public.acad_results(p_cohort bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.results_staff();
  if p_cohort is null then c := private.ac_cohort(); else select * into c from cohorts where id = p_cohort; end if;
  return jsonb_build_object(
    'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'start_date', c.start_date, 'exam_monday', private.exam_monday(c), 'assess_close', private.assess_close(c)),
    'cohorts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by start_date desc), '[]'::jsonb) from cohorts k
                where exists (select 1 from applications x where x.cohort_id = k.id and x.matric is not null)),
    'published', (select jsonb_build_object('at', published_at, 'by', by_name) from results_published where cohort_id = c.id),
    'can_publish', s.role in ('super','director'),
    'can_correct', s.role in ('super','director','cohort_manager','academy_admin'),
    'tracks', (select jsonb_object_agg(code, name) from tracks),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'matric', a.matric, 'name', trim(a.first_name || ' ' || a.surname),
        'track', a.track_code, 'result', private.result(a)) order by a.surname, a.first_name)
      from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb));
end $$;

create or replace function public.acad_result_detail(p_app uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.results_staff();
  select * into a from applications where id = p_app;
  if a.id is null or a.matric is null or not private.track_ok(s, a.track_code) then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', a.id, 'matric', a.matric, 'name', trim(a.first_name || ' ' || a.surname), 'track', (select name from tracks where code = a.track_code),
    'result', private.result(a),
    'sittings', coalesce((select jsonb_agg(jsonb_build_object('paper', x.paper, 'attempt', x.attempt, 'started_at', x.started_at, 'submitted_at', x.submitted_at,
        'deadline', x.deadline, 'correct', private.sitting_correct(a, x), 'late', x.late) order by x.paper, x.attempt) from exam_sittings x where x.application_id = a.id), '[]'::jsonb),
    'resits', coalesce((select jsonb_agg(jsonb_build_object('paper', r.paper, 'date', r.exam_date, 'reason', r.reason, 'by', r.granted_by, 'at', r.granted_at, 'used_at', r.used_at) order by r.id) from exam_resits r where r.application_id = a.id), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('component', g.component, 'old', g.old_value, 'new', g.new_value, 'reason', g.reason, 'by', g.by_name, 'at', g.at) order by g.at desc) from score_changes g where g.application_id = a.id), '[]'::jsonb),
    'can_publish', s.role in ('super','director'), 'can_correct', s.role in ('super','director','cohort_manager','academy_admin'),
    'locked', exists (select 1 from results_published where cohort_id = a.cohort_id));
end $$;

-- Correct a score (or clear a correction with p_value null). After results are published only Super Admin and the Programme Director can.
create or replace function public.acad_score_correct(p_app uuid, p_component text, p_value numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; mx numeric; old numeric; label text;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  select * into a from applications where id = p_app;
  if a.id is null or a.matric is null then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  if exists (select 1 from results_published where cohort_id = a.cohort_id) and s.role not in ('super','director') then
    raise exception 'Results are published. Only the Programme Director or Super Admin can change them now.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the change.' using errcode = 'P0001'; end if;
  if p_component = 'exam-fund' then mx := 30; label := 'Fundamental Examination (correct answers)';
  elsif p_component = 'exam-core' then mx := 40; label := 'Core Skill Learning Examination (correct answers)';
  elsif p_component = 'project' then mx := 100; label := 'Practical project (marks)';
  elsif exists (select 1 from course_items where track_code = a.track_code and key = p_component and type = 'quiz') then
    mx := 5; label := (select title from course_items where track_code = a.track_code and key = p_component) || ' (correct answers)';
  else raise exception 'Unknown score.' using errcode = 'P0001'; end if;
  if p_value is not null and (p_value < 0 or p_value > mx or (mx < 100 and p_value <> trunc(p_value))) then
    raise exception 'Enter a whole number from 0 to %.', mx using errcode = 'P0001';
  end if;
  select value into old from score_overrides where application_id = a.id and component = p_component;
  if p_value is null then delete from score_overrides where application_id = a.id and component = p_component;
  else
    insert into score_overrides(application_id, component, value, reason, by_name) values (a.id, p_component, p_value, trim(p_reason), s.full_name)
    on conflict (application_id, component) do update set value = excluded.value, reason = excluded.reason, by_name = excluded.by_name, at = now();
  end if;
  insert into score_changes(application_id, component, old_value, new_value, reason, by_name) values (a.id, p_component, old, p_value, trim(p_reason), s.full_name);
  insert into audit_log(actor, text) values (s.email, format('%s score for %s: %s (%s)', case when p_value is null then 'cleared the corrected' else 'corrected the' end,
    a.matric, label || coalesce(' = ' || p_value::text, ''), trim(p_reason)));
  return public.acad_result_detail(a.id);
end $$;

create or replace function public.acad_exam_resit(p_app uuid, p_paper text, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  select * into a from applications where id = p_app;
  if a.id is null or a.matric is null then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  if p_paper not in ('fund', 'core') then raise exception 'Choose a paper.' using errcode = 'P0001'; end if;
  if p_date is null or p_date < current_date then raise exception 'Choose today or a later date.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the resit.' using errcode = 'P0001'; end if;
  if exists (select 1 from exam_resits where application_id = a.id and paper = p_paper and used_at is null) then
    update exam_resits set exam_date = p_date, reason = trim(p_reason), granted_by = s.full_name, granted_at = now() where application_id = a.id and paper = p_paper and used_at is null;
  else
    insert into exam_resits(application_id, paper, exam_date, reason, granted_by) values (a.id, p_paper, p_date, trim(p_reason), s.full_name);
  end if;
  insert into audit_log(actor, text) values (s.email, format('authorised a %s resit for %s on %s (%s)',
    case when p_paper = 'fund' then 'Fundamental Examination' else 'Core Skill Learning Examination' end, a.matric, p_date, trim(p_reason)));
  insert into learn_history(application_id, key, action, by_name) values (a.id, 'exam-' || p_paper, format('Resit authorised for %s', to_char(p_date, 'FMDD FMMon YYYY')), s.full_name);
  perform private.notify(a, 'message', 'Examination resit authorised',
    format('You can sit the %s on %s between %s and %s. A resit replaces your previous score.',
      case when p_paper = 'fund' then 'Fundamental Examination' else 'Core Skill Learning Examination' end, to_char(p_date, 'FMDay FMDD FMMonth'),
      private.setting('exam_open', '09:00'), private.setting('exam_close', '16:00')), '/learn/results', null, null);
  return public.acad_result_detail(a.id);
end $$;

create or replace function public.acad_exam_resit_cancel(p_app uuid, p_paper text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  select * into a from applications where id = p_app;
  delete from exam_resits where application_id = p_app and paper = p_paper and used_at is null;
  insert into audit_log(actor, text) values (s.email, format('cancelled an unused %s resit for %s', p_paper, a.matric));
  return public.acad_result_detail(p_app);
end $$;

create or replace function public.acad_result_exception(p_app uuid, p_on boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['director']);
  select * into a from applications where id = p_app;
  if a.id is null then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  if p_on then
    if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the exception.' using errcode = 'P0001'; end if;
    insert into result_exceptions(application_id, reason, approved_by) values (a.id, trim(p_reason), s.full_name)
    on conflict (application_id) do update set reason = excluded.reason, approved_by = excluded.approved_by, at = now();
  else
    delete from result_exceptions where application_id = a.id;
  end if;
  insert into audit_log(actor, text) values (s.email, format('%s a result exception for %s%s', case when p_on then 'approved' else 'removed' end, a.matric,
    case when p_on then ': missing scores count as zero (' || trim(p_reason) || ')' else '' end));
  return public.acad_result_detail(a.id);
end $$;

create or replace function public.acad_results_publish(p_cohort bigint, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; a applications; r jsonb;
begin
  s := private.require_role(array['director']);
  select * into c from cohorts where id = p_cohort;
  if c.id is null then raise exception 'Cohort not found.' using errcode = 'P0001'; end if;
  if p_on then
    insert into results_published(cohort_id, by_name) values (c.id, s.full_name) on conflict (cohort_id) do nothing;
    for a in select * from applications where cohort_id = c.id and status = 'Admitted' and matric is not null loop
      r := private.result(a);
      if r ->> 'status' = 'Complete' then
        perform private.notify(a, 'message', 'Your final result is published', format('Final score %s/100: %s.', r ->> 'final', r ->> 'class'), '/learn/results', null, null);
      end if;
    end loop;
  else
    delete from results_published where cohort_id = c.id;
  end if;
  insert into audit_log(actor, text) values (s.email, format('%s results for %s', case when p_on then 'published' else 'unpublished' end, c.name));
  return public.acad_results(c.id);
end $$;

create or replace function public.acad_exam_settings(p jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; t record; k text;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  if p is not null then
    for t in select * from jsonb_to_recordset(coalesce(p -> 'schedule', '[]'::jsonb)) as r(track text, fund_day int, core_day int) loop
      if t.fund_day not in (1, 2) then raise exception 'The Fundamental Examination is on Monday or Tuesday.' using errcode = 'P0001'; end if;
      if t.core_day not in (3, 4, 5) then raise exception 'Core Skill Learning Examinations are on Wednesday, Thursday or Friday.' using errcode = 'P0001'; end if;
      if t.track = 'BOP' and t.core_day <> 3 then raise exception 'Business Operations sits its Core Skill Learning Examination on Wednesday.' using errcode = 'P0001'; end if;
      insert into exam_schedule(track_code, fund_day, core_day) values (t.track, t.fund_day, t.core_day)
      on conflict (track_code) do update set fund_day = excluded.fund_day, core_day = excluded.core_day;
    end loop;
    foreach k in array array['exam_open', 'exam_close', 'exam_fund_minutes', 'exam_core_minutes'] loop
      if p ? k then
        if k in ('exam_open', 'exam_close') and (p ->> k) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Use a time like 09:00.' using errcode = 'P0001'; end if;
        if k like '%minutes' and ((p ->> k) !~ '^[0-9]+$' or (p ->> k)::int not between 10 and 240) then raise exception 'Time limits are 10 to 240 minutes.' using errcode = 'P0001'; end if;
        insert into app_settings(key, value) values (k, p ->> k) on conflict (key) do update set value = excluded.value;
      end if;
    end loop;
    if private.setting('exam_open', '09:00') >= private.setting('exam_close', '16:00') then raise exception 'The start window must open before it closes.' using errcode = 'P0001'; end if;
    if p ? 'exam_week_start' then
      if nullif(p ->> 'exam_week_start', '') is not null and extract(isodow from (p ->> 'exam_week_start')::date) <> 1 then
        raise exception 'The examination week starts on a Monday.' using errcode = 'P0001';
      end if;
      update cohorts set exam_week_start = nullif(p ->> 'exam_week_start', '')::date where id = (private.ac_cohort()).id;
    end if;
    if p ? 'published' then
      insert into app_settings(key, value) values ('exam_published', case when (p ->> 'published')::boolean then 'on' else 'off' end)
      on conflict (key) do update set value = excluded.value;
    end if;
    insert into audit_log(actor, text) values (s.email, 'updated the examination timetable and settings' || case when p ? 'published' then case when (p ->> 'published')::boolean then ' (published)' else ' (unpublished)' end else '' end);
  end if;
  c := private.ac_cohort();
  return jsonb_build_object('cohort', c.name, 'exam_monday', private.exam_monday(c), 'exam_week_start', c.exam_week_start,
    'week12_monday', date_trunc('week', c.start_date + 77)::date,
    'open', private.setting('exam_open', '09:00'), 'close', private.setting('exam_close', '16:00'),
    'fund_minutes', private.exam_minutes('fund'), 'core_minutes', private.exam_minutes('core'),
    'published', private.setting('exam_published', 'off') = 'on',
    'schedule', (select coalesce(jsonb_agg(jsonb_build_object('track', k.code, 'name', k.name, 'fund_day', coalesce(x.fund_day, 1), 'core_day', coalesce(x.core_day, 3),
        'fund_bank', (select count(*) from quiz_bank b where b.track_code = k.code and b.key = 'exam-fund'),
        'core_bank', (select count(*) from quiz_bank b where b.track_code = k.code and b.key = 'exam-core')) order by k.sort), '[]'::jsonb)
      from tracks k left join exam_schedule x on x.track_code = k.code where not k.paused));
end $$;

-- ---------- 7. Certificates show the final classification ----------
create or replace function public.acad_issue_certificate(p_app uuid, p_date date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; r jsonb;
begin
  s := private.require_role(array['director','academy_admin']);
  select * into a from applications where id = p_app;
  if a.id is null or a.status <> 'Admitted' or a.matric is null then
    raise exception 'Only admitted students can get a certificate.' using errcode = 'P0001';
  end if;
  r := private.result(a);
  if not (r ->> 'published')::boolean then raise exception 'Publish this cohort''s results first (Results page).' using errcode = 'P0001'; end if;
  if r ->> 'status' <> 'Complete' then raise exception 'Their result is still Pending.' using errcode = 'P0001'; end if;
  if r ->> 'grade' = 'F' then raise exception 'A Fail result doesn''t receive a certificate.' using errcode = 'P0001'; end if;
  update applications set completed_on = coalesce(p_date, current_date), cert_id = private.cert_from_matric(a.matric), cert_class = r ->> 'class'
  where id = a.id returning * into a;
  insert into audit_log(actor, text) values (s.email, format('issued certificate %s (%s) to %s %s', a.cert_id, a.cert_class, a.first_name, a.surname));
  perform private.queue_email(a, 'certificate', jsonb_build_object('cert', a.cert_id), 'certificate');
  return jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on, 'class', a.cert_class);
end $$;

create or replace function public.certificate_view(p_cert text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v text := private.cert_norm(p_cert); r jsonb;
begin
  select jsonb_build_object('kind', 'internship', 'cert_id', e.cert_id, 'name', trim(a.first_name || ' ' || a.surname),
    'programme', 'Internship · ' || pl.role, 'role', pl.role, 'org', pl.org, 'sup_name', pl.sup_name, 'weeks', 4,
    'track', (select name from tracks where code = a.track_code), 'completed_on', (e.at at time zone 'Africa/Lagos')::date, 'year', to_char(e.at, 'YYYY'),
    'signer_name', private.setting('signer_name', ''), 'signer_title', private.setting('signer_title', 'Programme Director'))
  into r from learn_evals e join applications a on a.id = e.application_id join placements pl on pl.application_id = a.id
  where e.cert_id = v and a.status = 'Admitted';
  if r is not null then return r; end if;
  select jsonb_build_object('kind', 'programme', 'cert_id', a.cert_id, 'name', trim(a.first_name || ' ' || a.surname),
    'programme', p.name, 'weeks', p.weeks, 'track', (select name from tracks where code = a.track_code), 'class', a.cert_class,
    'completed_on', a.completed_on, 'year', to_char(a.completed_on, 'YYYY'),
    'signer_name', private.setting('signer_name', ''), 'signer_title', private.setting('signer_title', 'Programme Director'))
  into r from applications a join cohorts c on c.id = a.cohort_id join programmes p on p.code = c.programme_code
  where a.cert_id = v and a.status = 'Admitted';
  return r;
end $$;

create or replace function public.student_certificate() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if a.cert_id is null then return null; end if;
  return jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on, 'class', a.cert_class);
end $$;

-- ---------- 9. Week numbers in staff dashboards (20-week programme) ----------
create or replace function public.acad_jobsearch()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s staff;
begin
  s := private.require_role(array['coach','director','cohort_manager','academy_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'phone', a.phone,
      'track', (select name from tracks where code = a.track_code),
      'links', coalesce((select jsonb_object_agg(i.title, x.link) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key
        where x.application_id = a.id and x.link is not null and i.week >= 19), '{}'::jsonb),
      'done', coalesce((select jsonb_agg(i.title) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key
        where x.application_id = a.id and i.week >= 19 and x.status <> 'revise'), '[]'::jsonb),
      'pitch', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'pitch'),
      'outreach', coalesce((select d.data from learn_drafts d where d.application_id = a.id and d.key = 'outreach'), '[]'::jsonb),
      'apps', coalesce((select d.data from learn_drafts d where d.application_id = a.id and d.key = 'apps'), '[]'::jsonb),
      'cv', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'cv'),
      'score', (select r.score from call_results r where r.application_id = a.id),
      'updated', (select max(d.updated_at) from learn_drafts d where d.application_id = a.id and d.key in ('pitch','outreach','apps')))
      order by a.surname)
    from applications a where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb);
end $function$;
create or replace function public.super_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s staff; c cohorts; ad cohorts; p programmes; wk int; pass int; r jsonb; mode text;
begin
  s := private.require_role(array['super']);
  c := private.ac_cohort(); ad := private.current_cohort();
  select * into p from programmes where code = c.programme_code;
  wk := private.cur_week(c);
  pass := coalesce(nullif(private.setting('learn_pass', '70'), '')::int, 70);
  mode := case when private.setting('unlock_weeks', 'off') = 'on' then 'open' when private.setting('week_dates', 'on') = 'off' then 'progress' else 'normal' end;

  create temp table if not exists _st on commit drop as select * from private.student_status(c.id) limit 0;
  delete from _st where true; insert into _st select * from private.student_status(c.id);
  create temp table if not exists _wt on commit drop as select * from private.week_table(c.id) limit 0;
  delete from _wt where true; insert into _wt select * from private.week_table(c.id);

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
        from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and wk >= 13 and not exists (select 1 from placements pl where pl.application_id = a.id) having count(*) > 0
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
        when 'academy_admin' then (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and wk >= 13 and not exists (select 1 from placements pl where pl.application_id = a.id))
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
end $function$;
create or replace function public.director_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s staff; c cohorts; wk int; pass int;
begin
  s := private.require_role(array['director','super']);
  c := private.ac_cohort(); wk := private.cur_week(c);
  pass := coalesce(nullif(private.setting('learn_pass', '70'), '')::int, 70);
  create temp table if not exists _dst on commit drop as select * from private.student_status(c.id) limit 0;
  delete from _dst where true; insert into _dst select * from private.student_status(c.id);
  create temp table if not exists _dwt on commit drop as select * from private.week_table(c.id) limit 0;
  delete from _dwt where true; insert into _dwt select * from private.week_table(c.id);
  return jsonb_build_object(
    'me', s.full_name,
    'cohort', jsonb_build_object('name', c.name, 'week', wk, 'start_date', c.start_date),
    'students', (select count(*) from _dst),
    'pass_rate', (select round(100.0 * count(*) filter (where r ->> 'status' = 'Complete' and r ->> 'grade' <> 'F') / nullif(count(*) filter (where r ->> 'status' = 'Complete'), 0)) from (select private.result(a) r from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null) t),
    'pass_last', (select round(avg((r ->> 'assess_score')::numeric), 1) from (select private.result(a) r from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null) t),
    'ahead', jsonb_build_object(
      'behind2', (select count(*) from _dst where cur <= wk - 2),
      'behind1', (select count(*) from _dst where cur = wk - 1),
      'on', (select count(*) from _dst where cur = wk),
      'ahead', (select count(*) from _dst where cur > wk)),
    'attend', (select round(100.0 * count(*) filter (where at.status in ('present','late') or (at.status is null and at.joined_at is not null)) / nullif(count(*), 0))
      from sessions x join applications a on a.cohort_id = x.cohort_id and a.status = 'Admitted' and (x.track_code is null or x.track_code = a.track_code)
      left join attendance at on at.session_id = x.id and at.application_id = a.id where x.cohort_id = c.id and x.starts_at < now()),
    'grading_fast', (select round(100.0 * count(*) filter (where x.graded_at - x.done_at <= interval '2 days') / nullif(count(*), 0))
      from learn_progress x join applications a on a.id = x.application_id where a.cohort_id = c.id and x.graded_at is not null),
    'in_work', (select round(100.0 * count(*) filter (where o.status in ('hired','internship','freelance')) / nullif(count(*), 0))
      from applications a left join learn_outcomes o on o.application_id = a.id where a.cert_id is not null),
    'escalations', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'app', e.application_id, 'kind', e.kind, 'title', e.title, 'detail', e.detail, 'week', e.week,
        'by', e.raised_by_name, 'at', e.created_at, 'status', e.status, 'decided_by', e.decided_by, 'note', e.decision_note,
        'name', (select first_name || ' ' || surname from applications where id = e.application_id)) order by e.status = 'open' desc, e.created_at desc)
      from (select * from escalations where status = 'open' or decided_at > now() - interval '3 days' order by created_at desc limit 20) e), '[]'::jsonb),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name,
        'n', (select count(*) from _dst x where x.track_code = t.code),
        'pass', (select jsonb_agg((select round(100.0 * count(*) filter (where w.state = 'pass') / nullif(count(*) filter (where w.state in ('pass','fail')), 0)) from _dwt w where w.track_code = t.code and w.week = g) order by g) from generate_series(1, greatest(wk, 1)) g),
        'score', (select jsonb_agg((select round(avg(w.avg)) from _dwt w where w.track_code = t.code and w.week = g) order by g) from generate_series(1, greatest(wk, 1)) g),
        'att', (select jsonb_agg((select round(100.0 * count(*) filter (where at.status in ('present','late') or (at.status is null and at.joined_at is not null)) / nullif(count(*), 0))
            from sessions x join applications a on a.cohort_id = x.cohort_id and a.status = 'Admitted' and a.track_code = t.code and (x.track_code is null or x.track_code = t.code)
            left join attendance at on at.session_id = x.id and at.application_id = a.id
            where x.cohort_id = c.id and x.starts_at < now() and floor(extract(epoch from (x.starts_at - c.start_date::timestamptz)) / 604800)::int + 1 = g) order by g) from generate_series(1, greatest(wk, 1)) g),
        'avg', (select round(avg(w.avg)) from _dwt w where w.track_code = t.code and w.avg is not null),
        'ontime', (select round(100.0 * count(*) filter (where coalesce(x.cap, 1) >= 1) / nullif(count(*), 0)) from learn_progress x join applications a on a.id = x.application_id
          join course_items i on i.track_code = a.track_code and i.key = x.key where a.cohort_id = c.id and a.track_code = t.code and i.proj),
        'turn', (select round(extract(epoch from avg(x.graded_at - x.done_at)) / 86400.0, 1) from learn_progress x join applications a on a.id = x.application_id
          where a.cohort_id = c.id and a.track_code = t.code and x.graded_at is not null),
        'waiting', (select count(*) from learn_progress x join applications a on a.id = x.application_id join course_items i on i.track_code = a.track_code and i.key = x.key
          where a.cohort_id = c.id and a.track_code = t.code and i.proj and x.status = 'submitted'),
        'fac', (select string_agg(f.full_name, ', ') from staff f where f.active and f.role = 'facilitator' and f.track_code = t.code)) order by t.sort, t.code)
      from tracks t where t.programme_code = c.programme_code), '[]'::jsonb),
    'hard', coalesce((select jsonb_agg(h) from (select jsonb_build_object('q', r ->> 'q', 'track', (select name from tracks where code = a.track_code), 'week', x.week,
          'n', count(*), 'wrong', round(100.0 * count(*) filter (where (r ->> 'ans') is null or (r ->> 'ans')::int <> (r ->> 'a')::int) / count(*))) h
        from learn_progress x join applications a on a.id = x.application_id cross join lateral jsonb_array_elements(coalesce(x.data -> 'review', '[]'::jsonb)) r
        where a.cohort_id = c.id and x.week >= greatest(wk - 2, 1)
        group by r ->> 'q', a.track_code, x.week having count(*) >= 3
        order by round(100.0 * count(*) filter (where (r ->> 'ans') is null or (r ->> 'ans')::int <> (r ->> 'a')::int) / count(*)) desc limit 5) z), '[]'::jsonb),
    'feel', (select jsonb_build_object('avg', round(avg(k.conf)::numeric, 1), 'n', count(*), 'c1', count(*) filter (where k.conf = 1), 'c2', count(*) filter (where k.conf = 2),
        'c3', count(*) filter (where k.conf = 3), 'c4', count(*) filter (where k.conf = 4), 'c5', count(*) filter (where k.conf = 5))
      from learn_checkins k join applications a on a.id = k.application_id where a.cohort_id = c.id and k.week = (select max(week) from learn_checkins k2 join applications a2 on a2.id = k2.application_id where a2.cohort_id = c.id)),
    'notes', coalesce((select jsonb_agg(k.note order by k.at desc) from (select k.note, k.at from learn_checkins k join applications a on a.id = k.application_id
        where a.cohort_id = c.id and coalesce(trim(k.note), '') <> '' order by k.at desc limit 3) k), '[]'::jsonb));
end $function$;
create or replace function public.coach_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s staff; c cohorts; wk int; dc2 int;
begin
  s := private.require_role(array['coach','director','cohort_manager','super']);
  c := private.ac_cohort(); wk := private.cur_week(c);
  dc2 := coalesce((select min(week) from course_weeks where title ilike '%job search%'), 20);
  return jsonb_build_object('me', s.full_name, 'cohort', jsonb_build_object('name', c.name, 'week', wk), 'dc2_week', dc2,
    'to_book', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.first_name || ' ' || a.surname, 'track', (select name from tracks where code = a.track_code)) order by a.surname)
      from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and wk >= dc2 - 1
        and not exists (select 1 from coach_slots x where x.application_id = a.id)), '[]'::jsonb),
    'pipeline', (select jsonb_build_object(
        'interested', count(*) filter (where st in ('Interested','Planning to apply','Saved')),
        'applied', count(*) filter (where st = 'Applied'),
        'interviewing', count(*) filter (where st = 'Interviewing'),
        'offer', count(*) filter (where st in ('Offer','Offer received')))
      from (select coalesce(e ->> 'st', 'Applied') st from learn_drafts d join applications a on a.id = d.application_id cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data) = 'array' then d.data else '[]'::jsonb end) e
              where d.key = 'apps' and a.cohort_id = c.id
            union all select v.value #>> '{}' from learn_drafts d join applications a on a.id = d.application_id cross join lateral jsonb_each(coalesce(d.data -> 'st', '{}'::jsonb)) v
              where d.key = 'opps' and a.cohort_id = c.id) z),
    'pipe_people', coalesce((select jsonb_agg(p) from (select jsonb_build_object('name', a.first_name || ' ' || a.surname, 'id', a.id, 'st', e ->> 'st', 'role', coalesce(e ->> 'role', e ->> 't', ''), 'org', coalesce(e ->> 'co', e ->> 'org', '')) p
        from learn_drafts d join applications a on a.id = d.application_id cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data) = 'array' then d.data else '[]'::jsonb end) e
        where d.key = 'apps' and a.cohort_id = c.id order by d.updated_at desc limit 40) z), '[]'::jsonb),
    'working', (select count(*) from learn_outcomes o where o.status in ('hired','internship','freelance')),
    'opps_live', (select count(*) from opportunities o where o.active and (o.deadline is null or o.deadline >= private.today())),
    'chat', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'body', p.body, 'author', p.author, 'at', p.created_at) order by p.created_at)
      from discussion_posts p where p.cohort_id = c.id and p.channel = 'career' and p.parent_id is null and not p.hidden and not p.is_staff
        and not exists (select 1 from discussion_posts r where r.parent_id = p.id and r.is_staff)), '[]'::jsonb));
end $function$;
create or replace function public.aa_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s staff; c cohorts; wk int;
begin
  s := private.require_role(array['academy_admin','director','cohort_manager','super']);
  c := private.ac_cohort(); wk := private.cur_week(c);
  return jsonb_build_object('me', s.full_name, 'cohort', jsonb_build_object('id', c.id, 'name', c.name, 'week', wk, 'start_date', c.start_date),
    'intern_start', private.week_start(c, 10),
    'hosts', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'city', h.city, 'tracks', h.tracks, 'spots', h.spots, 'contact_name', h.contact_name,
        'contact_phone', h.contact_phone, 'contact_email', h.contact_email, 'notes', h.notes, 'active', h.active,
        'used', (select count(*) from placements pl join applications a on a.id = pl.application_id where a.cohort_id = c.id and lower(trim(pl.org)) = lower(trim(h.name)))) order by h.active desc, h.name)
      from host_orgs h), '[]'::jsonb),
    'unhosted_orgs', coalesce((select jsonb_agg(distinct pl.org) from placements pl join applications a on a.id = pl.application_id
      where a.cohort_id = c.id and not exists (select 1 from host_orgs h where lower(trim(h.name)) = lower(trim(pl.org)))), '[]'::jsonb),
    'no_account', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and a.account_set_at is null),
    'certs_ready', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.cert_id is null
      and exists (select 1 from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key where x.application_id = a.id and i.week = 20)),
    'sessions_nolink', (select count(*) from sessions x where x.cohort_id = c.id and x.starts_at between now() and now() + interval '8 days' and coalesce(x.link, '') = ''),
    'checks', coalesce((select jsonb_object_agg(item, jsonb_build_object('by', done_by, 'at', done_at)) from ops_checks where cohort_id = c.id and week = wk), '{}'::jsonb));
end $function$;

-- ---------- 10. Week 20: Discovery Call, Job Search & Pitching (the post-course call with a Career Coach) ----------
create or replace function public.learn_done(p_key text, p_done boolean, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a applications; it course_items; x learn_progress; d jsonb; n int;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.staff then raise exception 'Staff complete this step.' using errcode = 'P0001'; end if;
  if it.type = 'quiz' then raise exception 'Submit this one from its own page.' using errcode = 'P0001'; end if;
  if it.title in ('Book your Discovery Call') then raise exception 'Book a time below. This ticks itself when you book.' using errcode = 'P0001'; end if;
  if it.title in ('Have your Discovery Call') then raise exception 'Your coach marks this after your call.' using errcode = 'P0001'; end if;
  if it.link and it.title not in ('ATS-compliant resume', 'Weekly job application tracker') then
    raise exception 'Submit this one from its own page.' using errcode = 'P0001';
  end if;
  select * into x from learn_progress where application_id = a.id and key = p_key;
  if p_done then
    perform private.seq_check(a, it);
    if it.type = 'oath' and coalesce(trim(p_data ->> 'sig'), '') = '' then raise exception 'Sign with your full name.' using errcode = 'P0001'; end if;
    if it.title = 'Confirm your placement' and not exists (select 1 from placements where application_id = a.id) then
      raise exception 'Your placement hasn''t been assigned yet. Student Success will add it here.' using errcode = 'P0001';
    end if;
    if it.title = 'Collect your internship certificate' and not exists (select 1 from learn_evals where application_id = a.id) then
      raise exception 'Your internship certificate is issued after your supervisor submits your final evaluation.' using errcode = 'P0001';
    end if;
    if it.title = 'ATS-compliant resume' then
      select data into d from learn_drafts where application_id = a.id and key = 'cv';
      if d is null or coalesce(trim(d ->> 'name'), '') = '' or length(coalesce(d ->> 'summary', '')) < 40 then
        raise exception 'Fill in your CV first: at least your name and a short summary.' using errcode = 'P0001';
      end if;
      p_data := jsonb_build_object('cv', d);
    end if;
    if it.title = 'Send 10 cold outreach messages' then
      select jsonb_array_length(coalesce(data, '[]'::jsonb)) into n from learn_drafts where application_id = a.id and key = 'outreach';
      if coalesce(n, 0) < 10 then raise exception 'Log 10 messages first. You have %.', coalesce(n, 0) using errcode = 'P0001'; end if;
    end if;
    if it.title = 'Weekly job application tracker' then
      select jsonb_array_length(coalesce(data, '[]'::jsonb)) into n from learn_drafts where application_id = a.id and key = 'apps';
      if coalesce(n, 0) < 3 then raise exception 'Add at least 3 applications first.' using errcode = 'P0001'; end if;
      p_data := jsonb_build_object('count', n);
    end if;
    if it.title = 'Report your first interview invite' and not exists (
      select 1 from learn_drafts d2, jsonb_array_elements(d2.data) e where d2.application_id = a.id and d2.key = 'apps' and e ->> 'st' in ('Interviewing','Offer')) then
      raise exception 'Move an application to Interviewing first.' using errcode = 'P0001';
    end if;
    if it.type = 'logweek' and x.key is not null and x.status = 'done' and coalesce((x.data ->> 'signed')::boolean, false) then
      raise exception 'Your supervisor has already signed this entry.' using errcode = 'P0001';
    end if;
    insert into learn_progress(application_id, key, week, status, data) values (a.id, p_key, it.week, 'done', p_data)
    on conflict (application_id, key) do update set status = 'done', data = coalesce(excluded.data, learn_progress.data), done_at = now(), feedback = null;
    insert into learn_history(application_id, key, action) values (a.id, p_key,
      case when it.type = 'oath' then 'Signed' when it.type = 'logweek' then case when x.status = 'revise' then 'Resubmitted' else 'Submitted' end else 'Completed' end);
  else
    if it.type = 'oath' then raise exception 'A signed oath can''t be undone.' using errcode = 'P0001'; end if;
    if it.type = 'logweek' then raise exception 'A submitted logbook entry can''t be withdrawn.' using errcode = 'P0001'; end if;
    delete from learn_progress where application_id = a.id and key = p_key and status = 'done';
  end if;
  return public.learn_state();
end $function$;
create or replace function public.dc2_book(p_slot bigint, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a applications; s coach_slots; co staff;
begin
  a := private.require_student();
  if exists (select 1 from coach_slots where application_id = a.id) then raise exception 'You already have a call booked. Cancel it first to pick another time.' using errcode = 'P0001'; end if;
  update coach_slots set application_id = a.id, note = nullif(left(trim(coalesce(p_note, '')), 300), ''), booked_at = now()
  where id = p_slot and application_id is null and starts_at > now() + interval '2 hours' returning * into s;
  if s.id is null then raise exception 'Sorry, that time was just taken. Please pick another.' using errcode = 'P0001'; end if;
  select * into co from staff where email = s.coach_email;
  perform private.learn_mark(a, 'Book your Discovery Call', true, null);
  insert into learn_history(application_id, key, action) values (a.id, coalesce(private.key_of(a, 'Book your Discovery Call'), 'dc2'), 'Booked Discovery Call');
  perform private.queue_mail(a, 'dc2_booked', jsonb_build_object(
    'longdate', private.wat(s.starts_at, 'FMDay, FMDD FMMonth'), 'time', private.wat(s.starts_at, 'HH24:MI'), 'coach', co.full_name,
    'meet', private.setting('call_link', ''),
    'gcal', private.gcal_url(s.starts_at, 40, 'Jobnest Discovery Call', 'Your 40-minute call with ' || co.full_name || ', Career Coach.', private.setting('call_link', ''))),
    private.site() || '/#/learn/learning/15');
  return public.learn_extra();
end $function$;
create or replace function public.dc2_cancel()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a applications; s coach_slots;
begin
  a := private.require_student();
  select * into s from coach_slots where application_id = a.id;
  if s.id is null then return public.learn_extra(); end if;
  if s.starts_at < now() + interval '2 hours' then raise exception 'It''s less than 2 hours to your call. Message Student Success to change it.' using errcode = 'P0001'; end if;
  if exists (select 1 from call_results where application_id = a.id) then raise exception 'Your call has already happened.' using errcode = 'P0001'; end if;
  update coach_slots set application_id = null, note = null, booked_at = null where id = s.id;
  perform private.learn_mark(a, 'Book your Discovery Call', false, null);
  insert into learn_history(application_id, key, action) values (a.id, coalesce(private.key_of(a, 'Book your Discovery Call'), 'dc2'), 'Cancelled Discovery Call');
  return public.learn_extra();
end $function$;
create or replace function public.coach_result(p_app uuid, p_score integer, p_note text, p_next text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s staff; a applications; nx text[];
begin
  s := private.require_role(array['coach','director','cohort_manager']);
  select * into a from applications where id = p_app;
  if a.id is null or not exists (select 1 from coach_slots where application_id = a.id) then raise exception 'That student hasn''t booked a call.' using errcode = 'P0001'; end if;
  if p_score is null or p_score < 1 or p_score > 10 then raise exception 'Give a confidence score from 1 to 10.' using errcode = 'P0001'; end if;
  select array_agg(trim(l)) into nx from unnest(string_to_array(coalesce(p_next, ''), E'\n')) l where trim(l) <> '';
  insert into call_results(application_id, score, note, next, by_name) values (a.id, p_score, nullif(trim(coalesce(p_note, '')), ''), nx, s.full_name)
  on conflict (application_id) do update set score = excluded.score, note = excluded.note, next = excluded.next, by_name = excluded.by_name, at = now();
  perform private.learn_mark(a, 'Have your Discovery Call', true, s.full_name);
  insert into learn_history(application_id, key, action, by_name) values (a.id, coalesce(private.key_of(a, 'Have your Discovery Call'), 'dc2'), format('Call result: %s/10', p_score), s.full_name);
  perform private.queue_mail(a, 'dc2_result', jsonb_build_object('score', p_score, 'coach', s.full_name), private.site() || '/#/learn/learning/15');
  return jsonb_build_object('ok', true);
end $function$;
update email_templates set subject = replace(subject, 'Discovery Call 2', 'Discovery Call'), body = replace(body, 'Discovery Call 2', 'Discovery Call'),
  cta = replace(cta, 'Discovery Call 2', 'Discovery Call') where key in ('dc2_booked', 'dc2_result');
update email_templates set body = replace(body, 'It lasts 40 minutes.', 'It lasts 40 minutes. Now that the course is done, your coach reviews where you are, runs a short mock interview and agrees your next steps.') where key = 'dc2_booked' and body not like '%where you are%';

-- ---------- 8. Permissions ----------
revoke execute on function public.learn_exam_start(text), public.learn_exam_save(text, jsonb), public.learn_exam_submit(text, jsonb), public.learn_results(),
  public.acad_results(bigint), public.acad_result_detail(uuid), public.acad_score_correct(uuid, text, numeric, text), public.acad_exam_resit(uuid, text, date, text),
  public.acad_exam_resit_cancel(uuid, text), public.acad_result_exception(uuid, boolean, text), public.acad_results_publish(bigint, boolean), public.acad_exam_settings(jsonb)
  from public, anon;
grant execute on function public.learn_exam_start(text), public.learn_exam_save(text, jsonb), public.learn_exam_submit(text, jsonb), public.learn_results(),
  public.acad_results(bigint), public.acad_result_detail(uuid), public.acad_score_correct(uuid, text, numeric, text), public.acad_exam_resit(uuid, text, date, text),
  public.acad_exam_resit_cancel(uuid, text), public.acad_result_exception(uuid, boolean, text), public.acad_results_publish(bigint, boolean), public.acad_exam_settings(jsonb)
  to authenticated;

notify pgrst, 'reload schema';
select 'Programme v2: tracks, examinations and grading installed' as done;
