-- Jobnest Academy: automatic email sending (run once in Supabase → SQL Editor)
alter table outbox add column if not exists attempts int not null default 0;
create index if not exists outbox_unsent_idx on outbox(created_at) where sent_at is null;

create or replace function public.admin_outbox() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['adm_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'to', o.to_email, 'subject', o.subject, 'body', o.body,
      'link', o.link, 'cta', o.cta, 'at', o.created_at, 'sent_at', o.sent_at, 'error', o.error, 'attempts', o.attempts) order by o.created_at desc)
    from (select * from outbox order by created_at desc limit 200) o), '[]'::jsonb);
end $$;

-- Lets the Admin retry an email that failed to send.
create or replace function public.admin_retry_email(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role(array['adm_admin']);
  update outbox set attempts = 0, error = null where id = p_id and sent_at is null;
end $$;
revoke execute on function public.admin_retry_email(bigint) from public;
grant execute on function public.admin_retry_email(bigint) to authenticated;
