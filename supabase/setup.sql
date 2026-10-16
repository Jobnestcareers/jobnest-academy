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

Thank you for applying to the {programme}. Your application reference is {ref}.

Your next step is a 10-minute readiness assessment on basic digital skills and communication. You can take it now or any time in the next 3 days.', 'Take the readiness assessment'),
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
