-- Home pages for every staff role, decisions escalated to the Programme Director, a call log,
-- host organisations, operations checklist, marking-guide scores, past cohorts and student documents.

-- ---------- new tables and columns ----------
create table if not exists escalations (
  id bigint generated always as identity primary key,
  application_id uuid references applications(id) on delete cascade,
  kind text not null check (kind in ('retake','deferral','extension','appeal','withdrawal','other')),
  title text not null,
  detail text,
  week int,
  raised_by_email text not null,
  raised_by_name text not null,
  status text not null default 'open' check (status in ('open','approved','declined')),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
alter table escalations enable row level security;

create table if not exists staff_calls (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  outcome text not null check (outcome in ('reached','no_answer')),
  note text,
  by_email text not null,
  by_name text not null,
  at timestamptz not null default now()
);
alter table staff_calls enable row level security;
create index if not exists staff_calls_app on staff_calls(application_id, at desc);

create table if not exists host_orgs (
  id bigint generated always as identity primary key,
  name text not null,
  city text,
  tracks text,
  spots int not null default 1 check (spots between 0 and 200),
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table host_orgs enable row level security;

create table if not exists ops_checks (
  cohort_id bigint not null references cohorts(id) on delete cascade,
  week int not null,
  item text not null,
  done_by text,
  done_at timestamptz,
  primary key (cohort_id, week, item)
);
alter table ops_checks enable row level security;

alter table applications add column if not exists dc1_score int check (dc1_score between 1 and 10);

-- ---------- Programme Director ----------
create or replace function public.director_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
    'pass_rate', (select round(100.0 * count(*) filter (where state = 'pass') / nullif(count(*) filter (where state in ('pass','fail')), 0)) from _dwt where week between 2 and 9),
    'pass_last', (select round(100.0 * count(*) filter (where state = 'pass') / nullif(count(*) filter (where state in ('pass','fail')), 0)) from _dwt where week = greatest(wk - 1, 2)),
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
end $$;

-- Staff send a decision up to the Programme Director.
create or replace function public.escalation_raise(p_app uuid, p_kind text, p_title text, p_detail text, p_week int default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; v bigint;
begin
  s := private.require_role(array['super','director','cohort_manager','academy_admin','facilitator','coach']);
  if p_app is not null then
    select * into a from applications where id = p_app;
    if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Say what needs deciding.' using errcode = 'P0001'; end if;
  insert into escalations(application_id, kind, title, detail, week, raised_by_email, raised_by_name)
  values (p_app, coalesce(nullif(p_kind, ''), 'other'), left(trim(p_title), 200), nullif(left(trim(coalesce(p_detail, '')), 2000), ''), p_week, s.email, s.full_name || ' · ' ||
    case s.role when 'cohort_manager' then 'Cohort Manager' when 'facilitator' then 'Facilitator' when 'coach' then 'Career Coach' when 'academy_admin' then 'Academy Admin' when 'director' then 'Programme Director' else 'Super Admin' end)
  returning id into v;
  if p_app is not null then insert into learn_history(application_id, key, action, by_name) values (p_app, 'escalation', 'Sent to the Programme Director: ' || left(trim(p_title), 200), s.full_name); end if;
  return v;
end $$;

create or replace function public.escalation_decide(p_id bigint, p_decision text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; e escalations;
begin
  s := private.require_role(array['director','super']);
  select * into e from escalations where id = p_id for update;
  if e.id is null then raise exception 'Not found.' using errcode = 'P0001'; end if;
  if e.status <> 'open' then raise exception 'This has already been decided.' using errcode = 'P0001'; end if;
  if p_decision not in ('approved','declined') then raise exception 'Approve or decline.' using errcode = 'P0001'; end if;
  update escalations set status = p_decision, decided_by = s.full_name, decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = e.id;
  if p_decision = 'approved' and e.kind = 'retake' and e.application_id is not null and e.week is not null then
    perform public.acad_grant_retake(e.application_id, e.week);
  end if;
  if e.application_id is not null then
    insert into learn_history(application_id, key, action, by_name) values (e.application_id, 'escalation', 'Programme Director ' || p_decision || ': ' || e.title, s.full_name);
  end if;
  insert into audit_log(actor, text) values (s.email, p_decision || ' “' || e.title || '”');
  return public.director_home();
end $$;

-- ---------- Cohort Manager ----------
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
    'due_at', private.week_start(c, greatest(wk, 1)) + 4,
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

create or replace function public.cm_call_log(p_app uuid, p_outcome text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['cohort_manager','director','super','academy_admin','coach','facilitator']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  if p_outcome not in ('reached','no_answer') then raise exception 'Choose reached or no answer.' using errcode = 'P0001'; end if;
  insert into staff_calls(application_id, outcome, note, by_email, by_name) values (a.id, p_outcome, nullif(trim(coalesce(p_note, '')), ''), s.email, s.full_name);
  insert into learn_history(application_id, key, action, by_name) values (a.id, 'call', case when p_outcome = 'reached' then 'Called and reached' else 'Called, no answer' end
    || coalesce(': ' || nullif(trim(coalesce(p_note, '')), ''), ''), s.full_name);
  if p_outcome = 'reached' and coalesce(trim(p_note), '') <> '' then
    insert into staff_notes(application_id, body, by_email, by_name) values (a.id, 'Call: ' || trim(p_note), s.email, s.full_name || ' · ' || s.role);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Facilitator ----------
create or replace function public.fac_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; wk int;
begin
  s := private.require_role(array['facilitator','director','cohort_manager','super']);
  c := private.ac_cohort(); wk := greatest(private.cur_week(c), 1);
  return jsonb_build_object(
    'me', s.full_name, 'track', (select name from tracks where code = s.track_code), 'track_code', s.track_code,
    'cohort', jsonb_build_object('name', c.name, 'week', private.cur_week(c)),
    'week_title', (select title from course_weeks where track_code = coalesce(s.track_code, 'DAT') and week = wk),
    'students', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)),
    'lessons_pct', (select round(100.0 * count(x.key) / nullif(count(*), 0)) from applications a join course_items i on i.track_code = a.track_code and i.week = wk and i.type = 'lesson'
      left join learn_progress x on x.application_id = a.id and x.key = i.key where a.cohort_id = c.id and a.status = 'Admitted' and private.track_ok(s, a.track_code)),
    'quiz_taken', (select count(distinct a.id) from applications a join course_items i on i.track_code = a.track_code and i.week = wk and i.type = 'quiz'
      join learn_progress x on x.application_id = a.id and x.key = i.key where a.cohort_id = c.id and a.status = 'Admitted' and private.track_ok(s, a.track_code)),
    'proj_in', (select count(distinct a.id) from applications a join course_items i on i.track_code = a.track_code and i.week = wk and i.proj
      join learn_progress x on x.application_id = a.id and x.key = i.key where a.cohort_id = c.id and a.status = 'Admitted' and private.track_ok(s, a.track_code)),
    'low_conf', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and private.track_ok(s, a.track_code)
      and (select k.conf from learn_checkins k where k.application_id = a.id order by k.week desc limit 1) <= 2),
    'graded_week', (select count(*) from learn_progress x where x.graded_by = s.full_name and x.graded_at > now() - interval '7 days'),
    'turn', (select round(extract(epoch from avg(x.graded_at - x.done_at)) / 86400.0, 1) from learn_progress x join applications a on a.id = x.application_id
      where x.graded_at > now() - interval '30 days' and private.track_ok(s, a.track_code)),
    'next', (select jsonb_build_object('id', x.id, 'title', x.title, 'at', x.starts_at, 'minutes', x.minutes, 'link', x.link) from sessions x
      where x.cohort_id = c.id and x.starts_at + make_interval(mins => x.minutes) > now() and (x.track_code is null or private.track_ok(s, x.track_code)) order by x.starts_at limit 1));
end $$;

-- Grade with the four-part marking guide. Stores each part, then grades as usual.
create or replace function public.acad_learn_grade_parts(p_app uuid, p_key text, p_status text, p_parts jsonb, p_feedback text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g int; r jsonb;
begin
  g := case when p_status = 'graded' then (select coalesce(sum((v)::int), 0) from jsonb_each_text(coalesce(p_parts, '{}'::jsonb)) t(k, v)) else null end;
  r := public.acad_learn_grade(p_app, p_key, p_status, g, p_feedback);
  update learn_progress set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('rubric', p_parts) where application_id = p_app and key = p_key;
  return r;
end $$;

-- ---------- Career Coach ----------
create or replace function public.coach_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; wk int; dc2 int;
begin
  s := private.require_role(array['coach','director','cohort_manager','super']);
  c := private.ac_cohort(); wk := private.cur_week(c);
  dc2 := coalesce((select min(week) from course_weeks where title ilike '%discovery call 2%'), 15);
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
end $$;

-- ---------- Academy Admin ----------
create or replace function public.aa_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
      and exists (select 1 from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key where x.application_id = a.id and i.week = 17)),
    'sessions_nolink', (select count(*) from sessions x where x.cohort_id = c.id and x.starts_at between now() and now() + interval '8 days' and coalesce(x.link, '') = ''),
    'checks', coalesce((select jsonb_object_agg(item, jsonb_build_object('by', done_by, 'at', done_at)) from ops_checks where cohort_id = c.id and week = wk), '{}'::jsonb));
end $$;

create or replace function public.host_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['academy_admin','director','cohort_manager','super']);
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'Add the organisation''s name.' using errcode = 'P0001'; end if;
  if (p ->> 'id') is null then
    insert into host_orgs(name, city, tracks, spots, contact_name, contact_phone, contact_email, notes, active)
    values (trim(p ->> 'name'), nullif(trim(p ->> 'city'), ''), nullif(trim(p ->> 'tracks'), ''), coalesce(nullif(p ->> 'spots', '')::int, 1), nullif(trim(p ->> 'contact_name'), ''),
      nullif(trim(p ->> 'contact_phone'), ''), nullif(trim(p ->> 'contact_email'), ''), nullif(trim(p ->> 'notes'), ''), coalesce((p ->> 'active')::boolean, true));
  else
    update host_orgs set name = trim(p ->> 'name'), city = nullif(trim(p ->> 'city'), ''), tracks = nullif(trim(p ->> 'tracks'), ''), spots = coalesce(nullif(p ->> 'spots', '')::int, spots),
      contact_name = nullif(trim(p ->> 'contact_name'), ''), contact_phone = nullif(trim(p ->> 'contact_phone'), ''), contact_email = nullif(trim(p ->> 'contact_email'), ''),
      notes = nullif(trim(p ->> 'notes'), ''), active = coalesce((p ->> 'active')::boolean, active) where id = (p ->> 'id')::bigint;
  end if;
  insert into audit_log(actor, text) values (s.email, 'saved host organisation ' || trim(p ->> 'name'));
  return public.aa_home();
end $$;

create or replace function public.ops_check(p_item text, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; wk int;
begin
  s := private.require_role(array['academy_admin','director','cohort_manager','super']);
  c := private.ac_cohort(); wk := private.cur_week(c);
  if p_done then
    insert into ops_checks(cohort_id, week, item, done_by, done_at) values (c.id, wk, left(p_item, 120), s.full_name, now())
    on conflict (cohort_id, week, item) do update set done_by = excluded.done_by, done_at = excluded.done_at;
  else
    delete from ops_checks where cohort_id = c.id and week = wk and item = p_item;
  end if;
  return public.aa_home();
end $$;

-- ---------- Admissions ----------
create or replace function public.adm_home() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['adm_admin','adm_officer','super']);
  return jsonb_build_object(
    'money_today', (select coalesce(sum(coalesce(y.amount_paid, y.amount)), 0) from payments y where y.status = 'success' and y.created_at >= private.today()),
    'pay_today', (select count(*) from payments y where y.status = 'success' and y.created_at >= private.today()),
    'pay_failed', (select count(*) from payments y where y.status = 'failed' and y.created_at >= private.today()),
    'pay_last', (select max(created_at) from payments where status = 'success'),
    'calls_week', (select count(*) from applications where officer_email = s.email and dc1_at > now() - interval '7 days' and dc1_at <= now() and status <> 'Call booked'),
    'recs_week', (select count(*) from applications where officer_email = s.email and (rec ->> 'at')::timestamptz > now() - interval '7 days' and rec ->> 'd' = 'offer'),
    'avg_score', (select round(avg(dc1_score), 1) from applications where officer_email = s.email and dc1_score is not null));
end $$;

create or replace function public.officer_call_score(p_id uuid, p_score int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['adm_officer','adm_admin','super']);
  select * into a from applications where id = p_id;
  if a.id is null then raise exception 'Not found.' using errcode = 'P0001'; end if;
  if s.role = 'adm_officer' and a.officer_email <> s.email then raise exception 'This call belongs to another officer.' using errcode = 'P0001'; end if;
  if p_score is not null and (p_score < 1 or p_score > 10) then raise exception 'Score from 1 to 10.' using errcode = 'P0001'; end if;
  update applications set dc1_score = p_score where id = a.id;
end $$;

-- ---------- past cohorts ----------
create or replace function public.acad_cohorts() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'start_date', c.start_date,
      'students', (select count(*) from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null)) order by c.start_date desc), '[]'::jsonb)
  from cohorts c
$$;

create or replace function public.acad_students2(p_cohort bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['super','director','cohort_manager','facilitator','coach','academy_admin','adm_admin']);
  if p_cohort is null then c := private.ac_cohort(); else select * into c from cohorts where id = p_cohort; end if;
  if c.id is null then raise exception 'Cohort not found.' using errcode = 'P0001'; end if;
  return jsonb_build_object('cohort', to_jsonb(c), 'week', private.cur_week(c), 'my_track', s.track_code, 'cohorts', public.acad_cohorts(),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name) order by t.sort) from tracks t where t.programme_code = c.programme_code), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'first_name', a.first_name, 'surname', a.surname,
        'email', a.email, 'phone', a.phone, 'matric', a.matric, 'track_code', a.track_code,
        'track', (select name from tracks where code = a.track_code), 'account', a.account_set_at is not null,
        'invited_at', a.portal_invited_at, 'balance', greatest(0, coalesce((private.fees(a) ->> 'plan_total')::int, 0) - a.paid_total),
        'cert', a.cert_id,
        'outcome', (select o.status from learn_outcomes o where o.application_id = a.id),
        'sessions_past', (select count(*) from sessions x where x.cohort_id = c.id and x.starts_at < now() and (x.track_code is null or x.track_code = a.track_code)),
        'sessions_attended', (select count(*) from attendance at join sessions x on x.id = at.session_id
          where at.application_id = a.id and x.starts_at < now() and (at.status in ('present','late') or (at.status is null and at.joined_at is not null))))
        order by a.matric)
      from applications a where a.cohort_id = c.id and a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb));
end $$;

create or replace function public.acad_outcomes2(p_cohort bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['coach','director','cohort_manager','academy_admin','super']);
  return jsonb_build_object('cohorts', public.acad_cohorts(), 'cohort', p_cohort,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'phone', a.phone,
      'track', (select name from tracks where code = a.track_code), 'cert', a.cert_id, 'cohort', (select name from cohorts where id = a.cohort_id),
      'outcome', private.outcome_json(o),
      'checkins', coalesce((select jsonb_object_agg(k.day, jsonb_build_object('status', k.status, 'note', k.note, 'at', k.at)) from alumni_checkins k where k.application_id = a.id), '{}'::jsonb),
      'survey', (select jsonb_build_object('recommend', v.recommend, 'best', v.best, 'improve', v.improve, 'testimonial', v.testimonial, 'consent', v.consent, 'at', v.at) from exit_surveys v where v.application_id = a.id))
      order by a.surname)
    from applications a left join learn_outcomes o on o.application_id = a.id
    where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code) and (p_cohort is null or a.cohort_id = p_cohort)), '[]'::jsonb));
end $$;

-- ---------- documents and check-ins on the student record ----------
create or replace function public.acad_student_docs(p_app uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['super','director','cohort_manager','academy_admin','facilitator','coach']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'letter', case when a.status = 'Admitted' and s.role in ('super','director','cohort_manager','academy_admin') then '/a/' || a.ref || '/' || a.token || '/letter' end,
    'cert_id', a.cert_id,
    'intern_cert', case when exists (select 1 from learn_evals e where e.application_id = a.id) then private.intern_cert_id(a.matric) end,
    'cv', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'cv'),
    'pitch', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'pitch'),
    'work', coalesce((select jsonb_agg(jsonb_build_object('week', x.week, 'title', i.title, 'link', x.link, 'status', x.status, 'score', x.score, 'at', x.done_at, 'feedback', x.feedback) order by x.week, i.title)
      from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key where x.application_id = a.id and x.link is not null), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('at', y.created_at, 'amount', coalesce(y.amount_paid, y.amount), 'reference', y.reference, 'part', y.part) order by y.created_at)
      from payments y where y.application_id = a.id and y.status = 'success'), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(jsonb_build_object('day', k.day, 'status', k.status, 'note', k.note, 'at', k.at) order by k.day) from alumni_checkins k where k.application_id = a.id), '[]'::jsonb),
    'survey', (select jsonb_build_object('recommend', v.recommend, 'best', v.best, 'improve', v.improve, 'testimonial', v.testimonial, 'consent', v.consent, 'at', v.at) from exit_surveys v where v.application_id = a.id),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('outcome', k.outcome, 'note', k.note, 'by', k.by_name, 'at', k.at) order by k.at desc) from staff_calls k where k.application_id = a.id), '[]'::jsonb));
end $$;

-- ---------- who may call what ----------
revoke execute on function public.director_home(), public.escalation_raise(uuid, text, text, text, int), public.escalation_decide(bigint, text, text), public.cm_home(),
  public.cm_call_log(uuid, text, text), public.fac_home(), public.acad_learn_grade_parts(uuid, text, text, jsonb, text), public.coach_home(), public.aa_home(), public.host_save(jsonb),
  public.ops_check(text, boolean), public.adm_home(), public.officer_call_score(uuid, int), public.acad_cohorts(), public.acad_students2(bigint), public.acad_outcomes2(bigint),
  public.acad_student_docs(uuid) from public, anon;
grant execute on function public.director_home(), public.escalation_raise(uuid, text, text, text, int), public.escalation_decide(bigint, text, text), public.cm_home(),
  public.cm_call_log(uuid, text, text), public.fac_home(), public.acad_learn_grade_parts(uuid, text, text, jsonb, text), public.coach_home(), public.aa_home(), public.host_save(jsonb),
  public.ops_check(text, boolean), public.adm_home(), public.officer_call_score(uuid, int), public.acad_cohorts(), public.acad_students2(bigint), public.acad_outcomes2(bigint),
  public.acad_student_docs(uuid) to authenticated;

notify pgrst, 'reload schema';

select 'Role home pages installed' as done;
