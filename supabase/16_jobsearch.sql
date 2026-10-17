-- Staff view of each student's job search: Weeks 14–17 links, pitch, outreach and applications.
create or replace function public.acad_jobsearch() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s staff;
begin
  s := private.require_role(array['coach','director','cohort_manager','academy_admin']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'app', a.id, 'name', a.first_name || ' ' || a.surname, 'matric', a.matric, 'phone', a.phone,
      'track', (select name from tracks where code = a.track_code),
      'links', coalesce((select jsonb_object_agg(i.title, x.link) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key
        where x.application_id = a.id and x.link is not null and i.week >= 14), '{}'::jsonb),
      'done', coalesce((select jsonb_agg(i.title) from learn_progress x join course_items i on i.track_code = a.track_code and i.key = x.key
        where x.application_id = a.id and i.week >= 14 and x.status <> 'revise'), '[]'::jsonb),
      'pitch', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'pitch'),
      'outreach', coalesce((select d.data from learn_drafts d where d.application_id = a.id and d.key = 'outreach'), '[]'::jsonb),
      'apps', coalesce((select d.data from learn_drafts d where d.application_id = a.id and d.key = 'apps'), '[]'::jsonb),
      'cv', (select d.data from learn_drafts d where d.application_id = a.id and d.key = 'cv'),
      'score', (select r.score from call_results r where r.application_id = a.id),
      'updated', (select max(d.updated_at) from learn_drafts d where d.application_id = a.id and d.key in ('pitch','outreach','apps')))
      order by a.surname)
    from applications a where a.status = 'Admitted' and a.matric is not null and private.track_ok(s, a.track_code)), '[]'::jsonb);
end $$;

revoke execute on function public.acad_jobsearch() from public, anon;
grant execute on function public.acad_jobsearch() to authenticated;

notify pgrst, 'reload schema';
