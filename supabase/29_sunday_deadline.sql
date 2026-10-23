-- DRAFT, NOT READY TO RUN: waiting on the decision about weekly assessments. Caps below will be removed.
-- Jobnest Academy update 29: weekly work is due Sunday at 18:00.
-- Full marks until Sunday 18:00 WAT of the week, up to 80% until Monday 23:59, then 50% at most.
-- The "due tomorrow" reminder moves from Thursday to Saturday morning.
-- Run after update 28. Safe to run more than once.

create or replace function private.learn_cap(c cohorts, w int, at timestamptz) returns numeric
language sql stable as $$
  select case
    when at <= ((c.start_date + (w - 1) * 7 + 6) + time '18:00') at time zone 'Africa/Lagos' then 1
    when at <= ((c.start_date + (w - 1) * 7 + 7) + time '23:59') at time zone 'Africa/Lagos' then 0.8
    else 0.5 end
$$;
revoke execute on function private.learn_cap(cohorts, int, timestamptz) from public;

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
    -- 1) Saturday from 09:00: this week's work is due tomorrow (Sunday) at 18:00
    if w between 1 and coalesce(p.weeks, 20) and dow = 5 and hr >= 9 then
      select count(*) into left_n from course_items i where i.track_code = a.track_code and i.week = w and not i.opt and not i.staff
        and not exists (select 1 from learn_progress x2 where x2.application_id = a.id and x2.key = i.key and x2.status in ('done','graded','submitted'));
      if left_n > 0 and w > 1 and private.remind_once(a, 'due-' || w) then
        select title into t from course_weeks where track_code = a.track_code and week = w;
        perform private.notify(a, 'deadline', format('Week %s is due tomorrow at 18:00', w),
          format('%s %s left in “%s”. Work in by Sunday 18:00 gets full marks.', left_n, case when left_n = 1 then 'task is' else 'tasks are' end, t),
          '/learn/learning/' || w, 'reminder', jsonb_build_object('cta', 'Open this week'));
        n := n + 1;
      end if;
    end if;
    -- 2) Saturday from 08:00: next week opens
    nw := w + 1;
    if nw between 2 and coalesce(p.weeks, 20) and dow = 5 and hr >= 8 and private.remind_once(a, 'open-' || nw) then
      select title into t from course_weeks where track_code = a.track_code and week = nw;
      perform private.notify(a, 'week', format('Week %s opens today: %s', nw, t),
        format('Week %s starts on Monday. You can look ahead now; finish Week %s first.', nw, nw - 1),
        '/learn/learning/' || nw, 'reminder', '{}'::jsonb);
      n := n + 1;
    end if;
    -- 3) Monday from 09:00 in check-in weeks (2, 4, 6 …): the weekly check-in is open
    if w between 2 and coalesce(p.weeks, 20) and w % 2 = 0 and dow = 0 and hr >= 9 and private.remind_once(a, 'ck-' || w) then
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
revoke execute on function public.learn_reminders_tick() from public, anon;
grant execute on function public.learn_reminders_tick() to service_role;

notify pgrst, 'reload schema';
