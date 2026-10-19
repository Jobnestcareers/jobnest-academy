-- Student alert emails get their own template, 'student_alert'. 20_community.sql reused the name 'reminder',
-- which overwrote the applicant offer reminder from 05_payments.sql, so offer-expiry emails went out as
-- "{title}" / "{body}". This restores the offer reminder and points student alerts at the new template.
-- Safe to run more than once.

insert into email_templates(key, subject, body, cta) values
  ('student_alert', '{title}', E'Hi {first},\n\n{body}\n\nYou can turn these reminder emails off in your profile. You''ll still see them in the portal.', 'Open the portal'),
  ('reminder', 'Reminder: your offer expires in {days}',
   E'Hi {first},\n\nJust a reminder that your offer for the {track} track expires on {deadline}.\n\nYou can pay in full, or pay the first of 2 instalments now. After the deadline, the seat goes to the waitlist.',
   'Accept and pay')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

-- ---------- student reminders (from 20_community.sql), now using 'student_alert' ----------
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
          '/learn/learning/' || w, 'student_alert', jsonb_build_object('cta', 'Open this week'));
        n := n + 1;
      end if;
    end if;
    -- 2) Saturday from 08:00: next week opens
    nw := w + 1;
    if nw between 2 and coalesce(p.weeks, 17) and dow = 5 and hr >= 8 and private.remind_once(a, 'open-' || nw) then
      select title into t from course_weeks where track_code = a.track_code and week = nw;
      perform private.notify(a, 'week', format('Week %s opens today: %s', nw, t),
        format('Week %s starts on Monday. It unlocks for you once you''ve passed Week %s.', nw, nw - 1),
        '/learn/learning/' || nw, 'student_alert', '{}'::jsonb);
      n := n + 1;
    end if;
    -- 3) Monday from 09:00 in check-in weeks (2, 4, 6 …): the weekly check-in is open
    if w between 2 and coalesce(p.weeks, 17) and w % 2 = 0 and dow = 0 and hr >= 9 and private.remind_once(a, 'ck-' || w) then
      perform private.notify(a, 'checkin', format('Your Week %s check-in is open', w),
        'Tell your facilitator how confident you feel this week. It takes one minute.', '/learn/learning/' || w, 'student_alert', '{}'::jsonb);
      n := n + 1;
    end if;
    -- 4) One hour before a live class
    for x in select * from sessions s where s.cohort_id = c.id and (s.track_code is null or s.track_code = a.track_code)
        and s.starts_at between now() and now() + interval '65 minutes' loop
      if private.remind_once(a, 'sess-' || x.id) then
        perform private.notify(a, 'session', format('Live class at %s: %s', private.wat(x.starts_at, 'HH24:MI'), x.title),
          'Join from the portal so your attendance is recorded.', '/learn/cohort', 'student_alert', '{}'::jsonb);
        n := n + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('reminders', n);
end $$;

-- ---------- overdue fee reminders (from 24_super_admin.sql), now using 'student_alert' ----------
-- Remind students with an overdue balance (one student, or everyone when p_app is null).
create or replace function public.acad_fee_remind(p_app uuid default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; f jsonb; n int := 0;
begin
  s := private.require_role(array['super','director','cohort_manager']);
  for a in select * from applications where status = 'Admitted' and plan = 'two' and (p_app is null or id = p_app) loop
    f := private.fee_lock(a);
    if f is null then continue; end if;
    perform private.notify(a, 'payment', 'Your second instalment is overdue',
      'Pay ₦' || to_char((f ->> 'balance')::int, 'FM999,999,999') || ' to open your lessons again. Talk to Student Success if you need more time.',
      '/a/' || a.ref || '/' || a.token || '/pay', 'student_alert', null, true);
    n := n + 1;
  end loop;
  insert into audit_log(actor, text) values (s.email, format('sent %s overdue payment reminder%s', n, case when n = 1 then '' else 's' end));
  return n;
end $$;

select 'Student alert emails separated from the offer reminder' as done;
