-- Certificate codes now come from the matric number: GEP/27A/001 -> JNA-GEP27A-001.
create or replace function private.cert_from_matric(m text) returns text
language sql immutable as $$
  select case when m is null then null else
    'JNA-' || upper(split_part(m, '/', 1) || split_part(m, '/', 2)) || '-' || upper(split_part(m, '/', 3)) end
$$;

-- Accepts JNA-GEP27A-001, GEP27A-001, GEP/27A/001 (any case, spaces ignored).
create or replace function private.cert_norm(p text) returns text
language sql immutable as $$
  select case
    when v ~ '^[A-Z]+/[0-9A-Z]+/[0-9]+$' then private.cert_from_matric(v)
    when v ~ '^JNA-' then v
    else 'JNA-' || v end
  from (select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')) v) q
$$;

create or replace function public.acad_issue_certificate(p_app uuid, p_date date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['director','academy_admin']);
  select * into a from applications where id = p_app;
  if a.id is null or a.status <> 'Admitted' or a.matric is null then
    raise exception 'Only admitted students can get a certificate.' using errcode = 'P0001';
  end if;
  update applications set completed_on = coalesce(p_date, current_date), cert_id = private.cert_from_matric(a.matric)
  where id = a.id returning * into a;
  insert into audit_log(actor, text) values (s.email, format('issued certificate %s to %s %s', a.cert_id, a.first_name, a.surname));
  perform private.queue_email(a, 'certificate', jsonb_build_object('cert', a.cert_id), 'certificate');
  return jsonb_build_object('cert_id', a.cert_id, 'completed_on', a.completed_on);
end $$;

create or replace function public.certificate_view(p_cert text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('cert_id', a.cert_id, 'name', trim(a.first_name || ' ' || a.surname),
    'programme', p.name, 'weeks', p.weeks, 'track', (select name from tracks where code = a.track_code),
    'completed_on', a.completed_on, 'year', to_char(a.completed_on, 'YYYY'),
    'signer_name', private.setting('signer_name', ''), 'signer_title', private.setting('signer_title', 'Programme Director'))
  from applications a join cohorts c on c.id = a.cohort_id join programmes p on p.code = c.programme_code
  where a.cert_id = private.cert_norm(p_cert) and a.status = 'Admitted'
$$;

-- Certificates already issued switch to the new code.
update applications set cert_id = private.cert_from_matric(matric) where cert_id is not null and matric is not null;

revoke execute on function private.cert_from_matric(text), private.cert_norm(text) from public;
grant execute on function public.certificate_view(text) to anon, authenticated;

notify pgrst, 'reload schema';
select 'Certificate codes now use the matric number' as done;
