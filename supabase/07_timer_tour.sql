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
