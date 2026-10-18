-- Feedback batch: names, lesson order, question banks with a timer and one retake,
-- optional interview report, internship certificate gate, accountability pods, staff counts.

-- ---------- names always start with a capital ----------
create or replace function private.name_case(v text) returns text
language sql immutable as $$
  select case when v is null then null
    when trim(v) = lower(trim(v)) or trim(v) = upper(trim(v)) then initcap(lower(regexp_replace(trim(v), '\s+', ' ', 'g')))
    else upper(left(trim(v), 1)) || substr(regexp_replace(trim(v), '\s+', ' ', 'g'), 2) end
$$;
create or replace function private.names_trigger() returns trigger
language plpgsql as $$
begin
  new.first_name := private.name_case(new.first_name);
  new.surname := private.name_case(new.surname);
  return new;
end $$;
drop trigger if exists applications_names on applications;
create trigger applications_names before insert or update of first_name, surname on applications
  for each row execute function private.names_trigger();
update applications set first_name = first_name, surname = surname
  where first_name is distinct from private.name_case(first_name) or surname is distinct from private.name_case(surname);

-- ---------- reporting an interview is optional ----------
update course_items set opt = true where title = 'Report your first interview invite';

-- ---------- lesson order: an item opens when the required items before it are done ----------
create or replace function private.seq_block(a applications, it course_items) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select j.title from course_items j
  where j.track_code = it.track_code and j.week = it.week and not j.opt
    and split_part(j.key, '-', 2)::int < split_part(it.key, '-', 2)::int
    and not exists (select 1 from learn_progress x where x.application_id = a.id and x.key = j.key and x.status in ('done','graded','submitted'))
  order by split_part(j.key, '-', 2)::int limit 1
$$;

create or replace function private.seq_check(a applications, it course_items) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t text;
begin
  t := private.seq_block(a, it);
  if t is not null then raise exception 'Finish “%” first.', t using errcode = 'P0001'; end if;
end $$;

-- learn_done with lesson order and the internship certificate rule
create or replace function public.learn_done(p_key text, p_done boolean, p_data jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; x learn_progress; d jsonb; n int;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.staff then raise exception 'Staff complete this step.' using errcode = 'P0001'; end if;
  if it.type = 'quiz' then raise exception 'Submit this one from its own page.' using errcode = 'P0001'; end if;
  if it.title in ('Book your 1-on-1 session') then raise exception 'Book a time below. This ticks itself when you book.' using errcode = 'P0001'; end if;
  if it.title in ('Mock interview simulation') then raise exception 'Your coach marks this after your call.' using errcode = 'P0001'; end if;
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
end $$;

create or replace function public.learn_submit(p_key text, p_link text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; it course_items; x learn_progress; u text;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  it := private.learn_item(a, p_key);
  if not it.link then raise exception 'This item doesn''t take a link.' using errcode = 'P0001'; end if;
  perform private.seq_check(a, it);
  u := private.clean_url(p_link);
  if u is null then raise exception 'Paste a full link, starting with https://' using errcode = 'P0001'; end if;
  select * into x from learn_progress where application_id = a.id and key = p_key;
  if x.status = 'graded' then raise exception 'This has already been graded.' using errcode = 'P0001'; end if;
  insert into learn_progress(application_id, key, week, status, link, cap)
  values (a.id, p_key, it.week, case when it.proj then 'submitted' else 'done' end, u, private.learn_cap(c, it.week, now()))
  on conflict (application_id, key) do update set status = excluded.status, link = u, cap = excluded.cap, done_at = now(), feedback = learn_progress.feedback;
  insert into learn_history(application_id, key, action) values (a.id, p_key, case when x.key is null then 'Submitted' else 'Resubmitted' end);
  return public.learn_state();
end $$;

-- ---------- question banks, a 10-minute timer and one retake ----------
create table if not exists quiz_bank (
  track_code text not null references tracks(code),
  key text not null,
  qid int not null,
  q text not null,
  o text[] not null,
  a int not null,
  primary key (track_code, key, qid)
);
alter table quiz_bank enable row level security;

create table if not exists quiz_draws (
  application_id uuid not null references applications(id) on delete cascade,
  key text not null,
  attempt int not null,
  qids int[] not null,
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  submitted_at timestamptz,
  primary key (application_id, key, attempt)
);
alter table quiz_draws enable row level security;

insert into app_settings(key, value) values ('quiz_size', '5'), ('quiz_minutes', '10') on conflict (key) do nothing;

create or replace function private.quiz_public(a applications, d quiz_draws) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('attempt', d.attempt, 'deadline', d.deadline, 'now', now(),
    'qs', (select jsonb_agg(jsonb_build_object('q', b.q, 'o', to_jsonb(b.o)) order by u.n)
           from unnest(d.qids) with ordinality u(qid, n) join quiz_bank b on b.track_code = a.track_code and b.key = d.key and b.qid = u.qid))
$$;

-- Student: open (or resume) an assessment. Draws random questions the first time.
create or replace function public.learn_quiz_start(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; x learn_progress; d quiz_draws; att int; n int; mins int; prev int[];
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.type <> 'quiz' then raise exception 'That isn''t an assessment.' using errcode = 'P0001'; end if;
  perform private.seq_check(a, it);
  select * into x from learn_progress where application_id = a.id and key = p_key;
  if x.key is null then att := 1;
  elsif coalesce((x.data ->> 'retake')::boolean, false) then att := 2;
  else raise exception 'You''ve already taken this assessment.' using errcode = 'P0001';
  end if;
  select * into d from quiz_draws where application_id = a.id and key = p_key and attempt = att;
  if d.application_id is not null and d.submitted_at is null then return private.quiz_public(a, d); end if;
  if d.application_id is not null then raise exception 'You''ve already taken this assessment.' using errcode = 'P0001'; end if;
  n := coalesce(nullif(private.setting('quiz_size', '5'), '')::int, 5);
  mins := coalesce(nullif(private.setting('quiz_minutes', '10'), '')::int, 10);
  select coalesce(array_agg(q), '{}') into prev from quiz_draws w, unnest(w.qids) q where w.application_id = a.id and w.key = p_key;
  insert into quiz_draws(application_id, key, attempt, qids, deadline)
  values (a.id, p_key, att, (select array_agg(qid) from (
      select qid from quiz_bank where track_code = a.track_code and key = p_key
      order by (qid = any(prev)), random() limit n) s), now() + make_interval(mins => mins))
  returning * into d;
  if d.qids is null then raise exception 'This assessment has no questions yet. Tell Student Success.' using errcode = 'P0001'; end if;
  insert into learn_history(application_id, key, action) values (a.id, p_key, case when att = 1 then 'Started the assessment' else 'Started the retake' end);
  return private.quiz_public(a, d);
end $$;

-- Student: submit answers (one per question, null = unanswered). Marked here; answers never reach the browser before.
create or replace function public.learn_quiz(p_key text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; x learn_progress; d quiz_draws; ok int := 0; i int; sc int; late boolean; rev jsonb := '[]'::jsonb; b quiz_bank; ans int; best int;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.type <> 'quiz' then raise exception 'That isn''t an assessment.' using errcode = 'P0001'; end if;
  select * into d from quiz_draws where application_id = a.id and key = p_key and submitted_at is null order by attempt desc limit 1 for update;
  if d.application_id is null then raise exception 'Start the assessment first.' using errcode = 'P0001'; end if;
  late := now() > d.deadline + interval '90 seconds';
  for i in 1..array_length(d.qids, 1) loop
    select * into b from quiz_bank where track_code = a.track_code and key = p_key and qid = d.qids[i];
    ans := case when late then null else nullif(p_answers ->> (i - 1), '')::int end;
    if ans = b.a then ok := ok + 1; end if;
    rev := rev || jsonb_build_object('q', b.q, 'o', to_jsonb(b.o), 'a', b.a, 'ans', ans);
  end loop;
  sc := round(100.0 * ok / greatest(array_length(d.qids, 1), 1));
  update quiz_draws set submitted_at = now() where application_id = a.id and key = p_key and attempt = d.attempt;
  select * into x from learn_progress where application_id = a.id and key = p_key;
  best := greatest(sc, coalesce(x.score, 0));
  insert into learn_progress(application_id, key, week, status, score, cap, data)
  values (a.id, p_key, it.week, 'done', sc, 1, jsonb_build_object('attempt', d.attempt, 'review', rev, 'last', sc, 'late', late))
  on conflict (application_id, key) do update set status = 'done', score = best, done_at = now(),
    data = jsonb_build_object('attempt', d.attempt, 'review', rev, 'last', sc, 'first', learn_progress.score, 'late', late);
  insert into learn_history(application_id, key, action) values (a.id, p_key,
    format('%s score %s%%', case when d.attempt = 1 then 'Assessment' else 'Retake' end, sc) || case when late then ' (time ran out)' else '' end);
  return public.learn_state();
end $$;

-- Student: failed the first attempt? Redo the week's lessons, then retake once.
create or replace function public.learn_quiz_retry(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; x learn_progress; pass int;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  select * into x from learn_progress where application_id = a.id and key = p_key;
  pass := coalesce(nullif(private.setting('learn_pass', '70'), '')::int, 70);
  if x.key is null or it.type <> 'quiz' then raise exception 'Take the assessment first.' using errcode = 'P0001'; end if;
  if x.score >= pass then raise exception 'You''ve already passed this assessment.' using errcode = 'P0001'; end if;
  if coalesce((x.data ->> 'attempt')::int, 1) >= 2 then raise exception 'You''ve used your retake. Repeat the week to try again.' using errcode = 'P0001'; end if;
  if coalesce((x.data ->> 'retake')::boolean, false) then return public.learn_state(); end if;
  delete from learn_progress p using course_items i
  where p.application_id = a.id and i.track_code = a.track_code and i.key = p.key and i.week = it.week and i.type = 'lesson';
  update learn_progress set data = data || jsonb_build_object('retake', true) where application_id = a.id and key = p_key;
  insert into learn_history(application_id, key, action) values (a.id, p_key, 'Redoing the lessons before the retake');
  return public.learn_state();
end $$;

-- Repeating a week also clears its assessment draws.
create or replace function public.learn_repeat(p_week int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  delete from learn_progress where application_id = a.id and week = p_week;
  delete from quiz_draws w using course_items i where w.application_id = a.id and i.track_code = a.track_code and i.key = w.key and i.week = p_week;
  insert into learn_attempts(application_id, week, n) values (a.id, p_week, 2)
  on conflict (application_id, week) do update set n = learn_attempts.n + 1;
  insert into learn_history(application_id, key, action) values (a.id, 'w' || p_week, 'Started the week again');
  return public.learn_state();
end $$;

-- ---------- accountability pods ----------
create table if not exists pods (
  id bigint generated always as identity primary key,
  name text not null,
  track_code text references tracks(code),
  meet text,
  link text,
  created_at timestamptz not null default now()
);
alter table pods enable row level security;
create table if not exists pod_members (
  application_id uuid primary key references applications(id) on delete cascade,
  pod_id bigint not null references pods(id) on delete cascade
);
alter table pod_members enable row level security;

create or replace function public.acad_pods() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','facilitator','coach']);
  return jsonb_build_object(
    'pods', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'track', p.track_code, 'meet', p.meet, 'link', p.link,
        'members', coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'track', a.track_code) order by a.first_name)
          from pod_members m join applications a on a.id = m.application_id where m.pod_id = p.id), '[]'::jsonb)) order by p.track_code nulls last, p.name)
      from pods p where p.track_code is null or private.track_ok(s, p.track_code)), '[]'::jsonb),
    'unassigned', coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'track', a.track_code) order by a.track_code, a.first_name)
      from applications a where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)
        and not exists (select 1 from pod_members m where m.application_id = a.id)), '[]'::jsonb),
    'tracks', (select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by name) from tracks));
end $$;

create or replace function public.acad_pod_save(p_id bigint, p_name text, p_track text, p_meet text, p_link text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; v bigint;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the pod a name.' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into pods(name, track_code, meet, link) values (trim(p_name), nullif(p_track, ''), nullif(trim(coalesce(p_meet, '')), ''), private.clean_url(p_link)) returning id into v;
  else
    update pods set name = trim(p_name), track_code = nullif(p_track, ''), meet = nullif(trim(coalesce(p_meet, '')), ''), link = private.clean_url(p_link) where id = p_id returning id into v;
  end if;
  return v;
end $$;

create or replace function public.acad_pod_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  delete from pods where id = p_id;
end $$;

create or replace function public.acad_pod_assign(p_app uuid, p_pod bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  if p_pod is null then delete from pod_members where application_id = p_app;
  else insert into pod_members(application_id, pod_id) values (p_app, p_pod) on conflict (application_id) do update set pod_id = excluded.pod_id;
  end if;
end $$;

-- Put everyone not yet in a pod into new pods of about p_size, by track.
create or replace function public.acad_pods_auto(p_size int, p_meet text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; t record; k int; made int := 0; pid bigint; n int; i int; size int := greatest(coalesce(p_size, 5), 3);
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  for t in select a.track_code, array_agg(a.id order by random()) ids from applications a
    where a.status = 'Admitted' and a.matric is not null and not exists (select 1 from pod_members m where m.application_id = a.id)
    group by a.track_code loop
    n := array_length(t.ids, 1);
    k := greatest(1, round(n::numeric / size)::int);
    select count(*) into i from pods where track_code = t.track_code;
    for j in 1..k loop
      insert into pods(name, track_code, meet) values ((select name from tracks where code = t.track_code) || ' pod ' || (i + j), t.track_code, nullif(trim(coalesce(p_meet, '')), '')) returning id into pid;
      made := made + 1;
      insert into pod_members(application_id, pod_id) select t.ids[x], pid from generate_series(1, n) x where (x - 1) % k = j - 1;
    end loop;
  end loop;
  return made;
end $$;

create or replace function public.student_pod() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications; p pods;
begin
  a := private.require_student();
  select p0.* into p from pods p0 join pod_members m on m.pod_id = p0.id where m.application_id = a.id;
  if p.id is null then return null; end if;
  return jsonb_build_object('name', p.name, 'meet', p.meet, 'link', p.link,
    'members', (select jsonb_agg(jsonb_build_object('name', o.first_name || ' ' || left(o.surname, 1) || '.', 'me', o.id = a.id, 'initials', left(o.first_name, 1) || left(o.surname, 1)) order by o.id <> a.id, o.first_name)
      from pod_members m2 join applications o on o.id = m2.application_id where m2.pod_id = p.id));
end $$;

-- ---------- staff menu counts ----------
create or replace function public.staff_counts() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; r jsonb := '{}'::jsonb; c cohorts;
begin
  s := private.caller_staff();
  if s.email is null then return r; end if;
  if s.role in ('super','director','cohort_manager','facilitator') then
    r := r || jsonb_build_object('grading',
      (select count(*) from learn_progress x join applications a on a.id = x.application_id join course_items i on i.track_code = a.track_code and i.key = x.key
        where i.proj and x.status = 'submitted' and private.track_ok(s, a.track_code))
      + (select count(*) from (select distinct on (m.application_id) m.from_staff, a.track_code from learn_messages m join applications a on a.id = m.application_id
          order by m.application_id, m.at desc) q where not q.from_staff and private.track_ok(s, q.track_code)));
  end if;
  if s.role in ('super','director','cohort_manager','academy_admin') then
    select * into c from cohorts where id = (select cohort_id from applications where status = 'Admitted' order by created_at desc limit 1);
    r := r || jsonb_build_object('intern', case when c.id is not null and private.cur_week(c) >= 8 then
      (select count(*) from applications a where a.status = 'Admitted' and a.matric is not null and not exists (select 1 from placements p where p.application_id = a.id)) else 0 end,
      'pods', (select count(*) from applications a where a.status = 'Admitted' and a.matric is not null and not exists (select 1 from pod_members m where m.application_id = a.id)));
  end if;
  if s.role in ('super','director','cohort_manager','coach') then
    r := r || jsonb_build_object('dc2', (select count(*) from coach_slots x where x.application_id is not null and x.starts_at < now()
      and not exists (select 1 from call_results cr where cr.application_id = x.application_id) and (s.role <> 'coach' or x.coach_email = s.email)));
  end if;
  if s.role in ('super','adm_admin') then
    r := r || jsonb_build_object('decide', (select count(*) from applications where status = 'Under review'));
  end if;
  if s.role in ('super','adm_officer') then
    r := r || jsonb_build_object('calls', (select count(*) from applications a where a.status = 'Call booked' and a.dc1_at < now() and (s.role = 'super' or a.officer_email = s.email)));
  end if;
  return r;
end $$;

-- ---------- who may call what ----------
revoke execute on function private.name_case(text), private.names_trigger(), private.seq_block(applications, course_items), private.seq_check(applications, course_items),
  private.quiz_public(applications, quiz_draws) from public;
revoke execute on function public.learn_quiz_start(text), public.learn_quiz_retry(text), public.acad_pods(), public.acad_pod_save(bigint, text, text, text, text),
  public.acad_pod_delete(bigint), public.acad_pod_assign(uuid, bigint), public.acad_pods_auto(int, text), public.student_pod(), public.staff_counts() from public, anon;
grant execute on function public.learn_quiz_start(text), public.learn_quiz_retry(text), public.acad_pods(), public.acad_pod_save(bigint, text, text, text, text),
  public.acad_pod_delete(bigint), public.acad_pod_assign(uuid, bigint), public.acad_pods_auto(int, text), public.student_pod(), public.staff_counts() to authenticated;

notify pgrst, 'reload schema';
select 'Feedback updates installed' as done;
