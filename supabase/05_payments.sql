-- Jobnest Academy: payments, matric numbers and admission letters (run once in Supabase → SQL Editor)
-- Safe to run more than once.

-- ---------- tables ----------
alter table applications add column if not exists plan text check (plan in ('full','two'));
alter table applications add column if not exists paid_total int not null default 0;
alter table applications add column if not exists matric text unique;
alter table applications add column if not exists admitted_at timestamptz;
alter table applications add column if not exists reminded_at timestamptz;
alter table applications add column if not exists balance_reminded_at timestamptz;
alter table cohorts add column if not exists matric_next int not null default 1;

create table if not exists payments (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  reference text unique not null,          -- sent to Paystack, or MANUAL-… for payments recorded by staff
  part text not null check (part in ('full','part1','part2')),
  amount int not null,                     -- naira expected
  amount_paid int,                         -- naira actually received
  status text not null default 'pending' check (status in ('pending','success','failed','abandoned','reversed')),
  channel text,                            -- card, bank_transfer, ussd, manual …
  provider_id text,
  note text,
  recorded_by text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_app_idx on payments(application_id);
alter table payments enable row level security;

insert into app_settings(key, value) values ('signer_name', ''), ('signer_title', 'Programme Director')
on conflict (key) do nothing;

-- ---------- helpers ----------
-- Fees for an application: full fee, the 2-part total and each part, and when part 2 is due.
create or replace function private.fees(a applications) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'fee', p.fee,
    'two_total', private.inst_total(p),
    'part1', (ceil(private.inst_total(p) / 2.0 / 500) * 500)::int,
    'part2', private.inst_total(p) - (ceil(private.inst_total(p) / 2.0 / 500) * 500)::int,
    'due_date', c.start_date + (c.inst_due_week - 1) * 7 - 1,
    'plan_total', case a.plan when 'full' then p.fee when 'two' then private.inst_total(p) end)
  from cohorts c join programmes p on p.code = c.programme_code where c.id = a.cohort_id
$$;

-- Applies a successful payment: the first one admits and gives a matric number.
create or replace function private.apply_payment(y payments) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; c cohorts; f jsonb; n int; amt int := coalesce(y.amount_paid, y.amount); bal int;
begin
  select * into a from applications where id = y.application_id for update;
  select * into c from cohorts where id = a.cohort_id for update;
  if a.status in ('Offer sent','Offer expired') and y.part in ('full','part1') then
    update cohorts set matric_next = matric_next + 1 where id = c.id returning matric_next - 1 into n;
    update applications set status = 'Admitted', plan = case when y.part = 'full' then 'full' else 'two' end,
      paid_total = paid_total + amt, admitted_at = now(),
      matric = c.programme_code || '/' || c.year2 || c.batch || '/' || lpad(n::text, 3, '0')
      where id = a.id returning * into a;
    f := private.fees(a);
    bal := greatest(0, (f ->> 'plan_total')::int - a.paid_total);
    perform private.log(a.id, 'Payment', format('Paid %s (%s) · admitted · matric number %s', private.naira(amt),
      case when y.part = 'full' then 'in full' else 'first instalment' end, a.matric));
    perform private.queue_email(a, 'admitted', jsonb_build_object('amount', private.naira(amt), 'matric', a.matric,
      'start', to_char(c.start_date, 'FMDay FMDD FMMonth YYYY'),
      'balance_line', case when bal > 0 then format(E'\n\nYour second instalment of %s is due by %s. You can pay it from your application page.',
        private.naira(bal), to_char((f ->> 'due_date')::date, 'FMDay FMDD FMMonth YYYY')) else '' end), 'letter');
  elsif a.status = 'Admitted' and y.part = 'part2' then
    update applications set paid_total = paid_total + amt where id = a.id returning * into a;
    f := private.fees(a);
    bal := greatest(0, (f ->> 'plan_total')::int - a.paid_total);
    perform private.log(a.id, 'Payment', format('Paid %s · %s', private.naira(amt),
      case when bal = 0 then 'fees paid in full' else 'still owes ' || private.naira(bal) end));
    if bal = 0 then
      perform private.queue_email(a, 'paid_full', jsonb_build_object('amount', private.naira(amt), 'matric', a.matric), 'letter');
    end if;
  else
    -- Paid twice, or paid after declining: keep the money on record and flag it for a refund check.
    update applications set paid_total = paid_total + amt where id = a.id;
    perform private.log(a.id, 'Payment', format('Received %s while the application was "%s". Check it and refund if needed.', private.naira(amt), a.status));
    insert into audit_log(actor, text) values ('Payment', format('%s paid %s while "%s": check it and refund if needed', a.ref, private.naira(amt), a.status));
  end if;
end $$;

-- What an applicant is allowed to see about their own application (now with fees and payments).
create or replace function private.app_public(a applications) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ref', a.ref, 'first_name', a.first_name, 'surname', a.surname, 'email', a.email,
    'status', a.status, 'score', a.score, 'pass_mark', c.pass_mark,
    'track', (select name from tracks where code = a.track_code), 'wanted', a.wanted,
    'dc1_at', a.dc1_at, 'officer', (select full_name from staff where email = a.officer_email),
    'offer_deadline', a.offer_deadline, 'cohort', c.name, 'start_date', c.start_date,
    'has_zuri', a.zuri_summary is not null and a.zuri_summary <> '',
    'assessment_started', a.qset is not null,
    'created_at', a.created_at,
    'programme', p.name, 'weeks', p.weeks,
    'plan', a.plan, 'paid_total', a.paid_total, 'matric', a.matric, 'admitted_at', a.admitted_at,
    'fees', private.fees(a),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', coalesce(y.amount_paid, y.amount), 'part', y.part,
        'paid_at', y.paid_at, 'channel', y.channel) order by y.paid_at)
      from payments y where y.application_id = a.id and y.status = 'success'), '[]'::jsonb),
    'signer_name', case when a.status = 'Admitted' then private.setting('signer_name', '') end,
    'signer_title', case when a.status = 'Admitted' then private.setting('signer_title', 'Programme Director') end)
  from cohorts c join programmes p on p.code = c.programme_code where c.id = a.cohort_id
$$;

-- ---------- applicant ----------
create or replace function public.applicant_decline(p_ref text, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.applicant(p_ref, p_token);
  if a.status <> 'Offer sent' then raise exception 'There is no open offer to decline.'; end if;
  update applications set status = 'Offer declined' where id = a.id returning * into a;
  perform private.log(a.id, 'Applicant', 'Declined the offer');
  perform private.queue_email(a, 'declined', '{}'::jsonb, 'status');
  return private.app_public(a);
end $$;

-- ---------- server only (called by the Netlify payment functions with the secret key) ----------
create or replace function public.pay_prepare(p_ref text, p_token uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; f jsonb; v_part text; v_amt int; r text;
begin
  a := private.applicant(p_ref, p_token);
  f := private.fees(a);
  if a.status = 'Offer sent' then
    if a.offer_deadline < now() then
      raise exception 'Your offer deadline has passed. Reply to your offer email and Admissions will help.';
    end if;
    if p_plan = 'full' then v_part := 'full'; v_amt := (f ->> 'fee')::int;
    elsif p_plan = 'two' then v_part := 'part1'; v_amt := (f ->> 'part1')::int;
    else raise exception 'Choose how you want to pay.'; end if;
  elsif a.status = 'Admitted' and a.plan = 'two' and a.paid_total < (f ->> 'plan_total')::int then
    v_part := 'part2'; v_amt := (f ->> 'plan_total')::int - a.paid_total;
  else
    raise exception 'There is nothing to pay on this application right now.';
  end if;
  r := 'JN-' || substr(a.ref, 5) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into payments(application_id, reference, part, amount) values (a.id, r, v_part, v_amt);
  return jsonb_build_object('reference', r, 'amount', v_amt, 'email', a.email, 'part', v_part, 'ref', a.ref,
    'name', a.first_name || ' ' || a.surname);
end $$;

create or replace function public.pay_result(p_reference text, p_status text, p_amount_kobo bigint,
  p_channel text default null, p_provider_id text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare y payments; a applications; outcome text;
begin
  select * into y from payments where reference = p_reference for update;
  if y.id is null then raise exception 'Unknown payment reference.'; end if;
  select * into a from applications where id = y.application_id;
  if y.status = 'success' then
    outcome := 'success';                                   -- already recorded (webhook and return both arrive)
  elsif p_status = 'success' then
    if coalesce(p_amount_kobo, 0) < y.amount::bigint * 100 then
      update payments set status = 'failed', channel = p_channel, provider_id = p_provider_id,
        note = format('Received %s, expected %s', private.naira(p_amount_kobo / 100.0), private.naira(y.amount)) where id = y.id;
      insert into audit_log(actor, text) values ('Payment', format('%s: %s received less than expected on %s. Check it and refund.', a.ref, private.naira(p_amount_kobo / 100.0), y.reference));
      outcome := 'mismatch';
    else
      update payments set status = 'success', paid_at = now(), channel = p_channel, provider_id = p_provider_id,
        amount_paid = (p_amount_kobo / 100)::int where id = y.id returning * into y;
      perform private.apply_payment(y);
      outcome := 'success';
    end if;
  else
    update payments set status = case when p_status in ('failed','abandoned','reversed') then p_status else 'failed' end
      where id = y.id and status = 'pending';
    outcome := 'not_paid';
  end if;
  return jsonb_build_object('outcome', outcome, 'ref', a.ref, 'token', a.token);
end $$;

-- Runs every minute from the email service: expires unpaid offers and sends reminders.
create or replace function public.jobs_tick() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; f jsonb; ne int := 0; nr int := 0; nb int := 0; hrs numeric;
begin
  for a in select * from applications where status = 'Offer sent' and offer_deadline < now() for update skip locked loop
    -- don't expire someone who is paying right now
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
  return jsonb_build_object('expired', ne, 'reminded', nr, 'balance', nb);
end $$;

-- ---------- staff ----------
create or replace function public.adm_payments() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts;
begin
  perform private.require_role(array['adm_admin']);
  c := private.current_cohort();
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(private.app_staff(a) || jsonb_build_object('fees', private.fees(a))
        order by a.status, a.matric nulls last, a.offer_deadline)
      from applications a where a.cohort_id = c.id and a.status in ('Offer sent','Offer expired','Admitted')), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('at', y.created_at, 'paid_at', y.paid_at, 'reference', y.reference,
        'part', y.part, 'amount', y.amount, 'amount_paid', y.amount_paid, 'status', y.status, 'channel', y.channel, 'note', y.note,
        'recorded_by', y.recorded_by, 'name', a.first_name || ' ' || a.surname, 'app_ref', a.ref) order by y.created_at desc)
      from (select * from payments order by created_at desc limit 100) y join applications a on a.id = y.application_id), '[]'::jsonb));
end $$;

-- For money received outside Paystack, e.g. a direct bank transfer.
create or replace function public.admin_record_payment(p_id uuid, p_amount int, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications; f jsonb; v_part text; y payments;
begin
  s := private.require_role(array['adm_admin']);
  select * into a from applications where id = p_id;
  if a.id is null then raise exception 'Application not found.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount received.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note, e.g. the bank transfer reference.'; end if;
  f := private.fees(a);
  if a.status in ('Offer sent','Offer expired') then
    if p_amount >= (f ->> 'fee')::int then v_part := 'full';
    elsif p_amount >= (f ->> 'part1')::int then v_part := 'part1';
    else raise exception 'That is less than the first instalment (%).', private.naira((f ->> 'part1')::int); end if;
  elsif a.status = 'Admitted' and a.plan = 'two' and a.paid_total < (f ->> 'plan_total')::int then
    v_part := 'part2';
  else
    raise exception 'This application has nothing left to pay.';
  end if;
  insert into payments(application_id, reference, part, amount, amount_paid, status, channel, note, paid_at, recorded_by)
  values (a.id, 'MANUAL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_part, p_amount, p_amount,
    'success', 'manual', trim(p_note), now(), s.email)
  returning * into y;
  perform private.apply_payment(y);
  insert into audit_log(actor, text) values (s.email, format('recorded a %s payment for %s (%s)', private.naira(p_amount), a.ref, trim(p_note)));
  select * into a from applications where id = p_id;
  return private.app_staff(a);
end $$;

create or replace function public.admin_extend_offer(p_id uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; a applications;
begin
  s := private.require_role(array['adm_admin']);
  select * into a from applications where id = p_id for update;
  if a.id is null or a.status not in ('Offer sent','Offer expired') then raise exception 'Only open or expired offers can be extended.'; end if;
  if coalesce(p_days, 0) not between 1 and 30 then raise exception 'Choose between 1 and 30 days.'; end if;
  update applications set status = 'Offer sent', reminded_at = null,
    offer_deadline = greatest(now(), offer_deadline) + make_interval(days => p_days)
    where id = a.id returning * into a;
  perform private.log(a.id, s.full_name, format('Offer extended to %s', private.wat(a.offer_deadline, 'FMDay FMDD FMMonth')));
  perform private.queue_email(a, 'offer', jsonb_build_object('deadline', private.wat(a.offer_deadline, 'FMDay, FMDD FMMonth')), 'status');
  return private.app_staff(a);
end $$;

-- Settings now include who signs the admission letter.
create or replace function public.admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cohorts; p programmes;
begin
  perform private.require_role(array['adm_admin','academy_admin']);
  c := private.current_cohort();
  select * into p from programmes where code = c.programme_code;
  return jsonb_build_object('cohort', to_jsonb(c), 'programme', to_jsonb(p) || jsonb_build_object('inst_total', private.inst_total(p)),
    'tracks', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort, t.code) from tracks t where t.programme_code = c.programme_code), '[]'::jsonb),
    'site', jsonb_build_object('site_url', private.setting('site_url', ''), 'zuri_url', private.setting('zuri_url', ''),
      'website_url', private.setting('website_url', ''), 'signer_name', private.setting('signer_name', ''),
      'signer_title', private.setting('signer_title', 'Programme Director')));
end $$;

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

-- ---------- emails ----------
insert into email_templates(key, subject, body, cta) values
  ('admitted', 'Welcome to Jobnest Academy! Your matric number is {matric}',
   E'Hi {first},\n\nPayment received: {amount}. You are now admitted into the {track} track of the {programme}, {cohort}.\n\nYour matric number is {matric}. Your admission letter is ready: open it with the button below, then save or print it.{balance_line}\n\nThe programme starts on {start}. We''ll email your student portal sign-in before then.',
   'View your admission letter'),
  ('paid_full', 'Payment received: your fees are fully paid',
   E'Hi {first},\n\nPayment received: {amount}. Your fees for the {programme} are now paid in full. Thank you!\n\nYour matric number is {matric}. Your admission letter now shows your fees as fully paid.',
   'View your admission letter'),
  ('balance_due', 'Your second instalment is due by {due}',
   E'Hi {first},\n\nA reminder that the second instalment of your fees, {balance}, is due by {due}.\n\nYou can pay it from your application page with the button below.',
   'Pay the second instalment'),
  ('reminder', 'Reminder: your offer expires in {days}',
   E'Hi {first},\n\nJust a reminder that your offer for the {track} track expires on {deadline}.\n\nYou can pay in full, or pay the first of 2 instalments now. After the deadline, the seat goes to the waitlist.',
   'Accept and pay')
on conflict (key) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

-- ---------- who may call what ----------
-- Supabase lets anyone call new functions by default, so lock these down by name.
revoke execute on function public.pay_prepare(text, uuid, text), public.pay_result(text, text, bigint, text, text),
  public.jobs_tick() from public, anon, authenticated;
grant execute on function public.pay_prepare(text, uuid, text), public.pay_result(text, text, bigint, text, text),
  public.jobs_tick() to service_role;
revoke execute on function public.applicant_decline(text, uuid) from public;
grant execute on function public.applicant_decline(text, uuid) to anon, authenticated;
revoke execute on function public.adm_payments(), public.admin_record_payment(uuid, int, text),
  public.admin_extend_offer(uuid, int) from public, anon;
grant execute on function public.adm_payments(), public.admin_record_payment(uuid, int, text),
  public.admin_extend_offer(uuid, int) to authenticated;
revoke execute on function private.fees(applications), private.apply_payment(payments) from public;
