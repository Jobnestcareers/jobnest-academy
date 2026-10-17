-- Certificates of completion.
-- Staff issue a certificate to a student who has finished. Each one gets a code (JNA-27-XXXXXX)
-- that anyone can check at academy.jobnestcareers.com/#/verify/<code>.

alter table applications add column if not exists cert_id text unique;
alter table applications add column if not exists completed_on date;

-- The Programme Director signs certificates and admission letters.
insert into app_settings(key, value) values ('signer_name', 'Shekemi Odeyemi'), ('signer_title', 'Programme Director')
on conflict (key) do update set value = excluded.value;

create or replace function private.new_cert_id(c cohorts) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v text; abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v := 'JNA-' || coalesce(c.year2, to_char(now(), 'YY')) || '-' ||
      (select string_agg(substr(abc, 1 + floor(random() * length(abc))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from applications where cert_id = v);
  end loop;
  return v;
end $$;

-- Staff: issue (or re-date) a certificate. Programme Director and Academy Admin; Super Admin too.
create or replace function public.acad_issue_certificate(p_app uuid, p_date date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; c cohorts;
begin
  s := private.require_role(array['director','academy_admin']);
  select * into a from applications where id = p_app;
  if a.id is null or a.status <> 'Admitted' or a.matric is null then
    raise exception 'Only admitted students can get a certificate.' using errcode = 'P0001';
  end if;
  select * into c from cohorts where id = a.cohort_id;
  update applications set completed_on = coalesce(p_date, current_date),
    cert_id = coalesce(cert_id, private.new_cert_id(c))
  where id = a.id returning * into a;
  insert into audit_log(actor, text) values (s.email, format('issued certificate %s to %s %s', a.cert_id, a.first_name, a.surname));
  perform private.queue_email(a, 'certificate', jsonb_build_object('cert', a.cert_id), 'certificate');
  return jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on);
end $$;

-- Staff: take a certificate back (issued by mistake). The code stops verifying.
create or replace function public.acad_revoke_certificate(p_app uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['director','academy_admin']);
  update applications set cert_id = null, completed_on = null where id = p_app returning * into a;
  insert into audit_log(actor, text) values (s.email, format('withdrew the certificate of %s %s', a.first_name, a.surname));
  return jsonb_build_object('ok', true);
end $$;

-- Staff: which students have certificates (merged into the Students list).
create or replace function public.acad_certificates() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','facilitator','coach','academy_admin','adm_admin']);
  return coalesce((select jsonb_object_agg(a.id, jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on))
    from applications a where a.cert_id is not null), '{}'::jsonb);
end $$;

-- Anyone: look up a certificate by its code (the certificate page and the verify page).
create or replace function public.certificate_view(p_cert text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('cert_id', a.cert_id, 'name', trim(a.first_name || ' ' || a.surname),
    'programme', p.name, 'weeks', p.weeks, 'track', (select name from tracks where code = a.track_code),
    'completed_on', a.completed_on, 'year', to_char(a.completed_on, 'YYYY'),
    'signer_name', private.setting('signer_name', ''), 'signer_title', private.setting('signer_title', 'Programme Director'))
  from applications a join cohorts c on c.id = a.cohort_id join programmes p on p.code = c.programme_code
  where a.cert_id = upper(trim(p_cert)) and a.status = 'Admitted'
$$;

-- Student portal: my certificate, if issued.
create or replace function public.student_certificate() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if a.cert_id is null then return null; end if;
  return jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on);
end $$;

-- Applicant page link from the certificate email.
create or replace function public.applicant_certificate(p_ref text, p_token uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  return a.cert_id;
end $$;

insert into email_templates(key, subject, body, cta) values
  ('certificate', 'Your Jobnest Academy certificate is ready',
   E'Hi {first},\n\nCongratulations on completing the {programme}! Your certificate of completion is ready.\n\nYou can download it as a PDF and add it to your CV and LinkedIn. Its code, {cert}, lets employers check it\'s genuine.',
   'View my certificate')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

revoke execute on function private.new_cert_id(cohorts) from public;
revoke execute on function public.acad_issue_certificate(uuid, date), public.acad_revoke_certificate(uuid),
  public.acad_certificates(), public.student_certificate() from public, anon;
grant execute on function public.acad_issue_certificate(uuid, date), public.acad_revoke_certificate(uuid),
  public.acad_certificates(), public.student_certificate() to authenticated;
revoke execute on function public.certificate_view(text), public.applicant_certificate(text, uuid) from public;
grant execute on function public.certificate_view(text), public.applicant_certificate(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

select 'Certificates installed' as done;
