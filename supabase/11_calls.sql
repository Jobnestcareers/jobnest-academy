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
