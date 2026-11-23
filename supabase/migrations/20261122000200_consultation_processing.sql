alter table clinical.consultation_sessions
  add column processing_token uuid,
  add column processing_until timestamptz;

create function public.consultation_work(
  actor uuid, target uuid, capture_id uuid, action text,
  token uuid default null, segment_ids integer[] default null, output_text text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  capture clinical.consultation_sessions;
  batch jsonb;
  remaining integer;
begin
  select s.* into capture from clinical.consultation_sessions s
  join clinical.athletes t on t.id = s.athlete_id and t.source = 'demo'
  join clinical.athlete_access a on a.athlete_id = t.id and a.professional_id = actor
  where s.id = capture_id and s.athlete_id = target and s.professional_id = actor
    and s.specialty = clinical.consultation_specialty(actor) and a.can_write and a.can_read_records
  for update of s;
  if not found then return '{"error":"denied"}'; end if;

  if action = 'status' then
    return jsonb_build_object('state', capture.processing_state, 'transcript', capture.transcript,
      'body', capture.generated_body, 'specialty', capture.specialty, 'errorCode', capture.processing_error);
  end if;

  if capture.capture_state <> 'complete' then return '{"error":"incomplete"}'; end if;

  if action = 'claim' then
    if capture.processing_state = 'ready' then
      return jsonb_build_object('state', 'ready', 'body', capture.generated_body,
        'transcript', capture.transcript, 'specialty', capture.specialty);
    end if;
    if capture.processing_until > now() then return '{"state":"busy"}'; end if;

    select coalesce(jsonb_agg(jsonb_build_object('sequence', d.sequence, 'hash', d.sha256) order by d.sequence), '[]')
    into batch from (
      select sequence, sha256 from clinical.consultation_segments
      where session_id = capture_id and transcript is null order by sequence limit 12
    ) d;
    if batch <> '[]' and capture.audio_expires_at <= now() then return '{"error":"expired"}'; end if;

    if batch = '[]' then
      select string_agg(transcript, E'\n\n' order by sequence) into capture.transcript
      from clinical.consultation_segments where session_id = capture_id and transcript <> '';
    end if;

    update clinical.consultation_sessions
    set processing_token = gen_random_uuid(), processing_until = now() + interval '70 seconds',
      processing_state = case when batch = '[]' then 'generating' else 'transcribing' end,
      processing_attempts = processing_attempts + 1, processing_error = null, transcript = capture.transcript
    where id = capture_id returning * into capture;
    return jsonb_build_object('state', capture.processing_state, 'token', capture.processing_token,
      'batch', batch, 'transcript', capture.transcript, 'specialty', capture.specialty, 'occurredAt', capture.created_at);
  end if;

  if action = 'regenerate' and capture.processing_state = 'ready' and capture.evolution_id is null then
    update clinical.consultation_sessions set generated_body = null, processing_state = 'pending' where id = capture_id;
    return '{"state":"pending"}';
  end if;

  if token is null or capture.processing_token is distinct from token or capture.processing_until <= now() then
    return '{"error":"conflict"}';
  end if;

  if action = 'transcribed' and capture.processing_state = 'transcribing' then
    if output_text is null or length(trim(output_text)) = 0 or length(output_text) > 40000
      or cardinality(segment_ids) not between 1 and 12 then return '{"error":"invalid"}'; end if;
    update clinical.consultation_segments
      set transcript = case when sequence = segment_ids[1] then output_text else '' end
      where session_id = capture_id and sequence = any(segment_ids) and transcript is null;
    select count(*) into remaining from clinical.consultation_segments
    where session_id = capture_id and transcript is null;
    update clinical.consultation_sessions set processing_token = null, processing_until = null
    where id = capture_id;
    return jsonb_build_object('state', 'transcribing', 'remaining', remaining);
  end if;

  if action = 'generated' and capture.processing_state = 'generating' then
    if output_text is null or length(trim(output_text)) = 0 or length(output_text) > 20000 then
      return '{"error":"invalid"}';
    end if;
    update clinical.consultation_sessions set generated_body = output_text, processing_state = 'ready',
      processing_token = null, processing_until = null where id = capture_id;
    return jsonb_build_object('state', 'ready', 'body', output_text, 'transcript', capture.transcript,
      'specialty', capture.specialty);
  end if;

  if action = 'failed' then
    update clinical.consultation_sessions set processing_state = 'failed', processing_token = null,
      processing_until = null, processing_error = 'provider_or_storage' where id = capture_id;
    return '{"state":"failed"}';
  end if;

  return '{"error":"invalid"}';
end;
$$;
revoke all on function public.consultation_work(uuid,uuid,uuid,text,uuid,integer[],text)
  from public, anon, authenticated;
grant execute on function public.consultation_work(uuid,uuid,uuid,text,uuid,integer[],text) to service_role;

notify pgrst, 'reload schema';
