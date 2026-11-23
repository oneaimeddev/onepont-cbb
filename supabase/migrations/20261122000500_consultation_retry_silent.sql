create function public.consultation_retry_silent(actor uuid, target uuid, capture_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from clinical.consultation_sessions s
  join clinical.athletes t on t.id = s.athlete_id and t.source = 'demo'
  join clinical.athlete_access a on a.athlete_id = t.id and a.professional_id = actor
  where s.id = capture_id and t.id = target and s.professional_id = actor
    and s.specialty = clinical.consultation_specialty(actor) and a.can_write and a.can_read_records
    and s.processing_state = 'failed' and s.audio_expires_at > now()
    and btrim(replace(s.transcript, '[sem fala]', ''), E' \r\n\t') = ''
  for update of s;
  if not found then return false; end if;
  update clinical.consultation_segments set transcript = null where session_id = capture_id;
  update clinical.consultation_sessions set transcript = null, processing_state = 'pending', processing_error = null
  where id = capture_id;
  return true;
end;
$$;
revoke all on function public.consultation_retry_silent(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.consultation_retry_silent(uuid,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
