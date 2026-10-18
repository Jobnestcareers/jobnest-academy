-- Jobnest Academy: full database setup. Paste into Supabase → SQL Editor → Run.

-- Jobnest Academy: tables
-- Every table has row level security ON and no policies, so nobody can read or
-- write a table directly from the browser. All access goes through the functions
-- in 02_functions.sql, which check who is asking.

create table if not exists app_settings (
  key text primary key,
  value text not null
);

create table if not exists programmes (
  code text primary key,                 -- e.g. GEP
  name text not null,
  weeks int not null default 17,
  status text not null default 'Draft' check (status in ('Draft','Coming soon','Live','Closed')),
  tagline text,
  fee int not null default 85000,         -- naira, full payment
  inst_pct int not null default 6,        -- extra % when paying in 2 parts
  sort int not null default 0
);

create table if not exists cohorts (
  id bigint generated always as identity primary key,
  programme_code text not null references programmes(code),
  name text not null,                     -- e.g. Cohort 1 · Jan 2027
  start_date date not null,               -- Monday of Week 1
  year2 text not null,                    -- '27' for matric numbers
  batch text not null default 'A',
  applications_open boolean not null default true,
  pass_mark int not null default 60,      -- readiness pass mark (%)
  ready_n int not null default 5,         -- questions per category
  offer_days int not null default 7,      -- days to accept and pay
  inst_due_week int not null default 6,   -- second instalment due before this week
  is_current boolean not null default false
);

create table if not exists tracks (
  code text primary key,                  -- DAT, CSP, DMK, ADM
  programme_code text not null references programmes(code),
  name text not null,
  seats int not null default 30,
  paused boolean not null default false,
  sort int not null default 0
);

create table if not exists staff (
  email text primary key,                 -- always stored lower case
  full_name text not null,
  role text not null check (role in ('super','adm_admin','adm_officer','director','cohort_manager','facilitator','coach','academy_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,
  token uuid not null default gen_random_uuid(),   -- secret in the applicant's private link
  cohort_id bigint not null references cohorts(id),
  first_name text not null,
  surname text not null,
  email text not null,
  phone text not null,
  city text not null,
  edu text not null,
  nysc text not null,
  situation text not null,
  hours text not null,
  laptop text not null,
  internet text not null,
  motivation text not null,
  zuri_summary text,
  status text not null default 'Assessment pending',
  qset jsonb,                              -- questions given, with answers (never sent to the browser)
  answers jsonb,
  score int, score_digital int, score_comms int,
  officer_email text references staff(email),
  dc1_at timestamptz,
  dc1_note text,
  track_code text references tracks(code),
  wanted text,                             -- interest when no track matches
  rec jsonb,                               -- {d, why, by, at}
  decision text,
  decision_note text,
  decided_by text,
  decided_at timestamptz,
  offer_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applications_cohort_idx on applications(cohort_id);
create index if not exists applications_email_idx on applications(lower(email));

create table if not exists app_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  text text not null
);

create table if not exists slots (
  id bigint generated always as identity primary key,
  officer_email text not null references staff(email),
  starts_at timestamptz not null,
  application_id uuid unique references applications(id) on delete set null,
  unique (officer_email, starts_at)
);

create table if not exists readiness_bank (
  id bigint generated always as identity primary key,
  cat text not null check (cat in ('digital','comms')),
  concept text not null,
  question text not null,
  options jsonb not null                  -- first option is the correct one
);

create table if not exists email_templates (
  key text primary key,
  subject text not null,
  body text not null,
  cta text                                 -- button label in the email
);

create table if not exists outbox (
  id bigint generated always as identity primary key,
  application_id uuid references applications(id) on delete cascade,
  to_email text not null,
  template text not null,
  subject text not null,
  body text not null,
  link text,
  cta text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  text text not null
);

alter table app_settings enable row level security;
alter table programmes enable row level security;
alter table cohorts enable row level security;
alter table tracks enable row level security;
alter table staff enable row level security;
alter table applications enable row level security;
alter table app_events enable row level security;
alter table slots enable row level security;
alter table readiness_bank enable row level security;
alter table email_templates enable row level security;
alter table outbox enable row level security;
alter table audit_log enable row level security;


-- Jobnest Academy: functions
-- The browser can only call these functions. Each one checks who is calling.
-- Helpers live in the "private" schema, which the browser cannot reach.

create schema if not exists private;
revoke all on schema private from public;

-- ---------- helpers (private) ----------

create or replace function private.caller_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function private.caller_staff() returns staff
language sql stable security definer set search_path = public, pg_temp as $$
  select s.* from staff s where s.email = private.caller_email() and s.active
$$;

create or replace function private.require_role(roles text[]) returns staff
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.caller_staff();
  if s.email is null then raise exception 'Please sign in with a staff account.' using errcode = '42501'; end if;
  if s.role <> 'super' and not (s.role = any(roles)) then
    raise exception 'Your role cannot do this.' using errcode = '42501';
  end if;
  return s;
end $$;

create or replace function private.current_cohort() returns cohorts
language sql stable security definer set search_path = public, pg_temp as $$
  select * from cohorts where is_current order by id desc limit 1
$$;

create or replace function private.setting(k text, fallback text default null) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from app_settings where key = k), fallback)
$$;

create or replace function private.inst_total(p programmes) returns int
language sql immutable as $$
  select (round(p.fee * (1 + p.inst_pct / 100.0) / 1000) * 1000)::int
$$;

create or replace function private.seats_used(p_track text, p_cohort bigint) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from applications
  where track_code = p_track and cohort_id = p_cohort and status in ('Offer sent','Admitted')
$$;

create or replace function private.log(a uuid, actor text, msg text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into app_events(application_id, actor, text) values (a, actor, msg);
  update applications set updated_at = now() where id = a;
$$;

create or replace function private.naira(n numeric) returns text
language sql immutable as $$
  select '₦' || to_char(round(n), 'FM999,999,999')
$$;

create or replace function private.wat(t timestamptz, fmt text) returns text
language sql immutable as $$
  select trim(to_char(t at time zone 'Africa/Lagos', fmt))
$$;

-- Queue an email from a template. It is sent later by the email service.
create or replace function private.queue_email(a applications, tpl text, vars jsonb, go text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t email_templates; c cohorts; p programmes; subj text; body text; k text;
  v jsonb; link text;
begin
  select * into t from email_templates where key = tpl;
  if t.key is null then return; end if;
  select * into c from cohorts where id = a.cohort_id;
  select * into p from programmes where code = c.programme_code;
  v := jsonb_build_object(
    'first', a.first_name, 'ref', a.ref, 'programme', p.name, 'cohort', c.name,
    'track', coalesce((select name from tracks where code = a.track_code), ''),
    'pass', c.pass_mark::text, 'days', c.offer_days::text) || coalesce(vars, '{}'::jsonb);
  subj := t.subject; body := t.body;
  for k in select jsonb_object_keys(v) loop
    subj := replace(subj, '{' || k || '}', coalesce(v ->> k, ''));
    body := replace(body, '{' || k || '}', coalesce(v ->> k, ''));
  end loop;
  link := private.setting('site_url', 'https://academy.jobnestcareers.com') || '/#/a/' || a.ref || '/' || a.token || coalesce('/' || go, '');
  insert into outbox(application_id, to_email, template, subject, body, link, cta)
  values (a.id, a.email, tpl, subj, body, link, t.cta);
end $$;

-- What an applicant is allowed to see about their own application.
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
    'created_at', a.created_at)
  from cohorts c where c.id = a.cohort_id
$$;

create or replace function private.applicant(p_ref text, p_token uuid) returns applications
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  select * into a from applications where ref = upper(trim(p_ref)) and token = p_token;
  if a.id is null then raise exception 'We could not find that application. Check your link.' using errcode = 'P0002'; end if;
  return a;
end $$;

-- What staff see about an application (no token, no answers key).
create or replace function private.app_staff(a applications) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(a) - 'token' - 'qset' - 'answers'
    || jsonb_build_object(
      'track_name', (select name from tracks where code = a.track_code),
      'officer_name', (select full_name from staff where email = a.officer_email))
$$;

-- ---------- public: anyone ----------

create or replace function public.academy_info() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'programmes', coalesce((select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'weeks', p.weeks, 'status', p.status, 'tagline', p.tagline,
        'fee', p.fee, 'inst_total', private.inst_total(p)) order by p.sort, p.code)
      from programmes p where p.status <> 'Draft'), '[]'::jsonb),
    'cohort', (select jsonb_build_object('name', c.name, 'start_date', c.start_date,
        'applications_open', c.applications_open, 'pass_mark', c.pass_mark,
        'offer_days', c.offer_days, 'inst_due_week', c.inst_due_week, 'programme_code', c.programme_code)
      from cohorts c where c.is_current order by c.id desc limit 1),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name,
        'open', not t.paused) order by t.sort, t.code) from tracks t), '[]'::jsonb),
    'zuri_url', private.setting('zuri_url', ''),
    'website_url', private.setting('website_url', 'https://jobnestcareers.com'))
$$;

create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c cohorts; a applications; r text; f text;
  req text[] := array['first_name','surname','email','phone','city','edu','nysc','situation','hours','laptop','internet','motivation'];
begin
  c := private.current_cohort();
  if c.id is null or not c.applications_open then
    raise exception 'Applications are closed right now.' using errcode = 'P0001';
  end if;
  foreach f in array req loop
    if coalesce(trim(p ->> f), '') = '' then
      raise exception 'Please complete: %', replace(f, '_', ' ') using errcode = 'P0001';
    end if;
  end loop;
  if (p ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Add a valid email address.' using errcode = 'P0001';
  end if;
  if length(trim(p ->> 'first_name')) > 80 or length(trim(p ->> 'motivation')) > 2000
     or length(coalesce(p ->> 'zuri_summary', '')) > 4000 then
    raise exception 'Some answers are too long.' using errcode = 'P0001';
  end if;
  if exists (select 1 from applications where cohort_id = c.id and lower(email) = lower(trim(p ->> 'email'))
             and status not in ('Assessment failed','Not selected','Offer expired','Closed: no matching track','Deferred')) then
    raise exception 'You already have an application for this cohort. Use “Check an application” to continue it.' using errcode = 'P0001';
  end if;
  loop
    r := 'APP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when length(r) = 10 and not exists (select 1 from applications where ref = r);
  end loop;
  insert into applications(ref, cohort_id, first_name, surname, email, phone, city, edu, nysc, situation,
    hours, laptop, internet, motivation, zuri_summary)
  values (r, c.id, trim(p ->> 'first_name'), trim(p ->> 'surname'), lower(trim(p ->> 'email')), trim(p ->> 'phone'),
    trim(p ->> 'city'), p ->> 'edu', p ->> 'nysc', p ->> 'situation', p ->> 'hours', p ->> 'laptop',
    p ->> 'internet', trim(p ->> 'motivation'), nullif(trim(coalesce(p ->> 'zuri_summary', '')), ''))
  returning * into a;
  perform private.log(a.id, 'Applicant', case when a.zuri_summary is null then 'Application submitted (no Zuri summary)' else 'Application submitted with a Zuri summary' end);
  perform private.queue_email(a, 'received', '{}'::jsonb, 'assess');
  return jsonb_build_object('ref', a.ref, 'token', a.token);
end $$;

create or replace function public.applicant_view(p_ref text, p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  return private.app_public(a) || jsonb_build_object(
    'slots', case when a.status = 'Call to book' then coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'at', s.starts_at, 'officer', st.full_name) order by s.starts_at)
      from slots s join staff st on st.email = s.officer_email and st.active
      where s.application_id is null and s.starts_at > now() + interval '3 hours'), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Find an application by reference and email. Returns the private link parts.
create or replace function public.applicant_find(p_ref text, p_email text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ref', ref, 'token', token) from applications
  where ref = upper(trim(p_ref)) and lower(email) = lower(trim(p_email))
$$;

create or replace function public.assessment_start(p_ref text, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a applications; c cohorts; qs jsonb := '[]'::jsonb; v_cat text; v_con text; brow readiness_bank;
  opts jsonb; ord int[]; disp jsonb; correct int; i int;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Assessment pending' then raise exception 'The assessment is already done.' using errcode = 'P0001'; end if;
  if a.qset is null then
    select * into c from cohorts where id = a.cohort_id;
    foreach v_cat in array array['digital','comms'] loop
      for v_con in select d.concept from (select distinct b.concept from readiness_bank b where b.cat = v_cat) d order by random() limit c.ready_n loop
        select * into brow from readiness_bank b where b.cat = v_cat and b.concept = v_con order by random() limit 1;
        select array_agg(n order by random()) into ord from generate_series(0, jsonb_array_length(brow.options) - 1) n;
        disp := '[]'::jsonb; correct := null;
        for i in 1 .. array_length(ord, 1) loop
          disp := disp || jsonb_build_array(brow.options -> ord[i]);
          if ord[i] = 0 then correct := i - 1; end if;
        end loop;
        qs := qs || jsonb_build_array(jsonb_build_object('cat', v_cat, 'concept', v_con, 'q', brow.question, 'o', disp, 'a', correct));
      end loop;
    end loop;
    select coalesce(jsonb_agg(x order by random()), '[]'::jsonb) into qs from jsonb_array_elements(qs) x;
    update applications set qset = qs where id = a.id;
    a.qset := qs;
  end if;
  return (select jsonb_agg(jsonb_build_object('q', x ->> 'q', 'o', x -> 'o')) from jsonb_array_elements(a.qset) x);
end $$;

create or replace function public.assessment_submit(p_ref text, p_token uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a applications; c cohorts; n int; i int; ok int := 0; okd int := 0; okc int := 0; nd int := 0; nc int := 0;
  q jsonb; sc int; passed boolean;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Assessment pending' or a.qset is null then raise exception 'There is no assessment to submit.' using errcode = 'P0001'; end if;
  n := jsonb_array_length(a.qset);
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> n then
    raise exception 'Answer every question.' using errcode = 'P0001';
  end if;
  for i in 0 .. n - 1 loop
    q := a.qset -> i;
    if q ->> 'cat' = 'digital' then nd := nd + 1; else nc := nc + 1; end if;
    if (p_answers ->> i)::int = (q ->> 'a')::int then
      ok := ok + 1;
      if q ->> 'cat' = 'digital' then okd := okd + 1; else okc := okc + 1; end if;
    end if;
  end loop;
  select * into c from cohorts where id = a.cohort_id;
  sc := round(ok * 100.0 / n);
  passed := sc >= c.pass_mark;
  update applications set answers = p_answers, score = sc,
    score_digital = case when nd > 0 then round(okd * 100.0 / nd) end,
    score_comms = case when nc > 0 then round(okc * 100.0 / nc) end,
    status = case when passed then 'Call to book' else 'Assessment failed' end
  where id = a.id returning * into a;
  perform private.log(a.id, 'Applicant', format('Readiness assessment: %s%% (pass mark %s%%)', sc, c.pass_mark));
  perform private.queue_email(a, case when passed then 'passed' else 'failed' end,
    jsonb_build_object('score', sc::text), case when passed then 'book' else null end);
  return jsonb_build_object('score', sc, 'passed', passed);
end $$;

create or replace function public.book_call(p_ref text, p_token uuid, p_slot bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; s slots; o staff;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Call to book' then raise exception 'You can''t book a call right now.' using errcode = 'P0001'; end if;
  update slots set application_id = a.id
    where id = p_slot and application_id is null and starts_at > now() + interval '3 hours'
    returning * into s;
  if s.id is null then raise exception 'That time was just taken. Please choose another.' using errcode = 'P0001'; end if;
  select * into o from staff where email = s.officer_email;
  update applications set status = 'Call booked', dc1_at = s.starts_at, officer_email = s.officer_email
    where id = a.id returning * into a;
  perform private.log(a.id, 'Applicant', format('Discovery Call 1 booked for %s at %s WAT with %s',
    private.wat(s.starts_at, 'Dy DD Mon'), private.wat(s.starts_at, 'HH24:MI'), o.full_name));
  perform private.queue_email(a, 'booked', jsonb_build_object(
    'date', private.wat(s.starts_at, 'Dy, DD Mon'), 'longdate', private.wat(s.starts_at, 'FMDay, FMDD FMMonth'),
    'time', private.wat(s.starts_at, 'HH24:MI'), 'manager', o.full_name), 'status');
  return private.app_public(a);
end $$;

-- Lets the sign-up screen check that an email has been added as staff.
create or replace function public.staff_can_signup(p_email text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from staff where email = lower(trim(p_email)) and active)
$$;

-- ---------- staff ----------

create or replace function public.me() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when s.email is null then null
    else jsonb_build_object('email', s.email, 'name', s.full_name, 'role', s.role) end
  from (select (private.caller_staff()).*) s
$$;

create or replace function public.adm_applications() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts;
begin
  perform private.require_role(array['adm_admin','adm_officer']);
  c := private.current_cohort();
  return coalesce((select jsonb_agg(private.app_staff(a) order by a.created_at desc)
    from applications a where a.cohort_id = c.id), '[]'::jsonb);
end $$;

create or replace function public.adm_application(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  perform private.require_role(array['adm_admin','adm_officer']);
  select * into a from applications where id = p_id;
  if a.id is null then raise exception 'Application not found.'; end if;
  return private.app_staff(a) || jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'actor', e.actor, 'text', e.text) order by e.at)
      from app_events e where e.application_id = a.id), '[]'::jsonb),
    'emails', coalesce((select jsonb_agg(jsonb_build_object('at', o.created_at, 'subject', o.subject, 'sent', o.sent_at is not null) order by o.created_at)
      from outbox o where o.application_id = a.id), '[]'::jsonb));
end $$;

create or replace function public.adm_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts;
begin
  perform private.require_role(array['adm_admin','adm_officer']);
  c := private.current_cohort();
  return jsonb_build_object(
    'cohort', to_jsonb(c),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'seats', t.seats,
        'paused', t.paused, 'used', private.seats_used(t.code, c.id)) order by t.sort, t.code) from tracks t
        where t.programme_code = c.programme_code), '[]'::jsonb),
    'officers', coalesce((select jsonb_agg(jsonb_build_object('email', s.email, 'name', s.full_name) order by s.full_name)
      from staff s where s.role = 'adm_officer' and s.active), '[]'::jsonb),
    'unsent_emails', (select count(*) from outbox where sent_at is null));
end $$;

create or replace function public.officer_slots() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['adm_officer','adm_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', sl.id, 'at', sl.starts_at,
      'booked_by', (select first_name || ' ' || surname from applications where id = sl.application_id))
      order by sl.starts_at)
    from slots sl where sl.officer_email = s.email and sl.starts_at > now() - interval '1 day'), '[]'::jsonb);
end $$;

create or replace function public.officer_add_slots(p_times timestamptz[]) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; t timestamptz; n int := 0;
begin
  s := private.require_role(array['adm_officer','adm_admin']);
  foreach t in array p_times loop
    if t > now() then
      insert into slots(officer_email, starts_at) values (s.email, t) on conflict do nothing;
      if found then n := n + 1; end if;
    end if;
  end loop;
  insert into audit_log(actor, text) values (s.email, format('added %s call times', n));
  return n;
end $$;

create or replace function public.officer_remove_slot(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['adm_officer','adm_admin']);
  delete from slots where id = p_id and officer_email = s.email and application_id is null;
  if not found then raise exception 'That time is booked or not yours.'; end if;
end $$;

create or replace function public.officer_complete_call(p_id uuid, p_note text, p_track text, p_wanted text, p_rec text, p_why text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['adm_officer','adm_admin']);
  select * into a from applications where id = p_id for update;
  if a.id is null or a.status <> 'Call booked' then raise exception 'This call is not waiting to be completed.'; end if;
  if s.role = 'adm_officer' and a.officer_email <> s.email then raise exception 'This call belongs to another officer.'; end if;
  if coalesce(p_track, '') = '' then
    if coalesce(trim(p_wanted), '') = '' then raise exception 'Add what they are interested in.'; end if;
    update applications set status = 'Closed: no matching track', wanted = trim(p_wanted), dc1_note = p_note
      where id = a.id returning * into a;
    perform private.log(a.id, s.full_name, 'Discovery Call 1 completed · no available track (interested in ' || a.wanted || ')');
    perform private.queue_email(a, 'notrack', jsonb_build_object('interest', a.wanted), 'status');
  else
    if not exists (select 1 from tracks where code = p_track) then raise exception 'Unknown track.'; end if;
    if p_rec not in ('offer','waitlist','decline') then raise exception 'Choose offer, waitlist or decline.'; end if;
    if coalesce(trim(p_why), '') = '' then raise exception 'Add one line on why.'; end if;
    update applications set status = 'Under review', track_code = p_track, dc1_note = p_note,
      rec = jsonb_build_object('d', p_rec, 'why', trim(p_why), 'by', s.full_name, 'at', now())
      where id = a.id returning * into a;
    perform private.log(a.id, s.full_name, 'Discovery Call 1 completed · track agreed: ' || (select name from tracks where code = p_track));
    perform private.log(a.id, s.full_name, 'Recommended to the Admissions Admin: ' || p_rec || ' · ' || trim(p_why));
    perform private.queue_email(a, 'callthanks', '{}'::jsonb, 'status');
  end if;
  return private.app_staff(a);
end $$;

create or replace function public.admin_decide(p_id uuid, p_decision text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; c cohorts; t tracks; is_full boolean;
begin
  s := private.require_role(array['adm_admin']);
  select * into a from applications where id = p_id for update;
  if a.id is null or a.status not in ('Under review','Waitlisted') then raise exception 'This application is not waiting for a decision.'; end if;
  select * into c from cohorts where id = a.cohort_id;
  select * into t from tracks where code = a.track_code;
  if p_decision = 'offer' then
    is_full := private.seats_used(a.track_code, c.id) >= t.seats;
    if is_full then
      update applications set status = 'Waitlisted', decision = 'waitlist', decided_by = s.full_name, decided_at = now(),
        decision_note = 'Track full' where id = a.id returning * into a;
      perform private.log(a.id, s.full_name, 'Offer approved but the track is full: waitlisted');
      perform private.queue_email(a, 'waitlist_full', '{}'::jsonb, 'status');
    else
      update applications set status = 'Offer sent', decision = 'offer', decided_by = s.full_name, decided_at = now(),
        offer_deadline = now() + make_interval(days => c.offer_days), decision_note = p_note where id = a.id returning * into a;
      perform private.log(a.id, s.full_name, 'Decision: offer sent');
      perform private.queue_email(a, 'offer', jsonb_build_object('deadline', private.wat(a.offer_deadline, 'FMDay, FMDD FMMonth')), 'status');
    end if;
  elsif p_decision = 'waitlist' then
    update applications set status = 'Waitlisted', decision = 'waitlist', decided_by = s.full_name, decided_at = now(), decision_note = p_note
      where id = a.id returning * into a;
    perform private.log(a.id, s.full_name, 'Decision: waitlisted');
    perform private.queue_email(a, 'waitlist', '{}'::jsonb, 'status');
  elsif p_decision = 'reject' then
    update applications set status = 'Not selected', decision = 'reject', decided_by = s.full_name, decided_at = now(), decision_note = p_note
      where id = a.id returning * into a;
    perform private.log(a.id, s.full_name, 'Decision: not selected');
    perform private.queue_email(a, 'notselected', '{}'::jsonb, 'status');
  elsif p_decision = 'defer' then
    update applications set status = 'Deferred', decision = 'defer', decided_by = s.full_name, decided_at = now(), decision_note = p_note
      where id = a.id returning * into a;
    perform private.log(a.id, s.full_name, 'Decision: deferred to the next batch');
    perform private.queue_email(a, 'deferred', jsonb_build_object('batch', 'next'), 'status');
  else
    raise exception 'Unknown decision.';
  end if;
  return private.app_staff(a);
end $$;

create or replace function public.admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; p programmes;
begin
  perform private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  select * into p from programmes where code = c.programme_code;
  return jsonb_build_object('cohort', to_jsonb(c), 'programme', to_jsonb(p) || jsonb_build_object('inst_total', private.inst_total(p)),
    'tracks', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort, t.code) from tracks t where t.programme_code = c.programme_code), '[]'::jsonb),
    'site', jsonb_build_object('site_url', private.setting('site_url', ''), 'zuri_url', private.setting('zuri_url', ''),
      'website_url', private.setting('website_url', '')));
end $$;

create or replace function public.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; t jsonb; k text;
begin
  s := private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  if p ? 'cohort' then
    update cohorts set
      name = coalesce(nullif(trim(p #>> '{cohort,name}'), ''), name),
      start_date = coalesce((p #>> '{cohort,start_date}')::date, start_date),
      year2 = coalesce(nullif(p #>> '{cohort,year2}', ''), year2),
      batch = coalesce(nullif(upper(p #>> '{cohort,batch}'), ''), batch),
      applications_open = coalesce((p #>> '{cohort,applications_open}')::boolean, applications_open),
      pass_mark = least(100, greatest(0, coalesce((p #>> '{cohort,pass_mark}')::int, pass_mark))),
      ready_n = least(6, greatest(1, coalesce((p #>> '{cohort,ready_n}')::int, ready_n))),
      offer_days = least(30, greatest(1, coalesce((p #>> '{cohort,offer_days}')::int, offer_days))),
      inst_due_week = coalesce((p #>> '{cohort,inst_due_week}')::int, inst_due_week)
    where id = c.id;
  end if;
  if p ? 'programme' then
    update programmes set
      fee = coalesce((p #>> '{programme,fee}')::int, fee),
      inst_pct = coalesce((p #>> '{programme,inst_pct}')::int, inst_pct)
    where code = c.programme_code;
  end if;
  if p ? 'tracks' then
    for t in select * from jsonb_array_elements(p -> 'tracks') loop
      update tracks set seats = greatest(0, coalesce((t ->> 'seats')::int, seats)),
        paused = coalesce((t ->> 'paused')::boolean, paused) where code = t ->> 'code';
    end loop;
  end if;
  if p ? 'site' and s.role in ('super','adm_admin','academy_admin') then
    for k in select jsonb_object_keys(p -> 'site') loop
      if k in ('site_url','zuri_url','website_url') then
        insert into app_settings(key, value) values (k, p #>> array['site', k])
        on conflict (key) do update set value = excluded.value;
      end if;
    end loop;
  end if;
  insert into audit_log(actor, text) values (s.email, 'changed admissions settings');
  return public.admin_settings();
end $$;

create or replace function public.admin_outbox() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['adm_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'to', o.to_email, 'subject', o.subject, 'body', o.body,
      'link', o.link, 'cta', o.cta, 'at', o.created_at, 'sent_at', o.sent_at, 'error', o.error) order by o.created_at desc)
    from (select * from outbox order by created_at desc limit 200) o), '[]'::jsonb);
end $$;

-- Marks an email as sent by hand (until the email service is connected).
create or replace function public.admin_mark_sent(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['adm_admin']);
  update outbox set sent_at = now() where id = p_id and sent_at is null;
end $$;

-- ---------- Super Admin ----------

create or replace function public.super_staff() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['super']);
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.role, s.full_name) from staff s), '[]'::jsonb);
end $$;

create or replace function public.super_save_staff(p_email text, p_name text, p_role text, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; e text := lower(trim(p_email));
begin
  s := private.require_role(array['super']);
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add a valid email address.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Add their name.'; end if;
  if e = s.email and (p_role <> 'super' or not p_active) then raise exception 'You cannot remove your own Super Admin access.'; end if;
  insert into staff(email, full_name, role, active) values (e, trim(p_name), p_role, p_active)
  on conflict (email) do update set full_name = excluded.full_name, role = excluded.role, active = excluded.active;
  insert into audit_log(actor, text) values (s.email, format('set %s as %s (%s)', e, p_role, case when p_active then 'active' else 'suspended' end));
  return public.super_staff();
end $$;

create or replace function public.super_audit() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['super']);
  return coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc) from (select * from audit_log order by at desc limit 200) l), '[]'::jsonb);
end $$;

-- ---------- who may call what ----------
-- Functions in public are callable through the API; helpers in private are not.
revoke execute on all functions in schema private from public;
grant usage on schema private to postgres;

revoke execute on all functions in schema public from public;
grant execute on function public.academy_info(), public.submit_application(jsonb), public.applicant_view(text, uuid),
  public.applicant_find(text, text), public.assessment_start(text, uuid), public.assessment_submit(text, uuid, jsonb),
  public.book_call(text, uuid, bigint), public.staff_can_signup(text)
  to anon, authenticated;
grant execute on function public.me(), public.adm_applications(), public.adm_application(uuid), public.adm_overview(),
  public.officer_slots(), public.officer_add_slots(timestamptz[]), public.officer_remove_slot(bigint),
  public.officer_complete_call(uuid, text, text, text, text, text), public.admin_decide(uuid, text, text),
  public.admin_settings(), public.admin_save_settings(jsonb), public.admin_outbox(), public.admin_mark_sent(bigint),
  public.super_staff(), public.super_save_staff(text, text, text, boolean), public.super_audit()
  to authenticated;


-- Jobnest Academy: starting data
-- BEFORE RUNNING: replace the two values on the next lines with your own email and name.
-- That email becomes the first Super Admin, who can then add every other staff member.
do $$ begin
  insert into staff(email, full_name, role) values (lower('CHANGE-ME@example.com'), 'CHANGE ME', 'super')
  on conflict (email) do update set role = 'super', active = true;
end $$;

insert into app_settings(key, value) values
  ('site_url', 'https://academy.jobnestcareers.com'),
  ('website_url', 'https://jobnestcareers.com'),
  ('zuri_url', 'https://claude.ai/artifact/Ag9JUMv7Zs1BLpoSctN15v')
on conflict (key) do nothing;

insert into programmes(code, name, weeks, status, tagline, fee, inst_pct, sort) values
  ('GEP', 'Graduate Employability Programme', 17, 'Live', 'From graduate to work-ready: skills, a client project, an internship and coaching.', 85000, 6, 1)
on conflict (code) do nothing;

insert into cohorts(programme_code, name, start_date, year2, batch, applications_open, is_current)
select 'GEP', 'Cohort 1 · Jan 2027', date '2027-01-11', '27', 'A', true, true
where not exists (select 1 from cohorts);

insert into tracks(code, programme_code, name, seats, sort) values
  ('ADM', 'GEP', 'Administrative Support', 30, 1), ('CSP', 'GEP', 'Customer Support', 30, 2),
  ('DAT', 'GEP', 'Data Analysis', 30, 3), ('DMK', 'GEP', 'Digital Marketing', 30, 4)
on conflict (code) do nothing;

insert into readiness_bank(cat, concept, question, options)
select * from (values
  ('digital', 'Spreadsheets', 'Which of these is a spreadsheet tool?', '["Microsoft Excel", "Adobe Photoshop", "Zoom", "WhatsApp"]'::jsonb),
  ('digital', 'Spreadsheets', 'You need to add up 50 numbers quickly. Which tool is best?', '["Google Sheets", "Microsoft Paint", "Notepad", "Instagram"]'::jsonb),
  ('digital', 'Spreadsheets', 'In a spreadsheet, what is a “cell”?', '["The box where a row and a column meet", "A type of laptop battery", "A saved file", "The title of a chart"]'::jsonb),
  ('digital', 'Sharing files', 'What is the best way to share a large file with a colleague?', '["Share a Google Drive link", "Send it in 10 WhatsApp messages", "Print it", "Read it out on a call"]'::jsonb),
  ('digital', 'Sharing files', 'Three teammates need to edit the same document at the same time. What should you use?', '["A shared Google Doc", "Email a Word file to each person", "Send it by SMS", "Save it on your desktop only"]'::jsonb),
  ('digital', 'Sharing files', 'A colleague says your Drive link shows “Access denied”. What is the most likely fix?', '["Change the sharing settings to give them access", "Restart your laptop", "Send a screenshot of the link", "Rename the file"]'::jsonb),
  ('digital', 'Keyboard shortcuts', 'Which keyboard shortcut copies selected text on Windows?', '["Ctrl + C", "Ctrl + V", "Ctrl + Z", "Alt + F4"]'::jsonb),
  ('digital', 'Keyboard shortcuts', 'You deleted a sentence by mistake. Which shortcut undoes it?', '["Ctrl + Z", "Ctrl + P", "Ctrl + S", "Ctrl + A"]'::jsonb),
  ('digital', 'Keyboard shortcuts', 'Which shortcut saves the document you''re working on?', '["Ctrl + S", "Ctrl + X", "Ctrl + B", "Ctrl + F"]'::jsonb),
  ('digital', 'Staying safe online', 'Which password is the safest?', '["Lagos!Rain#2026", "123456", "password", "yourname"]'::jsonb),
  ('digital', 'Staying safe online', 'An email says “Your bank account is locked. Click here and enter your PIN.” What should you do?', '["Don''t click. Contact the bank through its official app or number", "Click and enter your PIN quickly", "Forward it to friends", "Reply with your PIN"]'::jsonb),
  ('digital', 'Staying safe online', 'You used a shared office computer. What''s the safest thing to do when you finish?', '["Sign out of your accounts", "Leave everything signed in", "Save your password in a note on the desktop", "Tell a colleague your password"]'::jsonb),
  ('digital', 'Email basics', 'In an email, what does CC mean?', '["Send a copy to someone who should be kept informed", "Cancel the email", "Check the spelling", "Close the chat"]'::jsonb),
  ('digital', 'Email basics', 'You need to attach your CV to an email. What do you click?', '["The paperclip (attach) icon", "The bin icon", "The star icon", "The print icon"]'::jsonb),
  ('digital', 'Email basics', 'You can''t find an important email in your inbox. Where should you look first?', '["The Spam folder and the search bar", "Your laptop''s recycle bin", "Your WhatsApp status", "The calculator app"]'::jsonb),
  ('digital', 'Online meetings & search', 'You join a video call after it has started. What should you do first?', '["Join on mute and listen", "Unmute and greet everyone loudly", "Start sharing your screen", "Leave and rejoin a few times"]'::jsonb),
  ('digital', 'Online meetings & search', 'Your internet is unstable during a video call. What''s the best move?', '["Turn off your camera and tell the host in the chat", "Leave without saying anything", "Keep talking while frozen", "Turn up your volume"]'::jsonb),
  ('digital', 'Online meetings & search', 'You want only PDF reports about unemployment in Nigeria. Which Google search works best?', '["Nigeria unemployment report filetype:pdf", "pdf pdf pdf", "How are you Google", "unemployment.jpg"]'::jsonb),
  ('comms', 'Clear subject lines', 'Which email subject line is clearest?', '["Request: move Monday''s meeting to 2pm", "Hi", "Urgent!!!", "Quick one"]'::jsonb),
  ('comms', 'Clear subject lines', 'Which subject line best tells a manager what your email is about?', '["Weekly sales report: 7–11 Oct", "Report", "Please see", "Hello sir"]'::jsonb),
  ('comms', 'Clear subject lines', 'Which subject line is best for a job application?', '["Application: Customer Support Agent – Tobi Ade", "Pls check my CV", "Job!!!", "Hi"]'::jsonb),
  ('comms', 'Reading carefully', 'Read: “Ada submits her weekly report every Friday by 5pm. This week Friday is a public holiday, so her manager asked for it on Thursday.” When should Ada submit this week?', '["Thursday", "Friday by 5pm", "Next Monday", "Any time"]'::jsonb),
  ('comms', 'Reading carefully', 'Read: “Training starts at 9am. Please arrive 15 minutes early to set up your laptop.” What time should you arrive?', '["8:45am", "9:00am", "9:15am", "8:00am"]'::jsonb),
  ('comms', 'Reading carefully', 'Read: “Submit the form by Friday. Late forms are only accepted with a manager''s approval.” It''s Saturday and you haven''t submitted. What should you do?', '["Ask your manager for approval, then submit", "Submit it without telling anyone", "Do nothing", "Wait until next month"]'::jsonb),
  ('comms', 'Handling problems', 'You''ll miss a deadline. What should you do?', '["Tell your manager early and give a new time", "Say nothing and hope", "Submit unfinished work", "Blame a colleague"]'::jsonb),
  ('comms', 'Handling problems', 'You don''t understand a task your supervisor gave you. What''s best?', '["Ask a clear question early", "Guess and hope it''s right", "Wait until the deadline", "Ask a friend to do it"]'::jsonb),
  ('comms', 'Handling problems', 'A customer is angry about a late delivery. What''s the best first response?', '["Acknowledge their frustration and say what you''ll do next", "Tell them it isn''t your fault", "Ignore the message", "Reply in capital letters"]'::jsonb),
  ('comms', 'Professional tone', 'Which message to a manager sounds most professional?', '["Good morning Mrs Bello, could we meet at 3pm today to discuss the report?", "Hey, we need to talk", "Abeg see me later", "Why haven''t you replied???"]'::jsonb),
  ('comms', 'Professional tone', 'Which WhatsApp message to a new client is most appropriate?', '["Good afternoon Mr Eze, this is Tobi from Jobnest. Is now a good time to share the proposal?", "Hello dear 😘", "Oga, how far?", "Reply me"]'::jsonb),
  ('comms', 'Professional tone', 'Which is the best way to end a formal email?', '["Kind regards, Tobi Ade", "Bye bye", "Later!", "xoxo"]'::jsonb),
  ('comms', 'Correct English', 'Which sentence is correct?', '["I have attached the report for your review.", "I have attach the report for you review.", "Me attached report reviewing.", "I has attached the reports for your review."]'::jsonb),
  ('comms', 'Correct English', 'Which sentence is correct?', '["Their team submitted the project on time.", "There team submitted the project on time.", "They''re team submitted the project on time.", "Theirs team submitted the project on time."]'::jsonb),
  ('comms', 'Correct English', 'Which sentence is correct?', '["Please let me know if you have any questions.", "Please let me knows if you has any question.", "Please let I know if you have any questions.", "Please letting me know if any questions."]'::jsonb),
  ('comms', 'Following instructions', 'Your manager says: “Send me the summary in three bullet points by noon.” What should you send?', '["Three short bullet points before 12pm", "A five-page essay at 5pm", "A voice note", "Nothing until they ask again"]'::jsonb),
  ('comms', 'Following instructions', 'Which is the best one-line summary of: “Sales rose in March because of the new ad campaign, but fell in April when the campaign ended”?', '["Sales rose with the campaign and fell when it ended", "Sales always rise in April", "The ad campaign failed", "March is a bad month"]'::jsonb),
  ('comms', 'Following instructions', 'A form says “Write your surname in CAPITAL LETTERS”. Your name is Tobi Ade. What do you write?', '["ADE", "ade", "Tobi", "TOBI ADE"]'::jsonb)
) v where not exists (select 1 from readiness_bank);

insert into email_templates(key, subject, body, cta) values
  ('received', 'We''ve received your application ({ref})', 'Hi {first},

Thank you for applying to the {programme}. Your application number is {ref}. Keep it safe: you''ll need it with your surname to come back to your application.

Your next step is a 5-minute readiness assessment on basic digital skills and communication. You can take it now or any time in the next 3 days.', 'Take the readiness assessment'),
  ('passed', 'You passed! Book your Discovery Call', 'Hi {first},

Well done: you scored {score}% on the readiness assessment.

Next, book a 15-minute Discovery Call with Admissions. We''ll talk about what you want to do and agree the track that fits you.', 'Book your Discovery Call'),
  ('failed', 'Your readiness assessment result', 'Hi {first},

Thank you for taking the readiness assessment. You scored {score}%, and the pass mark is {pass}%, so we can''t move your application forward this time.

You''re welcome to apply again for the next batch. Meanwhile, you can join the Jobnest Community waitlist on jobnestcareers.com. It opens soon, with resources and people building careers like you.', 'View your application'),
  ('times', 'New Discovery Call times are available', 'Hi {first},

Admissions has opened new times for Discovery Call 1. Pick the one that suits you; it takes 15 minutes.', 'Book your Discovery Call'),
  ('booked', 'Your Discovery Call is booked: {date}, {time} WAT', 'Hi {first},

Your 15-minute Discovery Call with {manager} is booked for {longdate} at {time} WAT.

The video link will be sent 30 minutes before the call. Come ready to talk about what you enjoy and what you want to do. This is where we agree your track together.', 'View your application'),
  ('callthanks', 'Thanks for your Discovery Call', 'Hi {first},

Thank you for the call. You agreed on the {track} track.

Admissions is now reviewing your application. You''ll hear from us within 3 working days.', 'View your application'),
  ('notrack', 'Thank you for your Discovery Call', 'Hi {first},

Thank you for your time on the call. You''re interested in {interest}, and the {programme} doesn''t offer that track yet.

This isn''t a judgement of you. We''ve noted your interest and will invite you first if we launch it. No payment was taken.

Meanwhile, you can join the Jobnest Community waitlist on jobnestcareers.com. It opens soon, with resources and people building careers like you.', 'View your application'),
  ('offer', 'Your offer of admission: {track}', 'Hi {first},

Congratulations! You''ve been offered a place on the {track} track of the {programme}, {cohort}.

To accept, pay in full or the first of 2 instalments by {deadline}. After that the seat goes to the waitlist.', 'Accept and pay'),
  ('waitlist_full', 'You''re on the waitlist', 'Hi {first},

The {track} track is full right now, so you''re on the waitlist. If a seat opens, we''ll email you an offer straight away.', 'View your application'),
  ('waitlist', 'You''re on the waitlist', 'Hi {first},

Thank you for your patience. You''re on the waitlist for the {track} track, and we''ll email you if a seat opens.', 'View your application'),
  ('notselected', 'An update on your application', 'Hi {first},

Thank you for applying. We''re not able to offer you a place this time.

You''re welcome to apply for the next batch.', 'View your application'),
  ('deferred', 'Your application has moved to the next batch', 'Hi {first},

Your application has been moved to batch {batch}. We''ll contact you when admissions for that batch open.', 'View your application'),
  ('reminder', 'Reminder: your offer expires in {days}', 'Hi {first},

Just a reminder that your offer for the {track} track expires on {deadline}.

You can pay in full or in 2 instalments, and discount codes are applied at payment.', 'Accept and pay'),
  ('expired', 'Your offer has expired', 'Hi {first},

Your offer for the {track} track has expired because payment wasn''t made by {deadline}, so the seat has gone to someone on the waitlist.

If you''d still like a place, reply to this email and Admissions will let you know your options.', 'View your application'),
  ('declined', 'You''ve declined your offer', 'Hi {first},

We''ve recorded that you declined your offer. Your seat will go to someone on the waitlist.

If your plans change, you''re welcome to apply for the next batch.', 'View your application'),
  ('admitted', 'Welcome to Jobnest Academy! Your matric number is {matric}', 'Hi {first},

Payment received: {amount}. You are now admitted into the {track} track of the {programme}, {cohort}.

Your matric number is {matric}. Use the button below to set your password, then sign in to the student portal with your matric number and that password.', 'Set your password'),
  ('invite', 'Good news: a {interest} track is opening', 'Hi {first},

When we spoke, you told us you''re interested in {interest}. Jobnest Academy is opening a {interest} track, and you''re one of the first people we''re inviting.

Your Zuri summary and call notes are saved, so applying takes about 5 minutes.', 'Apply now'),
  ('apps_open', 'Applications for the {programme} are open', 'Hi {first},

You asked us to tell you when applications open. They''re open now.

Start with a short chat with Zuri if you''re not sure what you want to do yet, then apply in about 5 minutes.', 'Apply now')
on conflict (key) do nothing;


-- Jobnest Academy: automatic email sending (run once in Supabase → SQL Editor)
alter table outbox add column if not exists attempts int not null default 0;
create index if not exists outbox_unsent_idx on outbox(created_at) where sent_at is null;

create or replace function public.admin_outbox() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['adm_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'to', o.to_email, 'subject', o.subject, 'body', o.body,
      'link', o.link, 'cta', o.cta, 'at', o.created_at, 'sent_at', o.sent_at, 'error', o.error, 'attempts', o.attempts) order by o.created_at desc)
    from (select * from outbox order by created_at desc limit 200) o), '[]'::jsonb);
end $$;

-- Lets the Admin retry an email that failed to send.
create or replace function public.admin_retry_email(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['adm_admin']);
  update outbox set attempts = 0, error = null where id = p_id and sent_at is null;
end $$;
revoke execute on function public.admin_retry_email(bigint) from public;
grant execute on function public.admin_retry_email(bigint) to authenticated;


-- Jobnest Academy: payments, matric numbers and admission letters (run once in Supabase → SQL Editor)
-- Safe to run more than once.

-- ---------- tables ----------
alter table applications add column if not exists plan text check (plan in ('full','two'));
alter table applications add column if not exists paid_total int not null default 0;
alter table applications add column if not exists matric text unique;
alter table applications add column if not exists admitted_at timestamptz;
alter table applications add column if not exists reminded_at timestamptz;
alter table applications add column if not exists balance_reminded_at timestamptz;
alter table cohorts add column if not exists matric_next int not null default 1;

create table if not exists payments (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  reference text unique not null,          -- sent to Paystack, or MANUAL-… for payments recorded by staff
  part text not null check (part in ('full','part1','part2')),
  amount int not null,                     -- naira expected
  amount_paid int,                         -- naira actually received
  status text not null default 'pending' check (status in ('pending','success','failed','abandoned','reversed')),
  channel text,                            -- card, bank_transfer, ussd, manual …
  provider_id text,
  note text,
  recorded_by text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_app_idx on payments(application_id);
alter table payments enable row level security;

insert into app_settings(key, value) values ('signer_name', ''), ('signer_title', 'Programme Director')
on conflict (key) do nothing;

-- ---------- helpers ----------
-- Fees for an application: full fee, the 2-part total and each part, and when part 2 is due.
create or replace function private.fees(a applications) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'fee', p.fee,
    'two_total', private.inst_total(p),
    'part1', (ceil(private.inst_total(p) / 2.0 / 500) * 500)::int,
    'part2', private.inst_total(p) - (ceil(private.inst_total(p) / 2.0 / 500) * 500)::int,
    'due_date', c.start_date + (c.inst_due_week - 1) * 7 - 1,
    'plan_total', case a.plan when 'full' then p.fee when 'two' then private.inst_total(p) end)
  from cohorts c join programmes p on p.code = c.programme_code where c.id = a.cohort_id
$$;

-- Applies a successful payment: the first one admits and gives a matric number.
create or replace function private.apply_payment(y payments) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; f jsonb; n int; amt int := coalesce(y.amount_paid, y.amount); bal int;
begin
  select * into a from applications where id = y.application_id for update;
  select * into c from cohorts where id = a.cohort_id for update;
  if a.status in ('Offer sent','Offer expired') and y.part in ('full','part1') then
    update cohorts set matric_next = matric_next + 1 where id = c.id returning matric_next - 1 into n;
    update applications set status = 'Admitted', plan = case when y.part = 'full' then 'full' else 'two' end,
      paid_total = paid_total + amt, admitted_at = now(),
      matric = c.programme_code || '/' || c.year2 || c.batch || '/' || lpad(n::text, 3, '0')
      where id = a.id returning * into a;
    f := private.fees(a);
    bal := greatest(0, (f ->> 'plan_total')::int - a.paid_total);
    perform private.log(a.id, 'Payment', format('Paid %s (%s) · admitted · matric number %s', private.naira(amt),
      case when y.part = 'full' then 'in full' else 'first instalment' end, a.matric));
    perform private.queue_email(a, 'admitted', jsonb_build_object('amount', private.naira(amt), 'matric', a.matric,
      'start', to_char(c.start_date, 'FMDay FMDD FMMonth YYYY'),
      'balance_line', case when bal > 0 then format(E'\n\nYour second instalment of %s is due by %s. You can pay it from your application page.',
        private.naira(bal), to_char((f ->> 'due_date')::date, 'FMDay FMDD FMMonth YYYY')) else '' end), 'letter');
  elsif a.status = 'Admitted' and y.part = 'part2' then
    update applications set paid_total = paid_total + amt where id = a.id returning * into a;
    f := private.fees(a);
    bal := greatest(0, (f ->> 'plan_total')::int - a.paid_total);
    perform private.log(a.id, 'Payment', format('Paid %s · %s', private.naira(amt),
      case when bal = 0 then 'fees paid in full' else 'still owes ' || private.naira(bal) end));
    if bal = 0 then
      perform private.queue_email(a, 'paid_full', jsonb_build_object('amount', private.naira(amt), 'matric', a.matric), 'letter');
    end if;
  else
    -- Paid twice, or paid after declining: keep the money on record and flag it for a refund check.
    update applications set paid_total = paid_total + amt where id = a.id;
    perform private.log(a.id, 'Payment', format('Received %s while the application was "%s". Check it and refund if needed.', private.naira(amt), a.status));
    insert into audit_log(actor, text) values ('Payment', format('%s paid %s while "%s": check it and refund if needed', a.ref, private.naira(amt), a.status));
  end if;
end $$;

-- What an applicant is allowed to see about their own application (now with fees and payments).
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
    'fees', private.fees(a),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', coalesce(y.amount_paid, y.amount), 'part', y.part,
        'paid_at', y.paid_at, 'channel', y.channel) order by y.paid_at)
      from payments y where y.application_id = a.id and y.status = 'success'), '[]'::jsonb),
    'signer_name', case when a.status = 'Admitted' then private.setting('signer_name', '') end,
    'signer_title', case when a.status = 'Admitted' then private.setting('signer_title', 'Programme Director') end)
  from cohorts c join programmes p on p.code = c.programme_code where c.id = a.cohort_id
$$;

-- ---------- applicant ----------
create or replace function public.applicant_decline(p_ref text, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Offer sent' then raise exception 'There is no open offer to decline.'; end if;
  update applications set status = 'Offer declined' where id = a.id returning * into a;
  perform private.log(a.id, 'Applicant', 'Declined the offer');
  perform private.queue_email(a, 'declined', '{}'::jsonb, 'status');
  return private.app_public(a);
end $$;

-- ---------- server only (called by the Netlify payment functions with the secret key) ----------
create or replace function public.pay_prepare(p_ref text, p_token uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; f jsonb; v_part text; v_amt int; r text;
begin
  a := private.applicant(p_ref, p_token);
  f := private.fees(a);
  if a.status = 'Offer sent' then
    if a.offer_deadline < now() then
      raise exception 'Your offer deadline has passed. Reply to your offer email and Admissions will help.';
    end if;
    if p_plan = 'full' then v_part := 'full'; v_amt := (f ->> 'fee')::int;
    elsif p_plan = 'two' then v_part := 'part1'; v_amt := (f ->> 'part1')::int;
    else raise exception 'Choose how you want to pay.'; end if;
  elsif a.status = 'Admitted' and a.plan = 'two' and a.paid_total < (f ->> 'plan_total')::int then
    v_part := 'part2'; v_amt := (f ->> 'plan_total')::int - a.paid_total;
  else
    raise exception 'There is nothing to pay on this application right now.';
  end if;
  r := 'JN-' || substr(a.ref, 5) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into payments(application_id, reference, part, amount) values (a.id, r, v_part, v_amt);
  return jsonb_build_object('reference', r, 'amount', v_amt, 'email', a.email, 'part', v_part, 'ref', a.ref,
    'name', a.first_name || ' ' || a.surname);
end $$;

create or replace function public.pay_result(p_reference text, p_status text, p_amount_kobo bigint,
  p_channel text default null, p_provider_id text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare y payments; a applications; outcome text;
begin
  select * into y from payments where reference = p_reference for update;
  if y.id is null then raise exception 'Unknown payment reference.'; end if;
  select * into a from applications where id = y.application_id;
  if y.status = 'success' then
    outcome := 'success';                                   -- already recorded (webhook and return both arrive)
  elsif p_status = 'success' then
    if coalesce(p_amount_kobo, 0) < y.amount::bigint * 100 then
      update payments set status = 'failed', channel = p_channel, provider_id = p_provider_id,
        note = format('Received %s, expected %s', private.naira(p_amount_kobo / 100.0), private.naira(y.amount)) where id = y.id;
      insert into audit_log(actor, text) values ('Payment', format('%s: %s received less than expected on %s. Check it and refund.', a.ref, private.naira(p_amount_kobo / 100.0), y.reference));
      outcome := 'mismatch';
    else
      update payments set status = 'success', paid_at = now(), channel = p_channel, provider_id = p_provider_id,
        amount_paid = (p_amount_kobo / 100)::int where id = y.id returning * into y;
      perform private.apply_payment(y);
      outcome := 'success';
    end if;
  else
    update payments set status = case when p_status in ('failed','abandoned','reversed') then p_status else 'failed' end
      where id = y.id and status = 'pending';
    outcome := 'not_paid';
  end if;
  return jsonb_build_object('outcome', outcome, 'ref', a.ref, 'token', a.token);
end $$;

-- Runs every minute from the email service: expires unpaid offers and sends reminders.
create or replace function public.jobs_tick() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; f jsonb; ne int := 0; nr int := 0; nb int := 0; hrs numeric;
begin
  for a in select * from applications where status = 'Offer sent' and offer_deadline < now() for update skip locked loop
    -- don't expire someone who is paying right now
    continue when exists (select 1 from payments where application_id = a.id and status = 'pending' and created_at > now() - interval '30 minutes');
    update applications set status = 'Offer expired' where id = a.id returning * into a;
    perform private.log(a.id, 'System', 'Offer expired: not paid by the deadline');
    perform private.queue_email(a, 'expired', jsonb_build_object('deadline', private.wat(a.offer_deadline, 'FMDay FMDD FMMonth')), 'status');
    ne := ne + 1;
  end loop;
  for a in select * from applications where status = 'Offer sent' and reminded_at is null
      and offer_deadline > now() and offer_deadline < now() + interval '48 hours'
      and decided_at < now() - interval '12 hours' for update skip locked loop
    update applications set reminded_at = now() where id = a.id;
    hrs := extract(epoch from a.offer_deadline - now()) / 3600;
    perform private.queue_email(a, 'reminder', jsonb_build_object(
      'deadline', private.wat(a.offer_deadline, 'FMDay FMDD FMMonth "at" HH24:MI "WAT"'),
      'days', case when hrs > 30 then '2 days' when hrs > 20 then '1 day' else greatest(1, round(hrs))::text || ' hours' end), 'status');
    perform private.log(a.id, 'System', 'Payment reminder sent');
    nr := nr + 1;
  end loop;
  for a in select * from applications where status = 'Admitted' and plan = 'two' and balance_reminded_at is null for update skip locked loop
    f := private.fees(a);
    continue when a.paid_total >= (f ->> 'plan_total')::int
      or (f ->> 'due_date')::date > (now() at time zone 'Africa/Lagos')::date + 7;
    update applications set balance_reminded_at = now() where id = a.id;
    perform private.queue_email(a, 'balance_due', jsonb_build_object(
      'balance', private.naira((f ->> 'plan_total')::int - a.paid_total),
      'due', to_char((f ->> 'due_date')::date, 'FMDay FMDD FMMonth'), 'matric', a.matric), 'status');
    perform private.log(a.id, 'System', 'Second instalment reminder sent');
    nb := nb + 1;
  end loop;
  return jsonb_build_object('expired', ne, 'reminded', nr, 'balance', nb);
end $$;

-- ---------- staff ----------
create or replace function public.adm_payments() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts;
begin
  perform private.require_role(array['adm_admin']);
  c := private.current_cohort();
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(private.app_staff(a) || jsonb_build_object('fees', private.fees(a))
        order by a.status, a.matric nulls last, a.offer_deadline)
      from applications a where a.cohort_id = c.id and a.status in ('Offer sent','Offer expired','Admitted')), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('at', y.created_at, 'paid_at', y.paid_at, 'reference', y.reference,
        'part', y.part, 'amount', y.amount, 'amount_paid', y.amount_paid, 'status', y.status, 'channel', y.channel, 'note', y.note,
        'recorded_by', y.recorded_by, 'name', a.first_name || ' ' || a.surname, 'app_ref', a.ref) order by y.created_at desc)
      from (select * from payments order by created_at desc limit 100) y join applications a on a.id = y.application_id), '[]'::jsonb));
end $$;

-- For money received outside Paystack, e.g. a direct bank transfer.
create or replace function public.admin_record_payment(p_id uuid, p_amount int, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; f jsonb; v_part text; y payments;
begin
  s := private.require_role(array['adm_admin']);
  select * into a from applications where id = p_id;
  if a.id is null then raise exception 'Application not found.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount received.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note, e.g. the bank transfer reference.'; end if;
  f := private.fees(a);
  if a.status in ('Offer sent','Offer expired') then
    if p_amount >= (f ->> 'fee')::int then v_part := 'full';
    elsif p_amount >= (f ->> 'part1')::int then v_part := 'part1';
    else raise exception 'That is less than the first instalment (%).', private.naira((f ->> 'part1')::int); end if;
  elsif a.status = 'Admitted' and a.plan = 'two' and a.paid_total < (f ->> 'plan_total')::int then
    v_part := 'part2';
  else
    raise exception 'This application has nothing left to pay.';
  end if;
  insert into payments(application_id, reference, part, amount, amount_paid, status, channel, note, paid_at, recorded_by)
  values (a.id, 'MANUAL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_part, p_amount, p_amount,
    'success', 'manual', trim(p_note), now(), s.email)
  returning * into y;
  perform private.apply_payment(y);
  insert into audit_log(actor, text) values (s.email, format('recorded a %s payment for %s (%s)', private.naira(p_amount), a.ref, trim(p_note)));
  select * into a from applications where id = p_id;
  return private.app_staff(a);
end $$;

create or replace function public.admin_extend_offer(p_id uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['adm_admin']);
  select * into a from applications where id = p_id for update;
  if a.id is null or a.status not in ('Offer sent','Offer expired') then raise exception 'Only open or expired offers can be extended.'; end if;
  if coalesce(p_days, 0) not between 1 and 30 then raise exception 'Choose between 1 and 30 days.'; end if;
  update applications set status = 'Offer sent', reminded_at = null,
    offer_deadline = greatest(now(), offer_deadline) + make_interval(days => p_days)
    where id = a.id returning * into a;
  perform private.log(a.id, s.full_name, format('Offer extended to %s', private.wat(a.offer_deadline, 'FMDay FMDD FMMonth')));
  perform private.queue_email(a, 'offer', jsonb_build_object('deadline', private.wat(a.offer_deadline, 'FMDay, FMDD FMMonth')), 'status');
  return private.app_staff(a);
end $$;

-- Settings now include who signs the admission letter.
create or replace function public.admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; p programmes;
begin
  perform private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  select * into p from programmes where code = c.programme_code;
  return jsonb_build_object('cohort', to_jsonb(c), 'programme', to_jsonb(p) || jsonb_build_object('inst_total', private.inst_total(p)),
    'tracks', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort, t.code) from tracks t where t.programme_code = c.programme_code), '[]'::jsonb),
    'site', jsonb_build_object('site_url', private.setting('site_url', ''), 'zuri_url', private.setting('zuri_url', ''),
      'website_url', private.setting('website_url', ''), 'signer_name', private.setting('signer_name', ''),
      'signer_title', private.setting('signer_title', 'Programme Director')));
end $$;

create or replace function public.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; t jsonb; k text;
begin
  s := private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  if p ? 'cohort' then
    update cohorts set
      name = coalesce(nullif(trim(p #>> '{cohort,name}'), ''), name),
      start_date = coalesce((p #>> '{cohort,start_date}')::date, start_date),
      year2 = coalesce(nullif(p #>> '{cohort,year2}', ''), year2),
      batch = coalesce(nullif(upper(p #>> '{cohort,batch}'), ''), batch),
      applications_open = coalesce((p #>> '{cohort,applications_open}')::boolean, applications_open),
      pass_mark = least(100, greatest(0, coalesce((p #>> '{cohort,pass_mark}')::int, pass_mark))),
      ready_n = least(6, greatest(1, coalesce((p #>> '{cohort,ready_n}')::int, ready_n))),
      offer_days = least(30, greatest(1, coalesce((p #>> '{cohort,offer_days}')::int, offer_days))),
      inst_due_week = coalesce((p #>> '{cohort,inst_due_week}')::int, inst_due_week)
    where id = c.id;
  end if;
  if p ? 'programme' then
    update programmes set
      fee = coalesce((p #>> '{programme,fee}')::int, fee),
      inst_pct = coalesce((p #>> '{programme,inst_pct}')::int, inst_pct)
    where code = c.programme_code;
  end if;
  if p ? 'tracks' then
    for t in select * from jsonb_array_elements(p -> 'tracks') loop
      update tracks set seats = greatest(0, coalesce((t ->> 'seats')::int, seats)),
        paused = coalesce((t ->> 'paused')::boolean, paused) where code = t ->> 'code';
    end loop;
  end if;
  if p ? 'site' then
    for k in select jsonb_object_keys(p -> 'site') loop
      if k in ('site_url','zuri_url','website_url','signer_name','signer_title') then
        insert into app_settings(key, value) values (k, trim(coalesce(p #>> array['site', k], '')))
        on conflict (key) do update set value = excluded.value;
      end if;
    end loop;
  end if;
  insert into audit_log(actor, text) values (s.email, 'changed admissions settings');
  return public.admin_settings();
end $$;

-- ---------- emails ----------
insert into email_templates(key, subject, body, cta) values
  ('admitted', 'Welcome to Jobnest Academy! Your matric number is {matric}',
   E'Hi {first},\n\nPayment received: {amount}. You are now admitted into the {track} track of the {programme}, {cohort}.\n\nYour matric number is {matric}. Your admission letter is ready: open it with the button below, then save or print it.{balance_line}\n\nThe programme starts on {start}. We''ll email your student portal sign-in before then.',
   'View your admission letter'),
  ('paid_full', 'Payment received: your fees are fully paid',
   E'Hi {first},\n\nPayment received: {amount}. Your fees for the {programme} are now paid in full. Thank you!\n\nYour matric number is {matric}. Your admission letter now shows your fees as fully paid.',
   'View your admission letter'),
  ('balance_due', 'Your second instalment is due by {due}',
   E'Hi {first},\n\nA reminder that the second instalment of your fees, {balance}, is due by {due}.\n\nYou can pay it from your application page with the button below.',
   'Pay the second instalment'),
  ('reminder', 'Reminder: your offer expires in {days}',
   E'Hi {first},\n\nJust a reminder that your offer for the {track} track expires on {deadline}.\n\nYou can pay in full, or pay the first of 2 instalments now. After the deadline, the seat goes to the waitlist.',
   'Accept and pay')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

-- ---------- who may call what ----------
-- Supabase lets anyone call new functions by default, so lock these down by name.
revoke execute on function public.pay_prepare(text, uuid, text), public.pay_result(text, text, bigint, text, text),
  public.jobs_tick() from public, anon, authenticated;
grant execute on function public.pay_prepare(text, uuid, text), public.pay_result(text, text, bigint, text, text),
  public.jobs_tick() to service_role;
revoke execute on function public.applicant_decline(text, uuid) from public;
grant execute on function public.applicant_decline(text, uuid) to anon, authenticated;
revoke execute on function public.adm_payments(), public.admin_record_payment(uuid, int, text),
  public.admin_extend_offer(uuid, int) from public, anon;
grant execute on function public.adm_payments(), public.admin_record_payment(uuid, int, text),
  public.admin_extend_offer(uuid, int) to authenticated;
revoke execute on function private.fees(applications), private.apply_payment(payments) from public;


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


-- Jobnest Academy: timed readiness assessment, welcome tour, sign-in links (run once in Supabase → SQL Editor).
-- Safe to run more than once.

alter table cohorts add column if not exists assess_minutes int not null default 10;
alter table applications add column if not exists assess_started_at timestamptz;
alter table applications add column if not exists tour_done_at timestamptz;

-- Scores an assessment and moves the application on. Unanswered questions count as wrong.
create or replace function private.finish_assessment(a applications, p_answers jsonb, p_late boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare c cohorts; n int; i int; ok int := 0; okd int := 0; okc int := 0; nd int := 0; nc int := 0; q jsonb; sc int; passed boolean; ans jsonb;
begin
  n := jsonb_array_length(a.qset);
  ans := case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end;
  for i in 0 .. n - 1 loop
    q := a.qset -> i;
    if q ->> 'cat' = 'digital' then nd := nd + 1; else nc := nc + 1; end if;
    if jsonb_typeof(ans -> i) = 'number' and (ans ->> i)::int = (q ->> 'a')::int then
      ok := ok + 1;
      if q ->> 'cat' = 'digital' then okd := okd + 1; else okc := okc + 1; end if;
    end if;
  end loop;
  select * into c from cohorts where id = a.cohort_id;
  sc := round(ok * 100.0 / n);
  passed := sc >= c.pass_mark;
  update applications set answers = ans, score = sc,
    score_digital = case when nd > 0 then round(okd * 100.0 / nd) end,
    score_comms = case when nc > 0 then round(okc * 100.0 / nc) end,
    status = case when passed then 'Call to book' else 'Assessment failed' end
  where id = a.id returning * into a;
  perform private.log(a.id, case when p_late then 'System' else 'Applicant' end,
    format('Readiness assessment: %s%% (pass mark %s%%)%s', sc, c.pass_mark, case when p_late then ' · time ran out' else '' end));
  perform private.queue_email(a, case when passed then 'passed' else 'failed' end,
    jsonb_build_object('score', sc::text), case when passed then 'book' else null end);
  return jsonb_build_object('score', sc, 'passed', passed, 'timed_out', p_late);
end $$;

create or replace function private.assess_deadline(a applications) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select a.assess_started_at + make_interval(mins => c.assess_minutes) from cohorts c where c.id = a.cohort_id
$$;

-- Now returns the questions plus the timer. The clock starts the first time this is called.
drop function if exists public.assessment_start(text, uuid);
create or replace function public.assessment_start(p_ref text, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a applications; c cohorts; qs jsonb := '[]'::jsonb; v_cat text; v_con text; brow readiness_bank;
  ord int[]; disp jsonb; correct int; i int;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Assessment pending' then raise exception 'The assessment is already done.' using errcode = 'P0001'; end if;
  select * into c from cohorts where id = a.cohort_id;
  if a.qset is null then
    foreach v_cat in array array['digital','comms'] loop
      for v_con in select d.concept from (select distinct b.concept from readiness_bank b where b.cat = v_cat) d order by random() limit c.ready_n loop
        select * into brow from readiness_bank b where b.cat = v_cat and b.concept = v_con order by random() limit 1;
        select array_agg(n order by random()) into ord from generate_series(0, jsonb_array_length(brow.options) - 1) n;
        disp := '[]'::jsonb; correct := null;
        for i in 1 .. array_length(ord, 1) loop
          disp := disp || jsonb_build_array(brow.options -> ord[i]);
          if ord[i] = 0 then correct := i - 1; end if;
        end loop;
        qs := qs || jsonb_build_array(jsonb_build_object('cat', v_cat, 'concept', v_con, 'q', brow.question, 'o', disp, 'a', correct));
      end loop;
    end loop;
    select coalesce(jsonb_agg(x order by random()), '[]'::jsonb) into qs from jsonb_array_elements(qs) x;
    update applications set qset = qs where id = a.id returning * into a;
  end if;
  if a.assess_started_at is null then
    update applications set assess_started_at = now() where id = a.id returning * into a;
    perform private.log(a.id, 'Applicant', format('Started the readiness assessment (%s minutes)', c.assess_minutes));
  end if;
  if now() > private.assess_deadline(a) + interval '1 minute' then
    return jsonb_build_object('finished', private.finish_assessment(a, a.answers, true));
  end if;
  return jsonb_build_object('questions', (select jsonb_agg(jsonb_build_object('q', x ->> 'q', 'o', x -> 'o')) from jsonb_array_elements(a.qset) x),
    'answers', coalesce(a.answers, '[]'::jsonb), 'deadline', private.assess_deadline(a), 'now', now(), 'minutes', c.assess_minutes);
end $$;

-- Saves answers as the applicant goes, so nothing is lost if the page closes.
create or replace function public.assessment_save(p_ref text, p_token uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Assessment pending' or a.qset is null or jsonb_typeof(p_answers) <> 'array' then return; end if;
  if now() > private.assess_deadline(a) + interval '1 minute' then return; end if;
  update applications set answers = p_answers where id = a.id;
end $$;

create or replace function public.assessment_submit(p_ref text, p_token uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; time_up boolean; late boolean;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Assessment pending' or a.qset is null then raise exception 'There is no assessment to submit.' using errcode = 'P0001'; end if;
  if a.assess_started_at is null then update applications set assess_started_at = now() where id = a.id returning * into a; end if;
  time_up := now() >= private.assess_deadline(a) - interval '5 seconds';
  late := now() > private.assess_deadline(a) + interval '1 minute';
  if late then return private.finish_assessment(a, a.answers, true); end if;   -- too late: use what was saved in time
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> jsonb_array_length(a.qset) then
    raise exception 'Answer every question.' using errcode = 'P0001';
  end if;
  if not time_up and exists (select 1 from jsonb_array_elements(p_answers) x where jsonb_typeof(x) <> 'number') then
    raise exception 'Answer every question.' using errcode = 'P0001';
  end if;
  return private.finish_assessment(a, p_answers, time_up);
end $$;

-- The every-minute job also finishes assessments left open after time ran out.
create or replace function public.jobs_tick() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; f jsonb; ne int := 0; nr int := 0; nb int := 0; na int := 0; hrs numeric;
begin
  for a in select x.* from applications x join cohorts c on c.id = x.cohort_id where x.status = 'Assessment pending'
      and x.assess_started_at is not null and x.assess_started_at + make_interval(mins => c.assess_minutes) < now() - interval '5 minutes'
      for update of x skip locked loop
    perform private.finish_assessment(a, a.answers, true);
    na := na + 1;
  end loop;
  for a in select * from applications where status = 'Offer sent' and offer_deadline < now() for update skip locked loop
    continue when exists (select 1 from payments where application_id = a.id and status = 'pending' and created_at > now() - interval '30 minutes');
    update applications set status = 'Offer expired' where id = a.id returning * into a;
    perform private.log(a.id, 'System', 'Offer expired: not paid by the deadline');
    perform private.queue_email(a, 'expired', jsonb_build_object('deadline', private.wat(a.offer_deadline, 'FMDay FMDD FMMonth')), 'status');
    ne := ne + 1;
  end loop;
  for a in select * from applications where status = 'Offer sent' and reminded_at is null
      and offer_deadline > now() and offer_deadline < now() + interval '48 hours'
      and decided_at < now() - interval '12 hours' for update skip locked loop
    update applications set reminded_at = now() where id = a.id;
    hrs := extract(epoch from a.offer_deadline - now()) / 3600;
    perform private.queue_email(a, 'reminder', jsonb_build_object(
      'deadline', private.wat(a.offer_deadline, 'FMDay FMDD FMMonth "at" HH24:MI "WAT"'),
      'days', case when hrs > 30 then '2 days' when hrs > 20 then '1 day' else greatest(1, round(hrs))::text || ' hours' end), 'status');
    perform private.log(a.id, 'System', 'Payment reminder sent');
    nr := nr + 1;
  end loop;
  for a in select * from applications where status = 'Admitted' and plan = 'two' and balance_reminded_at is null for update skip locked loop
    f := private.fees(a);
    continue when a.paid_total >= (f ->> 'plan_total')::int
      or (f ->> 'due_date')::date > (now() at time zone 'Africa/Lagos')::date + 7;
    update applications set balance_reminded_at = now() where id = a.id;
    perform private.queue_email(a, 'balance_due', jsonb_build_object(
      'balance', private.naira((f ->> 'plan_total')::int - a.paid_total),
      'due', to_char((f ->> 'due_date')::date, 'FMDay FMDD FMMonth'), 'matric', a.matric), 'status');
    perform private.log(a.id, 'System', 'Second instalment reminder sent');
    nb := nb + 1;
  end loop;
  return jsonb_build_object('assessments', na, 'expired', ne, 'reminded', nr, 'balance', nb);
end $$;

-- Settings can now change the assessment time limit.
create or replace function public.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; t jsonb; k text;
begin
  s := private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  if p ? 'cohort' then
    update cohorts set
      name = coalesce(nullif(trim(p #>> '{cohort,name}'), ''), name),
      start_date = coalesce((p #>> '{cohort,start_date}')::date, start_date),
      year2 = coalesce(nullif(p #>> '{cohort,year2}', ''), year2),
      batch = coalesce(nullif(upper(p #>> '{cohort,batch}'), ''), batch),
      applications_open = coalesce((p #>> '{cohort,applications_open}')::boolean, applications_open),
      pass_mark = least(100, greatest(0, coalesce((p #>> '{cohort,pass_mark}')::int, pass_mark))),
      ready_n = least(6, greatest(1, coalesce((p #>> '{cohort,ready_n}')::int, ready_n))),
      assess_minutes = least(60, greatest(3, coalesce((p #>> '{cohort,assess_minutes}')::int, assess_minutes))),
      offer_days = least(30, greatest(1, coalesce((p #>> '{cohort,offer_days}')::int, offer_days))),
      inst_due_week = coalesce((p #>> '{cohort,inst_due_week}')::int, inst_due_week)
    where id = c.id;
  end if;
  if p ? 'programme' then
    update programmes set
      fee = coalesce((p #>> '{programme,fee}')::int, fee),
      inst_pct = coalesce((p #>> '{programme,inst_pct}')::int, inst_pct)
    where code = c.programme_code;
  end if;
  if p ? 'tracks' then
    for t in select * from jsonb_array_elements(p -> 'tracks') loop
      update tracks set seats = greatest(0, coalesce((t ->> 'seats')::int, seats)),
        paused = coalesce((t ->> 'paused')::boolean, paused) where code = t ->> 'code';
    end loop;
  end if;
  if p ? 'site' then
    for k in select jsonb_object_keys(p -> 'site') loop
      if k in ('site_url','zuri_url','website_url','signer_name','signer_title') then
        insert into app_settings(key, value) values (k, trim(coalesce(p #>> array['site', k], '')))
        on conflict (key) do update set value = excluded.value;
      end if;
    end loop;
  end if;
  insert into audit_log(actor, text) values (s.email, 'changed admissions settings');
  return public.admin_settings();
end $$;

-- Applicant page shows the time limit before they start.
create or replace function public.academy_info() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'programmes', coalesce((select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'weeks', p.weeks, 'status', p.status, 'tagline', p.tagline,
        'fee', p.fee, 'inst_total', private.inst_total(p)) order by p.sort, p.code)
      from programmes p where p.status <> 'Draft'), '[]'::jsonb),
    'cohort', (select jsonb_build_object('name', c.name, 'start_date', c.start_date,
        'applications_open', c.applications_open, 'pass_mark', c.pass_mark, 'assess_minutes', c.assess_minutes,
        'questions', c.ready_n * 2, 'offer_days', c.offer_days, 'inst_due_week', c.inst_due_week, 'programme_code', c.programme_code)
      from cohorts c where c.is_current order by c.id desc limit 1),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name,
        'open', not t.paused) order by t.sort, t.code) from tracks t), '[]'::jsonb),
    'zuri_url', private.setting('zuri_url', ''),
    'website_url', private.setting('website_url', 'https://jobnestcareers.com'))
$$;

-- Welcome tour: shown once per student, on any device.
create or replace function public.student_tour_done() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  update applications set tour_done_at = coalesce(tour_done_at, now()) where id = a.id;
end $$;

create or replace function public.student_campus_extra() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return jsonb_build_object('tour_done', a.tour_done_at is not null);
end $$;

-- One link for first-time set-up and forgotten passwords.
insert into email_templates(key, subject, body, cta) values
  ('student_reset', 'Your student portal sign-in link',
   E'Hi {first},\n\nUse the button below to set your student portal password. You can use it the first time, or any time you forget your password.\n\nAfter that, sign in with your matric number, {matric}, and your password.\n\nIf you didn''t ask for this, you can ignore this email.',
   'Set my password')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

revoke execute on function private.finish_assessment(applications, jsonb, boolean), private.assess_deadline(applications) from public;
revoke execute on function public.assessment_start(text, uuid), public.assessment_save(text, uuid, jsonb) from public;
grant execute on function public.assessment_start(text, uuid), public.assessment_save(text, uuid, jsonb) to anon, authenticated;
revoke execute on function public.student_tour_done(), public.student_campus_extra() from public, anon;
grant execute on function public.student_tour_done(), public.student_campus_extra() to authenticated;


-- Jobnest Academy: readiness assessment takes 5 minutes (run once in Supabase → SQL Editor). Safe to run again.
alter table cohorts alter column assess_minutes set default 5;
update cohorts set assess_minutes = 5 where is_current;
update email_templates set body = replace(body, '10-minute readiness assessment', '5-minute readiness assessment') where key = 'received';
select name, assess_minutes from cohorts where is_current;


-- Testing switch: open every week of the student portal before the start date.
-- Turn it on and off from Settings in the staff portal. The clean-up script turns it off.

create or replace function private.week_open(c cohorts, w int) returns boolean
language sql stable as $$
  select private.setting('unlock_weeks', 'off') = 'on' or private.week_start(c, w) - 2 <= private.today()
$$;

-- p_on = null just reads the switch; true/false sets it.
create or replace function public.admin_test_unlock(p_on boolean default null) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['adm_admin','academy_admin']);
  if p_on is not null then
    insert into app_settings(key, value) values ('unlock_weeks', case when p_on then 'on' else 'off' end)
    on conflict (key) do update set value = excluded.value;
    insert into audit_log(actor, text) values (s.email, case when p_on then 'opened all portal weeks for testing' else 'closed portal weeks back to their dates' end);
  end if;
  return private.setting('unlock_weeks', 'off') = 'on';
end $$;

revoke execute on function public.admin_test_unlock(boolean) from public, anon;
grant execute on function public.admin_test_unlock(boolean) to authenticated;

-- Tell the API about the new function straight away.
notify pgrst, 'reload schema';

select 'Test unlock switch installed' as done;


-- Continue an application with the application number and surname.
-- After 5 wrong tries on one application number, it is blocked for 15 minutes.

create table if not exists continue_attempts (
  id bigint generated always as identity primary key,
  ref text not null,
  at timestamptz not null default now()
);
create index if not exists continue_attempts_ref_at on continue_attempts(ref, at);
alter table continue_attempts enable row level security;

create or replace function public.applicant_continue(p_ref text, p_surname text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_sur text := lower(regexp_replace(coalesce(p_surname, ''), '[\s''’-]', '', 'g'));
  a applications;
begin
  if v_ref = '' or v_sur = '' then raise exception 'Enter your application number and surname.' using errcode = 'P0001'; end if;
  if v_ref !~ '^APP-' then v_ref := 'APP-' || v_ref; end if;
  delete from continue_attempts where at < now() - interval '1 day';
  if (select count(*) from continue_attempts where ref = v_ref and at > now() - interval '15 minutes') >= 5 then
    raise exception 'Too many tries. Please wait 15 minutes and try again.' using errcode = 'P0001';
  end if;
  select * into a from applications
  where ref = v_ref and lower(regexp_replace(surname, '[\s''’-]', '', 'g')) = v_sur;
  if a.id is null then
    insert into continue_attempts(ref) values (v_ref);
    return null;
  end if;
  delete from continue_attempts where ref = v_ref;
  return jsonb_build_object('ref', a.ref, 'token', a.token);
end $$;

-- The old lookup by reference and email is replaced by the one above.
drop function if exists public.applicant_find(text, text);

revoke execute on function public.applicant_continue(text, text) from public;
grant execute on function public.applicant_continue(text, text) to anon, authenticated;

-- The first email explains what the application number is for.
update email_templates set body = replace(body, 'Your application reference is {ref}.', 'Your application number is {ref}. Keep it safe: you''ll need it with your surname to come back to your application.') where key = 'received';

notify pgrst, 'reload schema';

select 'Continue with application number and surname installed' as done;


-- Discovery Calls: the meeting link goes in the booking email and on the application page,
-- with an "Add to Google Calendar" link. Staff set the meeting link under Settings > Links.

insert into app_settings(key, value) values ('call_link', 'https://teams.live.com/meet/9326187899910?p=dHtSqSOYScF80V5TpV')
on conflict (key) do nothing;

-- Percent-encode text for a web address.
create or replace function private.urlenc(t text) returns text
language sql immutable as $$
  select coalesce(string_agg(case when ch ~ '^[A-Za-z0-9_.~-]$' then ch
    else upper(regexp_replace(encode(convert_to(ch, 'UTF8'), 'hex'), '(..)', '%\1', 'g')) end, '' order by i), '')
  from regexp_split_to_table(coalesce(t, ''), '') with ordinality as x(ch, i)
$$;

-- A Google Calendar "add event" link.
create or replace function private.gcal_url(starts timestamptz, mins int, title text, details text, loc text) returns text
language sql stable as $$
  select 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' || private.urlenc(title)
    || '&dates=' || to_char(starts at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || '/'
    || to_char((starts + make_interval(mins => mins)) at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"')
    || '&details=' || private.urlenc(details) || '&location=' || private.urlenc(loc)
$$;

create or replace function public.book_call(p_ref text, p_token uuid, p_slot bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; s slots; o staff;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Call to book' then raise exception 'You can''t book a call right now.' using errcode = 'P0001'; end if;
  update slots set application_id = a.id
    where id = p_slot and application_id is null and starts_at > now() + interval '3 hours'
    returning * into s;
  if s.id is null then raise exception 'That time was just taken. Please choose another.' using errcode = 'P0001'; end if;
  select * into o from staff where email = s.officer_email;
  update applications set status = 'Call booked', dc1_at = s.starts_at, officer_email = s.officer_email
    where id = a.id returning * into a;
  perform private.log(a.id, 'Applicant', format('Discovery Call 1 booked for %s at %s WAT with %s',
    private.wat(s.starts_at, 'Dy DD Mon'), private.wat(s.starts_at, 'HH24:MI'), o.full_name));
  perform private.queue_email(a, 'booked', jsonb_build_object(
    'date', private.wat(s.starts_at, 'Dy, DD Mon'), 'longdate', private.wat(s.starts_at, 'FMDay, FMDD FMMonth'),
    'time', private.wat(s.starts_at, 'HH24:MI'), 'manager', o.full_name,
    'meet', private.setting('call_link', ''),
    'gcal', private.gcal_url(s.starts_at, 15, 'Jobnest Academy Discovery Call',
      'Your 15-minute Discovery Call with ' || coalesce(o.full_name, 'Jobnest Admissions') || '. Join here: ' || private.setting('call_link', ''),
      private.setting('call_link', ''))), 'status');
  return private.app_public(a);
end $$;


-- The applicant's page shows the meeting link once their call is booked.
create or replace function public.applicant_call(p_ref text, p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Call booked' then return null; end if;
  return jsonb_build_object('meet', private.setting('call_link', ''));
end $$;

create or replace function public.admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; p programmes;
begin
  perform private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  select * into p from programmes where code = c.programme_code;
  return jsonb_build_object('cohort', to_jsonb(c), 'programme', to_jsonb(p) || jsonb_build_object('inst_total', private.inst_total(p)),
    'tracks', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort, t.code) from tracks t where t.programme_code = c.programme_code), '[]'::jsonb),
    'site', jsonb_build_object('site_url', private.setting('site_url', ''), 'zuri_url', private.setting('zuri_url', ''),
      'website_url', private.setting('website_url', ''), 'signer_name', private.setting('signer_name', ''),
      'signer_title', private.setting('signer_title', 'Programme Director'), 'call_link', private.setting('call_link', '')));
end $$;

create or replace function public.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; t jsonb; k text;
begin
  s := private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  if p ? 'cohort' then
    update cohorts set
      name = coalesce(nullif(trim(p #>> '{cohort,name}'), ''), name),
      start_date = coalesce((p #>> '{cohort,start_date}')::date, start_date),
      year2 = coalesce(nullif(p #>> '{cohort,year2}', ''), year2),
      batch = coalesce(nullif(upper(p #>> '{cohort,batch}'), ''), batch),
      applications_open = coalesce((p #>> '{cohort,applications_open}')::boolean, applications_open),
      pass_mark = least(100, greatest(0, coalesce((p #>> '{cohort,pass_mark}')::int, pass_mark))),
      ready_n = least(6, greatest(1, coalesce((p #>> '{cohort,ready_n}')::int, ready_n))),
      assess_minutes = least(60, greatest(3, coalesce((p #>> '{cohort,assess_minutes}')::int, assess_minutes))),
      offer_days = least(30, greatest(1, coalesce((p #>> '{cohort,offer_days}')::int, offer_days))),
      inst_due_week = coalesce((p #>> '{cohort,inst_due_week}')::int, inst_due_week)
    where id = c.id;
  end if;
  if p ? 'programme' then
    update programmes set
      fee = coalesce((p #>> '{programme,fee}')::int, fee),
      inst_pct = coalesce((p #>> '{programme,inst_pct}')::int, inst_pct)
    where code = c.programme_code;
  end if;
  if p ? 'tracks' then
    for t in select * from jsonb_array_elements(p -> 'tracks') loop
      update tracks set seats = greatest(0, coalesce((t ->> 'seats')::int, seats)),
        paused = coalesce((t ->> 'paused')::boolean, paused) where code = t ->> 'code';
    end loop;
  end if;
  if p ? 'site' then
    for k in select jsonb_object_keys(p -> 'site') loop
      if k in ('site_url','zuri_url','website_url','signer_name','signer_title','call_link') then
        insert into app_settings(key, value) values (k, trim(coalesce(p #>> array['site', k], '')))
        on conflict (key) do update set value = excluded.value;
      end if;
    end loop;
  end if;
  insert into audit_log(actor, text) values (s.email, 'changed admissions settings');
  return public.admin_settings();
end $$;


-- Booking email: the meeting link and calendar link instead of "sent 30 minutes before".
update email_templates set body = replace(body,
  'The video link will be sent 30 minutes before the call. ',
  '[Join the call on Microsoft Teams]({meet})' || chr(10) || chr(10) || '[Add it to your Google Calendar]({gcal})' || chr(10) || chr(10))
where key = 'booked';

revoke execute on function private.urlenc(text), private.gcal_url(timestamptz, int, text, text, text) from public;
revoke execute on function public.applicant_call(text, uuid) from public;
grant execute on function public.applicant_call(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

select 'Discovery Call link and calendar installed' as done;


-- Certificates of completion.
-- Staff issue a certificate to a student who has finished. Each one gets a code (JNA-27-XXXXXX)
-- that anyone can check at academy.jobnestcareers.com/#/verify/<code>.

alter table applications add column if not exists cert_id text unique;
alter table applications add column if not exists completed_on date;

-- The Programme Director signs certificates and admission letters.
insert into app_settings(key, value) values ('signer_name', 'Shekemi Odeyemi'), ('signer_title', 'Programme Director')
on conflict (key) do update set value = excluded.value;

create or replace function private.new_cert_id(c cohorts) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v text; abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v := 'JNA-' || coalesce(c.year2, to_char(now(), 'YY')) || '-' ||
      (select string_agg(substr(abc, 1 + floor(random() * length(abc))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from applications where cert_id = v);
  end loop;
  return v;
end $$;

-- Staff: issue (or re-date) a certificate. Programme Director and Academy Admin; Super Admin too.
create or replace function public.acad_issue_certificate(p_app uuid, p_date date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; c cohorts;
begin
  s := private.require_role(array['director','academy_admin']);
  select * into a from applications where id = p_app;
  if a.id is null or a.status <> 'Admitted' or a.matric is null then
    raise exception 'Only admitted students can get a certificate.' using errcode = 'P0001';
  end if;
  select * into c from cohorts where id = a.cohort_id;
  update applications set completed_on = coalesce(p_date, current_date),
    cert_id = coalesce(cert_id, private.new_cert_id(c))
  where id = a.id returning * into a;
  insert into audit_log(actor, text) values (s.email, format('issued certificate %s to %s %s', a.cert_id, a.first_name, a.surname));
  perform private.queue_email(a, 'certificate', jsonb_build_object('cert', a.cert_id), 'certificate');
  return jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on);
end $$;

-- Staff: take a certificate back (issued by mistake). The code stops verifying.
create or replace function public.acad_revoke_certificate(p_app uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['director','academy_admin']);
  update applications set cert_id = null, completed_on = null where id = p_app returning * into a;
  insert into audit_log(actor, text) values (s.email, format('withdrew the certificate of %s %s', a.first_name, a.surname));
  return jsonb_build_object('ok', true);
end $$;

-- Staff: which students have certificates (merged into the Students list).
create or replace function public.acad_certificates() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin','adm_admin']);
  return coalesce((select jsonb_object_agg(a.id, jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on))
    from applications a where a.cert_id is not null), '{}'::jsonb);
end $$;

-- Anyone: look up a certificate by its code (the certificate page and the verify page).
create or replace function public.certificate_view(p_cert text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('cert_id', a.cert_id, 'name', trim(a.first_name || ' ' || a.surname),
    'programme', p.name, 'weeks', p.weeks, 'track', (select name from tracks where code = a.track_code),
    'completed_on', a.completed_on, 'year', to_char(a.completed_on, 'YYYY'),
    'signer_name', private.setting('signer_name', ''), 'signer_title', private.setting('signer_title', 'Programme Director'))
  from applications a join cohorts c on c.id = a.cohort_id join programmes p on p.code = c.programme_code
  where a.cert_id = upper(trim(p_cert)) and a.status = 'Admitted'
$$;

-- Student portal: my certificate, if issued.
create or replace function public.student_certificate() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if a.cert_id is null then return null; end if;
  return jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on);
end $$;

-- Applicant page link from the certificate email.
create or replace function public.applicant_certificate(p_ref text, p_token uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  return a.cert_id;
end $$;

insert into email_templates(key, subject, body, cta) values
  ('certificate', 'Your Jobnest Academy certificate is ready',
   E'Hi {first},\n\nCongratulations on completing the {programme}! Your certificate of completion is ready.\n\nYou can download it as a PDF and add it to your CV and LinkedIn. Its code, {cert}, lets employers check it\'s genuine.',
   'View my certificate')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

revoke execute on function private.new_cert_id(cohorts) from public;
revoke execute on function public.acad_issue_certificate(uuid, date), public.acad_revoke_certificate(uuid),
  public.acad_certificates(), public.student_certificate() from public, anon;
grant execute on function public.acad_issue_certificate(uuid, date), public.acad_revoke_certificate(uuid),
  public.acad_certificates(), public.student_certificate() to authenticated;
revoke execute on function public.certificate_view(text), public.applicant_certificate(text, uuid) from public;
grant execute on function public.certificate_view(text), public.applicant_certificate(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

select 'Certificates installed' as done;


-- Landing page extras: info session and sample lesson links, team names, and the Zuri link.

insert into app_settings(key, value) values ('zuri_url', 'https://poetic-queijadas-3d5e84.netlify.app/')
on conflict (key) do update set value = excluded.value;

create or replace function public.academy_info() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'programmes', coalesce((select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'weeks', p.weeks, 'status', p.status, 'tagline', p.tagline,
        'fee', p.fee, 'inst_total', private.inst_total(p)) order by p.sort, p.code)
      from programmes p where p.status <> 'Draft'), '[]'::jsonb),
    'cohort', (select jsonb_build_object('name', c.name, 'start_date', c.start_date,
        'applications_open', c.applications_open, 'pass_mark', c.pass_mark, 'assess_minutes', c.assess_minutes,
        'questions', c.ready_n * 2, 'offer_days', c.offer_days, 'inst_due_week', c.inst_due_week, 'programme_code', c.programme_code)
      from cohorts c where c.is_current order by c.id desc limit 1),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name,
        'open', not t.paused) order by t.sort, t.code) from tracks t), '[]'::jsonb),
    'zuri_url', private.setting('zuri_url', ''),
    'website_url', private.setting('website_url', 'https://jobnestcareers.com'),
    'info_session_url', private.setting('info_session_url', ''), 'sample_lesson_url', private.setting('sample_lesson_url', ''),
    'team', private.setting('team', ''), 'signer_name', private.setting('signer_name', ''), 'signer_title', private.setting('signer_title', 'Programme Director'))
$$;

create or replace function public.admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; p programmes;
begin
  perform private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  select * into p from programmes where code = c.programme_code;
  return jsonb_build_object('cohort', to_jsonb(c), 'programme', to_jsonb(p) || jsonb_build_object('inst_total', private.inst_total(p)),
    'tracks', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort, t.code) from tracks t where t.programme_code = c.programme_code), '[]'::jsonb),
    'site', jsonb_build_object('site_url', private.setting('site_url', ''), 'zuri_url', private.setting('zuri_url', ''),
      'website_url', private.setting('website_url', ''), 'signer_name', private.setting('signer_name', ''),
      'signer_title', private.setting('signer_title', 'Programme Director'), 'call_link', private.setting('call_link', ''),
      'info_session_url', private.setting('info_session_url', ''), 'sample_lesson_url', private.setting('sample_lesson_url', ''), 'team', private.setting('team', '')));
end $$;

create or replace function public.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; t jsonb; k text;
begin
  s := private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  if p ? 'cohort' then
    update cohorts set
      name = coalesce(nullif(trim(p #>> '{cohort,name}'), ''), name),
      start_date = coalesce((p #>> '{cohort,start_date}')::date, start_date),
      year2 = coalesce(nullif(p #>> '{cohort,year2}', ''), year2),
      batch = coalesce(nullif(upper(p #>> '{cohort,batch}'), ''), batch),
      applications_open = coalesce((p #>> '{cohort,applications_open}')::boolean, applications_open),
      pass_mark = least(100, greatest(0, coalesce((p #>> '{cohort,pass_mark}')::int, pass_mark))),
      ready_n = least(6, greatest(1, coalesce((p #>> '{cohort,ready_n}')::int, ready_n))),
      assess_minutes = least(60, greatest(3, coalesce((p #>> '{cohort,assess_minutes}')::int, assess_minutes))),
      offer_days = least(30, greatest(1, coalesce((p #>> '{cohort,offer_days}')::int, offer_days))),
      inst_due_week = coalesce((p #>> '{cohort,inst_due_week}')::int, inst_due_week)
    where id = c.id;
  end if;
  if p ? 'programme' then
    update programmes set
      fee = coalesce((p #>> '{programme,fee}')::int, fee),
      inst_pct = coalesce((p #>> '{programme,inst_pct}')::int, inst_pct)
    where code = c.programme_code;
  end if;
  if p ? 'tracks' then
    for t in select * from jsonb_array_elements(p -> 'tracks') loop
      update tracks set seats = greatest(0, coalesce((t ->> 'seats')::int, seats)),
        paused = coalesce((t ->> 'paused')::boolean, paused) where code = t ->> 'code';
    end loop;
  end if;
  if p ? 'site' then
    for k in select jsonb_object_keys(p -> 'site') loop
      if k in ('site_url','zuri_url','website_url','signer_name','signer_title','call_link','info_session_url','sample_lesson_url','team') then
        insert into app_settings(key, value) values (k, trim(coalesce(p #>> array['site', k], '')))
        on conflict (key) do update set value = excluded.value;
      end if;
    end loop;
  end if;
  insert into audit_log(actor, text) values (s.email, 'changed admissions settings');
  return public.admin_settings();
end $$;

notify pgrst, 'reload schema';

select 'Landing page settings installed' as done;


-- Student portal, Phase 1: weeks unlock in order, quizzes are marked by the server,
-- link tasks are graded by facilitators, and late work is capped (100% / 80% / 50%).

create table if not exists course_items (
  track_code text not null references tracks(code),
  week int not null check (week between 1 and 30),
  key text not null,
  type text not null,
  title text not null,
  proj boolean not null default false,   -- the week project (graded, counts toward the week result)
  opt boolean not null default false,    -- optional
  link boolean not null default false,   -- needs a link to the work
  staff boolean not null default false,  -- completed by staff, not the student
  answers int[],                         -- quiz answer key (never sent to students)
  primary key (track_code, key)
);
alter table course_items enable row level security;

create table if not exists learn_progress (
  application_id uuid not null references applications(id) on delete cascade,
  key text not null,
  week int not null,
  status text not null check (status in ('done','submitted','graded','revise')),
  link text,
  data jsonb,
  score int,            -- final score after any late cap
  cap numeric,          -- 1, 0.8 or 0.5 depending on when it was submitted
  grade int,            -- the facilitator's grade before the cap
  feedback text,
  done_at timestamptz not null default now(),
  graded_by text,
  graded_at timestamptz,
  primary key (application_id, key)
);
alter table learn_progress enable row level security;

create table if not exists learn_attempts (
  application_id uuid not null references applications(id) on delete cascade,
  week int not null, n int not null default 1,
  primary key (application_id, week)
);
alter table learn_attempts enable row level security;

create table if not exists learn_checkins (
  application_id uuid not null references applications(id) on delete cascade,
  week int not null, conf int not null check (conf between 1 and 5), note text,
  at timestamptz not null default now(),
  primary key (application_id, week)
);
alter table learn_checkins enable row level security;

create table if not exists learn_history (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  key text not null, action text not null, by_name text,
  at timestamptz not null default now()
);
alter table learn_history enable row level security;

insert into app_settings(key, value) values ('learn_pass', '70') on conflict (key) do nothing;

-- The programme's items for every track (from the approved prototype).
delete from course_items;
insert into course_items(track_code, week, key, type, title, proj, opt, link, staff, answers) values
('ADM', 1, 'w1-1', 'guide', 'How to navigate the platform', false, false, false, false, null),
('ADM', 1, 'w1-2', 'oath', 'Read & sign the Student Oath', false, false, false, false, null),
('ADM', 1, 'w1-3', 'task', 'Read the Student Handbook', false, false, false, false, null),
('ADM', 1, 'w1-4', 'task', 'Join your cohort community', false, true, false, false, null),
('ADM', 2, 'w2-1', 'lesson', 'Professional communication', false, false, false, false, null),
('ADM', 2, 'w2-2', 'lesson', 'Remote work etiquette', false, false, false, false, null),
('ADM', 2, 'w2-3', 'lesson', 'File organisation in Google Drive & OneDrive', false, false, false, false, null),
('ADM', 2, 'w2-4', 'quiz', 'Week 2 assessment', false, false, false, false, array[1,2,3,0,1]::int[]),
('ADM', 2, 'w2-5', 'task', 'Week project: rewrite a messy email', true, false, true, false, null),
('ADM', 3, 'w3-1', 'lesson', 'Time management', false, false, false, false, null),
('ADM', 3, 'w3-2', 'lesson', 'Task tracking with Trello & Notion', false, false, false, false, null),
('ADM', 3, 'w3-3', 'quiz', 'Workplace Readiness Quiz', false, false, false, false, array[1,2,1,2,1]::int[]),
('ADM', 3, 'w3-4', 'task', 'Week project: set up your clean digital workspace', true, false, true, false, null),
('ADM', 4, 'w4-1', 'lesson', 'Calendar & inbox management', false, false, false, false, null),
('ADM', 4, 'w4-2', 'quiz', 'Week 4 assessment', false, false, false, false, array[3,0,1]::int[]),
('ADM', 4, 'w4-3', 'task', 'Week project: Calendar & Inbox Management', true, false, true, false, null),
('ADM', 4, 'w4-4', 'task', 'Stretch challenge', false, true, true, false, null),
('ADM', 5, 'w5-1', 'lesson', 'Business documents in Google Docs & Word', false, false, false, false, null),
('ADM', 5, 'w5-2', 'quiz', 'Week 5 assessment', false, false, false, false, array[0,1,2]::int[]),
('ADM', 5, 'w5-3', 'task', 'Week project: Business Documents', true, false, true, false, null),
('ADM', 5, 'w5-4', 'task', 'Stretch challenge', false, true, true, false, null),
('ADM', 6, 'w6-1', 'lesson', 'Spreadsheets for admins', false, false, false, false, null),
('ADM', 6, 'w6-2', 'quiz', 'Week 6 assessment', false, false, false, false, array[1,2,3]::int[]),
('ADM', 6, 'w6-3', 'task', 'Week project: Spreadsheets for Admins', true, false, true, false, null),
('ADM', 6, 'w6-4', 'task', 'Stretch challenge', false, true, true, false, null),
('ADM', 7, 'w7-1', 'lesson', 'Travel, expenses & vendor coordination', false, false, false, false, null),
('ADM', 7, 'w7-2', 'quiz', 'Week 7 assessment', false, false, false, false, array[2,3,0]::int[]),
('ADM', 7, 'w7-3', 'task', 'Week project: module assignment', true, false, true, false, null),
('ADM', 7, 'w7-4', 'task', 'Technical competency check', false, false, false, false, null),
('ADM', 7, 'w7-5', 'task', 'Stretch challenge', false, true, true, false, null),
('ADM', 8, 'w8-1', 'task', 'Read your project brief', false, false, false, false, null),
('ADM', 8, 'w8-2', 'task', 'Submit your project plan', true, false, true, false, null),
('ADM', 8, 'w8-3', 'task', 'Check-in with your project supervisor', false, false, false, false, null),
('ADM', 9, 'w9-1', 'task', 'Submit your final project', true, false, true, false, null),
('ADM', 9, 'w9-2', 'task', 'Self-review against the rubric', false, false, false, false, null),
('ADM', 9, 'w9-3', 'task', 'Supervisor grading', false, false, false, true, null),
('ADM', 10, 'w10-1', 'task', 'Confirm your placement', false, false, false, false, null),
('ADM', 10, 'w10-2', 'logweek', 'Logbook entry · Week 1', false, false, false, false, null),
('ADM', 11, 'w11-1', 'logweek', 'Logbook entry · Week 2', false, false, false, false, null),
('ADM', 12, 'w12-1', 'logweek', 'Logbook entry · Week 3', false, false, false, false, null),
('ADM', 13, 'w13-1', 'logweek', 'Logbook entry · Week 4', false, false, false, false, null),
('ADM', 13, 'w13-2', 'task', 'Supervisor performance evaluation', false, false, false, true, null),
('ADM', 13, 'w13-3', 'task', 'Collect your internship certificate', false, false, false, false, null),
('ADM', 14, 'w14-1', 'task', 'ATS-compliant resume', false, false, true, false, null),
('ADM', 14, 'w14-2', 'task', 'LinkedIn profile makeover', false, false, true, false, null),
('ADM', 14, 'w14-3', 'task', 'Publish your portfolio', false, false, true, false, null),
('ADM', 14, 'w14-4', 'task', 'CV swap with a pod member', false, true, false, false, null),
('ADM', 15, 'w15-1', 'task', 'Book your 1-on-1 session', false, false, false, false, null),
('ADM', 15, 'w15-2', 'task', 'Mock interview simulation', false, false, false, false, null),
('ADM', 15, 'w15-3', 'task', 'Finalise your Job Search Action Plan', false, false, true, false, null),
('ADM', 16, 'w16-1', 'task', 'Record your elevator pitch', false, false, true, false, null),
('ADM', 16, 'w16-2', 'task', 'Send 10 cold outreach messages', false, false, false, false, null),
('ADM', 17, 'w17-1', 'task', 'Weekly job application tracker', false, false, true, false, null),
('ADM', 17, 'w17-2', 'task', 'Report your first interview invite', false, false, false, false, null),
('CSP', 1, 'w1-1', 'guide', 'How to navigate the platform', false, false, false, false, null),
('CSP', 1, 'w1-2', 'oath', 'Read & sign the Student Oath', false, false, false, false, null),
('CSP', 1, 'w1-3', 'task', 'Read the Student Handbook', false, false, false, false, null),
('CSP', 1, 'w1-4', 'task', 'Join your cohort community', false, true, false, false, null),
('CSP', 2, 'w2-1', 'lesson', 'Professional communication', false, false, false, false, null),
('CSP', 2, 'w2-2', 'lesson', 'Remote work etiquette', false, false, false, false, null),
('CSP', 2, 'w2-3', 'lesson', 'File organisation in Google Drive & OneDrive', false, false, false, false, null),
('CSP', 2, 'w2-4', 'quiz', 'Week 2 assessment', false, false, false, false, array[1,2,3,0,1]::int[]),
('CSP', 2, 'w2-5', 'task', 'Week project: rewrite a messy email', true, false, true, false, null),
('CSP', 3, 'w3-1', 'lesson', 'Time management', false, false, false, false, null),
('CSP', 3, 'w3-2', 'lesson', 'Task tracking with Trello & Notion', false, false, false, false, null),
('CSP', 3, 'w3-3', 'quiz', 'Workplace Readiness Quiz', false, false, false, false, array[1,2,1,2,1]::int[]),
('CSP', 3, 'w3-4', 'task', 'Week project: set up your clean digital workspace', true, false, true, false, null),
('CSP', 4, 'w4-1', 'lesson', 'Customer support fundamentals', false, false, false, false, null),
('CSP', 4, 'w4-2', 'quiz', 'Week 4 assessment', false, false, false, false, array[3,0,1]::int[]),
('CSP', 4, 'w4-3', 'task', 'Week project: Support Fundamentals', true, false, true, false, null),
('CSP', 4, 'w4-4', 'task', 'Stretch challenge', false, true, true, false, null),
('CSP', 5, 'w5-1', 'lesson', 'Working in a ticketing tool', false, false, false, false, null),
('CSP', 5, 'w5-2', 'quiz', 'Week 5 assessment', false, false, false, false, array[0,1,2]::int[]),
('CSP', 5, 'w5-3', 'task', 'Week project: Ticketing Tools', true, false, true, false, null),
('CSP', 5, 'w5-4', 'task', 'Stretch challenge', false, true, true, false, null),
('CSP', 6, 'w6-1', 'lesson', 'Live chat & email etiquette', false, false, false, false, null),
('CSP', 6, 'w6-2', 'quiz', 'Week 6 assessment', false, false, false, false, array[1,2,3]::int[]),
('CSP', 6, 'w6-3', 'task', 'Week project: Live Chat & Email Etiquette', true, false, true, false, null),
('CSP', 6, 'w6-4', 'task', 'Stretch challenge', false, true, true, false, null),
('CSP', 7, 'w7-1', 'lesson', 'CX metrics: CSAT, FRT and NPS', false, false, false, false, null),
('CSP', 7, 'w7-2', 'quiz', 'Week 7 assessment', false, false, false, false, array[2,3,0]::int[]),
('CSP', 7, 'w7-3', 'task', 'Week project: module assignment', true, false, true, false, null),
('CSP', 7, 'w7-4', 'task', 'Technical competency check', false, false, false, false, null),
('CSP', 7, 'w7-5', 'task', 'Stretch challenge', false, true, true, false, null),
('CSP', 8, 'w8-1', 'task', 'Read your project brief', false, false, false, false, null),
('CSP', 8, 'w8-2', 'task', 'Submit your project plan', true, false, true, false, null),
('CSP', 8, 'w8-3', 'task', 'Check-in with your project supervisor', false, false, false, false, null),
('CSP', 9, 'w9-1', 'task', 'Submit your final project', true, false, true, false, null),
('CSP', 9, 'w9-2', 'task', 'Self-review against the rubric', false, false, false, false, null),
('CSP', 9, 'w9-3', 'task', 'Supervisor grading', false, false, false, true, null),
('CSP', 10, 'w10-1', 'task', 'Confirm your placement', false, false, false, false, null),
('CSP', 10, 'w10-2', 'logweek', 'Logbook entry · Week 1', false, false, false, false, null),
('CSP', 11, 'w11-1', 'logweek', 'Logbook entry · Week 2', false, false, false, false, null),
('CSP', 12, 'w12-1', 'logweek', 'Logbook entry · Week 3', false, false, false, false, null),
('CSP', 13, 'w13-1', 'logweek', 'Logbook entry · Week 4', false, false, false, false, null),
('CSP', 13, 'w13-2', 'task', 'Supervisor performance evaluation', false, false, false, true, null),
('CSP', 13, 'w13-3', 'task', 'Collect your internship certificate', false, false, false, false, null),
('CSP', 14, 'w14-1', 'task', 'ATS-compliant resume', false, false, true, false, null),
('CSP', 14, 'w14-2', 'task', 'LinkedIn profile makeover', false, false, true, false, null),
('CSP', 14, 'w14-3', 'task', 'Publish your portfolio', false, false, true, false, null),
('CSP', 14, 'w14-4', 'task', 'CV swap with a pod member', false, true, false, false, null),
('CSP', 15, 'w15-1', 'task', 'Book your 1-on-1 session', false, false, false, false, null),
('CSP', 15, 'w15-2', 'task', 'Mock interview simulation', false, false, false, false, null),
('CSP', 15, 'w15-3', 'task', 'Finalise your Job Search Action Plan', false, false, true, false, null),
('CSP', 16, 'w16-1', 'task', 'Record your elevator pitch', false, false, true, false, null),
('CSP', 16, 'w16-2', 'task', 'Send 10 cold outreach messages', false, false, false, false, null),
('CSP', 17, 'w17-1', 'task', 'Weekly job application tracker', false, false, true, false, null),
('CSP', 17, 'w17-2', 'task', 'Report your first interview invite', false, false, false, false, null),
('DAT', 1, 'w1-1', 'guide', 'How to navigate the platform', false, false, false, false, null),
('DAT', 1, 'w1-2', 'oath', 'Read & sign the Student Oath', false, false, false, false, null),
('DAT', 1, 'w1-3', 'task', 'Read the Student Handbook', false, false, false, false, null),
('DAT', 1, 'w1-4', 'task', 'Join your cohort community', false, true, false, false, null),
('DAT', 2, 'w2-1', 'lesson', 'Professional communication', false, false, false, false, null),
('DAT', 2, 'w2-2', 'lesson', 'Remote work etiquette', false, false, false, false, null),
('DAT', 2, 'w2-3', 'lesson', 'File organisation in Google Drive & OneDrive', false, false, false, false, null),
('DAT', 2, 'w2-4', 'quiz', 'Week 2 assessment', false, false, false, false, array[1,2,3,0,1]::int[]),
('DAT', 2, 'w2-5', 'task', 'Week project: rewrite a messy email', true, false, true, false, null),
('DAT', 3, 'w3-1', 'lesson', 'Time management', false, false, false, false, null),
('DAT', 3, 'w3-2', 'lesson', 'Task tracking with Trello & Notion', false, false, false, false, null),
('DAT', 3, 'w3-3', 'quiz', 'Workplace Readiness Quiz', false, false, false, false, array[1,2,1,2,1]::int[]),
('DAT', 3, 'w3-4', 'task', 'Week project: set up your clean digital workspace', true, false, true, false, null),
('DAT', 4, 'w4-1', 'lesson', 'Spreadsheet foundations for analysts', false, false, false, false, null),
('DAT', 4, 'w4-2', 'quiz', 'Week 4 assessment', false, false, false, false, array[3,0,1]::int[]),
('DAT', 4, 'w4-3', 'task', 'Week project: Spreadsheet Foundations', true, false, true, false, null),
('DAT', 4, 'w4-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DAT', 5, 'w5-1', 'lesson', 'Cleaning messy data', false, false, false, false, null),
('DAT', 5, 'w5-2', 'quiz', 'Week 5 assessment', false, false, false, false, array[0,1,2]::int[]),
('DAT', 5, 'w5-3', 'task', 'Week project: Cleaning Messy Data', true, false, true, false, null),
('DAT', 5, 'w5-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DAT', 6, 'w6-1', 'lesson', 'Charts that answer a question', false, false, false, false, null),
('DAT', 6, 'w6-2', 'quiz', 'Week 6 assessment', false, false, false, false, array[1,2,3]::int[]),
('DAT', 6, 'w6-3', 'task', 'Week project: Charts That Answer Questions', true, false, true, false, null),
('DAT', 6, 'w6-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DAT', 7, 'w7-1', 'lesson', 'Building a simple dashboard', false, false, false, false, null),
('DAT', 7, 'w7-2', 'quiz', 'Week 7 assessment', false, false, false, false, array[2,3,0]::int[]),
('DAT', 7, 'w7-3', 'task', 'Week project: module assignment', true, false, true, false, null),
('DAT', 7, 'w7-4', 'task', 'Technical competency check', false, false, false, false, null),
('DAT', 7, 'w7-5', 'task', 'Stretch challenge', false, true, true, false, null),
('DAT', 8, 'w8-1', 'task', 'Read your project brief', false, false, false, false, null),
('DAT', 8, 'w8-2', 'task', 'Submit your project plan', true, false, true, false, null),
('DAT', 8, 'w8-3', 'task', 'Check-in with your project supervisor', false, false, false, false, null),
('DAT', 9, 'w9-1', 'task', 'Submit your final project', true, false, true, false, null),
('DAT', 9, 'w9-2', 'task', 'Self-review against the rubric', false, false, false, false, null),
('DAT', 9, 'w9-3', 'task', 'Supervisor grading', false, false, false, true, null),
('DAT', 10, 'w10-1', 'task', 'Confirm your placement', false, false, false, false, null),
('DAT', 10, 'w10-2', 'logweek', 'Logbook entry · Week 1', false, false, false, false, null),
('DAT', 11, 'w11-1', 'logweek', 'Logbook entry · Week 2', false, false, false, false, null),
('DAT', 12, 'w12-1', 'logweek', 'Logbook entry · Week 3', false, false, false, false, null),
('DAT', 13, 'w13-1', 'logweek', 'Logbook entry · Week 4', false, false, false, false, null),
('DAT', 13, 'w13-2', 'task', 'Supervisor performance evaluation', false, false, false, true, null),
('DAT', 13, 'w13-3', 'task', 'Collect your internship certificate', false, false, false, false, null),
('DAT', 14, 'w14-1', 'task', 'ATS-compliant resume', false, false, true, false, null),
('DAT', 14, 'w14-2', 'task', 'LinkedIn profile makeover', false, false, true, false, null),
('DAT', 14, 'w14-3', 'task', 'Publish your portfolio', false, false, true, false, null),
('DAT', 14, 'w14-4', 'task', 'CV swap with a pod member', false, true, false, false, null),
('DAT', 15, 'w15-1', 'task', 'Book your 1-on-1 session', false, false, false, false, null),
('DAT', 15, 'w15-2', 'task', 'Mock interview simulation', false, false, false, false, null),
('DAT', 15, 'w15-3', 'task', 'Finalise your Job Search Action Plan', false, false, true, false, null),
('DAT', 16, 'w16-1', 'task', 'Record your elevator pitch', false, false, true, false, null),
('DAT', 16, 'w16-2', 'task', 'Send 10 cold outreach messages', false, false, false, false, null),
('DAT', 17, 'w17-1', 'task', 'Weekly job application tracker', false, false, true, false, null),
('DAT', 17, 'w17-2', 'task', 'Report your first interview invite', false, false, false, false, null),
('DMK', 1, 'w1-1', 'guide', 'How to navigate the platform', false, false, false, false, null),
('DMK', 1, 'w1-2', 'oath', 'Read & sign the Student Oath', false, false, false, false, null),
('DMK', 1, 'w1-3', 'task', 'Read the Student Handbook', false, false, false, false, null),
('DMK', 1, 'w1-4', 'task', 'Join your cohort community', false, true, false, false, null),
('DMK', 2, 'w2-1', 'lesson', 'Professional communication', false, false, false, false, null),
('DMK', 2, 'w2-2', 'lesson', 'Remote work etiquette', false, false, false, false, null),
('DMK', 2, 'w2-3', 'lesson', 'File organisation in Google Drive & OneDrive', false, false, false, false, null),
('DMK', 2, 'w2-4', 'quiz', 'Week 2 assessment', false, false, false, false, array[1,2,3,0,1]::int[]),
('DMK', 2, 'w2-5', 'task', 'Week project: rewrite a messy email', true, false, true, false, null),
('DMK', 3, 'w3-1', 'lesson', 'Time management', false, false, false, false, null),
('DMK', 3, 'w3-2', 'lesson', 'Task tracking with Trello & Notion', false, false, false, false, null),
('DMK', 3, 'w3-3', 'quiz', 'Workplace Readiness Quiz', false, false, false, false, array[1,2,1,2,1]::int[]),
('DMK', 3, 'w3-4', 'task', 'Week project: set up your clean digital workspace', true, false, true, false, null),
('DMK', 4, 'w4-1', 'lesson', 'Marketing fundamentals & the funnel', false, false, false, false, null),
('DMK', 4, 'w4-2', 'quiz', 'Week 4 assessment', false, false, false, false, array[3,0,1]::int[]),
('DMK', 4, 'w4-3', 'task', 'Week project: Marketing Fundamentals', true, false, true, false, null),
('DMK', 4, 'w4-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DMK', 5, 'w5-1', 'lesson', 'Content creation with Canva', false, false, false, false, null),
('DMK', 5, 'w5-2', 'quiz', 'Week 5 assessment', false, false, false, false, array[0,1,2]::int[]),
('DMK', 5, 'w5-3', 'task', 'Week project: Content Creation with Canva', true, false, true, false, null),
('DMK', 5, 'w5-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DMK', 6, 'w6-1', 'lesson', 'Social media management', false, false, false, false, null),
('DMK', 6, 'w6-2', 'quiz', 'Week 6 assessment', false, false, false, false, array[1,2,3]::int[]),
('DMK', 6, 'w6-3', 'task', 'Week project: Social Media Management', true, false, true, false, null),
('DMK', 6, 'w6-4', 'task', 'Stretch challenge', false, true, true, false, null),
('DMK', 7, 'w7-1', 'lesson', 'Paid ads & analytics basics', false, false, false, false, null),
('DMK', 7, 'w7-2', 'quiz', 'Week 7 assessment', false, false, false, false, array[2,3,0]::int[]),
('DMK', 7, 'w7-3', 'task', 'Week project: module assignment', true, false, true, false, null),
('DMK', 7, 'w7-4', 'task', 'Technical competency check', false, false, false, false, null),
('DMK', 7, 'w7-5', 'task', 'Stretch challenge', false, true, true, false, null),
('DMK', 8, 'w8-1', 'task', 'Read your project brief', false, false, false, false, null),
('DMK', 8, 'w8-2', 'task', 'Submit your project plan', true, false, true, false, null),
('DMK', 8, 'w8-3', 'task', 'Check-in with your project supervisor', false, false, false, false, null),
('DMK', 9, 'w9-1', 'task', 'Submit your final project', true, false, true, false, null),
('DMK', 9, 'w9-2', 'task', 'Self-review against the rubric', false, false, false, false, null),
('DMK', 9, 'w9-3', 'task', 'Supervisor grading', false, false, false, true, null),
('DMK', 10, 'w10-1', 'task', 'Confirm your placement', false, false, false, false, null),
('DMK', 10, 'w10-2', 'logweek', 'Logbook entry · Week 1', false, false, false, false, null),
('DMK', 11, 'w11-1', 'logweek', 'Logbook entry · Week 2', false, false, false, false, null),
('DMK', 12, 'w12-1', 'logweek', 'Logbook entry · Week 3', false, false, false, false, null),
('DMK', 13, 'w13-1', 'logweek', 'Logbook entry · Week 4', false, false, false, false, null),
('DMK', 13, 'w13-2', 'task', 'Supervisor performance evaluation', false, false, false, true, null),
('DMK', 13, 'w13-3', 'task', 'Collect your internship certificate', false, false, false, false, null),
('DMK', 14, 'w14-1', 'task', 'ATS-compliant resume', false, false, true, false, null),
('DMK', 14, 'w14-2', 'task', 'LinkedIn profile makeover', false, false, true, false, null),
('DMK', 14, 'w14-3', 'task', 'Publish your portfolio', false, false, true, false, null),
('DMK', 14, 'w14-4', 'task', 'CV swap with a pod member', false, true, false, false, null),
('DMK', 15, 'w15-1', 'task', 'Book your 1-on-1 session', false, false, false, false, null),
('DMK', 15, 'w15-2', 'task', 'Mock interview simulation', false, false, false, false, null),
('DMK', 15, 'w15-3', 'task', 'Finalise your Job Search Action Plan', false, false, true, false, null),
('DMK', 16, 'w16-1', 'task', 'Record your elevator pitch', false, false, true, false, null),
('DMK', 16, 'w16-2', 'task', 'Send 10 cold outreach messages', false, false, false, false, null),
('DMK', 17, 'w17-1', 'task', 'Weekly job application tracker', false, false, true, false, null),
('DMK', 17, 'w17-2', 'task', 'Report your first interview invite', false, false, false, false, null);

-- Late caps: full marks until Friday 17:00 WAT of the week, 80% until Sunday 23:59, then 50%.
create or replace function private.learn_cap(c cohorts, w int, at timestamptz) returns numeric
language sql stable as $$
  select case
    when at <= ((c.start_date + (w - 1) * 7 + 4) + time '17:00') at time zone 'Africa/Lagos' then 1
    when at <= ((c.start_date + (w - 1) * 7 + 6) + time '23:59') at time zone 'Africa/Lagos' then 0.8
    else 0.5 end
$$;

create or replace function private.learn_item(a applications, p_key text) returns course_items
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare it course_items;
begin
  select * into it from course_items where track_code = a.track_code and key = p_key;
  if it.key is null then raise exception 'That item was not found.' using errcode = 'P0001'; end if;
  return it;
end $$;

create or replace function private.learn_row(x learn_progress) returns jsonb
language sql immutable as $$
  select jsonb_build_object('status', x.status, 'link', x.link, 'data', x.data, 'score', x.score, 'cap', x.cap,
    'grade', x.grade, 'feedback', x.feedback, 'at', x.done_at, 'graded_by', x.graded_by, 'graded_at', x.graded_at)
$$;

-- Student: everything the portal needs about my progress.
create or replace function public.learn_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  return jsonb_build_object(
    'track', a.track_code,
    'start_date', c.start_date,
    'pass_mark', coalesce(nullif(private.setting('learn_pass', '70'), '')::int, 70),
    'unlock_all', private.setting('unlock_weeks', 'off') = 'on',
    'progress', coalesce((select jsonb_object_agg(x.key, private.learn_row(x)) from learn_progress x where x.application_id = a.id), '{}'::jsonb),
    'attempts', coalesce((select jsonb_object_agg(t.week, t.n) from learn_attempts t where t.application_id = a.id), '{}'::jsonb),
    'checkins', coalesce((select jsonb_object_agg(k.week, jsonb_build_object('conf', k.conf, 'note', k.note, 'at', k.at)) from learn_checkins k where k.application_id = a.id), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('key', h.key, 'action', h.action, 'by', h.by_name, 'at', h.at) order by h.at) from learn_history h where h.application_id = a.id), '[]'::jsonb),
    'now', now());
end $$;

-- Student: mark a lesson, guide or simple task done (or undo), or sign the oath.
create or replace function public.learn_done(p_key text, p_done boolean, p_data jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; x learn_progress;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.staff then raise exception 'Staff complete this step.' using errcode = 'P0001'; end if;
  if it.type = 'quiz' or it.link then raise exception 'Submit this one from its own page.' using errcode = 'P0001'; end if;
  select * into x from learn_progress where application_id = a.id and key = p_key;
  if p_done then
    if it.type = 'oath' and coalesce(trim(p_data ->> 'sig'), '') = '' then raise exception 'Sign with your full name.' using errcode = 'P0001'; end if;
    insert into learn_progress(application_id, key, week, status, data) values (a.id, p_key, it.week, 'done', p_data)
    on conflict (application_id, key) do update set status = 'done', data = coalesce(excluded.data, learn_progress.data), done_at = now();
    insert into learn_history(application_id, key, action) values (a.id, p_key, case when it.type = 'oath' then 'Signed' else 'Completed' end);
  else
    if it.type = 'oath' then raise exception 'A signed oath can''t be undone.' using errcode = 'P0001'; end if;
    delete from learn_progress where application_id = a.id and key = p_key and status = 'done';
  end if;
  return public.learn_state();
end $$;

-- Student: submit (or resubmit) a link to my work.
create or replace function public.learn_submit(p_key text, p_link text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; it course_items; x learn_progress; u text;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  it := private.learn_item(a, p_key);
  if not it.link then raise exception 'This item doesn''t take a link.' using errcode = 'P0001'; end if;
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

-- Student: undo a submission that hasn't been graded yet.
create or replace function public.learn_unsubmit(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  delete from learn_progress where application_id = a.id and key = p_key and status in ('submitted','done');
  return public.learn_state();
end $$;

-- Student: answer a quiz. One attempt; marked here so the answers never reach the browser.
create or replace function public.learn_quiz(p_key text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items; n int; ok int := 0; i int; sc int;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if it.type <> 'quiz' then raise exception 'That isn''t a quiz.' using errcode = 'P0001'; end if;
  if exists (select 1 from learn_progress where application_id = a.id and key = p_key) then
    raise exception 'You have already taken this quiz.' using errcode = 'P0001';
  end if;
  n := coalesce(array_length(it.answers, 1), 0);
  if jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) <> n then raise exception 'Answer every question.' using errcode = 'P0001'; end if;
  for i in 1..n loop
    if (p_answers ->> (i - 1))::int = it.answers[i] then ok := ok + 1; end if;
  end loop;
  sc := round(100.0 * ok / greatest(n, 1));
  insert into learn_progress(application_id, key, week, status, score, cap, data)
  values (a.id, p_key, it.week, 'done', sc, 1, jsonb_build_object('answers', p_answers, 'correct', to_jsonb(it.answers)));
  insert into learn_history(application_id, key, action) values (a.id, p_key, format('Quiz score %s%%', sc));
  return public.learn_state();
end $$;

-- Student: weekly check-in.
create or replace function public.learn_checkin(p_week int, p_conf int, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  insert into learn_checkins(application_id, week, conf, note) values (a.id, p_week, p_conf, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (application_id, week) do update set conf = excluded.conf, note = excluded.note, at = now();
  return public.learn_state();
end $$;

-- Student: repeat a week that wasn't passed. Its work resets.
create or replace function public.learn_repeat(p_week int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  delete from learn_progress where application_id = a.id and week = p_week;
  insert into learn_attempts(application_id, week, n) values (a.id, p_week, 2)
  on conflict (application_id, week) do update set n = learn_attempts.n + 1;
  insert into learn_history(application_id, key, action) values (a.id, 'w' || p_week, 'Started the week again');
  return public.learn_state();
end $$;

-- Staff: work waiting for grading, plus steps staff complete.
create or replace function public.acad_learn_queue() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','academy_admin']);
  return jsonb_build_object(
    'work', coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric,
        'track', a.track_code, 'week', i.week, 'key', i.key, 'title', i.title, 'link', x.link, 'at', x.done_at, 'cap', x.cap,
        'status', x.status, 'grade', x.grade, 'score', x.score, 'feedback', x.feedback, 'graded_by', x.graded_by) order by x.status <> 'submitted', x.done_at)
      from learn_progress x join applications a on a.id = x.application_id
      join course_items i on i.track_code = a.track_code and i.key = x.key
      where i.proj and private.track_ok(s, a.track_code)), '[]'::jsonb),
    'staff_steps', coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric,
        'track', a.track_code, 'week', i.week, 'key', i.key, 'title', i.title, 'done', x.key is not null) order by i.week, a.surname)
      from applications a join course_items i on i.track_code = a.track_code and i.staff
      left join learn_progress x on x.application_id = a.id and x.key = i.key
      where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb));
end $$;

-- Staff: grade a week project (or ask for changes).
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
    score = case when p_status = 'graded' then round(p_grade * coalesce(cap, 1)) end,
    feedback = nullif(trim(coalesce(p_feedback, '')), ''), graded_by = s.full_name, graded_at = now()
  where application_id = a.id and key = p_key returning * into x;
  insert into learn_history(application_id, key, action, by_name) values (a.id, p_key,
    case when p_status = 'graded' then format('Graded %s%%', x.score) else 'Changes requested' end, s.full_name);
  perform private.queue_mail(a, 'graded', jsonb_build_object('task', it.title,
    'result', case when p_status = 'graded' then format('was graded: %s%%', x.score) else 'needs another try' end,
    'feedback', coalesce(x.feedback, 'No extra comments.')), private.site() || '/#/learn/assignments');
  return private.learn_row(x);
end $$;

-- Staff: complete (or undo) a step staff are responsible for.
create or replace function public.acad_learn_mark(p_app uuid, p_key text, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; it course_items;
begin
  s := private.require_role(array['director','cohort_manager','facilitator']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'You can''t update that student.' using errcode = 'P0001'; end if;
  it := private.learn_item(a, p_key);
  if not it.staff then raise exception 'Students complete this step themselves.' using errcode = 'P0001'; end if;
  if p_done then
    insert into learn_progress(application_id, key, week, status, graded_by, graded_at) values (a.id, p_key, it.week, 'done', s.full_name, now())
    on conflict (application_id, key) do nothing;
    insert into learn_history(application_id, key, action, by_name) values (a.id, p_key, 'Completed by staff', s.full_name);
  else
    delete from learn_progress where application_id = a.id and key = p_key;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Staff: progress summary per student (Students tab).
create or replace function public.acad_learn_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin','adm_admin']);
  return coalesce((select jsonb_object_agg(a.id, jsonb_build_object(
      'done', (select count(*) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key where x.application_id = a.id and not i.opt and x.status in ('done','graded','submitted')),
      'total', (select count(*) from course_items i where i.track_code = a.track_code and not i.opt),
      'avg', (select round(avg(x.score)) from learn_progress x where x.application_id = a.id and x.score is not null),
      'to_grade', (select count(*) from learn_progress x where x.application_id = a.id and x.status = 'submitted')))
    from applications a where a.status = 'Admitted' and a.matric is not null), '{}'::jsonb);
end $$;

revoke execute on function private.learn_cap(cohorts, int, timestamptz), private.learn_item(applications, text), private.learn_row(learn_progress) from public;
revoke execute on function public.learn_state(), public.learn_done(text, boolean, jsonb), public.learn_submit(text, text), public.learn_unsubmit(text),
  public.learn_quiz(text, jsonb), public.learn_checkin(int, int, text), public.learn_repeat(int),
  public.acad_learn_queue(), public.acad_learn_grade(uuid, text, text, int, text), public.acad_learn_mark(uuid, text, boolean), public.acad_learn_stats() from public, anon;
grant execute on function public.learn_state(), public.learn_done(text, boolean, jsonb), public.learn_submit(text, text), public.learn_unsubmit(text),
  public.learn_quiz(text, jsonb), public.learn_checkin(int, int, text), public.learn_repeat(int),
  public.acad_learn_queue(), public.acad_learn_grade(uuid, text, text, int, text), public.acad_learn_mark(uuid, text, boolean), public.acad_learn_stats() to authenticated;

notify pgrst, 'reload schema';

select 'Student portal (Phase 1) installed' as done, (select count(*) from course_items) as course_items;


-- Student portal, Phase 2: client project messages, internship placements with a
-- no-login sign-off link for host supervisors, CV builder and job-search tools,
-- and Discovery Call 2 booking with career coaches.

-- ---------- tables ----------
create table if not exists placements (
  application_id uuid primary key references applications(id) on delete cascade,
  org text not null,
  role text not null,
  sup_name text not null,
  sup_email text,
  sup_phone text,
  token uuid not null default gen_random_uuid() unique,   -- the host supervisor's link
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table placements enable row level security;

-- Work saved as you go: CV, pitch, outreach log, applications, checklists.
create table if not exists learn_drafts (
  application_id uuid not null references applications(id) on delete cascade,
  key text not null check (key in ('cv','pitch','outreach','apps','prep','li')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (application_id, key)
);
alter table learn_drafts enable row level security;

create table if not exists learn_messages (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  thread text not null default 'proj',
  from_staff boolean not null default false,
  by_name text,
  body text not null check (length(body) between 1 and 2000),
  at timestamptz not null default now()
);
create index if not exists learn_messages_app on learn_messages(application_id, at);
alter table learn_messages enable row level security;

create table if not exists learn_evals (
  application_id uuid primary key references applications(id) on delete cascade,
  ratings int[] not null,
  comment text,
  by_name text,
  at timestamptz not null default now()
);
alter table learn_evals enable row level security;

create table if not exists coach_slots (
  id bigint generated always as identity primary key,
  coach_email text not null references staff(email),
  starts_at timestamptz not null,
  application_id uuid references applications(id) on delete set null,
  note text,
  booked_at timestamptz,
  unique (coach_email, starts_at)
);
create unique index if not exists coach_slots_one_each on coach_slots(application_id) where application_id is not null;
alter table coach_slots enable row level security;

create table if not exists call_results (
  application_id uuid primary key references applications(id) on delete cascade,
  score int not null check (score between 1 and 10),
  note text,
  next text[],
  by_name text,
  at timestamptz not null default now()
);
alter table call_results enable row level security;

-- ---------- helpers ----------
create or replace function private.key_of(a applications, p_title text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select key from course_items where track_code = a.track_code and title = p_title order by week limit 1
$$;

-- Mark an item done for a student (used by bookings, coaches and host supervisors).
create or replace function private.learn_mark(a applications, p_title text, p_done boolean, p_by text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; w int;
begin
  select key, week into k, w from course_items where track_code = a.track_code and title = p_title order by week limit 1;
  if k is null then return; end if;
  if p_done then
    insert into learn_progress(application_id, key, week, status, graded_by, graded_at) values (a.id, k, w, 'done', p_by, case when p_by is null then null else now() end)
    on conflict (application_id, key) do nothing;
  else
    delete from learn_progress where application_id = a.id and key = k;
  end if;
end $$;

create or replace function private.placement_json(p placements) returns jsonb
language sql immutable as $$
  select case when p.application_id is null then null else
    jsonb_build_object('org', p.org, 'role', p.role, 'sup_name', p.sup_name, 'sup_email', p.sup_email, 'sup_phone', p.sup_phone) end
$$;

create or replace function private.slot_json(s coach_slots) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'at', s.starts_at, 'coach', (select full_name from staff where email = s.coach_email), 'note', s.note)
$$;

-- ---------- student ----------
-- Everything Phase 2 screens need, alongside learn_state().
create or replace function public.learn_extra() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications; p placements; s coach_slots; r call_results;
begin
  a := private.require_student();
  select * into p from placements where application_id = a.id;
  select * into s from coach_slots where application_id = a.id;
  select * into r from call_results where application_id = a.id;
  return jsonb_build_object(
    'placement', private.placement_json(p),
    'drafts', coalesce((select jsonb_object_agg(d.key, d.data) from learn_drafts d where d.application_id = a.id), '{}'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'staff', m.from_staff, 'by', m.by_name, 'body', m.body, 'at', m.at) order by m.at)
      from learn_messages m where m.application_id = a.id and m.thread = 'proj'), '[]'::jsonb),
    'booking', case when s.id is null then null else private.slot_json(s) end,
    'call_link', case when s.id is null then null else nullif(private.setting('call_link', ''), '') end,
    'result', case when r.application_id is null then null else jsonb_build_object('score', r.score, 'note', r.note, 'next', to_jsonb(r.next), 'by', r.by_name, 'at', r.at) end,
    'eval', (select jsonb_build_object('ratings', to_jsonb(e.ratings), 'comment', e.comment, 'by', e.by_name, 'at', e.at) from learn_evals e where e.application_id = a.id));
end $$;

create or replace function public.learn_draft(p_key text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if p_key not in ('cv','pitch','outreach','apps','prep','li') then raise exception 'Unknown draft.' using errcode = 'P0001'; end if;
  if length(p_data::text) > 60000 then raise exception 'That is too long to save.' using errcode = 'P0001'; end if;
  insert into learn_drafts(application_id, key, data) values (a.id, p_key, p_data)
  on conflict (application_id, key) do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.learn_message(p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a message first.' using errcode = 'P0001'; end if;
  insert into learn_messages(application_id, thread, from_staff, by_name, body) values (a.id, 'proj', false, a.first_name, left(trim(p_body), 2000));
  return public.learn_extra();
end $$;

-- learn_done, with the Phase 2 rules for special steps.
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
    if it.type = 'oath' and coalesce(trim(p_data ->> 'sig'), '') = '' then raise exception 'Sign with your full name.' using errcode = 'P0001'; end if;
    if it.title = 'Confirm your placement' and not exists (select 1 from placements where application_id = a.id) then
      raise exception 'Your placement hasn''t been assigned yet. Student Success will add it here.' using errcode = 'P0001';
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

-- Undo only applies to link submissions that haven't been graded.
create or replace function public.learn_unsubmit(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items;
begin
  a := private.require_student();
  it := private.learn_item(a, p_key);
  if not it.link then raise exception 'This can''t be undone here.' using errcode = 'P0001'; end if;
  delete from learn_progress where application_id = a.id and key = p_key and status in ('submitted','done');
  return public.learn_state();
end $$;

-- Discovery Call 2: open times, book, cancel.
create or replace function public.dc2_slots() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return coalesce((select jsonb_agg(private.slot_json(s) order by s.starts_at) from coach_slots s
    where s.application_id is null and s.starts_at > now() + interval '2 hours'), '[]'::jsonb);
end $$;

create or replace function public.dc2_book(p_slot bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; s coach_slots; co staff;
begin
  a := private.require_student();
  if exists (select 1 from coach_slots where application_id = a.id) then raise exception 'You already have a call booked. Cancel it first to pick another time.' using errcode = 'P0001'; end if;
  update coach_slots set application_id = a.id, note = nullif(left(trim(coalesce(p_note, '')), 300), ''), booked_at = now()
  where id = p_slot and application_id is null and starts_at > now() + interval '2 hours' returning * into s;
  if s.id is null then raise exception 'Sorry, that time was just taken. Please pick another.' using errcode = 'P0001'; end if;
  select * into co from staff where email = s.coach_email;
  perform private.learn_mark(a, 'Book your 1-on-1 session', true, null);
  insert into learn_history(application_id, key, action) values (a.id, coalesce(private.key_of(a, 'Book your 1-on-1 session'), 'dc2'), 'Booked Discovery Call 2');
  perform private.queue_mail(a, 'dc2_booked', jsonb_build_object(
    'longdate', private.wat(s.starts_at, 'FMDay, FMDD FMMonth'), 'time', private.wat(s.starts_at, 'HH24:MI'), 'coach', co.full_name,
    'meet', private.setting('call_link', ''),
    'gcal', private.gcal_url(s.starts_at, 40, 'Jobnest Discovery Call 2', 'Your 40-minute call with ' || co.full_name || ', Career Coach.', private.setting('call_link', ''))),
    private.site() || '/#/learn/learning/15');
  return public.learn_extra();
end $$;

create or replace function public.dc2_cancel() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; s coach_slots;
begin
  a := private.require_student();
  select * into s from coach_slots where application_id = a.id;
  if s.id is null then return public.learn_extra(); end if;
  if s.starts_at < now() + interval '2 hours' then raise exception 'It''s less than 2 hours to your call. Message Student Success to change it.' using errcode = 'P0001'; end if;
  if exists (select 1 from call_results where application_id = a.id) then raise exception 'Your call has already happened.' using errcode = 'P0001'; end if;
  update coach_slots set application_id = null, note = null, booked_at = null where id = s.id;
  perform private.learn_mark(a, 'Book your 1-on-1 session', false, null);
  insert into learn_history(application_id, key, action) values (a.id, coalesce(private.key_of(a, 'Book your 1-on-1 session'), 'dc2'), 'Cancelled Discovery Call 2');
  return public.learn_extra();
end $$;

-- ---------- host supervisor (no login: the secret link) ----------
create or replace function public.host_view(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p placements; a applications;
begin
  select * into p from placements where token = p_token;
  if p.application_id is null then raise exception 'This link isn''t valid. Ask Jobnest Student Success for a new one.' using errcode = 'P0001'; end if;
  select * into a from applications where id = p.application_id;
  return jsonb_build_object(
    'student', a.first_name || ' ' || a.surname, 'first', a.first_name, 'matric', a.matric,
    'track', (select name from tracks where code = a.track_code), 'placement', private.placement_json(p),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('key', i.key, 'week', i.week, 'title', i.title,
        'status', x.status, 'data', x.data, 'feedback', x.feedback, 'at', x.done_at) order by i.week)
      from course_items i left join learn_progress x on x.application_id = a.id and x.key = i.key
      where i.track_code = a.track_code and i.type = 'logweek'), '[]'::jsonb),
    'eval', (select jsonb_build_object('ratings', to_jsonb(e.ratings), 'comment', e.comment, 'by', e.by_name, 'at', e.at) from learn_evals e where e.application_id = a.id));
end $$;

create or replace function public.host_sign(p_token uuid, p_key text, p_ok boolean, p_comment text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare p placements; a applications; x learn_progress; it course_items;
begin
  select * into p from placements where token = p_token;
  if p.application_id is null then raise exception 'This link isn''t valid.' using errcode = 'P0001'; end if;
  select * into a from applications where id = p.application_id;
  it := private.learn_item(a, p_key);
  if it.type <> 'logweek' then raise exception 'That isn''t a logbook entry.' using errcode = 'P0001'; end if;
  select * into x from learn_progress where application_id = a.id and key = p_key for update;
  if x.key is null or x.status <> 'done' then raise exception 'There''s nothing to sign for that week yet.' using errcode = 'P0001'; end if;
  if coalesce((x.data ->> 'signed')::boolean, false) then raise exception 'You''ve already signed this week.' using errcode = 'P0001'; end if;
  if p_ok then
    update learn_progress set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('signed', true, 'sup_comment', nullif(trim(coalesce(p_comment, '')), ''),
      'signed_by', p.sup_name, 'signed_at', now()), graded_by = p.sup_name, graded_at = now()
    where application_id = a.id and key = p_key;
    insert into learn_history(application_id, key, action, by_name) values (a.id, p_key, 'Signed by supervisor', p.sup_name);
  else
    if coalesce(trim(p_comment), '') = '' then raise exception 'Tell them what to change.' using errcode = 'P0001'; end if;
    update learn_progress set status = 'revise', feedback = trim(p_comment), graded_by = p.sup_name, graded_at = now()
    where application_id = a.id and key = p_key;
    insert into learn_history(application_id, key, action, by_name) values (a.id, p_key, 'Supervisor asked for changes', p.sup_name);
    perform private.queue_mail(a, 'logbook_changes', jsonb_build_object('week', it.title, 'sup', p.sup_name, 'feedback', trim(p_comment)),
      private.site() || '/#/learn/learning/' || it.week || '/' || it.key);
  end if;
  return public.host_view(p_token);
end $$;

create or replace function public.host_eval(p_token uuid, p_ratings int[], p_comment text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare p placements; a applications;
begin
  select * into p from placements where token = p_token;
  if p.application_id is null then raise exception 'This link isn''t valid.' using errcode = 'P0001'; end if;
  select * into a from applications where id = p.application_id;
  if coalesce(array_length(p_ratings, 1), 0) <> 5 or exists (select 1 from unnest(p_ratings) r where r is null or r < 1 or r > 5) then
    raise exception 'Rate each area from 1 to 5.' using errcode = 'P0001';
  end if;
  if exists (select 1 from course_items i left join learn_progress x on x.application_id = a.id and x.key = i.key
    where i.track_code = a.track_code and i.type = 'logweek' and not coalesce((x.data ->> 'signed')::boolean, false)) then
    raise exception 'Sign off all four weeks first.' using errcode = 'P0001';
  end if;
  insert into learn_evals(application_id, ratings, comment, by_name) values (a.id, p_ratings, nullif(trim(coalesce(p_comment, '')), ''), p.sup_name)
  on conflict (application_id) do update set ratings = excluded.ratings, comment = excluded.comment, by_name = excluded.by_name, at = now();
  perform private.learn_mark(a, 'Supervisor performance evaluation', true, p.sup_name);
  insert into learn_history(application_id, key, action, by_name) values (a.id, coalesce(private.key_of(a, 'Supervisor performance evaluation'), 'eval'), 'Evaluation submitted', p.sup_name);
  return public.host_view(p_token);
end $$;

-- ---------- staff ----------
create or replace function public.acad_placements() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','coach','facilitator']);
  return coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric,
      'track', (select name from tracks where code = a.track_code), 'placement', private.placement_json(p), 'token', p.token,
      'signed', (select count(*) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key
        where x.application_id = a.id and i.type = 'logweek' and coalesce((x.data ->> 'signed')::boolean, false)),
      'to_sign', (select count(*) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key
        where x.application_id = a.id and i.type = 'logweek' and x.status = 'done' and not coalesce((x.data ->> 'signed')::boolean, false)),
      'eval', exists (select 1 from learn_evals e where e.application_id = a.id)) order by a.surname)
    from applications a left join placements p on p.application_id = a.id
    where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb);
end $$;

create or replace function public.acad_placement_save(p_app uuid, p_org text, p_role text, p_sup_name text, p_sup_email text, p_sup_phone text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; p placements;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin']);
  select * into a from applications where id = p_app and status = 'Admitted';
  if a.id is null then raise exception 'Student not found.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_org), '') = '' or coalesce(trim(p_role), '') = '' or coalesce(trim(p_sup_name), '') = '' then
    raise exception 'Add the company, the role and the supervisor''s name.' using errcode = 'P0001';
  end if;
  insert into placements(application_id, org, role, sup_name, sup_email, sup_phone, updated_by)
  values (a.id, trim(p_org), trim(p_role), trim(p_sup_name), nullif(lower(trim(coalesce(p_sup_email, ''))), ''), nullif(trim(coalesce(p_sup_phone, '')), ''), s.full_name)
  on conflict (application_id) do update set org = excluded.org, role = excluded.role, sup_name = excluded.sup_name,
    sup_email = excluded.sup_email, sup_phone = excluded.sup_phone, updated_by = excluded.updated_by, updated_at = now()
  returning * into p;
  return jsonb_build_object('token', p.token);
end $$;

-- Project supervisors / facilitators: message threads.
create or replace function public.acad_messages() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','facilitator']);
  return coalesce((select jsonb_agg(t order by (t ->> 'last_at') desc) from (
    select jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'track', a.track_code,
      'last_at', max(m.at), 'waiting', (array_agg(m.from_staff order by m.at desc))[1] = false,
      'messages', jsonb_agg(jsonb_build_object('staff', m.from_staff, 'by', m.by_name, 'body', m.body, 'at', m.at) order by m.at)) t
    from learn_messages m join applications a on a.id = m.application_id
    where private.track_ok(s, a.track_code) group by a.id) q), '[]'::jsonb);
end $$;

create or replace function public.acad_message_reply(p_app uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['director','cohort_manager','facilitator']);
  select * into a from applications where id = p_app;
  if a.id is null or not private.track_ok(s, a.track_code) then raise exception 'You can''t message that student.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a reply first.' using errcode = 'P0001'; end if;
  insert into learn_messages(application_id, thread, from_staff, by_name, body) values (a.id, 'proj', true, s.full_name, left(trim(p_body), 2000));
  perform private.queue_mail(a, 'message', jsonb_build_object('by', s.full_name, 'body', left(trim(p_body), 2000)), private.site() || '/#/learn/learning/8');
  return jsonb_build_object('ok', true);
end $$;

-- Career coaches: times, bookings and call results.
create or replace function public.coach_calls() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['coach','director','cohort_manager']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.starts_at, 'coach', c.full_name, 'mine', x.coach_email = s.email,
      'app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'track', (select name from tracks where code = a.track_code),
      'note', x.note, 'result', (select jsonb_build_object('score', r.score, 'note', r.note, 'next', to_jsonb(r.next)) from call_results r where r.application_id = a.id),
      'cv', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'cv')) order by x.starts_at)
    from coach_slots x join staff c on c.email = x.coach_email left join applications a on a.id = x.application_id
    where x.starts_at > now() - interval '21 days' and (s.role <> 'coach' or x.coach_email = s.email)), '[]'::jsonb);
end $$;

create or replace function public.coach_add_slots(p_times timestamptz[]) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; n int;
begin
  s := private.require_role(array['coach']);
  insert into coach_slots(coach_email, starts_at) select s.email, t from unnest(p_times) t where t > now() on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.coach_remove_slot(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['coach']);
  delete from coach_slots where id = p_id and application_id is null and (coach_email = s.email or s.role = 'super');
end $$;

create or replace function public.coach_result(p_app uuid, p_score int, p_note text, p_next text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; nx text[];
begin
  s := private.require_role(array['coach','director','cohort_manager']);
  select * into a from applications where id = p_app;
  if a.id is null or not exists (select 1 from coach_slots where application_id = a.id) then raise exception 'That student hasn''t booked a call.' using errcode = 'P0001'; end if;
  if p_score is null or p_score < 1 or p_score > 10 then raise exception 'Give a confidence score from 1 to 10.' using errcode = 'P0001'; end if;
  select array_agg(trim(l)) into nx from unnest(string_to_array(coalesce(p_next, ''), E'\n')) l where trim(l) <> '';
  insert into call_results(application_id, score, note, next, by_name) values (a.id, p_score, nullif(trim(coalesce(p_note, '')), ''), nx, s.full_name)
  on conflict (application_id) do update set score = excluded.score, note = excluded.note, next = excluded.next, by_name = excluded.by_name, at = now();
  perform private.learn_mark(a, 'Mock interview simulation', true, s.full_name);
  insert into learn_history(application_id, key, action, by_name) values (a.id, coalesce(private.key_of(a, 'Mock interview simulation'), 'dc2'), format('Call result: %s/10', p_score), s.full_name);
  perform private.queue_mail(a, 'dc2_result', jsonb_build_object('score', p_score, 'coach', s.full_name), private.site() || '/#/learn/learning/15');
  return jsonb_build_object('ok', true);
end $$;

-- Grading the final project also completes "Supervisor grading".
create or replace function private.after_grade() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items;
begin
  if new.status = 'graded' and (old.status is distinct from 'graded') then
    select * into a from applications where id = new.application_id;
    select * into it from course_items where track_code = a.track_code and key = new.key;
    if it.title = 'Submit your final project' then perform private.learn_mark(a, 'Supervisor grading', true, new.graded_by); end if;
  end if;
  return new;
end $$;
drop trigger if exists learn_after_grade on learn_progress;
create trigger learn_after_grade after update on learn_progress for each row execute function private.after_grade();

-- ---------- emails ----------
insert into email_templates(key, subject, body, cta) values
  ('dc2_booked', 'Your Discovery Call 2 is booked: {longdate}, {time}',
   E'Hi {first},\n\nYour Discovery Call 2 with {coach} is booked for {longdate} at {time} (Lagos time). It lasts 40 minutes.\n\n[Join the call on Microsoft Teams]({meet})\n\n[Add it to your Google Calendar]({gcal})\n\nHave your CV, your portfolio link and three roles you''re targeting ready.',
   'Open Discovery Call 2'),
  ('dc2_result', 'Your Discovery Call 2 results are in',
   E'Hi {first},\n\n{coach} has added your Interview Confidence Score ({score}/10) and your next steps. Open the portal to see them, then submit your Job Search Action Plan.',
   'See my results'),
  ('logbook_changes', 'Your supervisor asked for changes: {week}',
   E'Hi {first},\n\n{sup} asked you to update your logbook entry ({week}) before they sign it.\n\nTheir comment: {feedback}',
   'Update my logbook'),
  ('message', 'New message from {by}',
   E'Hi {first},\n\n{by} replied about your client project:\n\n{body}',
   'Open my project')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

-- ---------- who may call what ----------
revoke execute on function private.key_of(applications, text), private.learn_mark(applications, text, boolean, text),
  private.placement_json(placements), private.slot_json(coach_slots), private.after_grade() from public;
revoke execute on function public.learn_extra(), public.learn_draft(text, jsonb), public.learn_message(text), public.learn_done(text, boolean, jsonb),
  public.dc2_slots(), public.dc2_book(bigint, text), public.dc2_cancel(),
  public.acad_placements(), public.acad_placement_save(uuid, text, text, text, text, text), public.acad_messages(), public.acad_message_reply(uuid, text),
  public.coach_calls(), public.coach_add_slots(timestamptz[]), public.coach_remove_slot(bigint), public.coach_result(uuid, int, text, text) from public, anon;
grant execute on function public.learn_extra(), public.learn_draft(text, jsonb), public.learn_message(text), public.learn_done(text, boolean, jsonb),
  public.dc2_slots(), public.dc2_book(bigint, text), public.dc2_cancel(),
  public.acad_placements(), public.acad_placement_save(uuid, text, text, text, text, text), public.acad_messages(), public.acad_message_reply(uuid, text),
  public.coach_calls(), public.coach_add_slots(timestamptz[]), public.coach_remove_slot(bigint), public.coach_result(uuid, int, text, text) to authenticated;
revoke execute on function public.host_view(uuid), public.host_sign(uuid, text, boolean, text), public.host_eval(uuid, int[], text) from public;
grant execute on function public.host_view(uuid), public.host_sign(uuid, text, boolean, text), public.host_eval(uuid, int[], text) to anon, authenticated;

notify pgrst, 'reload schema';


-- Staff view of each student's job search: Weeks 14–17 links, pitch, outreach and applications.
create or replace function public.acad_jobsearch() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['coach','director','cohort_manager','academy_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'phone', a.phone,
      'track', (select name from tracks where code = a.track_code),
      'links', coalesce((select jsonb_object_agg(i.title, x.link) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key
        where x.application_id = a.id and x.link is not null and i.week >= 14), '{}'::jsonb),
      'done', coalesce((select jsonb_agg(i.title) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key
        where x.application_id = a.id and i.week >= 14 and x.status <> 'revise'), '[]'::jsonb),
      'pitch', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'pitch'),
      'outreach', coalesce((select d.data from learn_drafts d where d.application_id = a.id and d.key = 'outreach'), '[]'::jsonb),
      'apps', coalesce((select d.data from learn_drafts d where d.application_id = a.id and d.key = 'apps'), '[]'::jsonb),
      'cv', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'cv'),
      'score', (select r.score from call_results r where r.application_id = a.id),
      'updated', (select max(d.updated_at) from learn_drafts d where d.application_id = a.id and d.key in ('pitch','outreach','apps')))
      order by a.surname)
    from applications a where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb);
end $$;

revoke execute on function public.acad_jobsearch() from public, anon;
grant execute on function public.acad_jobsearch() to authenticated;

notify pgrst, 'reload schema';


-- After Week 17: graduation page, job outcomes, alumni check-ins (30/60/90 days) and the exit survey.

create table if not exists learn_outcomes (
  application_id uuid primary key references applications(id) on delete cascade,
  status text not null check (status in ('hired','internship','freelance','study','searching')),
  company text,
  role text,
  start_date date,
  via text check (via in ('jobnest','own','referral','other')),
  updated_at timestamptz not null default now()
);
alter table learn_outcomes enable row level security;

create table if not exists alumni_checkins (
  application_id uuid not null references applications(id) on delete cascade,
  day int not null check (day in (30, 60, 90)),
  status text not null check (status in ('hired','internship','freelance','study','searching')),
  note text,
  at timestamptz not null default now(),
  primary key (application_id, day)
);
alter table alumni_checkins enable row level security;

create table if not exists exit_surveys (
  application_id uuid primary key references applications(id) on delete cascade,
  recommend int not null check (recommend between 0 and 10),
  best text,
  improve text,
  testimonial text,
  consent boolean not null default false,
  at timestamptz not null default now()
);
alter table exit_surveys enable row level security;

create or replace function private.outcome_json(o learn_outcomes) returns jsonb
language sql immutable as $$
  select case when o.application_id is null then null else jsonb_build_object('status', o.status, 'company', o.company, 'role', o.role,
    'start_date', o.start_date, 'via', o.via, 'at', o.updated_at) end
$$;

-- Student
create or replace function public.grad_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; p programmes; o learn_outcomes;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  select * into p from programmes where code = c.programme_code;
  select * into o from learn_outcomes where application_id = a.id;
  return jsonb_build_object(
    'end_date', c.start_date + coalesce(p.weeks, 17) * 7 - 3,
    'outcome', private.outcome_json(o),
    'checkins', coalesce((select jsonb_object_agg(k.day, jsonb_build_object('status', k.status, 'note', k.note, 'at', k.at)) from alumni_checkins k where k.application_id = a.id), '{}'::jsonb),
    'survey', (select jsonb_build_object('recommend', s.recommend, 'consent', s.consent, 'at', s.at) from exit_surveys s where s.application_id = a.id),
    'eval', exists (select 1 from learn_evals e where e.application_id = a.id));
end $$;

create or replace function public.grad_outcome(p_status text, p_company text, p_role text, p_start date, p_via text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if p_status not in ('hired','internship','freelance','study','searching') then raise exception 'Choose what you''re doing now.' using errcode = 'P0001'; end if;
  if p_status in ('hired','internship','freelance') and (coalesce(trim(p_company), '') = '' or coalesce(trim(p_role), '') = '') then
    raise exception 'Add the company and your role.' using errcode = 'P0001';
  end if;
  insert into learn_outcomes(application_id, status, company, role, start_date, via)
  values (a.id, p_status, nullif(trim(coalesce(p_company, '')), ''), nullif(trim(coalesce(p_role, '')), ''), p_start, nullif(p_via, ''))
  on conflict (application_id) do update set status = excluded.status, company = excluded.company, role = excluded.role,
    start_date = excluded.start_date, via = excluded.via, updated_at = now();
  insert into learn_history(application_id, key, action) values (a.id, 'outcome', case when p_status = 'searching' then 'Still searching' else 'Reported: ' || p_status end);
  return public.grad_state();
end $$;

create or replace function public.grad_checkin(p_day int, p_status text, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; p programmes; ends date;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  select * into p from programmes where code = c.programme_code;
  ends := c.start_date + coalesce(p.weeks, 17) * 7 - 3;
  if p_day not in (30, 60, 90) then raise exception 'Unknown check-in.' using errcode = 'P0001'; end if;
  if private.today() < ends + p_day - 7 and private.setting('unlock_weeks', 'off') <> 'on' then
    raise exception 'This check-in opens on %.', to_char(ends + p_day - 7, 'FMDD Mon YYYY') using errcode = 'P0001';
  end if;
  if p_status not in ('hired','internship','freelance','study','searching') then raise exception 'Choose what you''re doing now.' using errcode = 'P0001'; end if;
  insert into alumni_checkins(application_id, day, status, note) values (a.id, p_day, p_status, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (application_id, day) do update set status = excluded.status, note = excluded.note, at = now();
  return public.grad_state();
end $$;

create or replace function public.grad_survey(p_recommend int, p_best text, p_improve text, p_testimonial text, p_consent boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if p_recommend is null or p_recommend < 0 or p_recommend > 10 then raise exception 'Choose a number from 0 to 10.' using errcode = 'P0001'; end if;
  insert into exit_surveys(application_id, recommend, best, improve, testimonial, consent)
  values (a.id, p_recommend, nullif(trim(coalesce(p_best, '')), ''), nullif(trim(coalesce(p_improve, '')), ''), nullif(trim(coalesce(p_testimonial, '')), ''), coalesce(p_consent, false))
  on conflict (application_id) do update set recommend = excluded.recommend, best = excluded.best, improve = excluded.improve,
    testimonial = excluded.testimonial, consent = excluded.consent, at = now();
  return public.grad_state();
end $$;

-- Staff
create or replace function public.acad_outcomes() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['coach','director','cohort_manager','academy_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'phone', a.phone,
      'track', (select name from tracks where code = a.track_code), 'cert', a.cert_id,
      'outcome', private.outcome_json(o),
      'checkins', coalesce((select jsonb_object_agg(k.day, jsonb_build_object('status', k.status, 'note', k.note, 'at', k.at)) from alumni_checkins k where k.application_id = a.id), '{}'::jsonb),
      'survey', (select jsonb_build_object('recommend', v.recommend, 'best', v.best, 'improve', v.improve, 'testimonial', v.testimonial, 'consent', v.consent, 'at', v.at) from exit_surveys v where v.application_id = a.id))
      order by a.surname)
    from applications a left join learn_outcomes o on o.application_id = a.id
    where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb);
end $$;

revoke execute on function private.outcome_json(learn_outcomes) from public;
revoke execute on function public.grad_state(), public.grad_outcome(text, text, text, date, text), public.grad_checkin(int, text, text),
  public.grad_survey(int, text, text, text, boolean), public.acad_outcomes() from public, anon;
grant execute on function public.grad_state(), public.grad_outcome(text, text, text, date, text), public.grad_checkin(int, text, text),
  public.grad_survey(int, text, text, text, boolean), public.acad_outcomes() to authenticated;


-- Student: tell us the programme is complete (once). Checks every required step, then sends the email.
create or replace function public.grad_complete() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; n int;
begin
  a := private.require_student();
  if exists (select 1 from learn_history where application_id = a.id and key = 'complete') then return jsonb_build_object('sent', false); end if;
  select count(*) into n from course_items i
  where i.track_code = a.track_code and not i.opt
    and not exists (select 1 from learn_progress x where x.application_id = a.id and x.key = i.key and x.status in ('done','graded'));
  if n > 0 then return jsonb_build_object('sent', false, 'left', n); end if;
  insert into learn_history(application_id, key, action) values (a.id, 'complete', 'Completed the programme');
  perform private.queue_mail(a, 'complete', '{}'::jsonb, private.site() || '/learn/graduate');
  return jsonb_build_object('sent', true);
end $$;

insert into email_templates(key, subject, body, cta) values
  ('complete', 'You''ve completed Jobnest Academy, {first}! 🎓',
   E'Hi {first},\n\nYou''ve finished all 17 weeks of the {track} track. That took real commitment, and we''re proud of you.\n\nYour certificate: we check your final steps and issue it in the portal. We''ll email you when it''s ready to download and add to LinkedIn.\n\nThree things to do next on your Graduation page:\n\n1. Tell us where you are now. Got a job, an internship or freelance work? We want to celebrate you.\n2. Take the 3-minute exit survey so we can make the next cohort even better.\n3. Keep your job search going. Your applications board and CV builder stay open.\n\nWe''ll check in at 30, 60 and 90 days. You''re part of the Jobnest family now.',
   'Go to my Graduation page')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

revoke execute on function public.grad_complete() from public, anon;
grant execute on function public.grad_complete() to authenticated;

notify pgrst, 'reload schema';


-- Certificate codes now come from the matric number: GEP/27A/001 -> JNA-GEP27A-001.
create or replace function private.cert_from_matric(m text) returns text
language sql immutable as $$
  select case when m is null then null else
    'JNA-' || upper(split_part(m, '/', 1) || split_part(m, '/', 2)) || '-' || upper(split_part(m, '/', 3)) end
$$;

-- Accepts JNA-GEP27A-001, GEP27A-001, GEP/27A/001 (any case, spaces ignored).
create or replace function private.cert_norm(p text) returns text
language sql immutable as $$
  select case
    when v ~ '^[A-Z]+/[0-9A-Z]+/[0-9]+$' then private.cert_from_matric(v)
    when v ~ '^JNA-' then v
    else 'JNA-' || v end
  from (select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')) v) q
$$;

create or replace function public.acad_issue_certificate(p_app uuid, p_date date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['director','academy_admin']);
  select * into a from applications where id = p_app;
  if a.id is null or a.status <> 'Admitted' or a.matric is null then
    raise exception 'Only admitted students can get a certificate.' using errcode = 'P0001';
  end if;
  update applications set completed_on = coalesce(p_date, current_date), cert_id = private.cert_from_matric(a.matric)
  where id = a.id returning * into a;
  insert into audit_log(actor, text) values (s.email, format('issued certificate %s to %s %s', a.cert_id, a.first_name, a.surname));
  perform private.queue_email(a, 'certificate', jsonb_build_object('cert', a.cert_id), 'certificate');
  return jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on);
end $$;

create or replace function public.certificate_view(p_cert text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('cert_id', a.cert_id, 'name', trim(a.first_name || ' ' || a.surname),
    'programme', p.name, 'weeks', p.weeks, 'track', (select name from tracks where code = a.track_code),
    'completed_on', a.completed_on, 'year', to_char(a.completed_on, 'YYYY'),
    'signer_name', private.setting('signer_name', ''), 'signer_title', private.setting('signer_title', 'Programme Director'))
  from applications a join cohorts c on c.id = a.cohort_id join programmes p on p.code = c.programme_code
  where a.cert_id = private.cert_norm(p_cert) and a.status = 'Admitted'
$$;

-- Certificates already issued switch to the new code.
update applications set cert_id = private.cert_from_matric(matric) where cert_id is not null and matric is not null;

revoke execute on function private.cert_from_matric(text), private.cert_norm(text) from public;
grant execute on function public.certificate_view(text) to anon, authenticated;

notify pgrst, 'reload schema';
select 'Certificate codes now use the matric number' as done;


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


-- Question banks (generated by dev/quiz_bank.py). Each quiz draws 5 questions per student.
delete from quiz_bank;
insert into quiz_bank(track_code, key, qid, q, o, a) values
('ADM','w2-4',1,'A good email subject line should:',array['Be left empty so people open the email','Be one word, like “Hello”','State the ask or topic clearly, e.g. “Approval needed: Q3 budget by Friday”','Repeat the sender''s name'],2),
('ADM','w2-4',2,'You need two separate decisions from your manager. Best practice is to:',array['Put both in one long email with no headings','Wait for your weekly meeting','Send two short emails, one topic each, with a clear next step','Ask on WhatsApp late at night'],2),
('ADM','w2-4',3,'A client emails a question you can''t answer today. What should you do?',array['Reply “ok” and nothing else','Acknowledge it within one working day and say when you''ll reply','Forward it to a colleague without comment','Ignore it until you have the full answer'],1),
('ADM','w2-4',4,'Which channel suits an urgent, informal question to a teammate?',array['An email to the whole company','A formal letter','A work chat tool such as Slack or Teams','A post on your public social media'],2),
('ADM','w2-4',5,'In a remote team meeting where you are not presenting, you should:',array['Type every comment in capital letters','Mute and use raise-hand when you want to speak','Keep your mic on so people know you''re there','Leave your camera on and walk away'],1),
('ADM','w2-4',6,'Your team agreed cameras on for team meetings. Today your internet is poor. You should:',array['Join late without saying anything','Keep the camera on even if the call keeps dropping','Skip the meeting','Tell the host briefly and turn the camera off to save data'],3),
('ADM','w2-4',7,'You''re stuck on a task working from home. The best move is to:',array['Tell your lead early, say what you''ve tried, and ask a specific question','Say nothing and hope it resolves','Quietly hand it to a colleague','Wait until the deadline, then explain'],0),
('ADM','w2-4',8,'You''ll be away from your desk for two hours during work time. You should:',array['Log out of everything so nobody can reach you','Leave without telling anyone','Change your profile picture','Update your status or tell the team when you''ll be back'],3),
('ADM','w2-4',9,'Which file name follows good practice?',array['2026-11-04_AcmeCo_Onboarding-Guide_v2.docx','report-new(2).docx','Untitled document','final final.docx'],0),
('ADM','w2-4',10,'A sensible top-level folder structure for your work is:',array['Everything in Downloads','One folder per day','Files only on your desktop','One folder per client or project, with clear subfolders'],3),
('ADM','w2-4',11,'You need a colleague to comment on a document but not change it. Share it with:',array['Owner access','No access, and email a screenshot','Editor access for everyone with the link','Commenter access'],3),
('ADM','w2-4',12,'Why should work files not live only on your laptop desktop?',array['It uses too much battery','Laptops can''t open shared files','Desktops are slower to load','They can be lost and your team can''t find or open them'],3),
('ADM','w3-3',1,'In the Eisenhower matrix, a task that is important but not urgent should be:',array['Delegated','Scheduled','Deleted','Done immediately'],1),
('ADM','w3-3',2,'Time-blocking means:',array['Working without breaks','Reserving set times in your calendar for focused work','Blocking colleagues'' calendars','Doing every task as it arrives'],1),
('ADM','w3-3',3,'You estimated a task at 2 hours and it took 5. What''s the most useful next step?',array['Blame the tools','Ignore it','Stop estimating tasks','Note the difference and use it to estimate similar tasks better'],3),
('ADM','w3-3',4,'A daily shutdown routine helps you:',array['Skip planning','Work later every night','Review what''s done, plan tomorrow and switch off','Avoid checking any messages'],2),
('ADM','w3-3',5,'A simple task board usually has columns like:',array['Mine and Not mine','Easy, Medium, Hard, Impossible','To do, Doing, Review, Done','Monday to Friday only'],2),
('ADM','w3-3',6,'A Trello or Notion card for a deliverable should always have:',array['A colourful cover image','At least ten checklist items','A due date and a clear owner','No description'],2),
('ADM','w3-3',7,'Why use a checklist for repeatable work?',array['To make the task take longer','So nobody needs to think','So steps aren''t missed and quality stays consistent','Because managers like long lists'],2),
('ADM','w3-3',8,'A weekly review of your task board is for:',array['Showing off to colleagues','Clearing finished cards, updating dates and planning next week','Changing the board''s colours','Deleting tasks you don''t like'],1),
('ADM','w3-3',9,'Three urgent requests arrive at once. A good first step is to:',array['Wait for someone to follow up','Check priorities and deadlines, then confirm the order with your manager if unsure','Start all three at the same time','Do the easiest one and ignore the rest'],1),
('ADM','w3-3',10,'You realise you will miss a deadline. When should you tell your manager?',array['Only if they ask','Never; just submit late','As soon as you know, with a new date and what you need','After the deadline has passed'],2),
('ADM','w3-3',11,'Which habit best shows you are workplace-ready?',array['Working only on tasks you enjoy','Arriving on time and keeping people updated on your progress','Avoiding questions so you look confident','Replying only when it suits you'],1),
('ADM','w3-3',12,'When you finish a task, a good habit is to:',array['Delete your notes','Check your work, share it, and update your task board','Move on without telling anyone','Wait for someone to discover it'],1),
('ADM','w4-2',1,'“Inbox zero” mainly means:',array['Every email is actioned, filed or archived, so the inbox only holds what needs attention','Turning off email notifications forever','Deleting all emails every day','Never replying to emails'],0),
('ADM','w4-2',2,'Which tool helps sort incoming email automatically?',array['Printing every email','Marking all as read','Filters or rules that label and move messages','Forwarding everything to your manager'],2),
('ADM','w4-2',3,'Labels such as “Waiting on”, “To reply” and “Receipts” help you:',array['Hide emails from your manager','Make emails load faster','Delete emails automatically','See at a glance what needs action'],3),
('ADM','w4-2',4,'Your manager is in Lagos and a client is in London. When scheduling, you should:',array['Book outside working hours for both','Use only Lagos time without saying so','Check both time zones and show the time for each person','Let the client guess'],2),
('ADM','w4-2',5,'A good meeting invite includes:',array['A long story about why the meeting exists','Only the word “Meeting”','A clear title, purpose, agenda and the call link','No time zone'],2),
('ADM','w4-2',6,'Before booking a meeting for your manager, you should:',array['Ask the client to choose any time','Book back-to-back all day','Book over existing meetings','Check their calendar for clashes and travel time'],3),
('ADM','w4-2',7,'A recurring weekly meeting is best set up as:',array['A new invite every week by hand','A sticky note','One recurring calendar event','A WhatsApp reminder'],2),
('ADM','w4-2',8,'You get an email that needs your manager''s decision. You should:',array['Flag or label it, add a short summary and bring it to their attention','Delete it','Answer it yourself without asking','Leave it unread'],0),
('ADM','w4-2',9,'Good practice when declining a meeting on your manager''s behalf is to:',array['Ignore the invite','Accept and not attend','Decline politely and suggest another time','Decline with no message'],2),
('ADM','w4-2',10,'Which is the clearest meeting title?',array['Q3 budget review: decide on marketing spend','Meeting','Catch up???','Quick chat'],0),
('ADM','w4-2',11,'Colour-coding calendar events by type helps you:',array['See the week''s balance of meetings, focus time and travel','Hide private events from yourself','Avoid planning','Make the calendar look busy'],0),
('ADM','w4-2',12,'You manage two inboxes. A good routine is to:',array['Keep both open and react to every alert','Check once a week','Forward one inbox to the other and ignore it','Check them at set times and process each email once'],3),
('ADM','w5-2',1,'Why use built-in heading styles in Docs or Word?',array['They lock the document','They keep formatting consistent and create a clickable outline or contents','They change the font to bold everywhere','They make the file smaller'],1),
('ADM','w5-2',2,'A document template is useful because:',array['It stops anyone editing','It emails the document automatically','It deletes old versions','Everyone starts from the same layout, branding and sections'],3),
('ADM','w5-2',3,'Suggestion mode (track changes) lets you:',array['Delete the original text forever','Propose edits the owner can accept or reject','Lock the document','Hide your changes'],1),
('ADM','w5-2',4,'Version history helps you:',array['Print the document','See who changed what and restore an earlier version','Translate the document','Make the document load faster'],1),
('ADM','w5-2',5,'Good meeting minutes capture:',array['Decisions, action items, owners and due dates','Every word people said','Only who attended','Your personal opinions'],0),
('ADM','w5-2',6,'An action item in minutes should include:',array['The meeting room','A long background story','Only the topic','What will be done, who owns it, and by when'],3),
('ADM','w5-2',7,'When should minutes be shared?',array['Soon after the meeting, ideally the same day','Never','A month later','Only if someone asks'],0),
('ADM','w5-2',8,'Which file name is best for a final contract draft?',array['2026-11-10_ClientName_Service-Agreement_v3.docx','contract FINAL final.docx','doc1.docx','new.docx'],0),
('ADM','w5-2',9,'To share a document so only your team can edit it, you should:',array['Post it on social media','Make it public to anyone with the link as editor','Email it as an attachment to everyone','Share with team members'' emails as editors'],3),
('ADM','w5-2',10,'A professional business document usually starts with:',array['A list of everyone''s phone numbers','A clear title, date and purpose','A joke','No title'],1),
('ADM','w5-2',11,'Consistent fonts and spacing in documents matter because:',array['They make documents longer','They are required by law','They make documents easier to read and look professional','They use less paper'],2),
('ADM','w5-2',12,'Comments in a shared document are best used to:',array['Hide text','Rewrite the whole document','Chat about the weekend','Ask questions or give feedback on a specific part'],3),
('ADM','w6-2',1,'Sorting a spreadsheet by a column:',array['Deletes duplicate rows','Hides other columns','Changes the numbers','Reorders the rows by that column''s values'],3),
('ADM','w6-2',2,'A filter in a spreadsheet lets you:',array['Show only the rows that match what you choose','Delete rows permanently','Lock the sheet','Colour every cell'],0),
('ADM','w6-2',3,'Data validation is used to:',array['Make the sheet read-only','Back up the file','Check spelling in every cell','Limit what can be typed in a cell, e.g. a dropdown list'],3),
('ADM','w6-2',4,'Conditional formatting can:',array['Rename the sheet','Send emails','Delete old rows','Highlight cells automatically, e.g. overdue dates in red'],3),
('ADM','w6-2',5,'A simple tracker should have:',array['Merged cells everywhere','No headings','One row per item and clear columns such as status, owner and due date','Notes typed in random cells'],2),
('ADM','w6-2',6,'Why freeze the header row?',array['To hide it','So column names stay visible when you scroll','To make it print in colour','To stop people editing it'],1),
('ADM','w6-2',7,'You want colleagues to view a tracker but not change it. Share it as:',array['Viewer','Public editor','Editor','Owner'],0),
('ADM','w6-2',8,'A good way to avoid typos in a “Status” column is to:',array['Leave it blank','Use different colours of text','Use a dropdown with fixed options','Let people type anything'],2),
('ADM','w6-2',9,'Before sorting a table, you should:',array['Select only one column','Delete the headers','Merge the cells','Select the whole table so rows stay together'],3),
('ADM','w6-2',10,'COUNTIF can tell you:',array['The average of a column','Who edited the sheet','Today''s date','How many rows match a condition, e.g. how many are “Done”'],3),
('ADM','w6-2',11,'Protecting a range in a shared sheet is useful when:',array['You want to print it','Some cells, like formulas, must not be changed','You want to delete it','You want the file to load faster'],1),
('ADM','w6-2',12,'A date column works best when:',array['Some cells say “next week”','Dates are typed as words','Every cell uses the same date format','It is left empty'],2),
('ADM','w7-2',1,'A good travel itinerary includes:',array['Flights, times, addresses, booking references and contacts in one place','A list of restaurants','Only the destination city','Just the hotel name'],0),
('ADM','w7-2',2,'When booking travel for a manager, you should first confirm:',array['What the client is wearing','Nothing; just book','Dates, budget and preferences','Their favourite colour'],2),
('ADM','w7-2',3,'An expense report needs:',array['A total only','No receipts','Photos of the trip','Each cost with a receipt, date, purpose and amount'],3),
('ADM','w7-2',4,'A receipt is missing for a business expense. You should:',array['Make up a receipt','Leave it out and say nothing','Double another receipt','Follow your company''s missing-receipt process and explain it'],3),
('ADM','w7-2',5,'Why keep a vendor contact list?',array['So anyone on the team can reach suppliers quickly','To share on social media','To avoid paying vendors','It isn''t useful'],0),
('ADM','w7-2',6,'A vendor hasn''t delivered on the agreed date. A professional follow-up:',array['Is skipped','Threatens legal action immediately','Is posted publicly online','Politely restates what was agreed and asks for a new firm date'],3),
('ADM','w7-2',7,'When comparing vendor quotes, you should look at:',array['Only the logo','The longest quote','Price, what''s included, delivery time and reliability','Only the lowest price'],2),
('ADM','w7-2',8,'Before paying a vendor invoice, check that:',array['It is in colour','It looks professional','It matches the order, the agreed price and what was delivered','It was sent on a Monday'],2),
('ADM','w7-2',9,'Travel booking references should be shared:',array['Only in your head','Never','With the traveller and saved in the itinerary','On social media'],2),
('ADM','w7-2',10,'A per diem is:',array['A fixed daily allowance for travel costs like meals','A penalty for late receipts','A type of flight','A hotel brand'],0),
('ADM','w7-2',11,'When a trip changes at short notice, you should:',array['Leave the old itinerary as it is','Tell only the hotel','Update bookings, the itinerary and everyone affected','Cancel everything'],2),
('ADM','w7-2',12,'Good vendor relationships are built by:',array['Clear requests, timely payment and polite communication','Never giving feedback','Paying late on purpose','Changing requirements without notice'],0),
('CSP','w2-4',1,'A good email subject line should:',array['Be left empty so people open the email','State the ask or topic clearly, e.g. “Approval needed: Q3 budget by Friday”','Repeat the sender''s name','Be one word, like “Hello”'],1),
('CSP','w2-4',2,'You need two separate decisions from your manager. Best practice is to:',array['Send two short emails, one topic each, with a clear next step','Put both in one long email with no headings','Ask on WhatsApp late at night','Wait for your weekly meeting'],0),
('CSP','w2-4',3,'A client emails a question you can''t answer today. What should you do?',array['Acknowledge it within one working day and say when you''ll reply','Reply “ok” and nothing else','Forward it to a colleague without comment','Ignore it until you have the full answer'],0),
('CSP','w2-4',4,'Which channel suits an urgent, informal question to a teammate?',array['A work chat tool such as Slack or Teams','A post on your public social media','An email to the whole company','A formal letter'],0),
('CSP','w2-4',5,'In a remote team meeting where you are not presenting, you should:',array['Type every comment in capital letters','Keep your mic on so people know you''re there','Leave your camera on and walk away','Mute and use raise-hand when you want to speak'],3),
('CSP','w2-4',6,'Your team agreed cameras on for team meetings. Today your internet is poor. You should:',array['Skip the meeting','Tell the host briefly and turn the camera off to save data','Join late without saying anything','Keep the camera on even if the call keeps dropping'],1),
('CSP','w2-4',7,'You''re stuck on a task working from home. The best move is to:',array['Tell your lead early, say what you''ve tried, and ask a specific question','Say nothing and hope it resolves','Quietly hand it to a colleague','Wait until the deadline, then explain'],0),
('CSP','w2-4',8,'You''ll be away from your desk for two hours during work time. You should:',array['Leave without telling anyone','Update your status or tell the team when you''ll be back','Log out of everything so nobody can reach you','Change your profile picture'],1),
('CSP','w2-4',9,'Which file name follows good practice?',array['Untitled document','2026-11-04_AcmeCo_Onboarding-Guide_v2.docx','final final.docx','report-new(2).docx'],1),
('CSP','w2-4',10,'A sensible top-level folder structure for your work is:',array['One folder per day','One folder per client or project, with clear subfolders','Files only on your desktop','Everything in Downloads'],1),
('CSP','w2-4',11,'You need a colleague to comment on a document but not change it. Share it with:',array['Owner access','Editor access for everyone with the link','Commenter access','No access, and email a screenshot'],2),
('CSP','w2-4',12,'Why should work files not live only on your laptop desktop?',array['Desktops are slower to load','It uses too much battery','Laptops can''t open shared files','They can be lost and your team can''t find or open them'],3),
('CSP','w3-3',1,'In the Eisenhower matrix, a task that is important but not urgent should be:',array['Done immediately','Deleted','Delegated','Scheduled'],3),
('CSP','w3-3',2,'Time-blocking means:',array['Working without breaks','Blocking colleagues'' calendars','Doing every task as it arrives','Reserving set times in your calendar for focused work'],3),
('CSP','w3-3',3,'You estimated a task at 2 hours and it took 5. What''s the most useful next step?',array['Ignore it','Note the difference and use it to estimate similar tasks better','Stop estimating tasks','Blame the tools'],1),
('CSP','w3-3',4,'A daily shutdown routine helps you:',array['Review what''s done, plan tomorrow and switch off','Work later every night','Skip planning','Avoid checking any messages'],0),
('CSP','w3-3',5,'A simple task board usually has columns like:',array['To do, Doing, Review, Done','Easy, Medium, Hard, Impossible','Mine and Not mine','Monday to Friday only'],0),
('CSP','w3-3',6,'A Trello or Notion card for a deliverable should always have:',array['A due date and a clear owner','No description','A colourful cover image','At least ten checklist items'],0),
('CSP','w3-3',7,'Why use a checklist for repeatable work?',array['Because managers like long lists','So steps aren''t missed and quality stays consistent','So nobody needs to think','To make the task take longer'],1),
('CSP','w3-3',8,'A weekly review of your task board is for:',array['Changing the board''s colours','Deleting tasks you don''t like','Showing off to colleagues','Clearing finished cards, updating dates and planning next week'],3),
('CSP','w3-3',9,'Three urgent requests arrive at once. A good first step is to:',array['Start all three at the same time','Wait for someone to follow up','Do the easiest one and ignore the rest','Check priorities and deadlines, then confirm the order with your manager if unsure'],3),
('CSP','w3-3',10,'You realise you will miss a deadline. When should you tell your manager?',array['As soon as you know, with a new date and what you need','Only if they ask','After the deadline has passed','Never; just submit late'],0),
('CSP','w3-3',11,'Which habit best shows you are workplace-ready?',array['Avoiding questions so you look confident','Replying only when it suits you','Working only on tasks you enjoy','Arriving on time and keeping people updated on your progress'],3),
('CSP','w3-3',12,'When you finish a task, a good habit is to:',array['Move on without telling anyone','Check your work, share it, and update your task board','Wait for someone to discover it','Delete your notes'],1),
('CSP','w4-2',1,'Tier 1 support usually:',array['Handles common questions and escalates complex issues','Never talks to customers','Writes the company''s code','Only handles refunds over ₦1m'],0),
('CSP','w4-2',2,'You should escalate a ticket when:',array['You don''t feel like answering','It''s Friday','The customer is polite','It needs skills or permissions you don''t have'],3),
('CSP','w4-2',3,'Showing empathy without over-apologising sounds like:',array['“I understand how frustrating that is. Here''s what I''ll do now.”','“Calm down.”','“Sorry sorry sorry, so sorry.”','“That''s not my problem.”'],0),
('CSP','w4-2',4,'First-contact resolution means:',array['Closing tickets without replying','Answering the first ticket of the day','Solving the customer''s issue in the first interaction','Contacting the customer first'],2),
('CSP','w4-2',5,'Before replying to a customer, you should:',array['Read the whole message and check their history','Reply with a template without reading','Ask them to repeat everything','Close the ticket'],0),
('CSP','w4-2',6,'A customer''s problem is caused by a known bug. You should:',array['Ignore the ticket','Promise a fix today without checking','Explain clearly, share any workaround and say when you''ll update them','Pretend it''s their fault'],2),
('CSP','w4-2',7,'Good support writing is:',array['In capital letters','Full of technical jargon','Clear, friendly and step-by-step','As short as “ok”'],2),
('CSP','w4-2',8,'When escalating, you should include:',array['Only “please help”','Nothing; the next tier will ask','A summary, what you''ve tried, and the customer''s details','Your opinion of the customer'],2),
('CSP','w4-2',9,'A customer asks for something against policy. The best response:',array['Explain the policy kindly and offer what you can do','Tell them they''re wrong','Say yes anyway','Ignore the request'],0),
('CSP','w4-2',10,'Why log every customer interaction?',array['To avoid replying','It isn''t necessary','To count how many emails you sent','So anyone can see the full history and help quickly'],3),
('CSP','w4-2',11,'Personalising a reply means:',array['Adding emojis everywhere','Sharing your personal phone number','Writing a long story about yourself','Using the customer''s name and responding to their exact situation'],3),
('CSP','w4-2',12,'After solving an issue, a good final step is to:',array['Send the same message twice','Confirm it''s fixed and ask if they need anything else','Close the ticket without saying anything','Ask for a 5-star review immediately'],1),
('CSP','w5-2',1,'A ticket marked “Pending” usually means:',array['It is solved','You''re waiting for the customer to reply','It is spam','It has been deleted'],1),
('CSP','w5-2',2,'Tags on tickets help you:',array['Group and report on issues, e.g. “refund” or “login”','Delete tickets','Hide tickets from managers','Make tickets colourful'],0),
('CSP','w5-2',3,'Ticket priority should be based on:',array['Impact and urgency for the customer and business','Who shouted loudest','The time you feel like it','Alphabetical order'],0),
('CSP','w5-2',4,'A macro (saved reply) is best used to:',array['Close every ticket','Reply without reading','Answer common questions quickly, then personalise it','Send the same reply to everyone at once'],2),
('CSP','w5-2',5,'Why personalise a macro before sending?',array['To make it longer','So the reply fits the customer''s actual question','Because macros are illegal','It isn''t needed'],1),
('CSP','w5-2',6,'An SLA timer shows:',array['How long you have left to respond or resolve under the agreed target','The customer''s local time','How long you''ve been logged in','Lunch break length'],0),
('CSP','w5-2',7,'A ticket is close to breaching its SLA. You should:',array['Change the timer','Prioritise it or flag it to your lead','Ignore the timer','Close it unsolved'],1),
('CSP','w5-2',8,'Internal notes in a ticket are for:',array['Jokes','Information for your team that the customer won''t see','Messages to the customer','Personal reminders unrelated to work'],1),
('CSP','w5-2',9,'Merging tickets is useful when:',array['You want fewer tickets on your report','Two different customers complain','The same customer opened several tickets about one issue','Never'],2),
('CSP','w5-2',10,'Before marking a ticket “Solved”, make sure:',array['The customer''s issue is actually resolved','You''ve used a macro','It''s the end of your shift','The ticket is old'],0),
('CSP','w5-2',11,'Assigning a ticket to the right group helps:',array['It reach the person who can solve it fastest','It disappear','Nothing','Lower your workload unfairly'],0),
('CSP','w5-2',12,'Help desk tools such as Zendesk and Freshdesk are used to:',array['Pay salaries','Edit videos','Design websites','Manage, track and report on customer requests in one place'],3),
('CSP','w6-2',1,'When handling several chats at once, you should:',array['Stop replying to the oldest chat','Close chats randomly','Copy one answer into every chat','Keep each customer updated and use saved replies wisely'],3),
('CSP','w6-2',2,'A good first response time in live chat is:',array['Within a minute or so','The next day','After an hour','Whenever you''re free'],0),
('CSP','w6-2',3,'An angry customer writes in capital letters. Your first step:',array['End the chat','Reply in capitals too','Stay calm, acknowledge their frustration and focus on the problem','Tell them to be polite first'],2),
('CSP','w6-2',4,'De-escalating a conversation includes:',array['Listening, empathising and offering clear next steps','Arguing about who is right','Ignoring their messages','Blaming another department'],0),
('CSP','w6-2',5,'If you need time to check something in chat, you should:',array['Tell the customer you''re checking and roughly how long it will take','Close the chat','Send random messages','Go silent'],0),
('CSP','w6-2',6,'A good support email:',array['Has no greeting','Has a clear subject, short paragraphs and next steps','Is one long paragraph','Uses lots of jargon'],1),
('CSP','w6-2',7,'Closing a chat cleanly means:',array['Summarising the solution and asking if there''s anything else','Sending a link without explanation','Asking for money','Leaving without a goodbye'],0),
('CSP','w6-2',8,'Which phrase sounds professional?',array['“Not my department, bye.”','“Thanks for your patience. I''ve fixed that for you.”','“You should have read the FAQ.”','“Whatever.”'],1),
('CSP','w6-2',9,'A customer becomes abusive. You should:',array['Keep arguing','Insult them back','Follow your company''s policy, stay professional and escalate if needed','Share their details online'],2),
('CSP','w6-2',10,'Using the customer''s name in chat:',array['Is rude','Wastes time','Makes the conversation more personal','Is against the rules'],2),
('CSP','w6-2',11,'Canned responses in chat should:',array['Be adapted to sound natural and fit the question','Be very long','Be sent unchanged every time','Replace reading the message'],0),
('CSP','w6-2',12,'After a difficult chat, it''s good practice to:',array['Complain on social media','Delete the conversation','Close all your other chats','Add notes to the ticket so the next agent has context'],3),
('CSP','w7-2',1,'CSAT measures:',array['How fast you type','How many agents are online','Revenue per customer','How satisfied customers are with an interaction'],3),
('CSP','w7-2',2,'FRT stands for:',array['First Response Time','Final Resolution Ticket','Fast Reply Template','Frequent Return Total'],0),
('CSP','w7-2',3,'NPS asks customers:',array['How likely they are to recommend the company, from 0 to 10','How many products they own','Their favourite agent','Their age'],0),
('CSP','w7-2',4,'In NPS, customers who score 9 or 10 are called:',array['Passives','Promoters','Agents','Detractors'],1),
('CSP','w7-2',5,'A lower First Response Time is usually:',array['Not important','Worse','Only for email','Better, because customers hear back faster'],3),
('CSP','w7-2',6,'Agents are often scored on:',array['CSAT, response times, resolution rate and quality reviews','Their handwriting','Number of emojis used','How many breaks they take'],0),
('CSP','w7-2',7,'Your CSAT dropped this week. A good first step is to:',array['Ask friends to rate you','Read the low-rated tickets to find patterns','Close tickets faster without solving them','Ignore it'],1),
('CSP','w7-2',8,'Resolution rate means:',array['The number of customers','How many tickets you opened','The share of tickets that were actually solved','Your screen resolution'],2),
('CSP','w7-2',9,'A weekly support report usually shows:',array['Volume, response times, satisfaction and top issues','Staff birthdays','Only the number of agents','Social media likes'],0),
('CSP','w7-2',10,'Ticket volume spiking on one topic suggests:',array['Nothing important','A product issue worth flagging to the team','Agents are slow','Customers are bored'],1),
('CSP','w7-2',11,'Why balance speed with quality?',array['Speed is all that matters','Fast but wrong answers lead to repeat contacts and unhappy customers','Quality doesn''t affect CSAT','Customers prefer slow answers'],1),
('CSP','w7-2',12,'Detractors in NPS are customers who score:',array['Exactly 5','0 to 6','9 to 10','7 to 8'],1),
('DAT','w2-4',1,'A good email subject line should:',array['State the ask or topic clearly, e.g. “Approval needed: Q3 budget by Friday”','Be one word, like “Hello”','Repeat the sender''s name','Be left empty so people open the email'],0),
('DAT','w2-4',2,'You need two separate decisions from your manager. Best practice is to:',array['Put both in one long email with no headings','Ask on WhatsApp late at night','Send two short emails, one topic each, with a clear next step','Wait for your weekly meeting'],2),
('DAT','w2-4',3,'A client emails a question you can''t answer today. What should you do?',array['Acknowledge it within one working day and say when you''ll reply','Ignore it until you have the full answer','Forward it to a colleague without comment','Reply “ok” and nothing else'],0),
('DAT','w2-4',4,'Which channel suits an urgent, informal question to a teammate?',array['A work chat tool such as Slack or Teams','A formal letter','A post on your public social media','An email to the whole company'],0),
('DAT','w2-4',5,'In a remote team meeting where you are not presenting, you should:',array['Mute and use raise-hand when you want to speak','Leave your camera on and walk away','Type every comment in capital letters','Keep your mic on so people know you''re there'],0),
('DAT','w2-4',6,'Your team agreed cameras on for team meetings. Today your internet is poor. You should:',array['Tell the host briefly and turn the camera off to save data','Skip the meeting','Join late without saying anything','Keep the camera on even if the call keeps dropping'],0),
('DAT','w2-4',7,'You''re stuck on a task working from home. The best move is to:',array['Wait until the deadline, then explain','Say nothing and hope it resolves','Tell your lead early, say what you''ve tried, and ask a specific question','Quietly hand it to a colleague'],2),
('DAT','w2-4',8,'You''ll be away from your desk for two hours during work time. You should:',array['Update your status or tell the team when you''ll be back','Log out of everything so nobody can reach you','Leave without telling anyone','Change your profile picture'],0),
('DAT','w2-4',9,'Which file name follows good practice?',array['final final.docx','2026-11-04_AcmeCo_Onboarding-Guide_v2.docx','report-new(2).docx','Untitled document'],1),
('DAT','w2-4',10,'A sensible top-level folder structure for your work is:',array['One folder per day','Everything in Downloads','Files only on your desktop','One folder per client or project, with clear subfolders'],3),
('DAT','w2-4',11,'You need a colleague to comment on a document but not change it. Share it with:',array['Commenter access','Editor access for everyone with the link','Owner access','No access, and email a screenshot'],0),
('DAT','w2-4',12,'Why should work files not live only on your laptop desktop?',array['Desktops are slower to load','Laptops can''t open shared files','They can be lost and your team can''t find or open them','It uses too much battery'],2),
('DAT','w3-3',1,'In the Eisenhower matrix, a task that is important but not urgent should be:',array['Scheduled','Deleted','Delegated','Done immediately'],0),
('DAT','w3-3',2,'Time-blocking means:',array['Blocking colleagues'' calendars','Working without breaks','Reserving set times in your calendar for focused work','Doing every task as it arrives'],2),
('DAT','w3-3',3,'You estimated a task at 2 hours and it took 5. What''s the most useful next step?',array['Note the difference and use it to estimate similar tasks better','Blame the tools','Stop estimating tasks','Ignore it'],0),
('DAT','w3-3',4,'A daily shutdown routine helps you:',array['Review what''s done, plan tomorrow and switch off','Skip planning','Avoid checking any messages','Work later every night'],0),
('DAT','w3-3',5,'A simple task board usually has columns like:',array['Mine and Not mine','Monday to Friday only','To do, Doing, Review, Done','Easy, Medium, Hard, Impossible'],2),
('DAT','w3-3',6,'A Trello or Notion card for a deliverable should always have:',array['At least ten checklist items','A due date and a clear owner','A colourful cover image','No description'],1),
('DAT','w3-3',7,'Why use a checklist for repeatable work?',array['So steps aren''t missed and quality stays consistent','So nobody needs to think','To make the task take longer','Because managers like long lists'],0),
('DAT','w3-3',8,'A weekly review of your task board is for:',array['Showing off to colleagues','Clearing finished cards, updating dates and planning next week','Changing the board''s colours','Deleting tasks you don''t like'],1),
('DAT','w3-3',9,'Three urgent requests arrive at once. A good first step is to:',array['Start all three at the same time','Check priorities and deadlines, then confirm the order with your manager if unsure','Wait for someone to follow up','Do the easiest one and ignore the rest'],1),
('DAT','w3-3',10,'You realise you will miss a deadline. When should you tell your manager?',array['Never; just submit late','Only if they ask','As soon as you know, with a new date and what you need','After the deadline has passed'],2),
('DAT','w3-3',11,'Which habit best shows you are workplace-ready?',array['Replying only when it suits you','Arriving on time and keeping people updated on your progress','Avoiding questions so you look confident','Working only on tasks you enjoy'],1),
('DAT','w3-3',12,'When you finish a task, a good habit is to:',array['Move on without telling anyone','Check your work, share it, and update your task board','Delete your notes','Wait for someone to discover it'],1),
('DAT','w4-2',1,'A clean table has:',array['Merged cells and blank rows','One header row, one record per row and one type of data per column','Several tables on one sheet with no gaps','Totals typed in the middle'],1),
('DAT','w4-2',2,'Why should numbers be stored as numbers, not text?',array['Text is faster','So they look bigger','So formulas can calculate with them correctly','So they can''t be edited'],2),
('DAT','w4-2',3,'XLOOKUP is used to:',array['Find a value in one column and return a matching value from another','Create a chart','Sort a table','Count blank cells'],0),
('DAT','w4-2',4,'SUMIFS adds numbers that:',array['Are on another computer','Are negative only','Meet one or more conditions','Are in bold'],2),
('DAT','w4-2',5,'COUNTIFS can answer:',array['“What is the average price?”','“Who made this sheet?”','“What''s today''s date?”','“How many orders were from Lagos in March?”'],3),
('DAT','w4-2',6,'A pivot table is used to:',array['Summarise large data quickly, e.g. sales by region','Protect a sheet','Draw shapes','Spell-check a sheet'],0),
('DAT','w4-2',7,'In a pivot table, putting “Region” in Rows and “Sales” in Values gives:',array['A list of every sale','The number of regions','Total sales for each region','A chart only'],2),
('DAT','w4-2',8,'Absolute references like $A$1:',array['Make text bold','Change every time you copy','Stay fixed when you copy the formula','Delete the cell'],2),
('DAT','w4-2',9,'Dates should be stored:',array['As words like “next Tuesday”','As real dates in one consistent format','As colours','In mixed formats'],1),
('DAT','w4-2',10,'A formula returns #N/A in a lookup. It usually means:',array['The internet is down','The sheet is broken','The file is too big','The value wasn''t found'],3),
('DAT','w4-2',11,'Naming your table or range helps:',array['Print in colour','Speed up the internet','Make formulas easier to read and maintain','Hide the data'],2),
('DAT','w4-2',12,'Before analysing a dataset, you should first:',array['Share it publicly','Make a chart','Check its columns, data types and obvious errors','Delete half the rows'],2),
('DAT','w5-2',1,'The first thing to do with a raw data export is:',array['Edit the original directly','Delete columns you don''t understand','Sort it by colour','Keep an untouched copy, then clean a working copy'],3),
('DAT','w5-2',2,'Duplicate rows should be:',array['Doubled again','Ignored','Coloured red and left','Identified, checked and removed if they are true duplicates'],3),
('DAT','w5-2',3,'“Lagos”, “lagos ” and “LAGOS” in one column are an example of:',array['Inconsistent text that needs standardising','Correct data','Duplicate columns','A formula error'],0),
('DAT','w5-2',4,'TRIM is used to:',array['Delete rows','Split columns','Round numbers','Remove extra spaces from text'],3),
('DAT','w5-2',5,'Blank cells in an important column should be:',array['Always filled with zero','Ignored silently','Investigated and handled consistently, e.g. filled, flagged or excluded','Deleted with the whole sheet'],2),
('DAT','w5-2',6,'Splitting “Ade Bello” into first and last name uses:',array['A pivot table','SUMIFS','Conditional formatting','Split text to columns, or a text formula'],3),
('DAT','w5-2',7,'Joining first and last names into one cell uses:',array['Sort','Concatenation, e.g. =A2&" "&B2','VLOOKUP','COUNTIF'],1),
('DAT','w5-2',8,'Why document your cleaning steps?',array['Because the software requires it','To make the file bigger','So others can check and repeat your work','It isn''t useful'],2),
('DAT','w5-2',9,'Phone numbers saved as 8.03E+09 in a sheet need:',array['To be stored as text in a consistent format','To be deleted','To be charted','To be summed'],0),
('DAT','w5-2',10,'An outlier like an order of ₦999,999,999 should be:',array['Checked: is it real or a typing error?','Doubled','Always deleted','Always kept without checking'],0),
('DAT','w5-2',11,'Find and Replace helps you:',array['Create charts','Count rows','Protect the sheet','Fix the same mistake everywhere at once'],3),
('DAT','w5-2',12,'Clean data matters because:',array['It looks nicer only','It makes files smaller','Managers like colours','Wrong data leads to wrong conclusions'],3),
('DAT','w6-2',1,'To show sales over 12 months, the best chart is usually:',array['A table of colours','A scatter plot','A line chart','A pie chart'],2),
('DAT','w6-2',2,'To compare sales across 5 regions, use:',array['A map of the world','A line chart','A bar or column chart','A pie with 50 slices'],2),
('DAT','w6-2',3,'A pie chart works best when:',array['Showing exact values to the decimal','Showing trends over time','Comparing 20 categories','Showing parts of one whole with only a few categories'],3),
('DAT','w6-2',4,'A good chart title:',array['Lists every number','Is left empty','States the main message, e.g. “Lagos drove 40% of Q3 sales”','Just says “Chart 1”'],2),
('DAT','w6-2',5,'Axis labels should:',array['Be removed to save space','Say what is measured and the unit','Use random colours','Be in a different language'],1),
('DAT','w6-2',6,'Using one highlight colour helps:',array['Hide data','Make the chart longer','Draw attention to the key point','Confuse the reader'],2),
('DAT','w6-2',7,'“One chart, one message” means:',array['Each chart should answer one clear question','Use one colour only','Only make one chart per report','Put all data in one chart'],0),
('DAT','w6-2',8,'A bar chart''s value axis should usually start at:',array['Zero, so bars aren''t misleading','Any random number','The smallest value','100'],0),
('DAT','w6-2',9,'3D effects on charts usually:',array['Show more data','Make charts more accurate','Are required','Make values harder to read'],3),
('DAT','w6-2',10,'Before making a chart, ask:',array['“What''s the default chart?”','“Which colour is prettiest?”','“What question should this chart answer, and for whom?”','“How many charts can I make?”'],2),
('DAT','w6-2',11,'Sorting bars from largest to smallest helps:',array['Change the data','Nothing','Hide the smallest values','Readers compare quickly'],3),
('DAT','w6-2',12,'A scatter plot is good for showing:',array['A single total','The relationship between two numbers, e.g. ad spend vs sales','Text data','Parts of a whole'],1),
('DAT','w7-2',1,'A KPI is:',array['A spreadsheet function','A key number that shows progress towards a goal','Any number in the sheet','A type of chart'],1),
('DAT','w7-2',2,'A good dashboard shows:',array['Every column of the raw data','As many charts as possible','A few key KPIs and charts that answer the manager''s questions','Only tables'],2),
('DAT','w7-2',3,'Filters on a dashboard let users:',array['Change your password','Delete charts','Change the view, e.g. by month or region','Edit the raw data'],2),
('DAT','w7-2',4,'Looker Studio and Power BI are used to:',array['Design logos','Build interactive dashboards from data','Manage payroll','Write emails'],1),
('DAT','w7-2',5,'Where should the most important KPI go on a dashboard?',array['Top left or top, where people look first','On a separate page','Hidden at the bottom','Nowhere'],0),
('DAT','w7-2',6,'Connecting a dashboard to a live data source means:',array['It can never change','It deletes old data','It updates when the data changes','It becomes a PDF'],2),
('DAT','w7-2',7,'When presenting insights in five minutes, start with:',array['A list of every column','How you cleaned the data','Your software settings','The key finding and why it matters'],3),
('DAT','w7-2',8,'A good insight is:',array['A chart with no explanation','Specific and actionable, e.g. “Weekend sales are 30% lower; test a weekend promo”','“The data is interesting”','“Sales exist”'],1),
('DAT','w7-2',9,'Too many colours and charts on one dashboard:',array['Speed it up','Are always required','Make it more professional','Make it harder to understand'],3),
('DAT','w7-2',10,'Before sharing a dashboard, you should:',array['Check the numbers against the source data','Remove the title','Share the raw file only','Change all the colours'],0),
('DAT','w7-2',11,'Showing a KPI against a target or last month helps:',array['Nothing','Hide bad results','Make the dashboard longer','Readers judge whether performance is good or bad'],3),
('DAT','w7-2',12,'Who should a dashboard be designed for?',array['Only the analyst','Nobody in particular','The specific people who will use it to make decisions','Everyone in the world'],2),
('DMK','w2-4',1,'A good email subject line should:',array['Be left empty so people open the email','Repeat the sender''s name','Be one word, like “Hello”','State the ask or topic clearly, e.g. “Approval needed: Q3 budget by Friday”'],3),
('DMK','w2-4',2,'You need two separate decisions from your manager. Best practice is to:',array['Ask on WhatsApp late at night','Wait for your weekly meeting','Put both in one long email with no headings','Send two short emails, one topic each, with a clear next step'],3),
('DMK','w2-4',3,'A client emails a question you can''t answer today. What should you do?',array['Forward it to a colleague without comment','Reply “ok” and nothing else','Ignore it until you have the full answer','Acknowledge it within one working day and say when you''ll reply'],3),
('DMK','w2-4',4,'Which channel suits an urgent, informal question to a teammate?',array['A formal letter','A work chat tool such as Slack or Teams','An email to the whole company','A post on your public social media'],1),
('DMK','w2-4',5,'In a remote team meeting where you are not presenting, you should:',array['Keep your mic on so people know you''re there','Type every comment in capital letters','Leave your camera on and walk away','Mute and use raise-hand when you want to speak'],3),
('DMK','w2-4',6,'Your team agreed cameras on for team meetings. Today your internet is poor. You should:',array['Tell the host briefly and turn the camera off to save data','Skip the meeting','Keep the camera on even if the call keeps dropping','Join late without saying anything'],0),
('DMK','w2-4',7,'You''re stuck on a task working from home. The best move is to:',array['Tell your lead early, say what you''ve tried, and ask a specific question','Quietly hand it to a colleague','Wait until the deadline, then explain','Say nothing and hope it resolves'],0),
('DMK','w2-4',8,'You''ll be away from your desk for two hours during work time. You should:',array['Log out of everything so nobody can reach you','Change your profile picture','Leave without telling anyone','Update your status or tell the team when you''ll be back'],3),
('DMK','w2-4',9,'Which file name follows good practice?',array['report-new(2).docx','Untitled document','final final.docx','2026-11-04_AcmeCo_Onboarding-Guide_v2.docx'],3),
('DMK','w2-4',10,'A sensible top-level folder structure for your work is:',array['Files only on your desktop','One folder per day','One folder per client or project, with clear subfolders','Everything in Downloads'],2),
('DMK','w2-4',11,'You need a colleague to comment on a document but not change it. Share it with:',array['Editor access for everyone with the link','No access, and email a screenshot','Owner access','Commenter access'],3),
('DMK','w2-4',12,'Why should work files not live only on your laptop desktop?',array['Desktops are slower to load','Laptops can''t open shared files','It uses too much battery','They can be lost and your team can''t find or open them'],3),
('DMK','w3-3',1,'In the Eisenhower matrix, a task that is important but not urgent should be:',array['Delegated','Scheduled','Deleted','Done immediately'],1),
('DMK','w3-3',2,'Time-blocking means:',array['Doing every task as it arrives','Blocking colleagues'' calendars','Working without breaks','Reserving set times in your calendar for focused work'],3),
('DMK','w3-3',3,'You estimated a task at 2 hours and it took 5. What''s the most useful next step?',array['Ignore it','Note the difference and use it to estimate similar tasks better','Stop estimating tasks','Blame the tools'],1),
('DMK','w3-3',4,'A daily shutdown routine helps you:',array['Review what''s done, plan tomorrow and switch off','Avoid checking any messages','Work later every night','Skip planning'],0),
('DMK','w3-3',5,'A simple task board usually has columns like:',array['Easy, Medium, Hard, Impossible','Mine and Not mine','Monday to Friday only','To do, Doing, Review, Done'],3),
('DMK','w3-3',6,'A Trello or Notion card for a deliverable should always have:',array['A due date and a clear owner','At least ten checklist items','A colourful cover image','No description'],0),
('DMK','w3-3',7,'Why use a checklist for repeatable work?',array['To make the task take longer','Because managers like long lists','So steps aren''t missed and quality stays consistent','So nobody needs to think'],2),
('DMK','w3-3',8,'A weekly review of your task board is for:',array['Showing off to colleagues','Clearing finished cards, updating dates and planning next week','Changing the board''s colours','Deleting tasks you don''t like'],1),
('DMK','w3-3',9,'Three urgent requests arrive at once. A good first step is to:',array['Check priorities and deadlines, then confirm the order with your manager if unsure','Start all three at the same time','Wait for someone to follow up','Do the easiest one and ignore the rest'],0),
('DMK','w3-3',10,'You realise you will miss a deadline. When should you tell your manager?',array['Never; just submit late','As soon as you know, with a new date and what you need','Only if they ask','After the deadline has passed'],1),
('DMK','w3-3',11,'Which habit best shows you are workplace-ready?',array['Replying only when it suits you','Arriving on time and keeping people updated on your progress','Avoiding questions so you look confident','Working only on tasks you enjoy'],1),
('DMK','w3-3',12,'When you finish a task, a good habit is to:',array['Check your work, share it, and update your task board','Delete your notes','Wait for someone to discover it','Move on without telling anyone'],0),
('DMK','w4-2',1,'The marketing funnel usually moves people through:',array['Conversion, awareness, consideration','Awareness, consideration, conversion','Design, print, deliver','Hire, train, retire'],1),
('DMK','w4-2',2,'An awareness campaign aims to:',array['Reduce prices','Hire staff','Get more of the right people to know the brand exists','Close sales immediately'],2),
('DMK','w4-2',3,'A customer comparing brands and reading reviews is in the:',array['Consideration stage','Awareness stage','Retention stage only','Production stage'],0),
('DMK','w4-2',4,'Conversion means:',array['Changing the logo','Translating content','The audience takes the desired action, e.g. buys or signs up','Posting more often'],2),
('DMK','w4-2',5,'A persona is:',array['A celebrity endorser','A brand''s logo','A type of ad','A profile of a typical target customer based on research'],3),
('DMK','w4-2',6,'Good positioning explains:',array['Who the product is for and why it''s better for them','The price list only','The staff names','The company''s office address'],0),
('DMK','w4-2',7,'Which is a SMART campaign goal?',array['Post a lot','Increase sales somehow','Get 200 newsletter sign-ups from Lagos women aged 25–35 in 4 weeks','Be popular'],2),
('DMK','w4-2',8,'Why set a goal before a campaign?',array['It isn''t needed','Because ads require it','So you can measure whether it worked','To spend more money'],2),
('DMK','w4-2',9,'A brand targeting “everyone” usually:',array['Spreads its budget thin and connects with nobody','Saves money','Gets the best results','Needs no content'],0),
('DMK','w4-2',10,'Retargeting ads are usually aimed at people who:',array['Have never heard of the brand','Work at the company','Already visited the website or engaged before','Live abroad only'],2),
('DMK','w4-2',11,'Customer reviews mainly help at the:',array['Consideration stage','Production stage','Awareness stage only','Hiring stage'],0),
('DMK','w4-2',12,'A call to action (CTA) should be:',array['Clear and specific, e.g. “Shop the new range”','Very long','Hidden','Optional'],0),
('DMK','w5-2',1,'A brand kit in Canva stores:',array['Payment details','Logos, brand colours and fonts for consistent designs','Old invoices','Customer phone numbers'],1),
('DMK','w5-2',2,'Why use templates for social posts?',array['To avoid writing captions','To copy competitors exactly','To create on-brand content faster and consistently','Because originality isn''t allowed'],2),
('DMK','w5-2',3,'A carousel post is best for:',array['A live video','A single photo','An email newsletter','Step-by-step tips or a short story across several slides'],3),
('DMK','w5-2',4,'The first slide of a carousel should:',array['Be blank','List the brand''s address','Hook people with a clear promise or question','Contain all the text'],2),
('DMK','w5-2',5,'Reels and short videos perform best when:',array['They are 10 minutes long','They start slowly','The first 2–3 seconds grab attention','They have no captions or text'],2),
('DMK','w5-2',6,'Good captions usually include:',array['No words at all','A hook, value for the reader and a clear call to action','Only hashtags','The full product manual'],1),
('DMK','w5-2',7,'Adding on-screen text or captions to videos helps because:',array['Many people watch with the sound off','Platforms require it','It hides the product','It makes the video longer'],0),
('DMK','w5-2',8,'Which design choice keeps posts readable?',array['Strong contrast between text and background','Light grey text on white','Five different fonts','Tiny text'],0),
('DMK','w5-2',9,'Exporting images in the right size for each platform:',array['Changes the brand colours','Makes them load slower','Stops them being cropped or blurry','Is never needed'],2),
('DMK','w5-2',10,'Using copyrighted images without permission:',array['Is always fine','Can get content removed and the brand into trouble','Is required','Improves reach'],1),
('DMK','w5-2',11,'A content pillar is:',array['A main theme the brand posts about regularly','A type of chart','A paid ad','A Canva font'],0),
('DMK','w5-2',12,'Before posting a client''s content, you should:',array['Remove the call to action','Change their logo','Check spelling, brand rules and get approval if needed','Post immediately without checking'],2),
('DMK','w6-2',1,'A content calendar helps you:',array['Delete old posts','Reply to comments automatically','Plan posts in advance with dates, formats and topics','Count followers'],2),
('DMK','w6-2',2,'Scheduling tools like Meta Business Suite let you:',array['Write your CV','Plan and publish posts at set times','Design logos','Pay salaries'],1),
('DMK','w6-2',3,'The best time to post is usually found by:',array['Posting at 3am','Copying another country''s times','Checking when your own audience is most active in insights','Posting all at once'],2),
('DMK','w6-2',4,'A customer asks a question in the comments. You should:',array['Reply with a sales pitch only','Delete the comment','Ignore it','Reply helpfully and promptly, or move it to DM if it''s private'],3),
('DMK','w6-2',5,'Community moderation means:',array['Posting more ads','Deleting every negative comment','Blocking all new followers','Managing comments to keep the space respectful and on-brand'],3),
('DMK','w6-2',6,'A fair complaint posted publicly should be:',array['Ignored','Acknowledged publicly and resolved, often by moving to private messages','Deleted immediately','Argued with'],1),
('DMK','w6-2',7,'Consistency in posting matters because:',array['It isn''t important','Audiences and algorithms reward regular, reliable content','It reduces comments','It saves design time'],1),
('DMK','w6-2',8,'Engagement rate measures:',array['Number of posts','Interactions (likes, comments, shares) compared with reach or followers','Ad spend','Website speed'],1),
('DMK','w6-2',9,'Repurposing content means:',array['Deleting old posts','Posting the same image daily','Copying other brands','Turning one piece into several formats, e.g. a blog into a carousel'],3),
('DMK','w6-2',10,'Before a big launch post, check:',array['Your personal account','Only the colours','Nothing','Links, spelling, timing and approvals'],3),
('DMK','w6-2',11,'Spam and abusive comments should be handled by:',array['Following the brand''s moderation policy: hide, delete or report','Replying with insults','Ignoring them forever','Pinning them'],0),
('DMK','w6-2',12,'Social media insights help you:',array['See what content works and improve your plan','Get free ads','Write captions automatically','Change your password'],0),
('DMK','w7-2',1,'Meta Ads Manager campaigns are structured as:',array['Post, story, reel','Ad, campaign, page','Campaign, ad set, ad','Budget, logo, website'],2),
('DMK','w7-2',2,'At the campaign level you choose:',array['The objective, e.g. traffic, leads or sales','The caption','The comment replies','The image'],0),
('DMK','w7-2',3,'At the ad set level you choose:',array['Only the headline','The website code','Audience, budget, schedule and placements','The company logo'],2),
('DMK','w7-2',4,'A lookalike audience is:',array['People similar to an existing group, like past customers','Only your followers','Your competitors'' staff','A random audience'],0),
('DMK','w7-2',5,'A daily budget means:',array['The average amount you''re willing to spend each day','The price of the product','The cost of one click','The total for the whole year'],0),
('DMK','w7-2',6,'CTR (click-through rate) is:',array['Total spend','Number of followers','Clicks divided by impressions','Cost per sale'],2),
('DMK','w7-2',7,'CPC means:',array['Customers per city','Cost per click','Clicks per campaign','Content per channel'],1),
('DMK','w7-2',8,'Running two versions of an ad to see which performs better is called:',array['Boosting','Retargeting','Scheduling','A/B testing (split testing)'],3),
('DMK','w7-2',9,'If an ad has many clicks but no sales, you should check:',array['The landing page, offer and audience match','Only the ad colour','The number of hashtags','Nothing; it''s working'],0),
('DMK','w7-2',10,'ROAS stands for:',array['Results of a survey','Return on ad spend','Reach on all stories','Rate of audience size'],1),
('DMK','w7-2',11,'Before judging results, an ad should usually:',array['Be edited every few minutes','Run without a goal','Be stopped after one hour','Run long enough to gather data and exit the learning phase'],3),
('DMK','w7-2',12,'A good campaign results report includes:',array['The ad images only','Goal, spend, key results, what worked and next steps','Only the total spend','Only screenshots'],1);
select count(*) || ' questions in the bank' as done from quiz_bank;
