alter table clinical.consultation_sessions add column discarded_at timestamptz;

create function public.consultation_discard(actor uuid, target uuid, capture_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  capture clinical.consultation_sessions;
  paths jsonb;
begin
  select s.* into capture from clinical.consultation_sessions s
  join clinical.athletes t on t.id = s.athlete_id and t.source = 'demo'
  join clinical.athlete_access a on a.athlete_id = t.id and a.professional_id = actor
  where s.id = capture_id and s.athlete_id = target and s.professional_id = actor
    and s.specialty = clinical.consultation_specialty(actor) and a.can_read_records and a.can_write
  for update of s;
  if not found then return '{"error":"denied"}'; end if;
  if capture.evolution_id is not null then return '{"error":"linked_evolution"}'; end if;

  if capture.discarded_at is null then
    update clinical.consultation_sessions set discarded_at = now(), capture_state = 'partial',
      audio_expires_at = now(), expected_segments = null, transcript = null, generated_body = null,
      processing_state = 'pending', processing_token = null, processing_until = null, processing_error = null
    where id = capture_id;
    delete from clinical.consultation_segments where session_id = capture_id;
  end if;

  select coalesce(jsonb_agg(objects.name), '[]') into paths from (
    select o.name from storage.objects o where o.bucket_id = 'consultation-audio'
      and split_part(o.name, '/', 1) = capture_id::text
    order by o.name limit 100
  ) objects;
  return jsonb_build_object('state', 'discarded', 'paths', paths);
end;
$$;
revoke all on function public.consultation_discard(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.consultation_discard(uuid,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
