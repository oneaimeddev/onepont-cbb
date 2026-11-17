-- Read authorized clinical documents inside the conversation.
-- The transcript stores identifiers only. Content is loaded again on each view.

create function public.document_browse(target uuid, filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  page_number integer := case
    when coalesce(filters->>'page', '') ~ '^[0-9]{1,6}$' then greatest(1, least(100000, (filters->>'page')::integer))
    else 1
  end;
  page_size integer := case
    when coalesce(filters->>'page_size', '') ~ '^[0-9]{1,2}$' then greatest(1, least(8, (filters->>'page_size')::integer))
    else 5
  end;
  kind text := coalesce(filters->>'kind', '');
  entry_status text := coalesce(filters->>'status', '');
  result jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  if kind not in ('', 'prescription', 'surgical_order') or entry_status not in ('', 'draft', 'ready_for_review') then
    return jsonb_build_object('error', 'invalid');
  end if;
  if not clinical.can_author_documents(actor, target) then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', target, 'document.list', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;

  if filters ? 'ids' then
    with requested as (
      select item.value::uuid as id, item.ordinality
      from jsonb_array_elements_text(case when jsonb_typeof(filters->'ids') = 'array' then filters->'ids' else '[]'::jsonb end)
        with ordinality as item(value, ordinality)
      where item.ordinality <= 20
        and item.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), matching as (
      select d.id, d.document_type, d.status, d.version, d.created_at, d.updated_at, d.author_name, d.credential_label,
        case
          when d.document_type = 'prescription' then coalesce((
            select element->>'name' from jsonb_array_elements(d.content->'items') element
            where coalesce(element->>'name', '') <> '' limit 1
          ), '')
          else coalesce(d.content->>'procedure', '')
        end as label,
        requested.ordinality
      from requested
      join clinical.documents d on d.id = requested.id
      where d.athlete_id = target and d.author_id = actor
        and (kind = '' or d.document_type = kind)
        and (entry_status = '' or d.status = entry_status)
    )
    select jsonb_build_object(
      'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'document_type', document_type, 'status', status, 'version', version,
        'created_at', created_at, 'updated_at', updated_at, 'author_name', author_name,
        'credential_label', credential_label, 'label', label
      ) order by ordinality) from matching), '[]'::jsonb),
      'total', (select count(*) from matching),
      'page', 1,
      'page_size', page_size
    ) into result;
  else
    with matching as (
      select d.id, d.document_type, d.status, d.version, d.created_at, d.updated_at, d.author_name, d.credential_label,
        case
          when d.document_type = 'prescription' then coalesce((
            select element->>'name' from jsonb_array_elements(d.content->'items') element
            where coalesce(element->>'name', '') <> '' limit 1
          ), '')
          else coalesce(d.content->>'procedure', '')
        end as label
      from clinical.documents d
      where d.athlete_id = target and d.author_id = actor
        and (kind = '' or d.document_type = kind)
        and (entry_status = '' or d.status = entry_status)
    ), paged as (
      select * from matching order by updated_at desc, id desc
      limit page_size offset (page_number - 1) * page_size
    )
    select jsonb_build_object(
      'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'document_type', document_type, 'status', status, 'version', version,
        'created_at', created_at, 'updated_at', updated_at, 'author_name', author_name,
        'credential_label', credential_label, 'label', label
      ) order by updated_at desc, id desc) from paged), '[]'::jsonb),
      'total', (select count(*) from matching),
      'page', page_number,
      'page_size', page_size
    ) into result;
  end if;

  insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'clinical_document', target, 'document.list', 'success', clinical.audit_channel(), clinical.audit_method());
  return result;
end $$;

create function public.agent_document_browse(target uuid, filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'agent_tool', true);
  return public.document_browse(target, filters);
end $$;

create function public.chat_document_browse(target uuid, filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  return public.document_browse(target, filters);
end $$;

create function public.agent_document_open(target uuid, document_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'agent_tool', true);
  return public.document_open(target, document_id);
end $$;

create function public.chat_document_open(target uuid, document_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  return public.document_open(target, document_id);
end $$;

create function public.chat_athlete_timeline(target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  return public.athlete_workspace(target, 'timeline');
end $$;

revoke all on function
  public.document_browse(uuid, jsonb),
  public.agent_document_browse(uuid, jsonb),
  public.chat_document_browse(uuid, jsonb),
  public.agent_document_open(uuid, uuid),
  public.chat_document_open(uuid, uuid),
  public.chat_athlete_timeline(uuid)
from public, anon, authenticated;
grant execute on function
  public.document_browse(uuid, jsonb),
  public.agent_document_browse(uuid, jsonb),
  public.chat_document_browse(uuid, jsonb),
  public.agent_document_open(uuid, uuid),
  public.chat_document_open(uuid, uuid),
  public.chat_athlete_timeline(uuid)
to authenticated;

alter table clinical.conversation_messages
  add column readings jsonb,
  add constraint conversation_messages_readings_thin check (
    readings is null or (
      jsonb_typeof(readings) = 'object'
      and not (readings ?| array['content', 'dose', 'body', 'justification', 'notes', 'indication', 'instructions'])
    )
  );

create or replace function clinical.conversation_readings(value jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  kept jsonb := '[]'::jsonb;
  entry_id uuid;
  athlete_key uuid;
  entry_kind text;
  source text;
begin
  if jsonb_typeof(value) is distinct from 'object' then return null; end if;
  if value ?| array['content', 'dose', 'body', 'justification', 'notes', 'indication', 'instructions'] then return null; end if;
  source := value->>'source';
  if source not in ('document', 'evolution') then return null; end if;
  if jsonb_typeof(value->'items') is distinct from 'array' then return null; end if;
  for item in select entry from jsonb_array_elements(value->'items') as entry loop
    exit when jsonb_array_length(kept) >= 8;
    if jsonb_typeof(item) is distinct from 'object' then continue; end if;
    if item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
    if item->>'athleteId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
    entry_id := (item->>'id')::uuid;
    athlete_key := (item->>'athleteId')::uuid;
    entry_kind := item->>'kind';
    if source = 'document' and entry_kind in ('prescription', 'surgical_order')
      and clinical.can_author_documents(actor, athlete_key)
      and exists (
        select 1 from clinical.documents document
        where document.id = entry_id and document.athlete_id = athlete_key
          and document.author_id = actor and document.document_type = entry_kind
      ) then
      kept := kept || jsonb_build_array(jsonb_build_object(
        'id', entry_id, 'athleteId', athlete_key, 'kind', entry_kind, 'open', item->>'open' = 'true'
      ));
    elsif source = 'evolution' and entry_kind = 'evolution'
      and exists (
        select 1 from clinical.records record
        join clinical.athlete_access access on access.athlete_id = record.athlete_id and access.professional_id = actor and access.can_read_records
        where record.id = entry_id and record.athlete_id = athlete_key
          and ((record.status = 'finalized' and record.visibility = 'care_team') or record.author_id = actor)
      ) then
      kept := kept || jsonb_build_array(jsonb_build_object(
        'id', entry_id, 'athleteId', athlete_key, 'kind', 'evolution', 'open', item->>'open' = 'true'
      ));
    end if;
  end loop;
  if jsonb_array_length(kept) = 0 then return null; end if;
  return jsonb_build_object(
    'source', source,
    'athleteId', kept->0->>'athleteId',
    'total', least(8, greatest(jsonb_array_length(kept), coalesce((value->>'total')::integer, jsonb_array_length(kept)))),
    'page', 1,
    'pageSize', least(8, greatest(1, coalesce((value->>'pageSize')::integer, 5))),
    'kind', case when value->>'kind' in ('prescription', 'surgical_order') then value->>'kind' else '' end,
    'status', case when value->>'status' in ('draft', 'ready_for_review') then value->>'status' else '' end,
    'items', kept
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end $$;

revoke all on function clinical.conversation_readings(jsonb) from public, anon, authenticated;

create or replace function clinical.conversation_payload(session_row clinical.conversation_sessions)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare messages jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', message.client_id,
    'role', message.role,
    'text', message.text,
    'athletes', message.cards,
    'navigation', message.navigation,
    'search', message.search,
    'draft', message.draft,
    'document', message.document,
    'readings', message.readings
  ) order by message.position), '[]'::jsonb)
  into messages
  from clinical.conversation_messages message
  where message.session_id = session_row.id;
  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', session_row.id,
      'status', session_row.status,
      'athleteId', session_row.athlete_id,
      'startedAt', session_row.started_at,
      'lastActivityAt', session_row.last_activity_at
    ),
    'messages', messages
  );
end $$;

create or replace function public.conversation_save(target uuid, context_athlete uuid, transcript jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  session_row clinical.conversation_sessions;
  element jsonb;
  clean jsonb := '[]'::jsonb;
  message_role text;
  message_text text;
  message_id text;
  cards jsonb;
  navigation jsonb;
  search jsonb;
  draft jsonb;
  document jsonb;
  readings jsonb;
  seen text[] := '{}';
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if jsonb_typeof(transcript) is distinct from 'array' or jsonb_array_length(transcript) < 1 or jsonb_array_length(transcript) > 40 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for element in select entry from jsonb_array_elements(transcript) as entry loop
    exit when jsonb_array_length(clean) >= 40;
    if jsonb_typeof(element) is distinct from 'object' then continue; end if;
    message_role := element->>'role';
    message_id := left(trim(coalesce(element->>'id', '')), 80);
    message_text := left(coalesce(element->>'text', ''), 4000);
    if message_role not in ('user', 'assistant') or message_id = '' then continue; end if;
    if message_id = any (seen) then continue; end if;
    if message_role = 'user' and trim(message_text) = '' then continue; end if;
    cards := clinical.conversation_cards(element->'athletes');
    navigation := clinical.conversation_navigation(element->'navigation');
    search := clinical.conversation_search(element->'search');
    draft := clinical.conversation_draft(element->'draft');
    document := clinical.conversation_document(element->'document');
    readings := clinical.conversation_readings(element->'readings');
    if trim(message_text) = '' and cards = '[]'::jsonb and navigation is null and draft is null and document is null and readings is null then continue; end if;
    seen := array_append(seen, message_id);
    clean := clean || jsonb_build_array(jsonb_build_object(
      'id', message_id,
      'role', message_role,
      'text', message_text,
      'athletes', cards,
      'navigation', navigation,
      'search', search
    ) || case when draft is null then '{}'::jsonb else jsonb_build_object('draft', draft) end
      || case when document is null then '{}'::jsonb else jsonb_build_object('document', document) end
      || case when readings is null then '{}'::jsonb else jsonb_build_object('readings', readings) end);
  end loop;
  if jsonb_array_length(clean) = 0 then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  perform clinical.conversation_idle_stale(actor);
  if context_athlete is not null and not exists (
    select 1 from clinical.athlete_access where athlete_id = context_athlete and professional_id = actor
  ) then
    perform clinical.conversation_audit(actor, target, context_athlete, 'conversation.context', 'denied');
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;

  if target is not null then
    select * into session_row from clinical.conversation_sessions
    where id = target and professional_id = actor;
    if session_row.id is null then
      perform clinical.conversation_audit(actor, target, context_athlete, 'conversation.save', 'denied');
      return jsonb_build_object('ok', false, 'error', 'denied');
    end if;
    if session_row.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  else
    select * into session_row from clinical.conversation_sessions
    where professional_id = actor and status = 'active';
    if session_row.id is not null then return jsonb_build_object('ok', false, 'error', 'conflict'); end if;
    insert into clinical.conversation_sessions(professional_id, athlete_id)
    values (actor, context_athlete)
    returning * into session_row;
    perform clinical.conversation_audit(actor, session_row.id, context_athlete, 'conversation.start', 'success');
  end if;

  delete from clinical.conversation_messages where session_id = session_row.id;
  insert into clinical.conversation_messages(session_id, position, client_id, role, text, cards, navigation, search, draft, document, readings)
  select session_row.id, ordinality - 1, entry->>'id', entry->>'role', entry->>'text',
    entry->'athletes', entry->'navigation', entry->'search', entry->'draft', entry->'document', entry->'readings'
  from jsonb_array_elements(clean) with ordinality as item(entry, ordinality);

  update clinical.conversation_sessions
  set athlete_id = context_athlete, last_activity_at = clock_timestamp()
  where id = session_row.id
  returning * into session_row;
  return clinical.conversation_payload(session_row);
end $$;
