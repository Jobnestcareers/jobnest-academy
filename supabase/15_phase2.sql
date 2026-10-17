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
