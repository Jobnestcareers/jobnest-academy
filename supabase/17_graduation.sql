-- After Week 17: graduation page, job outcomes, alumni check-ins (30/60/90 days) and the exit survey.

create table if not exists learn_outcomes (
  application_id uuid primary key references applications(id) on delete cascade,
  status text not null check (status in ('hired','internship','freelance','study','searching')),
  company text,
  role text,
  start_date date,
  via text check (via in ('jobnest','own','referral','other')),
  updated_at timestamptz not null default now()
);
alter table learn_outcomes enable row level security;

create table if not exists alumni_checkins (
  application_id uuid not null references applications(id) on delete cascade,
  day int not null check (day in (30, 60, 90)),
  status text not null check (status in ('hired','internship','freelance','study','searching')),
  note text,
  at timestamptz not null default now(),
  primary key (application_id, day)
);
alter table alumni_checkins enable row level security;

create table if not exists exit_surveys (
  application_id uuid primary key references applications(id) on delete cascade,
  recommend int not null check (recommend between 0 and 10),
  best text,
  improve text,
  testimonial text,
  consent boolean not null default false,
  at timestamptz not null default now()
);
alter table exit_surveys enable row level security;

create or replace function private.outcome_json(o learn_outcomes) returns jsonb
language sql immutable as $$
  select case when o.application_id is null then null else jsonb_build_object('status', o.status, 'company', o.company, 'role', o.role,
    'start_date', o.start_date, 'via', o.via, 'at', o.updated_at) end
$$;

-- Student
create or replace function public.grad_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; p programmes; o learn_outcomes;
begin
  a := private.require_student();
  select * into c from cohorts where id = a.cohort_id;
  select * into p from programmes where code = c.programme_code;
  select * into o from learn_outcomes where application_id = a.id;
  return jsonb_build_object(
    'end_date', c.start_date + coalesce(p.weeks, 17) * 7 - 3,
    'outcome', private.outcome_json(o),
    'checkins', coalesce((select jsonb_object_agg(k.day, jsonb_build_object('status', k.status, 'note', k.note, 'at', k.at)) from alumni_checkins k where k.application_id = a.id), '{}'::jsonb),
    'survey', (select jsonb_build_object('recommend', s.recommend, 'consent', s.consent, 'at', s.at) from exit_surveys s where s.application_id = a.id),
    'eval', exists (select 1 from learn_evals e where e.application_id = a.id));
end $$;

create or replace function public.grad_outcome(p_status text, p_company text, p_role text, p_start date, p_via text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if p_status not in ('hired','internship','freelance','study','searching') then raise exception 'Choose what you''re doing now.' using errcode = 'P0001'; end if;
  if p_status in ('hired','internship','freelance') and (coalesce(trim(p_company), '') = '' or coalesce(trim(p_role), '') = '') then
    raise exception 'Add the company and your role.' using errcode = 'P0001';
  end if;
  insert into learn_outcomes(application_id, status, company, role, start_date, via)
  values (a.id, p_status, nullif(trim(coalesce(p_company, '')), ''), nullif(trim(coalesce(p_role, '')), ''), p_start, nullif(p_via, ''))
  on conflict (application_id) do update set status = excluded.status, company = excluded.company, role = excluded.role,
    start_date = excluded.start_date, via = excluded.via, updated_at = now();
  insert into learn_history(application_id, key, action) values (a.id, 'outcome', case when p_status = 'searching' then 'Still searching' else 'Reported: ' || p_status end);
  return public.grad_state();
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
  if private.today() < ends + p_day - 7 and private.setting('unlock_weeks', 'off') <> 'on' then
    raise exception 'This check-in opens on %.', to_char(ends + p_day - 7, 'FMDD Mon YYYY') using errcode = 'P0001';
  end if;
  if p_status not in ('hired','internship','freelance','study','searching') then raise exception 'Choose what you''re doing now.' using errcode = 'P0001'; end if;
  insert into alumni_checkins(application_id, day, status, note) values (a.id, p_day, p_status, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (application_id, day) do update set status = excluded.status, note = excluded.note, at = now();
  return public.grad_state();
end $$;

create or replace function public.grad_survey(p_recommend int, p_best text, p_improve text, p_testimonial text, p_consent boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if p_recommend is null or p_recommend < 0 or p_recommend > 10 then raise exception 'Choose a number from 0 to 10.' using errcode = 'P0001'; end if;
  insert into exit_surveys(application_id, recommend, best, improve, testimonial, consent)
  values (a.id, p_recommend, nullif(trim(coalesce(p_best, '')), ''), nullif(trim(coalesce(p_improve, '')), ''), nullif(trim(coalesce(p_testimonial, '')), ''), coalesce(p_consent, false))
  on conflict (application_id) do update set recommend = excluded.recommend, best = excluded.best, improve = excluded.improve,
    testimonial = excluded.testimonial, consent = excluded.consent, at = now();
  return public.grad_state();
end $$;

-- Staff
create or replace function public.acad_outcomes() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['coach','director','cohort_manager','academy_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'phone', a.phone,
      'track', (select name from tracks where code = a.track_code), 'cert', a.cert_id,
      'outcome', private.outcome_json(o),
      'checkins', coalesce((select jsonb_object_agg(k.day, jsonb_build_object('status', k.status, 'note', k.note, 'at', k.at)) from alumni_checkins k where k.application_id = a.id), '{}'::jsonb),
      'survey', (select jsonb_build_object('recommend', v.recommend, 'best', v.best, 'improve', v.improve, 'testimonial', v.testimonial, 'consent', v.consent, 'at', v.at) from exit_surveys v where v.application_id = a.id))
      order by a.surname)
    from applications a left join learn_outcomes o on o.application_id = a.id
    where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb);
end $$;

revoke execute on function private.outcome_json(learn_outcomes) from public;
revoke execute on function public.grad_state(), public.grad_outcome(text, text, text, date, text), public.grad_checkin(int, text, text),
  public.grad_survey(int, text, text, text, boolean), public.acad_outcomes() from public, anon;
grant execute on function public.grad_state(), public.grad_outcome(text, text, text, date, text), public.grad_checkin(int, text, text),
  public.grad_survey(int, text, text, text, boolean), public.acad_outcomes() to authenticated;


-- Student: tell us the programme is complete (once). Checks every required step, then sends the email.
create or replace function public.grad_complete() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; n int;
begin
  a := private.require_student();
  if exists (select 1 from learn_history where application_id = a.id and key = 'complete') then return jsonb_build_object('sent', false); end if;
  select count(*) into n from course_items i
  where i.track_code = a.track_code and not i.opt
    and not exists (select 1 from learn_progress x where x.application_id = a.id and x.key = i.key and x.status in ('done','graded'));
  if n > 0 then return jsonb_build_object('sent', false, 'left', n); end if;
  insert into learn_history(application_id, key, action) values (a.id, 'complete', 'Completed the programme');
  perform private.queue_mail(a, 'complete', '{}'::jsonb, private.site() || '/learn/graduate');
  return jsonb_build_object('sent', true);
end $$;

insert into email_templates(key, subject, body, cta) values
  ('complete', 'You''ve completed Jobnest Academy, {first}! 🎓',
   E'Hi {first},\n\nYou''ve finished all 17 weeks of the {track} track. That took real commitment, and we''re proud of you.\n\nYour certificate: we check your final steps and issue it in the portal. We''ll email you when it''s ready to download and add to LinkedIn.\n\nThree things to do next on your Graduation page:\n\n1. Tell us where you are now. Got a job, an internship or freelance work? We want to celebrate you.\n2. Take the 3-minute exit survey so we can make the next cohort even better.\n3. Keep your job search going. Your applications board and CV builder stay open.\n\nWe''ll check in at 30, 60 and 90 days. You''re part of the Jobnest family now.',
   'Go to my Graduation page')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

revoke execute on function public.grad_complete() from public, anon;
grant execute on function public.grad_complete() to authenticated;

notify pgrst, 'reload schema';
