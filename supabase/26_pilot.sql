-- Pilot cohort: outside testers apply through a private link into their own cohort (matric GEP/26P/001…),
-- so real applicants stay in Cohort 1. Staff pages show the pilot while it runs. Delete it with cleanup_pilot.sql.

alter table cohorts add column if not exists is_pilot boolean not null default false;

create or replace function private.pilot_cohort() returns cohorts
language sql stable security definer set search_path = public, pg_temp as $$
  select * from cohorts where is_pilot order by id desc limit 1
$$;

-- The cohort staff pages work on: the pilot while it has students, else the newest real cohort with students, else the admissions cohort.
create or replace function private.ac_cohort() returns cohorts
language sql stable security definer set search_path = public, pg_temp as $$
  select c.* from cohorts c
  where c.id = coalesce(
    (select p.id from cohorts p where p.is_pilot and exists (select 1 from applications a where a.cohort_id = p.id and a.status = 'Admitted') order by p.id desc limit 1),
    (select a.cohort_id from applications a join cohorts x on x.id = a.cohort_id where a.status = 'Admitted' and a.matric is not null and not x.is_pilot order by a.admitted_at desc nulls last limit 1),
    (select id from cohorts where is_current order by id desc limit 1))
$$;

-- Applications: the pilot link sends testers to the pilot cohort, everyone else goes to the current cohort.
create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c cohorts; a applications; r text; f text;
  req text[] := array['first_name','surname','email','phone','city','edu','nysc','situation','hours','laptop','internet','motivation'];
begin
  if coalesce(trim(p ->> 'pilot'), '') <> '' then
    c := private.pilot_cohort();
    if c.id is null or trim(p ->> 'pilot') <> private.setting('pilot_code', '') or not c.applications_open then
      raise exception 'This pilot link is no longer active. Ask the Jobnest team for a new one.' using errcode = 'P0001';
    end if;
  else
    c := private.current_cohort();
    if c.id is null or not c.applications_open then
      raise exception 'Applications are closed right now.' using errcode = 'P0001';
    end if;
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
    r := 'JNA-' || c.year2 || '-' || lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when r !~ '-000000$' and not exists (select 1 from applications where ref = r);
  end loop;
  insert into applications(ref, cohort_id, first_name, surname, email, phone, city, edu, nysc, situation,
    hours, laptop, internet, motivation, zuri_summary)
  values (r, c.id, trim(p ->> 'first_name'), trim(p ->> 'surname'), lower(trim(p ->> 'email')), trim(p ->> 'phone'),
    trim(p ->> 'city'), p ->> 'edu', p ->> 'nysc', p ->> 'situation', p ->> 'hours', p ->> 'laptop',
    p ->> 'internet', trim(p ->> 'motivation'), nullif(trim(coalesce(p ->> 'zuri_summary', '')), ''))
  returning * into a;
  perform private.log(a.id, 'Applicant', case when c.is_pilot then 'Pilot application submitted' when a.zuri_summary is null then 'Application submitted (no Zuri summary)' else 'Application submitted with a Zuri summary' end);
  perform private.queue_email(a, 'received', '{}'::jsonb, 'assess');
  return jsonb_build_object('ref', a.ref, 'token', a.token);
end $$;

-- Admissions lists include pilot applicants (marked), so the team can run their calls and decisions.
create or replace function public.adm_applications() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; pc cohorts;
begin
  perform private.require_role(array['adm_admin','adm_officer']);
  c := private.current_cohort(); pc := private.pilot_cohort();
  return coalesce((select jsonb_agg(private.app_staff(a) || jsonb_build_object('pilot', a.cohort_id = pc.id) order by a.created_at desc)
    from applications a where a.cohort_id = c.id or a.cohort_id = pc.id), '[]'::jsonb);
end $$;

create or replace function public.adm_payments() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; pc cohorts;
begin
  perform private.require_role(array['adm_admin']);
  c := private.current_cohort(); pc := private.pilot_cohort();
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(private.app_staff(a) || jsonb_build_object('fees', private.fees(a), 'pilot', a.cohort_id = pc.id)
        order by a.status, a.matric nulls last, a.offer_deadline)
      from applications a where (a.cohort_id = c.id or a.cohort_id = pc.id) and a.status in ('Offer sent','Offer expired','Admitted')), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('at', y.created_at, 'paid_at', y.paid_at, 'reference', y.reference,
        'part', y.part, 'amount', y.amount, 'amount_paid', y.amount_paid, 'status', y.status, 'channel', y.channel, 'note', y.note,
        'recorded_by', y.recorded_by, 'name', a.first_name || ' ' || a.surname, 'app_ref', a.ref) order by y.created_at desc)
      from (select * from payments order by created_at desc limit 100) y join applications a on a.id = y.application_id), '[]'::jsonb));
end $$;

-- Live sessions, announcements and portal invites follow the cohort that is learning (the pilot while it runs).
create or replace function public.acad_sessions() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin']);
  c := private.ac_cohort();
  return jsonb_build_object('my_track', s.track_code, 'start_date', c.start_date, 'cohort', c.name,
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
  c := private.ac_cohort();
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

create or replace function public.acad_news() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin']);
  c := private.ac_cohort();
  return jsonb_build_object('my_track', s.track_code, 'cohort', c.name,
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
  c := private.ac_cohort();
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

create or replace function public.acad_invite() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; a applications; n int := 0;
begin
  s := private.require_role(array['cohort_manager','academy_admin','adm_admin']);
  c := private.ac_cohort();
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

-- Super Admin: start, check or pause the pilot.
create or replace function public.admin_pilot(p_action text default 'status', p_start date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts; pc cohorts; code text;
begin
  s := private.require_role(array['super']);
  pc := private.pilot_cohort();
  if p_action = 'create' then
    if pc.id is not null then raise exception 'A pilot already exists.' using errcode = 'P0001'; end if;
    c := private.current_cohort();
    insert into cohorts(programme_code, name, start_date, year2, batch, applications_open, pass_mark, ready_n, offer_days, inst_due_week, is_current, matric_next, assess_minutes, is_pilot)
    values (c.programme_code, 'Pilot · Platform test', coalesce(p_start, private.today()), to_char(private.today(), 'YY'), 'P', true, c.pass_mark, c.ready_n, c.offer_days, c.inst_due_week, false, 1, c.assess_minutes, true)
    returning * into pc;
    code := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    insert into app_settings(key, value) values ('pilot_code', code) on conflict (key) do update set value = excluded.value;
    insert into audit_log(actor, text) values (s.email, 'started the pilot cohort');
  elsif p_action = 'open' or p_action = 'close' then
    if pc.id is null then raise exception 'There is no pilot.' using errcode = 'P0001'; end if;
    update cohorts set applications_open = (p_action = 'open') where id = pc.id returning * into pc;
    insert into audit_log(actor, text) values (s.email, case when p_action = 'open' then 'reopened pilot sign-ups' else 'closed pilot sign-ups' end);
  elsif p_action = 'start' then
    if pc.id is null or p_start is null then raise exception 'Choose a start date.' using errcode = 'P0001'; end if;
    update cohorts set start_date = p_start where id = pc.id returning * into pc;
  end if;
  if pc.id is null then return jsonb_build_object('pilot', null); end if;
  return jsonb_build_object('pilot', jsonb_build_object('id', pc.id, 'name', pc.name, 'start_date', pc.start_date, 'open', pc.applications_open, 'matric', pc.programme_code || '/' || pc.year2 || pc.batch || '/001'),
    'code', private.setting('pilot_code', ''),
    'applied', (select count(*) from applications where cohort_id = pc.id),
    'admitted', (select count(*) from applications where cohort_id = pc.id and status = 'Admitted'),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from applications where cohort_id = pc.id group by status) z), '{}'::jsonb));
end $$;

-- Applicants see that they are in the pilot, and the pilot never takes real payments.
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
    'signer_title', case when a.status = 'Admitted' then private.setting('signer_title', 'Programme Director') end,
    'pilot', c.is_pilot)
  from cohorts c join programmes p on p.code = c.programme_code where c.id = a.cohort_id
$$;

create or replace function public.pay_prepare(p_ref text, p_token uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; f jsonb; v_part text; v_amt int; r text;
begin
  a := private.applicant(p_ref, p_token);
  f := private.fees(a);
  if (select is_pilot from cohorts where id = a.cohort_id) then
    raise exception 'This is a pilot account, so there is nothing to pay. The Jobnest team will admit you.' using errcode = 'P0001';
  end if;
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

revoke execute on function private.pilot_cohort() from public;
revoke execute on function public.admin_pilot(text, date) from public, anon;
grant execute on function public.admin_pilot(text, date) to authenticated;

notify pgrst, 'reload schema';

select 'Pilot cohort installed' as done;
