-- Finalizing an assisted draft is a separate human confirmation.
-- The agent has no tool that calls this function.

create or replace function clinical.conversation_draft(value jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  request_key text;
  athlete_key text;
  record_key text;
  athlete_name text;
  professional_name text;
  entry_title text;
  occurred text;
  href text;
  draft_state text;
  expected_status text;
begin
  if jsonb_typeof(value) is distinct from 'object' then return null; end if;
  draft_state := value->>'state';
  if draft_state not in ('saved', 'finalized') then return null; end if;
  request_key := value->>'requestId';
  athlete_key := value->>'athleteId';
  record_key := value->>'recordId';
  if request_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if athlete_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if record_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  athlete_name := left(btrim(coalesce(value->>'athleteName', '')), 160);
  professional_name := left(btrim(coalesce(value->>'professionalName', '')), 160);
  entry_title := left(btrim(coalesce(value->>'title', '')), 160);
  if athlete_name = '' or professional_name = '' or entry_title = '' then return null; end if;
  if jsonb_typeof(value->'restricted') is distinct from 'boolean' then return null; end if;
  occurred := nullif(value->>'occurredOn', '');
  if occurred is not null and occurred !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  if occurred is not null then
    begin
      perform occurred::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        return null;
    end;
  end if;
  href := '/atletas/' || athlete_key || '/evolucao?registro=' || record_key;
  if value->>'href' is not null and value->>'href' is distinct from href then return null; end if;
  expected_status := case when draft_state = 'finalized' then 'finalized' else 'draft' end;
  if not exists (
    select 1 from clinical.records record
    where record.id = record_key::uuid
      and record.athlete_id = athlete_key::uuid
      and record.author_id = auth.uid()
      and record.status = expected_status
  ) then return null; end if;
  return jsonb_build_object(
    'state', draft_state,
    'requestId', request_key,
    'athleteId', athlete_key,
    'recordId', record_key,
    'athleteName', athlete_name,
    'professionalName', professional_name,
    'title', entry_title,
    'occurredOn', occurred,
    'restricted', (value->>'restricted')::boolean
  );
end $$;

create function public.clinical_draft_finalize(target uuid, record_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  access clinical.athlete_access;
  record clinical.records;
  saved jsonb;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if target is null or record_id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'human_ui', true);
  select * into access from clinical.athlete_access where athlete_id = target and professional_id = actor;
  select * into record from clinical.records
  where id = record_id and athlete_id = target and author_id = actor;
  if access.athlete_id is null
    or not coalesce(access.can_read_records, false)
    or not coalesce(access.can_write, false)
    or not coalesce(access.can_finalize, false)
    or record.id is null then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', record_id, target, 'clinical_record.finalized', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  if record.status = 'finalized' then
    return jsonb_build_object('ok', true, 'id', record.id);
  end if;
  if record.status <> 'draft' then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', record.id, target, 'clinical_record.finalized', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  begin
    saved := public.clinical_save(
      target, record.encounter_id, record.id, record.version, record.title, record.body,
      record.visibility = 'author_only', true
    );
  exception
    when invalid_parameter_value then
      insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
      values (actor, 'clinical_record', record.id, target, 'clinical_record.finalized', 'failed', clinical.audit_channel(), clinical.audit_method());
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  if saved is null or saved ? 'error' then
    return jsonb_build_object('ok', false, 'error', coalesce(saved->>'error', 'invalid'));
  end if;
  return jsonb_build_object('ok', true, 'id', saved->>'id');
end $$;

revoke all on function public.clinical_draft_finalize(uuid, uuid) from public, anon, authenticated;
grant execute on function public.clinical_draft_finalize(uuid, uuid) to authenticated;
