-- Jobnest Academy: student portal (run once in Supabase → SQL Editor). Safe to run more than once.
-- Students sign in with their matric number. Behind the scenes their login is a private address
-- made from the matric number (gep-27a-001@students.jobnestcareers.com), so their real email is never exposed.

-- ---------- tables ----------
alter table staff add column if not exists track_code text references tracks(code);   -- facilitators: their track (empty = all)
alter table applications add column if not exists student_uid uuid;
alter table applications add column if not exists account_set_at timestamptz;
alter table applications add column if not exists portal_invited_at timestamptz;
alter table applications add column if not exists reset_sent_at timestamptz;

create table if not exists lessons (
  id bigint generated always as identity primary key,
  cohort_id bigint not null references cohorts(id),
  track_code text references tracks(code),          -- empty = every track
  week int not null check (week between 1 and 30),
  sort int not null default 0,
  kind text not null default 'lesson' check (kind in ('lesson','video','reading','file','link')),
  title text not null,
  body text,
  url text,
  published boolean not null default true,
  created_by text,
  updated_at timestamptz not null default now()
);
create table if not exists tasks (
  id bigint generated always as identity primary key,
  cohort_id bigint not null references cohorts(id),
  track_code text references tracks(code),
  week int not null check (week between 1 and 30),
  title text not null,
  brief text,
  url text,
  due_at timestamptz not null,
  published boolean not null default true,
  created_by text,
  updated_at timestamptz not null default now()
);
create table if not exists submissions (
  id bigint generated always as identity primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  link text not null,
  note text,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted','passed','redo')),
  score int check (score between 0 and 100),
  feedback text,
  graded_by text,
  graded_at timestamptz,
  unique (task_id, application_id)
);
create table if not exists sessions (
  id bigint generated always as identity primary key,
  cohort_id bigint not null references cohorts(id),
  track_code text references tracks(code),
  title text not null,
  kind text not null default 'class' check (kind in ('class','clinic','orientation','other')),
  starts_at timestamptz not null,
  minutes int not null default 60 check (minutes between 10 and 480),
  link text,
  host text,
  created_by text
);
create table if not exists attendance (
  session_id bigint not null references sessions(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  joined_at timestamptz,
  status text check (status in ('present','late','absent','excused')),
  marked_by text,
  marked_at timestamptz,
  primary key (session_id, application_id)
);
create table if not exists announcements (
  id bigint generated always as identity primary key,
  cohort_id bigint not null references cohorts(id),
  track_code text references tracks(code),
  title text not null,
  body text not null,
  created_by text,
  created_at timestamptz not null default now(),
  emailed boolean not null default false
);
create index if not exists lessons_c_idx on lessons(cohort_id, week);
create index if not exists tasks_c_idx on tasks(cohort_id, week);
create index if not exists sessions_c_idx on sessions(cohort_id, starts_at);
create index if not exists subs_app_idx on submissions(application_id);
alter table lessons enable row level security;
alter table tasks enable row level security;
alter table submissions enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;
alter table announcements enable row level security;

-- ---------- helpers ----------
create or replace function private.student_login(m text) returns text
language sql immutable as $$
  select lower(replace(m, '/', '-')) || '@students.jobnestcareers.com'
$$;

create or replace function private.caller_student() returns applications
language sql stable security definer set search_path = public, pg_temp as $$
  select * from applications where status = 'Admitted' and matric is not null
    and private.student_login(matric) = private.caller_email() limit 1
$$;

create or replace function private.require_student() returns applications
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.caller_student();
  if a.id is null then raise exception 'Please sign in with your matric number.' using errcode = '42501'; end if;
  return a;
end $$;

create or replace function private.today() returns date
language sql stable as $$ select (now() at time zone 'Africa/Lagos')::date $$;

create or replace function private.week_start(c cohorts, w int) returns date
language sql immutable as $$ select c.start_date + (w - 1) * 7 $$;

create or replace function private.cur_week(c cohorts) returns int
language sql stable as $$ select floor((private.today() - c.start_date) / 7.0)::int + 1 $$;

-- A week opens on the Saturday before it starts.
create or replace function private.week_open(c cohorts, w int) returns boolean
language sql stable as $$ select private.week_start(c, w) - 2 <= private.today() $$;

create or replace function private.track_ok(s staff, t text) returns boolean
language sql immutable as $$ select s.role = 'super' or s.track_code is null or coalesce(t = s.track_code, false) $$;

create or replace function private.clean_url(u text) returns text
language plpgsql immutable as $$
begin
  u := nullif(trim(coalesce(u, '')), '');
  if u is not null and u !~* '^https?://[^\s]+$' then raise exception 'Links must start with https://'; end if;
  return u;
end $$;

-- Queue an email with any link (queue_email always links to the applicant page).
create or replace function private.queue_mail(a applications, tpl text, vars jsonb, link text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t email_templates; c cohorts; p programmes; subj text; body text; k text; v jsonb;
begin
  select * into t from email_templates where key = tpl;
  if t.key is null then return; end if;
  select * into c from cohorts where id = a.cohort_id;
  select * into p from programmes where code = c.programme_code;
  v := jsonb_build_object('first', a.first_name, 'ref', a.ref, 'matric', coalesce(a.matric, ''), 'programme', p.name,
    'cohort', c.name, 'track', coalesce((select name from tracks where code = a.track_code), '')) || coalesce(vars, '{}'::jsonb);
  subj := t.subject; body := t.body;
  for k in select jsonb_object_keys(v) loop
    subj := replace(subj, '{' || k || '}', coalesce(v ->> k, ''));
    body := replace(body, '{' || k || '}', coalesce(v ->> k, ''));
  end loop;
  insert into outbox(application_id, to_email, template, subject, body, link, cta) values (a.id, a.email, tpl, subj, body, link, t.cta);
end $$;

create or replace function private.site() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select rtrim(private.setting('site_url', 'https://academy.jobnestcareers.com'), '/')
$$;

-- Applicant page now also says whether the student account is set up.
create or replace function private.app_public(a applications) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ref', a.ref, 'first_name', a.first_name, 'surname', a.surname, 'email', a.email,
    'status', a.status, 'score', a.score, 'pass_mark', c.pass_mark,
    'track', (select name from tracks where code = a.track_code), 'wanted', a.wanted,
    'dc1_at', a.dc1_at, 'officer', (select full_name from staff where email = a.officer_email),
    'offer_deadline', a.offer_deadline, 'cohort', c.name, 'start_date', c.start_date,
    'has_zuri', a.zuri_summary is not null and a.zuri_summary <> '',
    'assessment_started', a.qset is not null,
    'created_at', a.created_at,
    'programme', p.name, 'weeks', p.weeks,
    'plan', a.plan, 'paid_total', a.paid_total, 'matric', a.matric, 'admitted_at', a.admitted_at,
    'account_set', a.account_set_at is not null,
    'fees', private.fees(a),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', coalesce(y.amount_paid, y.amount), 'part', y.part,
        'paid_at', y.paid_at, 'channel', y.channel) order by y.paid_at)
      from payments y where y.application_id = a.id and y.status = 'success'), '[]'::jsonb),
    'signer_name', case when a.status = 'Admitted' then private.setting('signer_name', '') end,
    'signer_title', case when a.status = 'Admitted' then private.setting('signer_title', 'Programme Director') end)
  from cohorts c join programmes p on p.code = c.programme_code where c.id = a.cohort_id
$$;

-- ---------- student accounts (server only: called by the Netlify function with the secret key) ----------
create or replace function public.student_account_prepare(p_ref text, p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Admitted' or a.matric is null then raise exception 'Your student account opens after you are admitted.'; end if;
  return jsonb_build_object('login', private.student_login(a.matric), 'uid', a.student_uid, 'matric', a.matric, 'first', a.first_name);
end $$;

create or replace function public.student_account_saved(p_ref text, p_token uuid, p_uid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  update applications set student_uid = p_uid, account_set_at = coalesce(account_set_at, now()) where id = a.id;
  perform private.log(a.id, 'Student', 'Set a student portal password');
end $$;

-- Anyone can ask for a password link by matric number. It only ever goes to the student's own email.
create or replace function public.student_reset_request(p_matric text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  select * into a from applications where upper(matric) = upper(trim(p_matric)) and status = 'Admitted';
  if a.id is null or (a.reset_sent_at is not null and a.reset_sent_at > now() - interval '10 minutes') then return; end if;
  update applications set reset_sent_at = now() where id = a.id;
  perform private.queue_mail(a, 'student_reset', '{}'::jsonb, private.site() || '/#/a/' || a.ref || '/' || a.token || '/account');
end $$;

-- ---------- student: the campus ----------
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
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'kind', x.kind, 'starts_at', x.starts_at,
        'minutes', x.minutes, 'link', x.link, 'host', x.host,
        'att', (select coalesce(at.status, case when at.joined_at is not null then 'joined' end)
          from attendance at where at.session_id = x.id and at.application_id = a.id)) order by x.starts_at)
      from sessions x where x.cohort_id = c.id and (x.track_code is null or x.track_code = a.track_code)
        and x.starts_at > now() - interval '60 days'), '[]'::jsonb),
    'news', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'at', n.created_at,
        'by', coalesce((select full_name from staff where email = n.created_by), 'Jobnest Academy')) order by n.created_at desc)
      from (select * from announcements where cohort_id = c.id and (track_code is null or track_code = a.track_code)
        order by created_at desc limit 30) n), '[]'::jsonb));
end $$;

create or replace function public.student_submit(p_task bigint, p_link text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; t tasks; s submissions;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  select * into t from tasks where id = p_task and cohort_id = c.id and published and (track_code is null or track_code = a.track_code);
  if t.id is null or not private.week_open(c, t.week) then raise exception 'That task is not open yet.'; end if;
  p_link := private.clean_url(p_link);
  if p_link is null then raise exception 'Add the link to your work (for example a Google Doc set to "Anyone with the link").'; end if;
  select * into s from submissions where task_id = t.id and application_id = a.id;
  if s.status = 'passed' then raise exception 'You have already passed this task.'; end if;
  insert into submissions(task_id, application_id, link, note) values (t.id, a.id, p_link, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (task_id, application_id) do update set link = excluded.link, note = excluded.note, submitted_at = now(),
    status = 'submitted', score = null, graded_by = null, graded_at = null
  returning * into s;
  return to_jsonb(s);
end $$;

create or replace function public.student_join(p_session bigint) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; x sessions;
begin
  a := private.require_student();
  select * into x from sessions where id = p_session and cohort_id = a.cohort_id and (track_code is null or track_code = a.track_code);
  if x.id is null then raise exception 'Session not found.'; end if;
  if now() between x.starts_at - interval '30 minutes' and x.starts_at + make_interval(mins => x.minutes) then
    insert into attendance(session_id, application_id, joined_at) values (x.id, a.id, now())
    on conflict (session_id, application_id) do update set joined_at = coalesce(attendance.joined_at, now());
  end if;
  return x.link;
end $$;

-- ---------- staff: academy ----------
-- Everyone admitted in the current cohort, with progress.
create or replace function public.acad_students() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin','adm_admin']);
  c := private.current_cohort();
  return jsonb_build_object('cohort', to_jsonb(c), 'week', private.cur_week(c), 'my_track', s.track_code,
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name) order by t.sort) from tracks t
      where t.programme_code = c.programme_code), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'first_name', a.first_name, 'surname', a.surname,
        'email', a.email, 'phone', a.phone, 'matric', a.matric, 'track_code', a.track_code,
        'track', (select name from tracks where code = a.track_code), 'account', a.account_set_at is not null,
        'invited_at', a.portal_invited_at, 'balance', greatest(0, coalesce((private.fees(a) ->> 'plan_total')::int, 0) - a.paid_total),
        'tasks_due', (select count(*) from tasks t where t.cohort_id = c.id and t.published and t.due_at < now()
          and (t.track_code is null or t.track_code = a.track_code)),
        'tasks_passed', (select count(*) from submissions x join tasks t on t.id = x.task_id where x.application_id = a.id and x.status = 'passed'),
        'tasks_waiting', (select count(*) from submissions x where x.application_id = a.id and x.status = 'submitted'),
        'sessions_past', (select count(*) from sessions x where x.cohort_id = c.id and x.starts_at < now()
          and (x.track_code is null or x.track_code = a.track_code)),
        'sessions_attended', (select count(*) from attendance at join sessions x on x.id = at.session_id
          where at.application_id = a.id and x.starts_at < now() and (at.status in ('present','late') or (at.status is null and at.joined_at is not null))))
        order by a.matric)
      from applications a where a.cohort_id = c.id and a.status = 'Admitted' and private.track_ok(s, a.track_code)), '[]'::jsonb));
end $$;

create or replace function public.acad_invite() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; a applications; n int := 0;
begin
  s := private.require_role(array['cohort_manager','academy_admin','adm_admin']);
  c := private.current_cohort();
  for a in select * from applications where cohort_id = c.id and status = 'Admitted' and account_set_at is null
      and (portal_invited_at is null or portal_invited_at < now() - interval '2 days') loop
    update applications set portal_invited_at = now() where id = a.id;
    perform private.queue_mail(a, 'portal_invite', jsonb_build_object('start', to_char(c.start_date, 'FMDay FMDD FMMonth')),
      private.site() || '/#/a/' || a.ref || '/' || a.token || '/account');
    n := n + 1;
  end loop;
  insert into audit_log(actor, text) values (s.email, format('sent %s student portal invitations', n));
  return n;
end $$;

create or replace function public.acad_content() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  c := private.current_cohort();
  return jsonb_build_object('cohort', to_jsonb(c), 'week', private.cur_week(c), 'my_track', s.track_code,
    'weeks', (select weeks from programmes where code = c.programme_code),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name) order by t.sort) from tracks t
      where t.programme_code = c.programme_code), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(l) order by l.week, l.sort, l.id) from lessons l where l.cohort_id = c.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object(
        'submitted', (select count(*) from submissions x where x.task_id = t.id),
        'waiting', (select count(*) from submissions x where x.task_id = t.id and x.status = 'submitted')) order by t.week, t.due_at)
      from tasks t where t.cohort_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.acad_save_lesson(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; l lessons; v_track text := nullif(p ->> 'track_code', '');
begin
  s := private.require_role(array['cohort_manager','facilitator','academy_admin']);
  c := private.current_cohort();
  if not private.track_ok(s, v_track) then raise exception 'You can only add content for your own track.'; end if;
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'Add a title.'; end if;
  if (p ->> 'id') is not null then
    select * into l from lessons where id = (p ->> 'id')::bigint and cohort_id = c.id;
    if l.id is null or not private.track_ok(s, l.track_code) then raise exception 'You can''t edit that item.'; end if;
    update lessons set track_code = v_track, week = (p ->> 'week')::int, kind = coalesce(p ->> 'kind', kind), title = trim(p ->> 'title'),
      body = nullif(trim(coalesce(p ->> 'body', '')), ''), url = private.clean_url(p ->> 'url'),
      sort = coalesce((p ->> 'sort')::int, sort), published = coalesce((p ->> 'published')::boolean, published),
      updated_at = now() where id = l.id returning * into l;
  else
    insert into lessons(cohort_id, track_code, week, kind, title, body, url, sort, published, created_by)
    values (c.id, v_track, (p ->> 'week')::int, coalesce(p ->> 'kind', 'lesson'), trim(p ->> 'title'),
      nullif(trim(coalesce(p ->> 'body', '')), ''), private.clean_url(p ->> 'url'),
      coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from lessons where cohort_id = c.id and week = (p ->> 'week')::int)),
      coalesce((p ->> 'published')::boolean, true), s.email)
    returning * into l;
  end if;
  return to_jsonb(l);
end $$;

create or replace function public.acad_delete_lesson(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['cohort_manager','facilitator','academy_admin']);
  delete from lessons where id = p_id and private.track_ok(s, track_code);
end $$;

create or replace function public.acad_save_task(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; t tasks; v_track text := nullif(p ->> 'track_code', '');
begin
  s := private.require_role(array['cohort_manager','facilitator','academy_admin']);
  c := private.current_cohort();
  if not private.track_ok(s, v_track) then raise exception 'You can only add tasks for your own track.'; end if;
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'Add a title.'; end if;
  if (p ->> 'due_at') is null then raise exception 'Add a due date.'; end if;
  if (p ->> 'id') is not null then
    select * into t from tasks where id = (p ->> 'id')::bigint and cohort_id = c.id;
    if t.id is null or not private.track_ok(s, t.track_code) then raise exception 'You can''t edit that task.'; end if;
    update tasks set track_code = v_track, week = (p ->> 'week')::int, title = trim(p ->> 'title'),
      brief = nullif(trim(coalesce(p ->> 'brief', '')), ''), url = private.clean_url(p ->> 'url'),
      due_at = (p ->> 'due_at')::timestamptz, published = coalesce((p ->> 'published')::boolean, published), updated_at = now()
      where id = t.id returning * into t;
  else
    insert into tasks(cohort_id, track_code, week, title, brief, url, due_at, published, created_by)
    values (c.id, v_track, (p ->> 'week')::int, trim(p ->> 'title'), nullif(trim(coalesce(p ->> 'brief', '')), ''),
      private.clean_url(p ->> 'url'), (p ->> 'due_at')::timestamptz, coalesce((p ->> 'published')::boolean, true), s.email)
    returning * into t;
  end if;
  return to_jsonb(t);
end $$;

create or replace function public.acad_delete_task(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['cohort_manager','facilitator','academy_admin']);
  if exists (select 1 from submissions where task_id = p_id) then
    raise exception 'Students have already submitted this task. Hide it instead (untick "Visible to students").';
  end if;
  delete from tasks where id = p_id and private.track_ok(s, track_code);
end $$;

create or replace function public.acad_submissions() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator']);
  c := private.current_cohort();
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'link', x.link, 'note', x.note,
      'submitted_at', x.submitted_at, 'score', x.score, 'feedback', x.feedback, 'graded_by', x.graded_by, 'graded_at', x.graded_at,
      'task', t.title, 'task_id', t.id, 'week', t.week, 'due_at', t.due_at, 'brief', t.brief,
      'student', a.first_name || ' ' || a.surname, 'matric', a.matric, 'track', (select name from tracks where code = a.track_code))
      order by (x.status = 'submitted') desc, x.submitted_at)
    from submissions x join tasks t on t.id = x.task_id join applications a on a.id = x.application_id
    where t.cohort_id = c.id and private.track_ok(s, a.track_code)
      and (x.status = 'submitted' or x.graded_at > now() - interval '30 days')), '[]'::jsonb);
end $$;

create or replace function public.acad_grade(p_id bigint, p_status text, p_score int, p_feedback text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; x submissions; a applications; t tasks;
begin
  s := private.require_role(array['cohort_manager','facilitator']);
  select * into x from submissions where id = p_id for update;
  select * into a from applications where id = x.application_id;
  select * into t from tasks where id = x.task_id;
  if x.id is null or not private.track_ok(s, a.track_code) then raise exception 'You can''t grade that submission.'; end if;
  if p_status not in ('passed','redo') then raise exception 'Choose Passed or Needs another try.'; end if;
  if p_status = 'redo' and coalesce(trim(p_feedback), '') = '' then raise exception 'Tell them what to change.'; end if;
  update submissions set status = p_status, score = p_score, feedback = nullif(trim(coalesce(p_feedback, '')), ''),
    graded_by = s.full_name, graded_at = now() where id = x.id returning * into x;
  perform private.queue_mail(a, 'graded', jsonb_build_object('task', t.title,
    'result', case when p_status = 'passed' then 'passed' else 'needs another try' end,
    'feedback', coalesce(x.feedback, 'No extra comments.')), private.site() || '/#/learn/tasks');
  return to_jsonb(x);
end $$;

create or replace function public.acad_sessions() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin']);
  c := private.current_cohort();
  return jsonb_build_object('my_track', s.track_code, 'start_date', c.start_date,
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name) order by t.sort) from tracks t
      where t.programme_code = c.programme_code), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object(
        'track', (select name from tracks where code = x.track_code),
        'joined', (select count(*) from attendance at where at.session_id = x.id and at.joined_at is not null),
        'marked', (select count(*) from attendance at where at.session_id = x.id and at.status is not null)) order by x.starts_at)
      from sessions x where x.cohort_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.acad_save_session(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; x sessions; v_track text := nullif(p ->> 'track_code', '');
begin
  s := private.require_role(array['cohort_manager','facilitator','academy_admin']);
  c := private.current_cohort();
  if not private.track_ok(s, v_track) then raise exception 'You can only schedule sessions for your own track.'; end if;
  if coalesce(trim(p ->> 'title'), '') = '' or (p ->> 'starts_at') is null then raise exception 'Add a title, date and time.'; end if;
  if (p ->> 'id') is not null then
    select * into x from sessions where id = (p ->> 'id')::bigint and cohort_id = c.id;
    if x.id is null or not private.track_ok(s, x.track_code) then raise exception 'You can''t edit that session.'; end if;
    update sessions set track_code = v_track, title = trim(p ->> 'title'), kind = coalesce(p ->> 'kind', kind),
      starts_at = (p ->> 'starts_at')::timestamptz, minutes = coalesce((p ->> 'minutes')::int, minutes),
      link = private.clean_url(p ->> 'link'), host = nullif(trim(coalesce(p ->> 'host', '')), '')
      where id = x.id returning * into x;
  else
    insert into sessions(cohort_id, track_code, title, kind, starts_at, minutes, link, host, created_by)
    values (c.id, v_track, trim(p ->> 'title'), coalesce(p ->> 'kind', 'class'), (p ->> 'starts_at')::timestamptz,
      coalesce((p ->> 'minutes')::int, 60), private.clean_url(p ->> 'link'), coalesce(nullif(trim(coalesce(p ->> 'host', '')), ''), s.full_name), s.email)
    returning * into x;
  end if;
  return to_jsonb(x);
end $$;

create or replace function public.acad_delete_session(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['cohort_manager','facilitator','academy_admin']);
  delete from sessions where id = p_id and private.track_ok(s, track_code);
end $$;

create or replace function public.acad_attendance(p_session bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; x sessions;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin']);
  select * into x from sessions where id = p_session;
  if x.id is null then raise exception 'Session not found.'; end if;
  return jsonb_build_object('session', to_jsonb(x), 'students', coalesce((select jsonb_agg(jsonb_build_object('id', a.id,
      'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'joined_at', at.joined_at, 'status', at.status) order by a.matric)
    from applications a left join attendance at on at.session_id = x.id and at.application_id = a.id
    where a.cohort_id = x.cohort_id and a.status = 'Admitted' and (x.track_code is null or a.track_code = x.track_code)
      and private.track_ok(s, a.track_code)), '[]'::jsonb));
end $$;

create or replace function public.acad_mark_attendance(p_session bigint, p_marks jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; x sessions; m jsonb; n int := 0;
begin
  s := private.require_role(array['cohort_manager','facilitator']);
  select * into x from sessions where id = p_session;
  if x.id is null or not private.track_ok(s, x.track_code) then raise exception 'You can''t mark this session.'; end if;
  for m in select * from jsonb_array_elements(p_marks) loop
    continue when (m ->> 'status') not in ('present','late','absent','excused');
    continue when not exists (select 1 from applications a where a.id = (m ->> 'id')::uuid and a.cohort_id = x.cohort_id
      and a.status = 'Admitted' and private.track_ok(s, a.track_code));
    insert into attendance(session_id, application_id, status, marked_by, marked_at)
    values (x.id, (m ->> 'id')::uuid, m ->> 'status', s.full_name, now())
    on conflict (session_id, application_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.acad_news() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin']);
  c := private.current_cohort();
  return jsonb_build_object('my_track', s.track_code,
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name) order by t.sort) from tracks t
      where t.programme_code = c.programme_code), '[]'::jsonb),
    'news', coalesce((select jsonb_agg(to_jsonb(n) || jsonb_build_object('by', coalesce((select full_name from staff where email = n.created_by), n.created_by),
        'track', (select name from tracks where code = n.track_code)) order by n.created_at desc)
      from announcements n where n.cohort_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.acad_announce(p_title text, p_body text, p_track text default null, p_email boolean default true) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; n announcements; a applications; k int := 0; v_track text := nullif(p_track, '');
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  c := private.current_cohort();
  if not private.track_ok(s, v_track) then raise exception 'You can only post to your own track.'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'Add a title and a message.'; end if;
  insert into announcements(cohort_id, track_code, title, body, created_by, emailed)
  values (c.id, v_track, trim(p_title), trim(p_body), s.email, p_email) returning * into n;
  if p_email then
    for a in select * from applications where cohort_id = c.id and status = 'Admitted' and (v_track is null or track_code = v_track) loop
      perform private.queue_mail(a, 'announcement', jsonb_build_object('title', n.title, 'body', n.body,
        'by', s.full_name), private.site() || '/#/learn/news');
      k := k + 1;
    end loop;
  end if;
  return k;
end $$;

-- Staff accounts now have an optional track (for facilitators).
drop function if exists public.super_save_staff(text, text, text, boolean);
create or replace function public.super_save_staff(p_email text, p_name text, p_role text, p_active boolean default true, p_track text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; e text := lower(trim(p_email)); v_track text := nullif(p_track, '');
begin
  s := private.require_role(array['super']);
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add a valid email address.'; end if;
  if e like '%@students.jobnestcareers.com' then raise exception 'That address is reserved for student logins.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add their name.'; end if;
  if e = s.email and (p_role <> 'super' or not p_active) then raise exception 'You cannot remove your own Super Admin access.'; end if;
  insert into staff(email, full_name, role, active, track_code) values (e, trim(p_name), p_role, p_active, v_track)
  on conflict (email) do update set full_name = excluded.full_name, role = excluded.role, active = excluded.active, track_code = excluded.track_code;
  insert into audit_log(actor, text) values (s.email, format('set %s as %s%s (%s)', e, p_role,
    coalesce(' · ' || v_track, ''), case when p_active then 'active' else 'suspended' end));
  return public.super_staff();
end $$;

-- ---------- emails ----------
insert into email_templates(key, subject, body, cta) values
  ('portal_invite', 'Set up your Jobnest Academy student account',
   E'Hi {first},\n\nYour student portal is ready. It''s where you''ll find your weekly lessons, tasks, live sessions and announcements.\n\nUse the button below to choose your password. After that, sign in at any time with your matric number, {matric}, and that password.\n\nThe programme starts on {start}.',
   'Set up my account'),
  ('student_reset', 'Choose a new student portal password',
   E'Hi {first},\n\nSomeone asked to reset the password for matric number {matric}. Use the button below to choose a new one.\n\nIf this wasn''t you, you can ignore this email.',
   'Choose a new password'),
  ('graded', 'Your task "{task}" {result}',
   E'Hi {first},\n\nYour task "{task}" has been marked: {result}.\n\nFeedback: {feedback}',
   'Open my tasks'),
  ('announcement', '{title}',
   E'Hi {first},\n\n{body}\n\n{by}, Jobnest Academy',
   'Open the student portal')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

-- ---------- who may call what ----------
revoke execute on function private.student_login(text), private.caller_student(), private.require_student(), private.today(),
  private.week_start(cohorts, int), private.cur_week(cohorts), private.week_open(cohorts, int), private.track_ok(staff, text),
  private.clean_url(text), private.queue_mail(applications, text, jsonb, text), private.site() from public;
revoke execute on function public.student_account_prepare(text, uuid), public.student_account_saved(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.student_account_prepare(text, uuid), public.student_account_saved(text, uuid, uuid) to service_role;
revoke execute on function public.student_reset_request(text) from public;
grant execute on function public.student_reset_request(text) to anon, authenticated;
revoke execute on function public.student_campus(), public.student_submit(bigint, text, text), public.student_join(bigint),
  public.acad_students(), public.acad_invite(), public.acad_content(), public.acad_save_lesson(jsonb), public.acad_delete_lesson(bigint),
  public.acad_save_task(jsonb), public.acad_delete_task(bigint), public.acad_submissions(), public.acad_grade(bigint, text, int, text),
  public.acad_sessions(), public.acad_save_session(jsonb), public.acad_delete_session(bigint), public.acad_attendance(bigint),
  public.acad_mark_attendance(bigint, jsonb), public.acad_news(), public.acad_announce(text, text, text, boolean),
  public.super_save_staff(text, text, text, boolean, text) from public, anon;
grant execute on function public.student_campus(), public.student_submit(bigint, text, text), public.student_join(bigint),
  public.acad_students(), public.acad_invite(), public.acad_content(), public.acad_save_lesson(jsonb), public.acad_delete_lesson(bigint),
  public.acad_save_task(jsonb), public.acad_delete_task(bigint), public.acad_submissions(), public.acad_grade(bigint, text, int, text),
  public.acad_sessions(), public.acad_save_session(jsonb), public.acad_delete_session(bigint), public.acad_attendance(bigint),
  public.acad_mark_attendance(bigint, jsonb), public.acad_news(), public.acad_announce(text, text, text, boolean),
  public.super_save_staff(text, text, text, boolean, text) to authenticated;
