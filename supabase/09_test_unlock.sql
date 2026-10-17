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

select 'Test unlock switch installed' as done;
