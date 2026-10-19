-- Testing modes for the student portal.
--   normal   : a week opens when the week before it is passed AND its date has come (the live setting)
--   progress : dates are ignored. A week opens as soon as the week before it is done and graded
--   open     : every week is open (for checking content only)

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
    'ignore_dates', private.setting('week_dates', 'on') = 'off',
    'progress', coalesce((select jsonb_object_agg(x.key, private.learn_row(x)) from learn_progress x where x.application_id = a.id), '{}'::jsonb),
    'attempts', coalesce((select jsonb_object_agg(t.week, t.n) from learn_attempts t where t.application_id = a.id), '{}'::jsonb),
    'checkins', coalesce((select jsonb_object_agg(k.week, jsonb_build_object('conf', k.conf, 'note', k.note, 'at', k.at)) from learn_checkins k where k.application_id = a.id), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('key', h.key, 'action', h.action, 'by', h.by_name, 'at', h.at) order by h.at) from learn_history h where h.application_id = a.id), '[]'::jsonb),
    'now', now());
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
  if private.today() < ends + p_day - 7 and private.setting('unlock_weeks', 'off') <> 'on' and private.setting('week_dates', 'on') <> 'off' then
    raise exception 'This check-in opens on %.', to_char(ends + p_day - 7, 'FMDD Mon YYYY') using errcode = 'P0001';
  end if;
  if p_status not in ('hired','internship','freelance','study','searching') then raise exception 'Choose what you''re doing now.' using errcode = 'P0001'; end if;
  insert into alumni_checkins(application_id, day, status, note) values (a.id, p_day, p_status, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (application_id, day) do update set status = excluded.status, note = excluded.note, at = now();
  return public.grad_state();
end $$;

create or replace function public.admin_test_mode(p_mode text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['adm_admin','academy_admin']);
  if p_mode is not null then
    if p_mode not in ('normal','progress','open') then raise exception 'Unknown mode.' using errcode = 'P0001'; end if;
    insert into app_settings(key, value) values ('unlock_weeks', case when p_mode = 'open' then 'on' else 'off' end)
    on conflict (key) do update set value = excluded.value;
    insert into app_settings(key, value) values ('week_dates', case when p_mode = 'progress' then 'off' else 'on' end)
    on conflict (key) do update set value = excluded.value;
    insert into audit_log(actor, text) values (s.email, case p_mode when 'open' then 'opened all portal weeks for testing'
      when 'progress' then 'set portal weeks to open by progress only (dates ignored) for testing' else 'set portal weeks back to normal (progress and dates)' end);
  end if;
  return case when private.setting('unlock_weeks', 'off') = 'on' then 'open' when private.setting('week_dates', 'on') = 'off' then 'progress' else 'normal' end;
end $$;

revoke execute on function public.admin_test_mode(text) from public, anon;
grant execute on function public.admin_test_mode(text) to authenticated;

notify pgrst, 'reload schema';

select 'Testing modes installed' as done;
