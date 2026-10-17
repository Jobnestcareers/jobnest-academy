-- Continue an application with the application number and surname.
-- After 5 wrong tries on one application number, it is blocked for 15 minutes.

create table if not exists continue_attempts (
  id bigint generated always as identity primary key,
  ref text not null,
  at timestamptz not null default now()
);
create index if not exists continue_attempts_ref_at on continue_attempts(ref, at);
alter table continue_attempts enable row level security;

create or replace function public.applicant_continue(p_ref text, p_surname text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_sur text := lower(regexp_replace(coalesce(p_surname, ''), '[\s''’-]', '', 'g'));
  a applications;
begin
  if v_ref = '' or v_sur = '' then raise exception 'Enter your application number and surname.' using errcode = 'P0001'; end if;
  if v_ref !~ '^APP-' then v_ref := 'APP-' || v_ref; end if;
  delete from continue_attempts where at < now() - interval '1 day';
  if (select count(*) from continue_attempts where ref = v_ref and at > now() - interval '15 minutes') >= 5 then
    raise exception 'Too many tries. Please wait 15 minutes and try again.' using errcode = 'P0001';
  end if;
  select * into a from applications
  where ref = v_ref and lower(regexp_replace(surname, '[\s''’-]', '', 'g')) = v_sur;
  if a.id is null then
    insert into continue_attempts(ref) values (v_ref);
    return null;
  end if;
  delete from continue_attempts where ref = v_ref;
  return jsonb_build_object('ref', a.ref, 'token', a.token);
end $$;

-- The old lookup by reference and email is replaced by the one above.
drop function if exists public.applicant_find(text, text);

revoke execute on function public.applicant_continue(text, text) from public;
grant execute on function public.applicant_continue(text, text) to anon, authenticated;

-- The first email explains what the application number is for.
update email_templates set body = replace(body, 'Your application reference is {ref}.', 'Your application number is {ref}. Keep it safe: you''ll need it with your surname to come back to your application.') where key = 'received';

notify pgrst, 'reload schema';

select 'Continue with application number and surname installed' as done;
