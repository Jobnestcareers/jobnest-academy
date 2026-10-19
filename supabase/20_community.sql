-- Community and support: cohort discussion, profile editing, help requests, in-portal alerts,
-- email reminders (deadlines, check-ins, new weeks, live classes) and the internship certificate.

-- ---------- week titles (for reminders) ----------
create table if not exists course_weeks (
  track_code text not null references tracks(code),
  week int not null,
  title text not null,
  primary key (track_code, week)
);
alter table course_weeks enable row level security;
insert into course_weeks(track_code, week, title) values
('ADM',1,$t$Welcome & Orientation$t$),
('ADM',2,$t$Communication & Remote Work$t$),
('ADM',3,$t$Productivity & Workplace Readiness$t$),
('ADM',4,$t$Calendar & Inbox Management$t$),
('ADM',5,$t$Business Documents$t$),
('ADM',6,$t$Spreadsheets for Admins$t$),
('ADM',7,$t$Travel, Expenses & Vendors$t$),
('ADM',8,$t$Project: Plan & Build$t$),
('ADM',9,$t$Project: Delivery$t$),
('ADM',10,$t$Internship · Week 1$t$),
('ADM',11,$t$Internship · Week 2$t$),
('ADM',12,$t$Internship · Week 3$t$),
('ADM',13,$t$Internship · Week 4$t$),
('ADM',14,$t$CV, LinkedIn & Portfolio$t$),
('ADM',15,$t$Discovery Call 2$t$),
('ADM',16,$t$Personal Pitch & Outreach$t$),
('ADM',17,$t$Applications & Interviews$t$),
('CSP',1,$t$Welcome & Orientation$t$),
('CSP',2,$t$Communication & Remote Work$t$),
('CSP',3,$t$Productivity & Workplace Readiness$t$),
('CSP',4,$t$Support Fundamentals$t$),
('CSP',5,$t$Ticketing Tools$t$),
('CSP',6,$t$Live Chat & Email Etiquette$t$),
('CSP',7,$t$CX Metrics$t$),
('CSP',8,$t$Project: Plan & Build$t$),
('CSP',9,$t$Project: Delivery$t$),
('CSP',10,$t$Internship · Week 1$t$),
('CSP',11,$t$Internship · Week 2$t$),
('CSP',12,$t$Internship · Week 3$t$),
('CSP',13,$t$Internship · Week 4$t$),
('CSP',14,$t$CV, LinkedIn & Portfolio$t$),
('CSP',15,$t$Discovery Call 2$t$),
('CSP',16,$t$Personal Pitch & Outreach$t$),
('CSP',17,$t$Applications & Interviews$t$),
('DAT',1,$t$Welcome & Orientation$t$),
('DAT',2,$t$Communication & Remote Work$t$),
('DAT',3,$t$Productivity & Workplace Readiness$t$),
('DAT',4,$t$Spreadsheet Foundations$t$),
('DAT',5,$t$Cleaning Messy Data$t$),
('DAT',6,$t$Charts That Answer Questions$t$),
('DAT',7,$t$Building a Dashboard$t$),
('DAT',8,$t$Project: Plan & Build$t$),
('DAT',9,$t$Project: Delivery$t$),
('DAT',10,$t$Internship · Week 1$t$),
('DAT',11,$t$Internship · Week 2$t$),
('DAT',12,$t$Internship · Week 3$t$),
('DAT',13,$t$Internship · Week 4$t$),
('DAT',14,$t$CV, LinkedIn & Portfolio$t$),
('DAT',15,$t$Discovery Call 2$t$),
('DAT',16,$t$Personal Pitch & Outreach$t$),
('DAT',17,$t$Applications & Interviews$t$),
('DMK',1,$t$Welcome & Orientation$t$),
('DMK',2,$t$Communication & Remote Work$t$),
('DMK',3,$t$Productivity & Workplace Readiness$t$),
('DMK',4,$t$Marketing Fundamentals$t$),
('DMK',5,$t$Content Creation with Canva$t$),
('DMK',6,$t$Social Media Management$t$),
('DMK',7,$t$Paid Ads & Analytics$t$),
('DMK',8,$t$Project: Plan & Build$t$),
('DMK',9,$t$Project: Delivery$t$),
('DMK',10,$t$Internship · Week 1$t$),
('DMK',11,$t$Internship · Week 2$t$),
('DMK',12,$t$Internship · Week 3$t$),
('DMK',13,$t$Internship · Week 4$t$),
('DMK',14,$t$CV, LinkedIn & Portfolio$t$),
('DMK',15,$t$Discovery Call 2$t$),
('DMK',16,$t$Personal Pitch & Outreach$t$),
('DMK',17,$t$Applications & Interviews$t$)
on conflict (track_code, week) do update set title = excluded.title;

-- ---------- profile ----------
alter table applications add column if not exists linkedin text;
alter table applications add column if not exists bio text;
alter table applications add column if not exists email_reminders boolean not null default true;

create or replace function public.profile_get() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return jsonb_build_object('first_name', a.first_name, 'surname', a.surname, 'email', a.email, 'phone', a.phone, 'city', a.city,
    'linkedin', a.linkedin, 'bio', a.bio, 'email_reminders', a.email_reminders);
end $$;

create or replace function public.profile_save(p_phone text, p_city text, p_linkedin text, p_bio text, p_reminders boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; ph text;
begin
  a := private.require_student();
  ph := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if length(regexp_replace(ph, '\D', '', 'g')) < 7 then raise exception 'Add your WhatsApp number with the country code, e.g. +2348031234567.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_city), '') = '' then raise exception 'Add your city or town.' using errcode = 'P0001'; end if;
  if length(coalesce(p_bio, '')) > 400 then raise exception 'Keep your bio under 400 characters.' using errcode = 'P0001'; end if;
  update applications set phone = ph, city = left(trim(p_city), 120), linkedin = private.clean_url(p_linkedin),
    bio = nullif(trim(coalesce(p_bio, '')), ''), email_reminders = coalesce(p_reminders, true)
  where id = a.id;
  return public.profile_get();
end $$;

-- ---------- in-portal alerts ----------
create table if not exists notices (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notices_app on notices(application_id, created_at desc);
alter table notices enable row level security;

create table if not exists reminders_sent (
  application_id uuid not null references applications(id) on delete cascade,
  ref text not null,
  at timestamptz not null default now(),
  primary key (application_id, ref)
);
alter table reminders_sent enable row level security;

-- Alert in the portal, and email too when the student wants reminders (or always, for replies).
create or replace function private.notify(a applications, p_kind text, p_title text, p_body text, p_link text, p_tpl text, p_vars jsonb, p_always_email boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notices(application_id, kind, title, body, link) values (a.id, p_kind, p_title, p_body, p_link);
  if p_tpl is not null and (p_always_email or a.email_reminders) then
    perform private.queue_mail(a, p_tpl, coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('title', p_title, 'body', coalesce(p_body, '')), private.site() || coalesce(p_link, '/learn'));
  end if;
end $$;

create or replace function public.notices_list() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return jsonb_build_object('unread', (select count(*) from notices where application_id = a.id and read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link', n.link, 'at', n.created_at, 'read', n.read_at is not null) order by n.created_at desc)
      from (select * from notices where application_id = a.id order by created_at desc limit 40) n), '[]'::jsonb));
end $$;

create or replace function public.notices_read() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  update notices set read_at = now() where application_id = a.id and read_at is null;
  return public.notices_list();
end $$;

-- ---------- reminders: run every minute by the email job; each one is sent once ----------
create or replace function private.remind_once(a applications, p_ref text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into reminders_sent(application_id, ref) values (a.id, p_ref);
  return true;
exception when unique_violation then return false;
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
    -- 1) Thursday from 09:00: this week's work is due tomorrow at 17:00
    if w between 1 and coalesce(p.weeks, 17) and dow = 3 and hr >= 9 then
      select count(*) into left_n from course_items i where i.track_code = a.track_code and i.week = w and not i.opt and not i.staff
        and not exists (select 1 from learn_progress x2 where x2.application_id = a.id and x2.key = i.key and x2.status in ('done','graded','submitted'));
      if left_n > 0 and w > 1 and private.remind_once(a, 'due-' || w) then
        select title into t from course_weeks where track_code = a.track_code and week = w;
        perform private.notify(a, 'deadline', format('Week %s is due tomorrow at 17:00', w),
          format('%s %s left in “%s”. Work in by Friday 17:00 gets full marks.', left_n, case when left_n = 1 then 'task is' else 'tasks are' end, t),
          '/learn/learning/' || w, 'reminder', jsonb_build_object('cta', 'Open this week'));
        n := n + 1;
      end if;
    end if;
    -- 2) Saturday from 08:00: next week opens
    nw := w + 1;
    if nw between 2 and coalesce(p.weeks, 17) and dow = 5 and hr >= 8 and private.remind_once(a, 'open-' || nw) then
      select title into t from course_weeks where track_code = a.track_code and week = nw;
      perform private.notify(a, 'week', format('Week %s opens today: %s', nw, t),
        format('Week %s starts on Monday. It unlocks for you once you''ve passed Week %s.', nw, nw - 1),
        '/learn/learning/' || nw, 'reminder', '{}'::jsonb);
      n := n + 1;
    end if;
    -- 3) Monday from 09:00 in check-in weeks (2, 4, 6 …): the weekly check-in is open
    if w between 2 and coalesce(p.weeks, 17) and w % 2 = 0 and dow = 0 and hr >= 9 and private.remind_once(a, 'ck-' || w) then
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

insert into app_settings(key, value) values ('reminders', 'on') on conflict (key) do nothing;

-- ---------- help & support ----------
create table if not exists support_requests (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  category text not null,
  subject text not null,
  message text not null,
  status text not null default 'Open' check (status in ('Open','In progress','Resolved')),
  reply text,
  replied_by text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
alter table support_requests enable row level security;

create or replace function public.support_list() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'category', r.category, 'subject', r.subject, 'message', r.message, 'status', r.status,
      'reply', r.reply, 'by', r.replied_by, 'replied_at', r.replied_at, 'at', r.created_at) order by r.created_at desc)
    from support_requests r where r.application_id = a.id), '[]'::jsonb);
end $$;

create or replace function public.support_create(p_category text, p_subject text, p_message text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if p_category not in ('Technical problem','Course content','Deadlines or extension','Payment','Internship','Personal or wellbeing','Other') then
    raise exception 'Choose what your request is about.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_subject), '') = '' or coalesce(trim(p_message), '') = '' then raise exception 'Add a subject and your message.' using errcode = 'P0001'; end if;
  if (select count(*) from support_requests where application_id = a.id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent a lot of requests today. We''ll reply to those first.' using errcode = 'P0001';
  end if;
  insert into support_requests(application_id, category, subject, message) values (a.id, p_category, left(trim(p_subject), 120), left(trim(p_message), 3000));
  return public.support_list();
end $$;

create or replace function public.acad_support() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','facilitator','coach']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'phone', a.phone,
      'track', (select name from tracks where code = a.track_code), 'category', r.category, 'subject', r.subject, 'message', r.message, 'status', r.status,
      'reply', r.reply, 'by', r.replied_by, 'replied_at', r.replied_at, 'at', r.created_at)
      order by (r.status = 'Resolved'), r.created_at desc)
    from support_requests r join applications a on a.id = r.application_id
    where private.track_ok(s, a.track_code) and (r.status <> 'Resolved' or r.created_at > now() - interval '60 days')), '[]'::jsonb);
end $$;

create or replace function public.acad_support_reply(p_id bigint, p_reply text, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; r support_requests; a applications;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','facilitator','coach']);
  if p_status not in ('Open','In progress','Resolved') then raise exception 'Choose a status.' using errcode = 'P0001'; end if;
  select * into r from support_requests where id = p_id;
  select * into a from applications where id = r.application_id;
  if r.id is null or not private.track_ok(s, a.track_code) then raise exception 'Request not found.' using errcode = 'P0001'; end if;
  update support_requests set status = p_status,
    reply = coalesce(nullif(trim(coalesce(p_reply, '')), ''), reply),
    replied_by = case when coalesce(trim(p_reply), '') <> '' then s.full_name else replied_by end,
    replied_at = case when coalesce(trim(p_reply), '') <> '' then now() else replied_at end
  where id = p_id returning * into r;
  if coalesce(trim(p_reply), '') <> '' then
    perform private.notify(a, 'support', 'Reply to your request: ' || r.subject, left(trim(p_reply), 300), '/learn/help', 'support_reply',
      jsonb_build_object('subject', r.subject, 'reply', trim(p_reply), 'by', s.full_name, 'status', r.status), true);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- cohort discussion ----------
create table if not exists discussion_posts (
  id bigint generated always as identity primary key,
  cohort_id bigint not null references cohorts(id) on delete cascade,
  parent_id bigint references discussion_posts(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  staff_email text,
  author text not null,
  is_staff boolean not null default false,
  body text not null check (length(body) between 1 and 2000),
  pinned boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists discussion_cohort on discussion_posts(cohort_id, created_at desc);
alter table discussion_posts enable row level security;

create or replace function private.disc_json(p_cohort bigint, p_staff boolean, p_me uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'author', t.author, 'staff', t.is_staff, 'mine', t.application_id = p_me, 'body', t.body, 'at', t.created_at,
      'pinned', t.pinned, 'hidden', t.hidden,
      'replies', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'author', r.author, 'staff', r.is_staff, 'mine', r.application_id = p_me, 'body', r.body, 'at', r.created_at, 'hidden', r.hidden) order by r.created_at)
        from discussion_posts r where r.parent_id = t.id and (p_staff or not r.hidden)), '[]'::jsonb))
    order by t.pinned desc, t.created_at desc), '[]'::jsonb)
  from (select * from discussion_posts where cohort_id = p_cohort and parent_id is null and (p_staff or not hidden) order by pinned desc, created_at desc limit 60) t
$$;

create or replace function public.disc_list() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return private.disc_json(a.cohort_id, false, a.id);
end $$;

create or replace function public.disc_post(p_body text, p_parent bigint default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first.' using errcode = 'P0001'; end if;
  if p_parent is not null and not exists (select 1 from discussion_posts where id = p_parent and cohort_id = a.cohort_id and parent_id is null and not hidden) then
    raise exception 'That post was not found.' using errcode = 'P0001';
  end if;
  if (select count(*) from discussion_posts where application_id = a.id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Slow down a little. Try again in a few minutes.' using errcode = 'P0001';
  end if;
  insert into discussion_posts(cohort_id, parent_id, application_id, author, body)
  values (a.cohort_id, p_parent, a.id, a.first_name || ' ' || left(a.surname, 1) || '. · ' || coalesce((select name from tracks where code = a.track_code), ''), left(trim(p_body), 2000));
  return private.disc_json(a.cohort_id, false, a.id);
end $$;

create or replace function public.disc_delete_mine(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  delete from discussion_posts where id = p_id and application_id = a.id;
  return private.disc_json(a.cohort_id, false, a.id);
end $$;

create or replace function public.acad_discussion() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','facilitator','coach']);
  select * into c from cohorts where id = (select cohort_id from applications where status = 'Admitted' order by created_at desc limit 1);
  if c.id is null then return jsonb_build_object('cohort', null, 'posts', '[]'::jsonb); end if;
  return jsonb_build_object('cohort', c.name, 'posts', private.disc_json(c.id, true, null));
end $$;

create or replace function public.acad_disc_post(p_body text, p_parent bigint default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; cid bigint;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','facilitator','coach']);
  cid := (select cohort_id from applications where status = 'Admitted' order by created_at desc limit 1);
  if cid is null then raise exception 'There''s no active cohort yet.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first.' using errcode = 'P0001'; end if;
  insert into discussion_posts(cohort_id, parent_id, staff_email, author, is_staff, body) values (cid, p_parent, s.email, s.full_name || ' · Jobnest', true, left(trim(p_body), 2000));
  return public.acad_discussion();
end $$;

create or replace function public.acad_disc_moderate(p_id bigint, p_hidden boolean, p_pinned boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','facilitator']);
  update discussion_posts set hidden = coalesce(p_hidden, hidden), pinned = coalesce(p_pinned, pinned) where id = p_id;
  return public.acad_discussion();
end $$;

-- ---------- internship certificate ----------
alter table learn_evals add column if not exists cert_id text unique;
create or replace function private.intern_cert_id(m text) returns text
language sql immutable as $$
  select case when m is null then null else 'JNA-INT-' || upper(split_part(m, '/', 1) || split_part(m, '/', 2)) || '-' || upper(split_part(m, '/', 3)) end
$$;

-- Supervisor's final evaluation now also issues the internship certificate.
create or replace function public.host_eval(p_token uuid, p_ratings int[], p_comment text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare p placements; a applications; first boolean;
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
  first := not exists (select 1 from learn_evals where application_id = a.id);
  insert into learn_evals(application_id, ratings, comment, by_name, cert_id) values (a.id, p_ratings, nullif(trim(coalesce(p_comment, '')), ''), p.sup_name, private.intern_cert_id(a.matric))
  on conflict (application_id) do update set ratings = excluded.ratings, comment = excluded.comment, by_name = excluded.by_name, at = now(), cert_id = coalesce(learn_evals.cert_id, excluded.cert_id);
  perform private.learn_mark(a, 'Supervisor performance evaluation', true, p.sup_name);
  insert into learn_history(application_id, key, action, by_name) values (a.id, coalesce(private.key_of(a, 'Supervisor performance evaluation'), 'eval'), 'Evaluation submitted', p.sup_name);
  if first then
    perform private.notify(a, 'certificate', 'Your internship certificate is ready 🎓',
      format('%s at %s submitted your final evaluation. Download your internship certificate from Week 13.', p.sup_name, p.org),
      '/learn/learning/13', 'intern_cert', jsonb_build_object('org', p.org, 'role', p.role, 'cert', private.intern_cert_id(a.matric)), true);
  end if;
  return public.host_view(p_token);
end $$;
update learn_evals e set cert_id = private.intern_cert_id(a.matric) from applications a where a.id = e.application_id and e.cert_id is null;

-- Verify page: programme certificates and internship certificates.
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
    'programme', p.name, 'weeks', p.weeks, 'track', (select name from tracks where code = a.track_code),
    'completed_on', a.completed_on, 'year', to_char(a.completed_on, 'YYYY'),
    'signer_name', private.setting('signer_name', ''), 'signer_title', private.setting('signer_title', 'Programme Director'))
  into r from applications a join cohorts c on c.id = a.cohort_id join programmes p on p.code = c.programme_code
  where a.cert_id = v and a.status = 'Admitted';
  return r;
end $$;

-- ---------- staff counts: also open help requests ----------
create or replace function public.staff_counts_extra() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.caller_staff();
  if s.email is null or s.role not in ('super','director','cohort_manager','academy_admin','facilitator','coach') then return '{}'::jsonb; end if;
  return jsonb_build_object('support', (select count(*) from support_requests r join applications a on a.id = r.application_id
    where r.status <> 'Resolved' and private.track_ok(s, a.track_code)));
end $$;

-- ---------- emails ----------
insert into email_templates(key, subject, body, cta) values
  ('reminder', '{title}', E'Hi {first},\n\n{body}\n\nYou can turn these reminder emails off in your profile. You''ll still see them in the portal.', 'Open the portal'),
  ('support_reply', 'Reply to your request: {subject}', E'Hi {first},\n\n{by} replied to your request "{subject}":\n\n{reply}\n\nStatus: {status}', 'See my requests'),
  ('intern_cert', 'Your internship certificate is ready 🎓', E'Hi {first},\n\nCongratulations on completing your internship as {role} at {org}! Your supervisor has submitted your final evaluation, and your internship certificate is ready.\n\nCertificate number: {cert}. Employers can check it at academy.jobnestcareers.com/verify.', 'Download my certificate')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

-- ---------- who may call what ----------
revoke execute on function private.notify(applications, text, text, text, text, text, jsonb, boolean), private.remind_once(applications, text),
  private.disc_json(bigint, boolean, uuid), private.intern_cert_id(text) from public;
revoke execute on function public.profile_get(), public.profile_save(text, text, text, text, boolean), public.notices_list(), public.notices_read(),
  public.support_list(), public.support_create(text, text, text), public.acad_support(), public.acad_support_reply(bigint, text, text),
  public.disc_list(), public.disc_post(text, bigint), public.disc_delete_mine(bigint), public.acad_discussion(), public.acad_disc_post(text, bigint),
  public.acad_disc_moderate(bigint, boolean, boolean), public.staff_counts_extra(), public.learn_reminders_tick() from public, anon;
grant execute on function public.profile_get(), public.profile_save(text, text, text, text, boolean), public.notices_list(), public.notices_read(),
  public.support_list(), public.support_create(text, text, text), public.acad_support(), public.acad_support_reply(bigint, text, text),
  public.disc_list(), public.disc_post(text, bigint), public.disc_delete_mine(bigint), public.acad_discussion(), public.acad_disc_post(text, bigint),
  public.acad_disc_moderate(bigint, boolean, boolean), public.staff_counts_extra() to authenticated;
grant execute on function public.learn_reminders_tick() to service_role;
grant execute on function public.certificate_view(text) to anon, authenticated;

notify pgrst, 'reload schema';
select 'Community, support, reminders and internship certificates installed' as done;
