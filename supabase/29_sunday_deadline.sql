-- Jobnest Academy update 29: weekly work is due Sunday at 18:00 (WAT).
-- Weekly tasks: due Sunday 18:00. Late work is still accepted and marked late; marks are no longer cut,
--   because week tasks don't count towards the final result.
-- Weekly assessments: each closes Sunday 18:00 of its own week. Not taken by then = Missed, 0 marks (no resits).
--   A missed assessment no longer holds up the rest of that week.
-- Reminder: "due tomorrow" moves from Thursday to Saturday morning.
-- The final project is due Sunday 18:00 at the end of Week 14; lateness costs the rubric's 20 timeliness marks.
-- Run after update 28. Safe to run more than once.

-- Sunday 18:00 WAT of week w (week 1 starts on the cohort start date, a Monday).
create or replace function private.week_due(c cohorts, w int) returns timestamptz
language sql stable as $$ select ((c.start_date + (w - 1) * 7 + 6) + time '18:00') at time zone 'Africa/Lagos' $$;

-- 1 = on time, 0.5 = late. Kept only as a "late" marker for staff; it no longer reduces any mark.
create or replace function private.learn_cap(c cohorts, w int, at timestamptz) returns numeric
language sql stable as $$ select case when at <= private.week_due(c, w) then 1 else 0.5 end $$;

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
    score = case when p_status = 'graded' then p_grade end,
    feedback = nullif(trim(coalesce(p_feedback, '')), ''), graded_by = s.full_name, graded_at = now()
  where application_id = a.id and key = p_key returning * into x;
  insert into learn_history(application_id, key, action, by_name) values (a.id, p_key,
    case when p_status = 'graded' then format('Graded %s%%', x.score) else 'Changes requested' end, s.full_name);
  perform private.queue_mail(a, 'graded', jsonb_build_object('task', it.title,
    'result', case when p_status = 'graded' then format('was graded: %s%%', x.score) else 'needs another try' end,
    'feedback', coalesce(x.feedback, 'No extra comments.')), private.site() || '/#/learn/assignments');
  return private.learn_row(x);
end $$;

create or replace function private.result(a applications) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; assess jsonb := '[]'::jsonb; it record; x learn_progress; ov numeric; st text; cor numeric; n_taken int := 0; n_missed int := 0;
  n_pending int := 0; a_marks numeric := 0; fi jsonb; ci jsonb; fc numeric; cc numeric; e numeric; pi course_items; px learn_progress; p numeric; pst text;
  exc result_exceptions; missing text[] := '{}'; complete boolean; f numeric; band jsonb; pub results_published; closed boolean; drawing boolean;
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
  if now() >= private.week_due(c, it.week) and not private.test_mode()
     and not exists (select 1 from quiz_draws w where w.application_id = a.id and w.key = p_key and w.submitted_at is null) then
    raise exception 'This assessment closed on Sunday at 18:00. Missed assessments score 0.' using errcode = 'P0001';
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

create or replace function private.seq_block(a applications, it course_items) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select j.title from course_items j
  where j.track_code = it.track_code and j.week = it.week and not j.opt
    and split_part(j.key, '-', 2)::int < split_part(it.key, '-', 2)::int
    and not exists (select 1 from learn_progress x where x.application_id = a.id and x.key = j.key and x.status in ('done','graded','submitted'))
    -- a weekly assessment that closed without being taken (Missed, 0 marks) doesn't hold up the rest of the week
    and not (j.type = 'quiz' and not private.test_mode() and now() >= private.week_due((select c from cohorts c where c.id = a.cohort_id), j.week))
  order by split_part(j.key, '-', 2)::int limit 1
$$;

create or replace function public.cm_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; wk int; ends date; p programmes;
begin
  s := private.require_role(array['cohort_manager','director','super']);
  c := private.ac_cohort(); wk := private.cur_week(c);
  select * into p from programmes where code = c.programme_code;
  ends := c.start_date + coalesce(p.weeks, 17) * 7 - 3;
  return jsonb_build_object(
    'me', s.full_name, 'cohort', jsonb_build_object('name', c.name, 'week', wk, 'start_date', c.start_date),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.first_name || ' ' || a.surname, 'phone', a.phone, 'track', (select name from tracks where code = a.track_code),
        'week', x.cur, 'reasons', to_jsonb(x.reasons), 'last_at', x.last_at,
        'note', (select n.body from staff_notes n where n.application_id = a.id order by n.at desc limit 1),
        'call', (select jsonb_build_object('outcome', k.outcome, 'at', k.at, 'by', k.by_name) from staff_calls k where k.application_id = a.id order by k.at desc limit 1))
        order by (select max(k.at) from staff_calls k where k.application_id = a.id and k.at > now() - interval '24 hours') nulls first, cardinality(x.reasons) desc, a.surname)
      from private.student_status(c.id) x join applications a on a.id = x.application_id where cardinality(x.reasons) > 0), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'at', x.starts_at, 'minutes', x.minutes, 'link', x.link, 'host', x.host,
        'track', (select name from tracks where code = x.track_code),
        'joined', (select count(*) from attendance at where at.session_id = x.id and (at.joined_at is not null or at.status in ('present','late'))),
        'invited', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and (x.track_code is null or a.track_code = x.track_code))) order by x.starts_at)
      from sessions x where x.cohort_id = c.id and x.starts_at::date between private.today() and private.today() + 1), '[]'::jsonb),
    'due', coalesce((select jsonb_agg(jsonb_build_object('track', t.name, 'code', t.code,
        'n', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.track_code = t.code),
        'in', (select count(*) from applications a join course_items i on i.track_code = a.track_code and i.week = greatest(wk, 1) and i.proj
            join learn_progress x on x.application_id = a.id and x.key = i.key and x.status in ('submitted','graded')
          where a.cohort_id = c.id and a.status = 'Admitted' and a.track_code = t.code)) order by t.sort, t.code)
      from tracks t where t.programme_code = c.programme_code), '[]'::jsonb),
    'due_at', private.week_start(c, greatest(wk, 1)) + 6,
    'help', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'subject', r.subject, 'category', r.category, 'at', r.created_at, 'name', a.first_name || ' ' || a.surname) order by r.created_at)
      from support_requests r join applications a on a.id = r.application_id where r.status <> 'Resolved' and r.reply is null), '[]'::jsonb),
    'pods', coalesce((select jsonb_agg(jsonb_build_object('id', pd.id, 'name', pd.name, 'track', (select name from tracks where code = pd.track_code),
        'n', (select count(*) from pod_members m where m.pod_id = pd.id),
        'active', (select count(*) from pod_members m where m.pod_id = pd.id and exists (select 1 from learn_progress x where x.application_id = m.application_id and x.done_at > now() - interval '7 days'))) order by pd.name)
      from pods pd), '[]'::jsonb),
    'unpodded', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and not exists (select 1 from pod_members m where m.application_id = a.id)),
    'checkins_due', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.first_name || ' ' || a.surname, 'phone', a.phone, 'day', d.day, 'opened', ac.start_date + coalesce(pp.weeks, 17) * 7 - 3 + d.day - 7) order by a.surname)
      from applications a join cohorts ac on ac.id = a.cohort_id join programmes pp on pp.code = ac.programme_code cross join (values (30), (60), (90)) d(day)
      where a.cert_id is not null and private.today() >= ac.start_date + coalesce(pp.weeks, 17) * 7 - 3 + d.day - 7
        and private.today() < ac.start_date + coalesce(pp.weeks, 17) * 7 - 3 + d.day + 21
        and not exists (select 1 from alumni_checkins k where k.application_id = a.id and k.day = d.day)), '[]'::jsonb),
    'ends', ends);
end $$;

create or replace function public.learn_reminders_tick() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; p programmes; today date := private.today(); hr int := extract(hour from now() at time zone 'Africa/Lagos');
  w int; nw int; left_n int; t text; x sessions; n int := 0; dow int;
begin
  if private.setting('reminders', 'on') <> 'on' then return jsonb_build_object('reminders', 'off'); end if;
  for a in select ap.* from applications ap where ap.status = 'Admitted' and ap.matric is not null and ap.student_uid is not null loop
    select * into c from cohorts where id = a.cohort_id;
    select * into p from programmes where code = c.programme_code;
    continue when c.id is null;
    w := floor((today - c.start_date) / 7.0)::int + 1;          -- this week (1 = first week)
    dow := (today - c.start_date) - (w - 1) * 7;                -- 0 = Monday … 6 = Sunday
    -- 1) Saturday from 09:00: this week's work is due tomorrow (Sunday) at 18:00
    if w between 1 and coalesce(p.weeks, 20) and dow = 5 and hr >= 9 then
      select count(*) into left_n from course_items i where i.track_code = a.track_code and i.week = w and not i.opt and not i.staff
        and not exists (select 1 from learn_progress x2 where x2.application_id = a.id and x2.key = i.key and x2.status in ('done','graded','submitted'));
      if left_n > 0 and w > 1 and private.remind_once(a, 'due-' || w) then
        select title into t from course_weeks where track_code = a.track_code and week = w;
        perform private.notify(a, 'deadline', format('Week %s is due tomorrow at 18:00', w),
          format('%s %s left in “%s”. Finish by Sunday 18:00. This week''s assessment also closes then.', left_n, case when left_n = 1 then 'task is' else 'tasks are' end, t),
          '/learn/learning/' || w, 'reminder', jsonb_build_object('cta', 'Open this week'));
        n := n + 1;
      end if;
    end if;
    -- 2) Saturday from 08:00: next week opens
    nw := w + 1;
    if nw between 2 and coalesce(p.weeks, 20) and dow = 5 and hr >= 8 and private.remind_once(a, 'open-' || nw) then
      select title into t from course_weeks where track_code = a.track_code and week = nw;
      perform private.notify(a, 'week', format('Week %s opens today: %s', nw, t),
        format('Week %s starts on Monday. You can look ahead now; finish Week %s first.', nw, nw - 1),
        '/learn/learning/' || nw, 'reminder', '{}'::jsonb);
      n := n + 1;
    end if;
    -- 3) Monday from 09:00 in check-in weeks (2, 4, 6 …): the weekly check-in is open
    if w between 2 and coalesce(p.weeks, 20) and w % 2 = 0 and dow = 0 and hr >= 9 and private.remind_once(a, 'ck-' || w) then
      perform private.notify(a, 'checkin', format('Your Week %s check-in is open', w),
        'Tell your facilitator how confident you feel this week. It takes one minute.', '/learn/learning/' || w, 'reminder', '{}'::jsonb);
      n := n + 1;
    end if;
    -- 4) One hour before a live class
    for x in select * from sessions s where s.cohort_id = c.id and (s.track_code is null or s.track_code = a.track_code)
        and s.starts_at between now() and now() + interval '65 minutes' loop
      if private.remind_once(a, 'sess-' || x.id) then
        perform private.notify(a, 'session', format('Live class at %s: %s', private.wat(x.starts_at, 'HH24:MI'), x.title),
          'Join from the portal so your attendance is recorded.', '/learn/cohort', 'reminder', '{}'::jsonb);
        n := n + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('reminders', n);
end $$;

revoke execute on function private.week_due(cohorts, int), private.learn_cap(cohorts, int, timestamptz) from public;
revoke execute on function public.learn_reminders_tick() from public, anon;
grant execute on function public.learn_reminders_tick() to service_role;

-- Grades already given with a late cut get their full grade back.
update learn_progress set score = grade where grade is not null and status = 'graded' and score is distinct from grade;

notify pgrst, 'reload schema';
