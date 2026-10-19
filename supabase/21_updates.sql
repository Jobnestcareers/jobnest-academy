-- Updates 31–40: new application numbers, more readiness questions, overdue-fee lock, opportunities, career workspace,
-- profile photo, career chat, alerts for announcements and grades.

-- ---------- 36. application numbers: JNA-27-483920 (random, unique) ----------
create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c cohorts; a applications; r text; f text;
  req text[] := array['first_name','surname','email','phone','city','edu','nysc','situation','hours','laptop','internet','motivation'];
begin
  c := private.current_cohort();
  if c.id is null or not c.applications_open then
    raise exception 'Applications are closed right now.' using errcode = 'P0001';
  end if;
  foreach f in array req loop
    if coalesce(trim(p ->> f), '') = '' then
      raise exception 'Please complete: %', replace(f, '_', ' ') using errcode = 'P0001';
    end if;
  end loop;
  if (p ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Add a valid email address.' using errcode = 'P0001';
  end if;
  if length(trim(p ->> 'first_name')) > 80 or length(trim(p ->> 'motivation')) > 2000
     or length(coalesce(p ->> 'zuri_summary', '')) > 4000 then
    raise exception 'Some answers are too long.' using errcode = 'P0001';
  end if;
  if exists (select 1 from applications where cohort_id = c.id and lower(email) = lower(trim(p ->> 'email'))
             and status not in ('Assessment failed','Not selected','Offer expired','Closed: no matching track','Deferred')) then
    raise exception 'You already have an application for this cohort. Use “Check an application” to continue it.' using errcode = 'P0001';
  end if;
  loop
    r := 'JNA-' || c.year2 || '-' || lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when r !~ '-000000$' and not exists (select 1 from applications where ref = r);
  end loop;
  insert into applications(ref, cohort_id, first_name, surname, email, phone, city, edu, nysc, situation,
    hours, laptop, internet, motivation, zuri_summary)
  values (r, c.id, trim(p ->> 'first_name'), trim(p ->> 'surname'), lower(trim(p ->> 'email')), trim(p ->> 'phone'),
    trim(p ->> 'city'), p ->> 'edu', p ->> 'nysc', p ->> 'situation', p ->> 'hours', p ->> 'laptop',
    p ->> 'internet', trim(p ->> 'motivation'), nullif(trim(coalesce(p ->> 'zuri_summary', '')), ''))
  returning * into a;
  perform private.log(a.id, 'Applicant', case when a.zuri_summary is null then 'Application submitted (no Zuri summary)' else 'Application submitted with a Zuri summary' end);
  perform private.queue_email(a, 'received', '{}'::jsonb, 'assess');
  return jsonb_build_object('ref', a.ref, 'token', a.token);
end $$;

create or replace function public.applicant_continue(p_ref text, p_surname text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_sur text := lower(regexp_replace(coalesce(p_surname, ''), '[\s''’-]', '', 'g'));
  a applications;
begin
  if v_ref = '' or v_sur = '' then raise exception 'Enter your application number and surname.' using errcode = 'P0001'; end if;
  if v_ref ~ '^[0-9]{2}-[0-9]{6}$' then v_ref := 'JNA-' || v_ref;
  elsif v_ref ~ '^[0-9A-F]{6}$' then v_ref := 'APP-' || v_ref;
  end if;
  delete from continue_attempts where at < now() - interval '1 day';
  if (select count(*) from continue_attempts where ref = v_ref and at > now() - interval '15 minutes') >= 5 then
    raise exception 'Too many tries. Please wait 15 minutes and try again.' using errcode = 'P0001';
  end if;
  select * into a from applications
  where (ref = v_ref or (v_ref ~ '^[0-9]{6}$' and ref like 'JNA-__-' || v_ref)) and lower(regexp_replace(surname, '[\s''’-]', '', 'g')) = v_sur
  limit 1;
  if a.id is null then
    insert into continue_attempts(ref) values (v_ref);
    return null;
  end if;
  delete from continue_attempts where ref = v_ref;
  return jsonb_build_object('ref', a.ref, 'token', a.token);
end $$;

-- ---------- 37. more readiness questions (digital skills and communication) ----------
insert into readiness_bank(cat, concept, question, options)
select v.cat, v.concept, v.question, v.options from (values
  ($q$digital$q$, $q$Documents & formatting$q$, $q$You want a heading to look the same all through a long document. What should you use?$q$, $q$["Built-in heading styles", "Press space many times", "Type it in capital letters", "Change each heading by hand"]$q$::jsonb),
  ($q$digital$q$, $q$Documents & formatting$q$, $q$Which file type is best for sending a CV that must look the same on any device?$q$, $q$["PDF", "A photo of the screen", "A WhatsApp voice note", "A spreadsheet"]$q$::jsonb),
  ($q$digital$q$, $q$Documents & formatting$q$, $q$You need to check a word you keep misspelling in a 10-page document. What is fastest?$q$, $q$["Use Find (Ctrl + F)", "Read every page slowly", "Delete the document", "Print it out"]$q$::jsonb),
  ($q$digital$q$, $q$Accounts & passwords$q$, $q$Which password is the strongest?$q$, $q$["Lagos!Sun3t#Rain2027", "password123", "your date of birth", "12345678"]$q$::jsonb),
  ($q$digital$q$, $q$Accounts & passwords$q$, $q$A website offers two-step verification (a code sent to your phone). Should you turn it on?$q$, $q$["Yes, it makes your account much harder to break into", "No, it is only for banks", "Only if you forget your password", "No, it slows the internet"]$q$::jsonb),
  ($q$digital$q$, $q$Accounts & passwords$q$, $q$A colleague asks for your work password to "check something quickly". You should:$q$, $q$["Not share it, and offer to help them another way", "Send it on WhatsApp", "Write it on a sticky note for them", "Share it if they promise to delete it"]$q$::jsonb),
  ($q$digital$q$, $q$Folders & cloud storage$q$, $q$Where is the safest place to keep work files so you don't lose them?$q$, $q$["A cloud drive such as Google Drive or OneDrive", "Only on your phone", "Only on a flash drive", "In your email drafts"]$q$::jsonb),
  ($q$digital$q$, $q$Folders & cloud storage$q$, $q$A good way to organise files for three different clients is:$q$, $q$["One folder per client", "All files on the desktop", "One folder called Stuff", "Rename every file Final"]$q$::jsonb),
  ($q$digital$q$, $q$Folders & cloud storage$q$, $q$You deleted a file by mistake in Google Drive. What should you check first?$q$, $q$["The Bin (Trash)", "Your WhatsApp chats", "The printer", "Nothing, it is gone forever"]$q$::jsonb),
  ($q$digital$q$, $q$Browsers & the web$q$, $q$What does it usually mean when a website address starts with https:// and shows a padlock?$q$, $q$["The connection to the site is encrypted", "The website is free", "The website is a government site", "The website has no adverts"]$q$::jsonb),
  ($q$digital$q$, $q$Browsers & the web$q$, $q$You have 12 tabs open and need to find the tab with your email. What helps most?$q$, $q$["Keep only the tabs you need, or pin important ones", "Open more tabs", "Restart the computer every time", "Switch to a different browser"]$q$::jsonb),
  ($q$digital$q$, $q$Browsers & the web$q$, $q$Which search will find a Word template for a meeting agenda fastest?$q$, $q$["meeting agenda template docx", "help", "template", "how do I do things on a computer"]$q$::jsonb),
  ($q$digital$q$, $q$Calendars & productivity$q$, $q$You agree a call with a manager for Thursday at 10:00. What should you do straight away?$q$, $q$["Add it to your calendar with a reminder", "Try to remember it", "Write it on your hand", "Wait for them to remind you"]$q$::jsonb),
  ($q$digital$q$, $q$Calendars & productivity$q$, $q$Which tool is best for tracking several tasks with due dates?$q$, $q$["A task board such as Trello or a to-do app", "Your phone gallery", "A music app", "An unsaved note"]$q$::jsonb),
  ($q$digital$q$, $q$Calendars & productivity$q$, $q$A meeting invite shows 14:00 GMT. You are in Lagos (WAT, GMT+1). What time is it for you?$q$, $q$["15:00", "13:00", "14:00", "16:00"]$q$::jsonb),
  ($q$digital$q$, $q$File types$q$, $q$Which of these is an image file?$q$, $q$["photo.jpg", "report.docx", "budget.xlsx", "slides.pptx"]$q$::jsonb),
  ($q$digital$q$, $q$File types$q$, $q$A client asks for a "spreadsheet". Which file would you send?$q$, $q$["sales.xlsx", "sales.mp3", "sales.jpg", "sales.zip with nothing inside"]$q$::jsonb),
  ($q$digital$q$, $q$File types$q$, $q$What is a .zip file?$q$, $q$["A compressed folder that holds one or more files", "A virus", "A video", "A type of password"]$q$::jsonb),
  ($q$comms$q$, $q$Listening & asking questions$q$, $q$Your manager gives you a task but the deadline is unclear. You should:$q$, $q$["Ask politely when it is due", "Guess a date", "Wait until they ask for it", "Do it whenever you are free"]$q$::jsonb),
  ($q$comms$q$, $q$Listening & asking questions$q$, $q$During a meeting you didn't understand one instruction. What is best?$q$, $q$["Ask a short question to confirm", "Stay quiet and hope it is fine", "Ask a classmate weeks later", "Ignore that instruction"]$q$::jsonb),
  ($q$comms$q$, $q$Listening & asking questions$q$, $q$Which question is the most useful to ask before starting a task?$q$, $q$["What does a great result look like?", "Can I skip this task?", "Why me?", "Is this optional?"]$q$::jsonb),
  ($q$comms$q$, $q$Summarising$q$, $q$You must summarise a 30-minute meeting for your team. A good summary includes:$q$, $q$["Decisions made, actions, owners and deadlines", "Every word that was said", "Only who attended", "Your opinion of each person"]$q$::jsonb),
  ($q$comms$q$, $q$Summarising$q$, $q$Which is the clearest one-line update?$q$, $q$["The report is 80% done. I will send it by 3pm today.", "I am working on stuff.", "Report soon, hopefully.", "Things are going."]$q$::jsonb),
  ($q$comms$q$, $q$Summarising$q$, $q$When you send a long email, where should the main point go?$q$, $q$["At the start", "At the very end", "In an attachment only", "Nowhere, let them guess"]$q$::jsonb),
  ($q$comms$q$, $q$Deadlines & updates$q$, $q$You will miss a deadline because you are ill. What should you do?$q$, $q$["Tell your manager as early as you can and suggest a new time", "Say nothing and submit late", "Ask a friend to do it secretly", "Turn off your phone"]$q$::jsonb),
  ($q$comms$q$, $q$Deadlines & updates$q$, $q$A task is taking longer than planned. When should you share an update?$q$, $q$["As soon as you see it will be late", "After the deadline", "Never", "Only if asked twice"]$q$::jsonb),
  ($q$comms$q$, $q$Deadlines & updates$q$, $q$Which message best asks for more time?$q$, $q$["Could I have until Friday 12:00? The data arrived late and I want to check it properly.", "I need more time.", "I can't do it.", "Why is this due so soon?"]$q$::jsonb),
  ($q$comms$q$, $q$Teamwork$q$, $q$A teammate is stuck on a part you know well. The best response is:$q$, $q$["Offer to help or share how you did it", "Ignore them", "Tell the manager they are slow", "Do their whole task without asking"]$q$::jsonb),
  ($q$comms$q$, $q$Teamwork$q$, $q$You disagree with a teammate's idea in a meeting. What is most professional?$q$, $q$["Explain your view calmly and suggest an option", "Laugh at the idea", "Leave the meeting", "Complain about them later"]$q$::jsonb),
  ($q$comms$q$, $q$Teamwork$q$, $q$Your group finished a project. Who should be credited?$q$, $q$["Everyone who contributed", "Only you", "Only the leader", "Nobody"]$q$::jsonb),
  ($q$comms$q$, $q$Customer courtesy$q$, $q$A customer is upset about a late delivery. What should you say first?$q$, $q$["I'm sorry about the delay. Let me check what happened.", "That's not my fault.", "Calm down.", "Call back later."]$q$::jsonb),
  ($q$comms$q$, $q$Customer courtesy$q$, $q$Which greeting is best for a first email to a client you have never met?$q$, $q$["Dear Mrs Bello,", "Hey you,", "Yo!", "Sup Bello"]$q$::jsonb),
  ($q$comms$q$, $q$Customer courtesy$q$, $q$A customer asks something you don't know. You should say:$q$, $q$["Good question. Let me find out and get back to you by 2pm.", "I don't know.", "Google it.", "That's not my job."]$q$::jsonb),
  ($q$comms$q$, $q$Taking feedback$q$, $q$Your manager says your report has too many errors. The best response is:$q$, $q$["Thank them, ask which parts to fix and correct them", "Argue that it is fine", "Ignore the comment", "Blame the computer"]$q$::jsonb),
  ($q$comms$q$, $q$Taking feedback$q$, $q$After receiving feedback, what shows you took it seriously?$q$, $q$["Your next piece of work avoids the same mistakes", "Saying sorry many times", "Asking for a different manager", "Never mentioning it again"]$q$::jsonb),
  ($q$comms$q$, $q$Taking feedback$q$, $q$A colleague asks for feedback on their slides. Helpful feedback is:$q$, $q$["Specific and kind, with one or two clear suggestions", "It's bad.", "It's perfect, no notes.", "A long list of everything wrong"]$q$::jsonb)
) v(cat, concept, question, options)
where not exists (select 1 from readiness_bank b where b.question = v.question);

-- ---------- 38. overdue second instalment locks learning ----------
create or replace function private.fee_lock(a applications) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f jsonb;
begin
  if a.plan is distinct from 'two' then return null; end if;
  f := private.fees(a);
  if a.paid_total >= (f ->> 'plan_total')::int or (f ->> 'due_date')::date >= private.today() then return null; end if;
  return jsonb_build_object('balance', (f ->> 'plan_total')::int - a.paid_total, 'due_date', f ->> 'due_date', 'ref', a.ref, 'token', a.token);
end $$;

create or replace function private.seq_check(a applications, it course_items) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t text;
begin
  if private.fee_lock(a) is not null then
    raise exception 'Your second instalment is overdue. Pay the balance to continue learning.' using errcode = 'P0001';
  end if;
  t := private.seq_block(a, it);
  if t is not null then raise exception 'Finish “%” first.', t using errcode = 'P0001'; end if;
end $$;

create or replace function public.learn_fee_lock() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return private.fee_lock(a);
end $$;

-- ---------- 30. profile photo ----------
alter table applications add column if not exists photo text;
create or replace function public.profile_photo(p_data text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if p_data is not null and (p_data !~ '^data:image/(jpeg|png|webp).base64,' or length(p_data) > 200000) then
    raise exception 'Use a JPG or PNG photo.' using errcode = 'P0001';
  end if;
  update applications set photo = p_data where id = a.id;
  return jsonb_build_object('photo', p_data);
end $$;
create or replace function public.profile_get() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return jsonb_build_object('first_name', a.first_name, 'surname', a.surname, 'email', a.email, 'phone', a.phone, 'city', a.city,
    'linkedin', a.linkedin, 'bio', a.bio, 'email_reminders', a.email_reminders, 'photo', a.photo);
end $$;

-- ---------- 21 + 28. discussion channels: cohort and career ----------
alter table discussion_posts add column if not exists channel text not null default 'cohort';
create or replace function private.disc_json2(p_cohort bigint, p_staff boolean, p_me uuid, p_channel text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'author', t.author, 'staff', t.is_staff, 'mine', t.application_id = p_me, 'body', t.body, 'at', t.created_at,
      'pinned', t.pinned, 'hidden', t.hidden,
      'replies', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'author', r.author, 'staff', r.is_staff, 'mine', r.application_id = p_me, 'body', r.body, 'at', r.created_at, 'hidden', r.hidden) order by r.created_at)
        from discussion_posts r where r.parent_id = t.id and (p_staff or not r.hidden)), '[]'::jsonb))
    order by t.pinned desc, t.created_at desc), '[]'::jsonb)
  from (select * from discussion_posts where cohort_id = p_cohort and channel = p_channel and parent_id is null and (p_staff or not hidden) order by pinned desc, created_at desc limit 60) t
$$;
create or replace function public.disc_list2(p_channel text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return private.disc_json2(a.cohort_id, false, a.id, case when p_channel = 'career' then 'career' else 'cohort' end);
end $$;
create or replace function public.disc_post2(p_channel text, p_body text, p_parent bigint default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; ch text := case when p_channel = 'career' then 'career' else 'cohort' end;
begin
  a := private.require_student();
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first.' using errcode = 'P0001'; end if;
  if p_parent is not null and not exists (select 1 from discussion_posts where id = p_parent and cohort_id = a.cohort_id and parent_id is null and not hidden) then
    raise exception 'That post was not found.' using errcode = 'P0001';
  end if;
  if (select count(*) from discussion_posts where application_id = a.id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Slow down a little. Try again in a few minutes.' using errcode = 'P0001';
  end if;
  insert into discussion_posts(cohort_id, parent_id, application_id, author, body, channel)
  values (a.cohort_id, p_parent, a.id, a.first_name || ' ' || left(a.surname, 1) || '. · ' || coalesce((select name from tracks where code = a.track_code), ''), left(trim(p_body), 2000), ch);
  return private.disc_json2(a.cohort_id, false, a.id, ch);
end $$;
create or replace function public.acad_discussion2(p_channel text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff; c cohorts;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','facilitator','coach']);
  select * into c from cohorts where id = (select cohort_id from applications where status = 'Admitted' order by created_at desc limit 1);
  if c.id is null then return jsonb_build_object('cohort', null, 'posts', '[]'::jsonb); end if;
  return jsonb_build_object('cohort', c.name, 'posts', private.disc_json2(c.id, true, null, case when p_channel = 'career' then 'career' else 'cohort' end));
end $$;
create or replace function public.acad_disc_post2(p_channel text, p_body text, p_parent bigint default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; cid bigint; ch text := case when p_channel = 'career' then 'career' else 'cohort' end;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','facilitator','coach']);
  cid := (select cohort_id from applications where status = 'Admitted' order by created_at desc limit 1);
  if cid is null then raise exception 'There''s no active cohort yet.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first.' using errcode = 'P0001'; end if;
  insert into discussion_posts(cohort_id, parent_id, staff_email, author, is_staff, body, channel) values (cid, p_parent, s.email, s.full_name || ' · Jobnest', true, left(trim(p_body), 2000), ch);
  return public.acad_discussion2(ch);
end $$;

-- ---------- 26. opportunities (jobs, internships, events) ----------
create table if not exists opportunities (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('Job','Internship','Graduate programme','Freelance project','Work experience','Career event')),
  title text not null,
  org text not null,
  location text,
  deadline date,
  track_code text references tracks(code),
  description text,
  requirements text,
  skills text,
  link text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
alter table opportunities enable row level security;
alter table learn_drafts drop constraint if exists learn_drafts_key_check;
alter table learn_drafts add constraint learn_drafts_key_check check (key in ('cv','pitch','outreach','apps','prep','li','opps','career'));

create or replace function public.opps_list() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'title', o.title, 'org', o.org, 'location', o.location, 'deadline', o.deadline,
      'track', o.track_code, 'match', o.track_code = a.track_code, 'description', o.description, 'requirements', o.requirements, 'skills', o.skills, 'link', o.link)
      order by (o.track_code = a.track_code) desc nulls last, o.deadline nulls last)
    from opportunities o where o.active and (o.deadline is null or o.deadline >= private.today())), '[]'::jsonb);
end $$;
create or replace function public.acad_opps() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','coach']);
  return jsonb_build_object('opps', coalesce((select jsonb_agg(to_jsonb(o) order by o.active desc, o.deadline nulls last) from opportunities o), '[]'::jsonb),
    'tracks', (select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by name) from tracks));
end $$;
create or replace function public.acad_opp_save(p jsonb) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff; v bigint;
begin
  s := private.require_role(array['director','cohort_manager','academy_admin','coach']);
  if coalesce(trim(p ->> 'title'), '') = '' or coalesce(trim(p ->> 'org'), '') = '' then raise exception 'Add the title and the company.' using errcode = 'P0001'; end if;
  if (p ->> 'id') is null then
    insert into opportunities(kind, title, org, location, deadline, track_code, description, requirements, skills, link, active, created_by)
    values (p ->> 'kind', trim(p ->> 'title'), trim(p ->> 'org'), nullif(trim(p ->> 'location'), ''), nullif(p ->> 'deadline', '')::date, nullif(p ->> 'track', ''),
      nullif(trim(p ->> 'description'), ''), nullif(trim(p ->> 'requirements'), ''), nullif(trim(p ->> 'skills'), ''), private.clean_url(p ->> 'link'), coalesce((p ->> 'active')::boolean, true), s.full_name)
    returning id into v;
  else
    update opportunities set kind = p ->> 'kind', title = trim(p ->> 'title'), org = trim(p ->> 'org'), location = nullif(trim(p ->> 'location'), ''),
      deadline = nullif(p ->> 'deadline', '')::date, track_code = nullif(p ->> 'track', ''), description = nullif(trim(p ->> 'description'), ''),
      requirements = nullif(trim(p ->> 'requirements'), ''), skills = nullif(trim(p ->> 'skills'), ''), link = private.clean_url(p ->> 'link'), active = coalesce((p ->> 'active')::boolean, true)
    where id = (p ->> 'id')::bigint returning id into v;
  end if;
  return v;
end $$;

create or replace function public.learn_draft(p_key text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  if p_key not in ('cv','pitch','outreach','apps','prep','li','opps','career') then raise exception 'Unknown draft.' using errcode = 'P0001'; end if;
  if length(p_data::text) > 60000 then raise exception 'That is too long to save.' using errcode = 'P0001'; end if;
  insert into learn_drafts(application_id, key, data) values (a.id, p_key, p_data)
  on conflict (application_id, key) do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- a new live opportunity sends an alert to current students
create or replace function private.after_opportunity() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    insert into notices(application_id, kind, title, body, link)
    select a.id, 'opportunity', 'New opportunity: ' || new.title, new.org || coalesce(' · ' || new.location, ''), '/learn/opps' from applications a
    where a.status = 'Admitted' and a.matric is not null and (new.track_code is null or a.track_code = new.track_code)
      and a.cohort_id = (select cohort_id from applications where status = 'Admitted' order by created_at desc limit 1);
  end if;
  return new;
end $$;
drop trigger if exists opportunities_notify on opportunities;
create trigger opportunities_notify after insert or update on opportunities for each row execute function private.after_opportunity();

-- ---------- 24. alerts for announcements, grades and replies ----------
create or replace function private.after_announcement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notices(application_id, kind, title, body, link)
  select a.id, 'announcement', new.title, left(new.body, 300), '/learn/cohort' from applications a
  where a.cohort_id = new.cohort_id and a.status = 'Admitted' and a.matric is not null and (new.track_code is null or a.track_code = new.track_code);
  return new;
end $$;
drop trigger if exists announcements_notify on announcements;
create trigger announcements_notify after insert on announcements for each row execute function private.after_announcement();

create or replace function private.after_grade_notice() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare a applications; it course_items;
begin
  if new.status in ('graded','revise') and old.status is distinct from new.status and new.graded_by is not null then
    select * into a from applications where id = new.application_id;
    select * into it from course_items where track_code = a.track_code and key = new.key;
    if it.key is not null and it.type <> 'logweek' then
      insert into notices(application_id, kind, title, body, link) values (a.id, 'grade',
        case when new.status = 'graded' then format('Graded: %s (%s%%)', it.title, new.score) else 'Changes requested: ' || it.title end,
        left(coalesce(new.feedback, ''), 300), '/learn/assignments/' || it.key);
    elsif it.type = 'logweek' and new.status = 'revise' then
      insert into notices(application_id, kind, title, body, link) values (a.id, 'logbook', 'Your supervisor asked for changes: ' || it.title, left(coalesce(new.feedback, ''), 300), '/learn/learning/' || it.week || '/' || it.key);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists learn_grade_notice on learn_progress;
create trigger learn_grade_notice after update on learn_progress for each row execute function private.after_grade_notice();

create or replace function private.after_message_notice() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.from_staff then
    insert into notices(application_id, kind, title, body, link) values (new.application_id, 'message', 'New message from ' || coalesce(new.by_name, 'your supervisor'), left(new.body, 300), '/learn/learning/8');
  end if;
  return new;
end $$;
drop trigger if exists learn_message_notice on learn_messages;
create trigger learn_message_notice after insert on learn_messages for each row execute function private.after_message_notice();

-- ---------- 23. project supervisor = the track's facilitator ----------
create or replace function public.learn_supervisor() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a applications;
begin
  a := private.require_student();
  return (select jsonb_build_object('name', s.full_name) from staff s where s.active and s.role = 'facilitator' and s.track_code = a.track_code order by s.created_at limit 1);
end $$;

-- the older cohort functions now only show the cohort channel
create or replace function private.disc_json(p_cohort bigint, p_staff boolean, p_me uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select private.disc_json2(p_cohort, p_staff, p_me, 'cohort')
$$;

-- ---------- who may call what ----------
revoke execute on function private.fee_lock(applications), private.disc_json2(bigint, boolean, uuid, text), private.after_announcement(),
  private.after_grade_notice(), private.after_message_notice(), private.after_opportunity() from public;
revoke execute on function public.learn_fee_lock(), public.profile_photo(text), public.disc_list2(text), public.disc_post2(text, text, bigint),
  public.acad_discussion2(text), public.acad_disc_post2(text, text, bigint), public.opps_list(), public.acad_opps(), public.acad_opp_save(jsonb), public.learn_supervisor() from public, anon;
grant execute on function public.learn_fee_lock(), public.profile_photo(text), public.disc_list2(text), public.disc_post2(text, text, bigint),
  public.acad_discussion2(text), public.acad_disc_post2(text, text, bigint), public.opps_list(), public.acad_opps(), public.acad_opp_save(jsonb), public.learn_supervisor() to authenticated;
grant execute on function public.profile_get() to authenticated;

notify pgrst, 'reload schema';
select 'Updates 31–40 installed' as done;
