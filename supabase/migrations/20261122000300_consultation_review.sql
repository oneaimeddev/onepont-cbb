create function public.consultation_submit(
  target uuid, capture_id uuid, request_id uuid, record_id uuid, expected_version integer,
  entry_title text, entry_body text, restricted boolean, intent text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  capture clinical.consultation_sessions;
  saved jsonb;
begin
  select s.* into capture from clinical.consultation_sessions s
  join clinical.athletes t on t.id = s.athlete_id and t.source = 'demo'
  where s.id = capture_id and s.athlete_id = target and s.professional_id = actor
    and s.specialty = clinical.consultation_specialty(actor) and s.processing_state = 'ready'
    and s.capture_state = 'complete'
  for update of s;
  if not found then return '{"error":"denied"}'; end if;

  if capture.evolution_id is not null and capture.evolution_id is distinct from record_id
    and not exists (
      select 1 from clinical.audit_events e
      where e.actor_user_id = actor and e.operation = 'clinical_record.traditional_submitted'
        and e.resource_id = capture.evolution_id and e.safe_metadata->>'submission_id' = consultation_submit.request_id::text
    ) then return '{"error":"conflict"}'; end if;
  if capture.evolution_id is null and (record_id is not null or exists (
    select 1 from clinical.audit_events e
    where e.actor_user_id = actor and e.operation = 'clinical_record.traditional_submitted'
      and e.safe_metadata->>'submission_id' = consultation_submit.request_id::text
  )) then return '{"error":"conflict"}'; end if;

  saved := public.evolution_submit(target, request_id, record_id, expected_version,
    entry_title, entry_body, restricted or capture.specialty = 'Psicologia', intent);
  if saved ? 'error' then return saved; end if;

  update clinical.consultation_sessions set evolution_id = (saved->>'id')::uuid where id = capture_id;
  if saved->>'replayed' = 'false' then
    perform pg_catalog.set_config('cbb.origin_channel','ai_voice',true);
    perform pg_catalog.set_config('cbb.execution_method','human_ui',true);
    insert into clinical.audit_events(
      actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, approved_by_user_id, safe_metadata
    ) values (
      actor, 'clinical_record', (saved->>'id')::uuid, target, 'clinical_record.consultation_submitted', 'success',
      case when intent = 'finalize' then actor end,
      jsonb_build_object('capture_id', capture_id, 'intent', intent)
    );
  end if;
  return saved;
end;
$$;
revoke all on function public.consultation_submit(uuid,uuid,uuid,uuid,integer,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.consultation_submit(uuid,uuid,uuid,uuid,integer,text,text,boolean,text)
  to authenticated;

notify pgrst, 'reload schema';
