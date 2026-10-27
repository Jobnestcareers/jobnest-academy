-- Jobnest Academy update 30: live classes, attendance marks and facilitator-owned questions.
-- 1. Each topic is a live class that facilitators set up in Staff > Live classes: time, link, notes, slides,
--    resources, recording. Fundamentals classes (Weeks 2-3) are for everyone; Core classes are per track.
-- 2. Attendance at teaching classes is worth 10 marks. Present = joined and entered the class code (or ticked
--    on the register). Late counts as present. Recording + catch-up check within 48 hours = half.
--    An approved absence (Excused) isn't counted.
-- 3. Final score = (attendance 10 + weekly assessments 30 + examinations 60 + project 100) / 2.
--    Each assessment question is now worth 0.6 marks (5 questions = 3 marks, 10 assessments = 30).
-- 4. Facilitators write their assessment and practice questions; the Programme Director approves them.
--    Only approved questions are drawn. Practice questions are shown with answers, so they never appear in a graded paper. A question is locked once any learner has been given it.
-- 5. A weekly assessment opens after that week's last live class (still closes Sunday 18:00).
-- 6. The demo lessons are hidden: live classes replace them.
-- Run after update 29. Safe to run more than once.

-- ---------- tables ----------
alter table sessions add column if not exists summary text;
alter table sessions add column if not exists notes text;
alter table sessions add column if not exists notes_early boolean not null default true;
alter table sessions add column if not exists slides jsonb;
alter table sessions add column if not exists resources jsonb not null default '[]'::jsonb;
alter table sessions add column if not exists recording_url text;
alter table sessions add column if not exists chapters text;
alter table sessions add column if not exists published boolean not null default true;
alter table sessions add column if not exists code text;
alter table sessions add column if not exists code_until timestamptz;
alter table sessions add column if not exists updated_at timestamptz;
alter table sessions drop constraint if exists sessions_kind_check;
alter table sessions add constraint sessions_kind_check check (kind in ('class','guest','clinic','orientation','other'));

alter table attendance add column if not exists code_at timestamptz;
alter table attendance add column if not exists code_tries int not null default 0;
alter table attendance add column if not exists catchup_at timestamptz;
alter table attendance add column if not exists catchup_qids int[];
alter table attendance add column if not exists catchup_key text;

alter table quiz_bank add column if not exists status text not null default 'approved';
alter table quiz_bank drop constraint if exists quiz_bank_status_check;
alter table quiz_bank add constraint quiz_bank_status_check check (status in ('draft','pending','approved'));
alter table quiz_bank add column if not exists practice boolean not null default false;
alter table quiz_bank add column if not exists explain text;
alter table quiz_bank add column if not exists author text;
alter table quiz_bank add column if not exists approved_by text;
alter table quiz_bank add column if not exists approved_at timestamptz;
alter table quiz_bank add column if not exists review_note text;
alter table quiz_bank add column if not exists updated_at timestamptz;

-- Live classes replace the demo lessons: they no longer count as steps to finish.
update course_items set opt = true where type = 'lesson';

insert into app_settings(key, value) values ('uploads', 'on') on conflict (key) do nothing;

-- ---------- helpers ----------
-- Which programme week a moment falls in (week 1 starts on the cohort start date).
create or replace function private.week_of(c cohorts, t timestamptz) returns int
language sql stable as $$ select floor(((t at time zone 'Africa/Lagos')::date - c.start_date) / 7.0)::int + 1 $$;

-- A slide or resource: {name, url, kind, size}. Uploaded files and pasted links look the same.
create or replace function private.clean_file(j jsonb) returns jsonb
language plpgsql immutable as $$
declare u text; n text;
begin
  if j is null or jsonb_typeof(j) <> 'object' then return null; end if;
  u := private.clean_url(j ->> 'url');
  if u is null then return null; end if;
  n := left(coalesce(nullif(trim(coalesce(j ->> 'name', '')), ''), regexp_replace(u, '^.*/', '')), 120);
  return jsonb_build_object('name', n, 'url', u, 'kind', upper(left(coalesce(nullif(j ->> 'kind', ''), 'LINK'), 8)),
    'size', case when (j ->> 'size') ~ '^\d+$' then (j ->> 'size')::bigint end);
end $$;

create or replace function private.clean_files(j jsonb) returns jsonb
language sql immutable as $$
  select coalesce((select jsonb_agg(f) from (select private.clean_file(e) f from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) e limit 20) z where f is not null), '[]'::jsonb)
$$;

-- Attendance credit for one class: 1 present or late, 0.5 caught up from the recording, 0 missed, null excused (not counted).
create or replace function private.att_credit(x sessions, at attendance) returns numeric
language sql immutable as $$
  select case when at.status = 'excused' then null
    when at.status in ('present', 'late') then 1
    when at.status is null and at.code_at is not null then 1
    when at.catchup_at is not null then 0.5
    else 0 end
$$;

-- A learner's attendance over every teaching class held so far: 10 marks x credit / classes counted.
create or replace function private.attendance(a applications) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with k as (
    select x.id, x.title, x.starts_at, at.status, private.att_credit(x, at) cr
    from sessions x left join attendance at on at.session_id = x.id and at.application_id = a.id
    where x.cohort_id = a.cohort_id and (x.track_code is null or x.track_code = a.track_code) and x.kind = 'class' and x.published
      and x.starts_at + make_interval(mins => x.minutes) < now())
  select jsonb_build_object('held', count(*), 'counted', count(cr), 'credit', coalesce(sum(cr), 0),
    'present', count(*) filter (where cr = 1), 'catchup', count(*) filter (where cr = 0.5),
    'missed', count(*) filter (where cr = 0), 'excused', count(*) filter (where cr is null),
    'score', case when count(cr) = 0 then 10 else round(10 * sum(cr) / count(cr), 2) end)
  from k
$$;

-- True when the two most recent teaching classes (not excused) both earned nothing.
create or replace function private.missed_two(a applications) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select count(*) = 2 and bool_and(cr = 0) from (
    select private.att_credit(x, at) cr
    from sessions x left join attendance at on at.session_id = x.id and at.application_id = a.id
    where x.cohort_id = a.cohort_id and (x.track_code is null or x.track_code = a.track_code) and x.kind = 'class' and x.published
      and x.starts_at + make_interval(mins => x.minutes) < now() and at.status is distinct from 'excused'
    order by x.starts_at desc limit 2) z), false)
$$;

-- What a learner sees of one class. Notes and files show before class only if the facilitator allows it.
create or replace function private.class_public(a applications, c cohorts, x sessions) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', x.id, 'title', x.title, 'kind', x.kind, 'starts_at', x.starts_at, 'minutes', x.minutes,
    'host', x.host, 'week', private.week_of(c, x.starts_at), 'summary', x.summary, 'counts', x.kind = 'class',
    'notes', case when x.notes_early or now() >= x.starts_at then x.notes end,
    'slides', case when x.notes_early or now() >= x.starts_at then x.slides end,
    'resources', case when x.notes_early or now() >= x.starts_at then x.resources else '[]'::jsonb end,
    'early_hidden', not x.notes_early and now() < x.starts_at and (x.notes is not null or x.slides is not null or jsonb_array_length(x.resources) > 0),
    'has_link', coalesce(x.link, '') <> '', 'recording_url', x.recording_url, 'chapters', x.chapters,
    'code_live', x.code is not null and x.code_until > now(),
    'catchup_until', x.starts_at + make_interval(mins => x.minutes) + interval '48 hours',
    'att', (select coalesce(at.status, case when at.code_at is not null then 'present' when at.joined_at is not null then 'joined' end)
            from attendance at where at.session_id = x.id and at.application_id = a.id),
    'me', (select jsonb_build_object('status', at.status, 'joined_at', at.joined_at, 'code_at', at.code_at, 'catchup_at', at.catchup_at,
              'credit', private.att_credit(x, at), 'catchup_open', at.catchup_qids is not null and at.catchup_at is null)
            from attendance at where at.session_id = x.id and at.application_id = a.id))
$$;

-- Question banks shared by every track: the Fundamentals weeks (2-3) and the Fundamental Examination.
create or replace function private.bank_shared(k text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select k = 'exam-fund' or exists (select 1 from course_items i where i.key = k and i.type = 'quiz' and i.week <= 3)
$$;

create or replace function private.bank_min(k text) returns int
language sql immutable as $$ select case k when 'exam-fund' then 30 when 'exam-core' then 40 else 10 end $$;

-- The tracks a bank edit applies to: every track for a shared bank, otherwise the one track (if the staff member may edit it).
create or replace function private.bank_tracks(s staff, p_track text, k text) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if k is null or (k <> 'exam-core' and k <> 'exam-fund' and not exists (select 1 from course_items where key = k and type = 'quiz')) then
    raise exception 'Unknown question bank.' using errcode = 'P0001';
  end if;
  if private.bank_shared(k) then
    if s.role <> 'super' and s.track_code is not null then
      raise exception 'Fundamentals questions are shared by every track. The Cohort Manager or Programme Director edits them.' using errcode = '42501';
    end if;
    return array(select code from tracks order by sort);
  end if;
  if not exists (select 1 from tracks where code = p_track) then raise exception 'Choose a track.' using errcode = 'P0001'; end if;
  if not private.track_ok(s, p_track) then raise exception 'You can only edit questions for your own track.' using errcode = '42501'; end if;
  return array[p_track];
end $$;

-- A question is locked once any learner on these tracks has been given it.
create or replace function private.bank_locked(k text, q int, trks text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from quiz_draws d join applications ap on ap.id = d.application_id where d.key = k and q = any(d.qids) and ap.track_code = any(trks))
      or exists (select 1 from exam_sittings x join applications ap on ap.id = x.application_id where 'exam-' || x.paper = k and q = any(x.qids) and ap.track_code = any(trks))
$$;


-- ---------- updated functions ----------

create or replace function private.result(a applications) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; assess jsonb := '[]'::jsonb; it record; x learn_progress; ov numeric; st text; cor numeric; n_taken int := 0; n_missed int := 0;
  n_pending int := 0; a_marks numeric := 0; fi jsonb; ci jsonb; fc numeric; cc numeric; e numeric; pi course_items; px learn_progress; p numeric; pst text;
  exc result_exceptions; missing text[] := '{}'; complete boolean; f numeric; band jsonb; pub results_published; closed boolean; drawing boolean; att jsonb; t_marks numeric;
begin
  select * into c from cohorts where id = a.cohort_id;
  for it in select i.key, i.week, i.title from course_items i where i.track_code = a.track_code and i.type = 'quiz' order by i.week loop
    select * into x from learn_progress where application_id = a.id and key = it.key;
    select value into ov from score_overrides where application_id = a.id and component = it.key;
    drawing := exists (select 1 from quiz_draws w where w.application_id = a.id and w.key = it.key and w.submitted_at is null and now() <= w.deadline + interval '90 seconds');
    cor := coalesce(ov, (x.data ->> 'correct')::numeric, case when x.key is not null then round(coalesce(x.score, 0) * 5 / 100.0) end,
      -- started but never submitted before the time ran out: no answers were sent, so 0 correct
      case when exists (select 1 from quiz_draws w where w.application_id = a.id and w.key = it.key and w.submitted_at is null and now() > w.deadline + interval '90 seconds') then 0 end);
    st := case when cor is not null then 'Graded' when drawing then 'In progress' when now() >= private.week_due(c, it.week) and not private.test_mode() then 'Missed' else 'Pending' end;
    if st = 'Graded' then n_taken := n_taken + 1; a_marks := a_marks + cor * 0.6;
    elsif st = 'Missed' then n_missed := n_missed + 1;
    else n_pending := n_pending + 1; end if;
    assess := assess || jsonb_build_object('key', it.key, 'week', it.week, 'title', it.title, 'status', st, 'correct', cor,
      'marks', case when cor is null then null else round(cor * 0.6, 1) end, 'corrected', ov is not null, 'taken_at', x.done_at);
  end loop;
  a_marks := least(30, a_marks);
  att := private.attendance(a);
  t_marks := coalesce((select value from score_overrides where application_id = a.id and component = 'attendance'), (att ->> 'score')::numeric);

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
    f := least(100, trunc((t_marks + a_marks + coalesce(e, trunc((coalesce(fc, 0) + coalesce(cc, 0)) * 60 / 70.0, 2)) + coalesce(p, 0)) / 2, 1));
    band := private.grade_band(f);
  end if;
  select * into pub from results_published where cohort_id = a.cohort_id;
  return jsonb_build_object(
    'assessments', assess, 'assess_taken', n_taken, 'assess_missed', n_missed, 'assess_pending', n_pending,
    'assess_score', round(a_marks, 1), 'assess_max', 30,
    'attendance', att || jsonb_build_object('score', round(t_marks, 1), 'corrected', exists (select 1 from score_overrides where application_id = a.id and component = 'attendance')), 'attendance_max', 10, 'assess_close', private.assess_close(c),
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

create or replace function public.learn_quiz_start(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; it course_items; d quiz_draws; mins int; last_end timestamptz;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  it := private.learn_item(a, p_key);
  if it.type <> 'quiz' then raise exception 'That isn''t an assessment.' using errcode = 'P0001'; end if;
  if exists (select 1 from learn_progress where application_id = a.id and key = p_key) then
    raise exception 'You''ve already taken this assessment. Each assessment has one attempt.' using errcode = 'P0001';
  end if;
  if now() >= private.week_due(c, it.week) and not private.test_mode()
     and not exists (select 1 from quiz_draws w where w.application_id = a.id and w.key = p_key and w.submitted_at is null) then
    raise exception 'This assessment closed on Sunday at 18:00. Missed assessments score 0.' using errcode = 'P0001';
  end if;
  select max(x.starts_at + make_interval(mins => x.minutes)) into last_end from sessions x
  where x.cohort_id = a.cohort_id and (x.track_code is null or x.track_code = a.track_code) and x.kind = 'class' and x.published
    and private.week_of(c, x.starts_at) = it.week;
  if last_end is not null and now() < last_end and not private.test_mode()
     and not exists (select 1 from quiz_draws w where w.application_id = a.id and w.key = p_key and w.submitted_at is null) then
    raise exception 'This assessment opens after the week''s last live class, at % WAT.', to_char(last_end at time zone 'Africa/Lagos', 'FMDay DD Mon, HH24:MI') using errcode = 'P0001';
  end if;
  perform private.seq_check(a, it);
  select * into d from quiz_draws where application_id = a.id and key = p_key order by attempt desc limit 1;
  if d.application_id is not null and d.submitted_at is null then return private.quiz_public(a, d); end if;
  if d.application_id is not null then raise exception 'You''ve already taken this assessment.' using errcode = 'P0001'; end if;
  mins := coalesce(nullif(private.setting('quiz_minutes', '10'), '')::int, 10);
  insert into quiz_draws(application_id, key, attempt, qids, deadline)
  values (a.id, p_key, 1, (select array_agg(qid) from (
      select qid from quiz_bank where track_code = a.track_code and key = p_key and status = 'approved' and not practice order by random() limit 5) s), now() + make_interval(mins => mins))
  returning * into d;
  if d.qids is null or array_length(d.qids, 1) < 5 then raise exception 'This assessment isn''t ready yet. Tell Student Success.' using errcode = 'P0001'; end if;
  insert into learn_history(application_id, key, action) values (a.id, p_key, 'Started the assessment');
  return private.quiz_public(a, d);
end $$;

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
      select qid from quiz_bank where track_code = a.track_code and key = 'exam-' || p_paper and status = 'approved' and not practice order by (qid = any(prev)), random() limit n) z),
    now() + make_interval(mins => private.exam_minutes(p_paper)))
  returning * into s;
  if s.qids is null or array_length(s.qids, 1) < n then raise exception 'This examination isn''t ready yet. Tell Student Success.' using errcode = 'P0001'; end if;
  if rs.id is not null then update exam_resits set used_at = now() where id = rs.id; end if;
  insert into learn_history(application_id, key, action) values (a.id, 'exam-' || p_paper,
    format('Started the %s%s', info ->> 'title', case when att > 1 then ' (authorised resit)' else '' end));
  return private.exam_public(a, s);
end $$;

create or replace function public.student_campus() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; p programmes; w int; f jsonb;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  select * into p from programmes where code = c.programme_code;
  w := private.cur_week(c);
  f := private.fees(a);
  return jsonb_build_object(
    'me', jsonb_build_object('first_name', a.first_name, 'surname', a.surname, 'matric', a.matric, 'email', a.email,
      'track', (select name from tracks where code = a.track_code), 'track_code', a.track_code,
      'balance', greatest(0, coalesce((f ->> 'plan_total')::int, 0) - a.paid_total), 'due_date', f ->> 'due_date',
      'ref', a.ref, 'token', a.token),
    'cohort', jsonb_build_object('name', c.name, 'start_date', c.start_date, 'weeks', p.weeks, 'programme', p.name),
    'week', w, 'today', private.today(),
    'open_weeks', (select coalesce(max(g), 0) from generate_series(1, p.weeks) g where private.week_open(c, g)),
    'lessons', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'week', l.week, 'kind', l.kind, 'title', l.title,
        'body', l.body, 'url', l.url) order by l.week, l.sort, l.id)
      from lessons l where l.cohort_id = c.id and l.published and (l.track_code is null or l.track_code = a.track_code)
        and private.week_open(c, l.week)), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'week', t.week, 'title', t.title, 'brief', t.brief,
        'url', t.url, 'due_at', t.due_at,
        'sub', (select jsonb_build_object('link', s.link, 'note', s.note, 'submitted_at', s.submitted_at, 'status', s.status,
            'score', s.score, 'feedback', s.feedback, 'graded_at', s.graded_at)
          from submissions s where s.task_id = t.id and s.application_id = a.id)) order by t.due_at)
      from tasks t where t.cohort_id = c.id and t.published and (t.track_code is null or t.track_code = a.track_code)
        and private.week_open(c, t.week)), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(private.class_public(a, c, x) order by x.starts_at)
      from sessions x where x.cohort_id = c.id and (x.track_code is null or x.track_code = a.track_code) and x.published), '[]'::jsonb),
    'news', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'at', n.created_at,
        'by', coalesce((select full_name from staff where email = n.created_by), 'Jobnest Academy')) order by n.created_at desc)
      from (select * from announcements where cohort_id = c.id and (track_code is null or track_code = a.track_code)
        order by created_at desc limit 30) n), '[]'::jsonb));
end $$;

create or replace function public.student_join(p_session bigint) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; x sessions;
begin
  a := private.require_student();
  select * into x from sessions where id = p_session and cohort_id = a.cohort_id and (track_code is null or track_code = a.track_code) and published;
  if x.id is null then raise exception 'Session not found.'; end if;
  if now() < x.starts_at - interval '20 minutes' and not private.test_mode() then
    raise exception 'This class opens 20 minutes before it starts.' using errcode = 'P0001';
  end if;
  if coalesce(x.link, '') = '' then raise exception 'The class link isn''t ready yet. Try again in a minute.' using errcode = 'P0001'; end if;
  if now() between x.starts_at - interval '20 minutes' and x.starts_at + make_interval(mins => x.minutes) or private.test_mode() then
    insert into attendance(session_id, application_id, joined_at) values (x.id, a.id, now())
    on conflict (session_id, application_id) do update set joined_at = coalesce(attendance.joined_at, now());
  end if;
  return x.link;
end $$;

create or replace function public.acad_sessions() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin']);
  c := private.ac_cohort();
  return jsonb_build_object('my_track', s.track_code, 'start_date', c.start_date, 'cohort', c.name, 'weeks', (select weeks from programmes where code = c.programme_code),
    'role', s.role, 'upload_ok', private.setting('uploads', 'on') = 'on',
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name) order by t.sort) from tracks t
      where t.programme_code = c.programme_code), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object(
        'track', (select name from tracks where code = x.track_code),
        'joined', (select count(*) from attendance at where at.session_id = x.id and at.joined_at is not null),
        'marked', (select count(*) from attendance at where at.session_id = x.id and at.status is not null),
        'coded', (select count(*) from attendance at where at.session_id = x.id and at.code_at is not null),
        'week', private.week_of(c, x.starts_at), 'can_edit', private.track_ok(s, x.track_code)) order by x.starts_at)
      from sessions x where x.cohort_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.acad_save_session(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; x sessions; v_track text := nullif(p ->> 'track_code', '');
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  c := private.ac_cohort();
  if not private.track_ok(s, v_track) then raise exception 'You can only schedule classes for your own track. Classes for everyone (Fundamentals) are set by the Cohort Manager.'; end if;
  if coalesce(p ->> 'kind', 'class') not in ('class','guest','clinic','orientation','other') then raise exception 'Unknown session type.'; end if;
  if coalesce(trim(p ->> 'title'), '') = '' or (p ->> 'starts_at') is null then raise exception 'Add a title, date and time.'; end if;
  if (p ->> 'id') is not null then
    select * into x from sessions where id = (p ->> 'id')::bigint and cohort_id = c.id;
    if x.id is null or not private.track_ok(s, x.track_code) then raise exception 'You can''t edit that session.'; end if;
    update sessions set track_code = v_track, title = trim(p ->> 'title'), kind = coalesce(p ->> 'kind', kind),
      starts_at = (p ->> 'starts_at')::timestamptz, minutes = coalesce((p ->> 'minutes')::int, minutes),
      link = private.clean_url(p ->> 'link'), host = nullif(trim(coalesce(p ->> 'host', '')), ''),
      summary = nullif(trim(coalesce(p ->> 'summary', '')), ''), notes = nullif(trim(coalesce(p ->> 'notes', '')), ''),
      notes_early = coalesce((p ->> 'notes_early')::boolean, notes_early), slides = private.clean_file(p -> 'slides'),
      resources = private.clean_files(p -> 'resources'), recording_url = private.clean_url(p ->> 'recording_url'),
      chapters = nullif(trim(coalesce(p ->> 'chapters', '')), ''), published = coalesce((p ->> 'published')::boolean, published), updated_at = now()
      where id = x.id returning * into x;

  else
    insert into sessions(cohort_id, track_code, title, kind, starts_at, minutes, link, host, created_by, summary, notes, notes_early, slides, resources, recording_url, chapters, published, updated_at)
    values (c.id, v_track, trim(p ->> 'title'), coalesce(p ->> 'kind', 'class'), (p ->> 'starts_at')::timestamptz,
      coalesce((p ->> 'minutes')::int, 60), private.clean_url(p ->> 'link'), coalesce(nullif(trim(coalesce(p ->> 'host', '')), ''), s.full_name), s.email,
      nullif(trim(coalesce(p ->> 'summary', '')), ''), nullif(trim(coalesce(p ->> 'notes', '')), ''), coalesce((p ->> 'notes_early')::boolean, true),
      private.clean_file(p -> 'slides'), private.clean_files(p -> 'resources'), private.clean_url(p ->> 'recording_url'),
      nullif(trim(coalesce(p ->> 'chapters', '')), ''), coalesce((p ->> 'published')::boolean, true), now())
    returning * into x;
  end if;
  return to_jsonb(x);
end $$;

create or replace function public.acad_attendance(p_session bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; x sessions;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin']);
  select * into x from sessions where id = p_session;
  if x.id is null then raise exception 'Session not found.'; end if;
  return jsonb_build_object('session', to_jsonb(x) || jsonb_build_object('code_live', x.code is not null and x.code_until > now(), 'can_mark', private.track_ok(s, x.track_code)), 'students', coalesce((select jsonb_agg(jsonb_build_object('id', a.id,
      'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'joined_at', at.joined_at, 'status', at.status,
      'code_at', at.code_at, 'catchup_at', at.catchup_at, 'marked_by', at.marked_by,
      'suggest', coalesce(at.status, case when at.code_at is not null or at.joined_at is not null then
        case when coalesce(at.joined_at, at.code_at) > x.starts_at + interval '15 minutes' then 'late' else 'present' end
        when x.starts_at + make_interval(mins => x.minutes) < now() then 'absent' end),
      'missed_two', private.missed_two(a)) order by a.matric)
    from applications a left join attendance at on at.session_id = x.id and at.application_id = a.id
    where a.cohort_id = x.cohort_id and a.status = 'Admitted' and (x.track_code is null or a.track_code = x.track_code)
      and private.track_ok(s, a.track_code)), '[]'::jsonb));
end $$;

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
      case when private.missed_two((select ap from applications ap where ap.id = s.id)) then 'Missed the last 2 live classes' end,
      case when (select c.start_date from cohorts c where c.id = s.cohort_id) <= private.today()
        and coalesce(s.last_at, '-infinity'::timestamptz) < now() - interval '7 days' then 'No activity for 7+ days' end], null)
  from s
$$;

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
  elsif p_component = 'attendance' then mx := 10; label := 'Attendance (marks out of 10)';
  elsif exists (select 1 from course_items where track_code = a.track_code and key = p_component and type = 'quiz') then
    mx := 5; label := (select title from course_items where track_code = a.track_code and key = p_component) || ' (correct answers)';
  else raise exception 'Unknown score.' using errcode = 'P0001'; end if;
  if p_value is not null and (p_value < 0 or p_value > mx or (mx not in (100, 10) and p_value <> trunc(p_value))) then
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

-- ---------- learners: class code, catch-up check, practice questions ----------
create or replace function private.learner_class(a applications, p_session bigint) returns sessions
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare x sessions;
begin
  select * into x from sessions where id = p_session and cohort_id = a.cohort_id and (track_code is null or track_code = a.track_code) and published;
  if x.id is null then raise exception 'Class not found.' using errcode = 'P0001'; end if;
  return x;
end $$;

-- Enter the code the facilitator says in class. Wrong codes are counted; after 6 the learner asks to be ticked on the register.
create or replace function public.learn_class_code(p_session bigint, p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; x sessions; at attendance;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  x := private.learner_class(a, p_session);
  if x.kind <> 'class' then raise exception 'This session doesn''t take attendance.' using errcode = 'P0001'; end if;
  select * into at from attendance where session_id = x.id and application_id = a.id;
  if at.code_at is not null then return jsonb_build_object('ok', true, 'class', private.class_public(a, c, x)); end if;
  if coalesce(at.code_tries, 0) >= 6 then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong codes. Ask your facilitator to mark you on the register.');
  end if;
  if x.code is null or x.code_until < now() or regexp_replace(coalesce(p_code, ''), '\D', '', 'g') <> x.code then
    insert into attendance(session_id, application_id, code_tries) values (x.id, a.id, 1)
    on conflict (session_id, application_id) do update set code_tries = attendance.code_tries + 1;
    return jsonb_build_object('ok', false, 'error', 'That code isn''t right, or it has expired. Ask in the class chat.');
  end if;
  insert into attendance(session_id, application_id, joined_at, code_at) values (x.id, a.id, now(), now())
  on conflict (session_id, application_id) do update set code_at = now(), joined_at = coalesce(attendance.joined_at, now());
  return jsonb_build_object('ok', true, 'class', private.class_public(a, c, x));
end $$;

-- Catch-up: within 48 hours of the class, once the recording is up. 3 practice questions from that week; 2 right = half attendance.
create or replace function private.catchup_check(a applications, x sessions) returns attendance
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare at attendance;
begin
  if x.kind <> 'class' then raise exception 'This session doesn''t take attendance.' using errcode = 'P0001'; end if;
  select * into at from attendance where session_id = x.id and application_id = a.id;
  if at.status = 'excused' then raise exception 'Your absence for this class is approved, so you don''t need to catch up.' using errcode = 'P0001'; end if;
  if coalesce(private.att_credit(x, at), 0) >= 1 then raise exception 'You''re already marked present for this class.' using errcode = 'P0001'; end if;
  if now() < x.starts_at + make_interval(mins => x.minutes) and not private.test_mode() then raise exception 'The class hasn''t finished yet.' using errcode = 'P0001'; end if;
  if coalesce(x.recording_url, '') = '' then raise exception 'The recording isn''t up yet. Check back later today.' using errcode = 'P0001'; end if;
  if now() > x.starts_at + make_interval(mins => x.minutes) + interval '48 hours' and not private.test_mode() then
    raise exception 'The catch-up window closed 48 hours after the class.' using errcode = 'P0001';
  end if;
  return at;
end $$;

create or replace function public.learn_catchup_start(p_session bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; x sessions; at attendance; k text; q int[];
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  x := private.learner_class(a, p_session);
  at := private.catchup_check(a, x);
  if at.catchup_at is not null then return jsonb_build_object('done', true); end if;
  select i.key into k from course_items i where i.track_code = a.track_code and i.type = 'quiz' and i.week = private.week_of(c, x.starts_at) limit 1;
  q := array(select b.qid from quiz_bank b where b.track_code = a.track_code and b.key = k and b.status = 'approved' and b.practice order by random() limit 3);
  if coalesce(array_length(q, 1), 0) < 3 then q := '{}'; end if;
  insert into attendance(session_id, application_id, catchup_qids, catchup_key) values (x.id, a.id, q, k)
  on conflict (session_id, application_id) do update set catchup_qids = excluded.catchup_qids, catchup_key = excluded.catchup_key;
  return jsonb_build_object('done', false, 'mode', case when cardinality(q) = 0 then 'confirm' else 'quiz' end,
    'qs', coalesce((select jsonb_agg(jsonb_build_object('q', b.q, 'o', to_jsonb(b.o)) order by u.n)
      from unnest(q) with ordinality u(qid, n) join quiz_bank b on b.track_code = a.track_code and b.key = k and b.qid = u.qid), '[]'::jsonb));
end $$;

create or replace function public.learn_catchup_submit(p_session bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; x sessions; at attendance; ok int := 0; i int;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  x := private.learner_class(a, p_session);
  at := private.catchup_check(a, x);
  if at.catchup_at is not null then return jsonb_build_object('ok', true, 'class', private.class_public(a, c, x)); end if;
  if at.catchup_qids is null then raise exception 'Start the catch-up check first.' using errcode = 'P0001'; end if;
  if cardinality(at.catchup_qids) > 0 then
    for i in 1 .. cardinality(at.catchup_qids) loop
      if exists (select 1 from quiz_bank b where b.track_code = a.track_code and b.key = at.catchup_key and b.qid = at.catchup_qids[i]
                 and b.a = (p_answers ->> (i - 1))::int) then ok := ok + 1; end if;
    end loop;
    if ok < 2 then
      update attendance set catchup_qids = null where session_id = x.id and application_id = a.id;
      return jsonb_build_object('ok', false, 'correct', ok, 'error', format('%s of 3 right. Watch the recording again, then try a new set of questions.', ok));
    end if;
  end if;
  update attendance set catchup_at = now() where session_id = x.id and application_id = a.id;
  insert into learn_history(application_id, key, action) values (a.id, 'class-' || x.id, 'Caught up on “' || x.title || '” from the recording');
  select * into x from sessions where id = x.id;
  return jsonb_build_object('ok', true, 'correct', ok, 'class', private.class_public(a, c, x));
end $$;

-- Practice questions: not graded, shown with answers and explanations.
create or replace function public.learn_practice(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return coalesce((select jsonb_agg(jsonb_build_object('q', b.q, 'o', to_jsonb(b.o), 'a', b.a, 'explain', b.explain) order by random())
    from quiz_bank b where b.track_code = a.track_code and b.key = p_key and b.status = 'approved' and b.practice), '[]'::jsonb);
end $$;

-- ---------- staff: class code ----------
create or replace function public.acad_class_code(p_session bigint, p_show boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; x sessions;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  select * into x from sessions where id = p_session;
  if x.id is null or not private.track_ok(s, x.track_code) then raise exception 'You can''t run this class.' using errcode = '42501'; end if;
  if x.kind <> 'class' then raise exception 'Only teaching classes take attendance.' using errcode = 'P0001'; end if;
  if not p_show then
    update sessions set code_until = least(code_until, now()) where id = x.id returning * into x;
    return jsonb_build_object('code', null, 'until', null);
  end if;
  if not (now() between x.starts_at - interval '20 minutes' and x.starts_at + make_interval(mins => x.minutes) + interval '30 minutes') and not private.test_mode() then
    raise exception 'The class code works from 20 minutes before the class until 30 minutes after it ends.' using errcode = 'P0001';
  end if;
  update sessions set code = lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'), code_until = now() + interval '10 minutes'
  where id = x.id returning * into x;
  insert into audit_log(actor, text) values (s.email, format('showed a class code for “%s”', x.title));
  return jsonb_build_object('code', x.code, 'until', x.code_until);
end $$;

-- ---------- staff: question banks ----------
create or replace function public.acad_bank_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  c := private.ac_cohort();
  return jsonb_build_object('role', s.role, 'my_track', s.track_code, 'can_approve', s.role in ('super','director'),
    'tracks', (select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by sort) from tracks),
    'banks', coalesce((select jsonb_agg(b order by (b ->> 'sort')::int, b ->> 'track') from (
      select jsonb_build_object('track', case when private.bank_shared(k.key) then null else k.track_code end, 'key', k.key, 'title', k.title, 'week', k.week,
        'shared', private.bank_shared(k.key), 'min', private.bank_min(k.key), 'sort', coalesce(k.week, 99),
        'needed_by', case when k.week is not null then private.week_start(c, k.week) else private.exam_monday(c) end,
        'can_edit', case when private.bank_shared(k.key) then s.role = 'super' or s.track_code is null else private.track_ok(s, k.track_code) end,
        'total', (select count(*) from quiz_bank q where q.track_code = k.track_code and q.key = k.key and not q.practice),
        'approved', (select count(*) from quiz_bank q where q.track_code = k.track_code and q.key = k.key and not q.practice and q.status = 'approved'),
        'pending', (select count(*) from quiz_bank q where q.track_code = k.track_code and q.key = k.key and q.status = 'pending'),
        'draft', (select count(*) from quiz_bank q where q.track_code = k.track_code and q.key = k.key and q.status = 'draft'),
        'practice', (select count(*) from quiz_bank q where q.track_code = k.track_code and q.key = k.key and q.practice and q.status = 'approved')) b
      from ((select distinct on (case when private.bank_shared(i.key) then i.key else i.track_code || i.key end) i.track_code, i.key, i.title, i.week
              from course_items i where i.type = 'quiz' and (private.bank_shared(i.key) or private.track_ok(s, i.track_code))
              order by case when private.bank_shared(i.key) then i.key else i.track_code || i.key end, i.track_code)
            union all
            select (select code from tracks order by sort limit 1), 'exam-fund', 'Fundamental Examination pool', null
            union all
            select t.code, 'exam-core', 'Core Skill Learning Examination pool', null from tracks t where private.track_ok(s, t.code)) k) z), '[]'::jsonb));
end $$;

create or replace function public.acad_bank(p_track text, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; trks text[]; t text;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  if private.bank_shared(p_key) then trks := array(select code from tracks order by sort);
  else
    if not private.track_ok(s, p_track) then raise exception 'You can only see questions for your own track.' using errcode = '42501'; end if;
    trks := array[p_track];
  end if;
  t := trks[1];
  return jsonb_build_object('track', case when private.bank_shared(p_key) then null else p_track end, 'key', p_key, 'shared', private.bank_shared(p_key),
    'min', private.bank_min(p_key), 'can_approve', s.role in ('super','director'),
    'can_edit', case when private.bank_shared(p_key) then s.role = 'super' or s.track_code is null else private.track_ok(s, p_track) end,
    'title', coalesce((select title from course_items where key = p_key and track_code = t), case p_key when 'exam-fund' then 'Fundamental Examination pool' else 'Core Skill Learning Examination pool' end),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('qid', b.qid, 'q', b.q, 'o', to_jsonb(b.o), 'a', b.a, 'explain', b.explain, 'practice', b.practice,
        'status', b.status, 'author', b.author, 'approved_by', b.approved_by, 'note', b.review_note, 'locked', private.bank_locked(p_key, b.qid, trks)) order by b.practice, b.qid)
      from quiz_bank b where b.track_code = t and b.key = p_key), '[]'::jsonb));
end $$;

create or replace function public.acad_bank_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; k text := p ->> 'key'; trks text[]; q int; opts text[]; ans int; t text;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  trks := private.bank_tracks(s, p ->> 'track', k);
  opts := array(select trim(e) from jsonb_array_elements_text(coalesce(p -> 'o', '[]'::jsonb)) e where trim(e) <> '');
  ans := (p ->> 'a')::int;
  if coalesce(trim(p ->> 'q'), '') = '' then raise exception 'Write the question.' using errcode = 'P0001'; end if;
  if cardinality(opts) < 2 or cardinality(opts) > 5 then raise exception 'Give 2 to 5 answers.' using errcode = 'P0001'; end if;
  if ans is null or ans < 0 or ans >= cardinality(opts) then raise exception 'Tick the correct answer.' using errcode = 'P0001'; end if;
  q := (p ->> 'qid')::int;
  if q is not null then
    if private.bank_locked(k, q, trks) then raise exception 'This question has already been given to learners, so it can''t change. Add a new one instead.' using errcode = 'P0001'; end if;
  else
    q := coalesce((select max(qid) from quiz_bank where key = k and track_code = any(trks)), 0) + 1;
  end if;
  foreach t in array trks loop
    insert into quiz_bank(track_code, key, qid, q, o, a, explain, practice, status, author, updated_at)
    values (t, k, q, trim(p ->> 'q'), opts, ans, nullif(trim(coalesce(p ->> 'explain', '')), ''), coalesce((p ->> 'practice')::boolean, false), 'draft', s.full_name, now())
    on conflict (track_code, key, qid) do update set q = excluded.q, o = excluded.o, a = excluded.a, explain = excluded.explain,
      practice = excluded.practice, status = 'draft', author = excluded.author, approved_by = null, approved_at = null, updated_at = now();
  end loop;
  return public.acad_bank(trks[1], k);
end $$;

create or replace function public.acad_bank_delete(p_track text, p_key text, p_qid int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; trks text[];
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  trks := private.bank_tracks(s, p_track, p_key);
  if private.bank_locked(p_key, p_qid, trks) then raise exception 'This question has already been given to learners, so it can''t be removed.' using errcode = 'P0001'; end if;
  delete from quiz_bank where key = p_key and qid = p_qid and track_code = any(trks);
  return public.acad_bank(trks[1], p_key);
end $$;

-- Send the drafts for approval. Needs at least the bank's minimum of graded (non-practice) questions.
create or replace function public.acad_bank_submit(p_track text, p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; trks text[]; n int;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  trks := private.bank_tracks(s, p_track, p_key);
  select count(*) into n from quiz_bank where track_code = trks[1] and key = p_key and not practice;
  if n < private.bank_min(p_key) then
    raise exception 'Write at least % graded questions first (you have %).', private.bank_min(p_key), n using errcode = 'P0001';
  end if;
  if not exists (select 1 from quiz_bank where track_code = any(trks) and key = p_key and status = 'draft') then
    raise exception 'There are no new or changed questions to send.' using errcode = 'P0001';
  end if;
  update quiz_bank set status = 'pending', review_note = null where track_code = any(trks) and key = p_key and status = 'draft';
  insert into audit_log(actor, text) values (s.email, format('sent %s questions for approval', p_key));
  return public.acad_bank(trks[1], p_key);
end $$;

-- Programme Director: approve the waiting questions, or send them back with a note.
create or replace function public.acad_bank_review(p_track text, p_key text, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; trks text[];
begin
  s := private.require_role(array['director']);
  trks := private.bank_tracks(s, p_track, p_key);
  if not exists (select 1 from quiz_bank where track_code = any(trks) and key = p_key and status = 'pending') then
    raise exception 'Nothing is waiting for approval here.' using errcode = 'P0001';
  end if;
  if p_approve then
    update quiz_bank set status = 'approved', approved_by = s.full_name, approved_at = now(), review_note = null
    where track_code = any(trks) and key = p_key and status = 'pending';
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'Say what needs changing.' using errcode = 'P0001'; end if;
    update quiz_bank set status = 'draft', review_note = trim(p_note) where track_code = any(trks) and key = p_key and status = 'pending';
  end if;
  insert into audit_log(actor, text) values (s.email, format('%s %s questions', case when p_approve then 'approved' else 'sent back' end, p_key));
  return public.acad_bank(trks[1], p_key);
end $$;

-- ---------- file uploads (Supabase Storage) ----------
-- A public bucket for class slides and resources: staff upload (20 MB max), anyone with the link can download.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('class-files', 'class-files', true, 20971520)
    on conflict (id) do update set public = true, file_size_limit = 20971520;
    execute 'drop policy if exists "Staff upload class files" on storage.objects';
    execute $p$create policy "Staff upload class files" on storage.objects for insert to authenticated
      with check (bucket_id = 'class-files' and exists (select 1 from public.staff s where s.email = lower(auth.jwt() ->> 'email') and s.active
        and s.role in ('super','director','cohort_manager','facilitator','academy_admin')))$p$;
  end if;
end $$;

-- ---------- permissions ----------
revoke execute on function private.week_of(cohorts, timestamptz), private.clean_file(jsonb), private.clean_files(jsonb), private.att_credit(sessions, attendance),
  private.attendance(applications), private.missed_two(applications), private.class_public(applications, cohorts, sessions), private.bank_shared(text),
  private.bank_min(text), private.bank_tracks(staff, text, text), private.bank_locked(text, int, text[]), private.learner_class(applications, bigint),
  private.catchup_check(applications, sessions) from public;
revoke execute on function public.learn_class_code(bigint, text), public.learn_catchup_start(bigint), public.learn_catchup_submit(bigint, jsonb),
  public.learn_practice(text), public.acad_class_code(bigint, boolean), public.acad_bank_overview(), public.acad_bank(text, text),
  public.acad_bank_save(jsonb), public.acad_bank_delete(text, text, int), public.acad_bank_submit(text, text), public.acad_bank_review(text, text, boolean, text) from public, anon;
grant execute on function public.learn_class_code(bigint, text), public.learn_catchup_start(bigint), public.learn_catchup_submit(bigint, jsonb),
  public.learn_practice(text), public.acad_class_code(bigint, boolean), public.acad_bank_overview(), public.acad_bank(text, text),
  public.acad_bank_save(jsonb), public.acad_bank_delete(text, text, int), public.acad_bank_submit(text, text), public.acad_bank_review(text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
