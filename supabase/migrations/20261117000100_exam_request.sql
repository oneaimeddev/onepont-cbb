-- Exam requests reuse clinical documents. This does not sign, emit, or receive results.

alter table clinical.documents drop constraint documents_document_type_check;
alter table clinical.documents add constraint documents_document_type_check
  check (document_type in ('prescription', 'surgical_order', 'exam_request'));

alter table clinical.document_proposals drop constraint document_proposals_document_type_check;
alter table clinical.document_proposals add constraint document_proposals_document_type_check
  check (document_type in ('prescription', 'surgical_order', 'exam_request'));

create or replace function clinical.canonical_document(kind text, payload jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  built jsonb := '[]'::jsonb;
  seen text[] := '{}';
  item_id text;
  fields text[] := array['name', 'presentation', 'dose', 'dose_unit', 'route', 'schedule', 'duration', 'quantity', 'instructions'];
  exam_fields text[] := array['name', 'exam_type', 'region', 'laterality', 'technical_details', 'notes'];
  field text;
  clipped text;
  notes text;
  procedure_name text;
  region text;
  laterality text;
  indication text;
  diagnosis text;
  justification text;
  priority text;
  additional text;
  materials text;
  occurred_at text;
  item_object jsonb;
begin
  if kind not in ('prescription', 'surgical_order', 'exam_request') or jsonb_typeof(payload) <> 'object' then return null; end if;
  if kind = 'prescription' or kind = 'exam_request' then
    if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') > 12 then return null; end if;
    if kind = 'prescription' then
      notes := clinical.clip_text(payload -> 'notes', 2000);
      if notes is null then return null; end if;
    else
      occurred_at := clinical.clip_text(payload -> 'occurred_at', 10);
      indication := clinical.clip_text(payload -> 'indication', 2000);
      justification := clinical.clip_text(payload -> 'justification', 2000);
      diagnosis := clinical.clip_text(payload -> 'diagnosis', 500);
      priority := clinical.clip_text(payload -> 'priority', 20);
      additional := clinical.clip_text(payload -> 'additional', 2000);
      if occurred_at is null or indication is null or justification is null or diagnosis is null or priority is null or additional is null then
        return null;
      end if;
      if occurred_at <> '' and occurred_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
      if priority not in ('', 'elective', 'priority', 'urgent') then return null; end if;
    end if;
    for item in select value from jsonb_array_elements(payload -> 'items') loop
      if jsonb_typeof(item) <> 'object' then return null; end if;
      item_id := lower(coalesce(item ->> 'id', ''));
      if item_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or item_id = any(seen) then return null; end if;
      seen := seen || item_id;
      item_object := jsonb_build_object('id', item_id);
      if kind = 'prescription' then
        foreach field in array fields loop
          clipped := clinical.clip_text(item -> field, case when field = 'instructions' then 500 else 160 end);
          if clipped is null then return null; end if;
          item_object := item_object || jsonb_build_object(field, clipped);
        end loop;
      else
        foreach field in array exam_fields loop
          clipped := clinical.clip_text(item -> field, case when field in ('technical_details', 'notes') then 500 else 160 end);
          if clipped is null then return null; end if;
          item_object := item_object || jsonb_build_object(field, clipped);
        end loop;
        if (item_object ->> 'exam_type') not in ('', 'laboratory', 'imaging', 'other') then return null; end if;
        if (item_object ->> 'laterality') not in ('', 'left', 'right', 'bilateral', 'not_applicable') then return null; end if;
      end if;
      built := built || jsonb_build_array(item_object);
    end loop;
    if kind = 'prescription' then
      return jsonb_build_object('notes', notes, 'items', built);
    end if;
    return jsonb_build_object(
      'occurred_at', occurred_at, 'indication', indication, 'justification', justification,
      'diagnosis', diagnosis, 'priority', priority, 'additional', additional, 'items', built
    );
  end if;

  procedure_name := clinical.clip_text(payload -> 'procedure', 200);
  region := clinical.clip_text(payload -> 'region', 120);
  laterality := clinical.clip_text(payload -> 'laterality', 20);
  indication := clinical.clip_text(payload -> 'indication', 2000);
  diagnosis := clinical.clip_text(payload -> 'diagnosis', 500);
  justification := clinical.clip_text(payload -> 'justification', 2000);
  priority := clinical.clip_text(payload -> 'priority', 20);
  additional := clinical.clip_text(payload -> 'additional', 2000);
  materials := clinical.clip_text(payload -> 'materials', 1000);
  if procedure_name is null or region is null or laterality is null or indication is null
    or diagnosis is null or justification is null or priority is null or additional is null or materials is null then
    return null;
  end if;
  if laterality not in ('', 'left', 'right', 'bilateral', 'not_applicable') then return null; end if;
  if priority not in ('', 'elective', 'priority', 'urgent') then return null; end if;
  return jsonb_build_object(
    'procedure', procedure_name, 'region', region, 'laterality', laterality,
    'indication', indication, 'diagnosis', diagnosis, 'justification', justification,
    'priority', priority, 'additional', additional, 'materials', materials
  );
end $$;

create or replace function clinical.document_pending(kind text, payload jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  pending text[] := '{}';
  item jsonb;
  ordinal integer := 0;
  named integer := 0;
begin
  if kind = 'prescription' then
    if payload ->> 'notes' = '' then pending := array_append(pending, 'notes'); end if;
    for item in select value from jsonb_array_elements(payload -> 'items') loop
      ordinal := ordinal + 1;
      if item ->> 'name' <> '' then named := named + 1; end if;
      if item ->> 'name' = '' then pending := array_append(pending, 'item.' || ordinal || '.name'); end if;
      if item ->> 'presentation' = '' then pending := array_append(pending, 'item.' || ordinal || '.presentation'); end if;
      if item ->> 'dose' = '' then pending := array_append(pending, 'item.' || ordinal || '.dose'); end if;
      if item ->> 'dose_unit' = '' then pending := array_append(pending, 'item.' || ordinal || '.dose_unit'); end if;
      if item ->> 'route' = '' then pending := array_append(pending, 'item.' || ordinal || '.route'); end if;
      if item ->> 'schedule' = '' then pending := array_append(pending, 'item.' || ordinal || '.schedule'); end if;
      if item ->> 'duration' = '' then pending := array_append(pending, 'item.' || ordinal || '.duration'); end if;
      if item ->> 'quantity' = '' then pending := array_append(pending, 'item.' || ordinal || '.quantity'); end if;
      if item ->> 'instructions' = '' then pending := array_append(pending, 'item.' || ordinal || '.instructions'); end if;
    end loop;
    if named = 0 then pending := array_append(pending, 'medication'); end if;
    return pending;
  end if;
  if kind = 'exam_request' then
    if payload ->> 'occurred_at' = '' then pending := array_append(pending, 'occurred_at'); end if;
    if payload ->> 'indication' = '' then pending := array_append(pending, 'indication'); end if;
    if payload ->> 'justification' = '' then pending := array_append(pending, 'justification'); end if;
    if payload ->> 'diagnosis' = '' then pending := array_append(pending, 'diagnosis'); end if;
    if payload ->> 'priority' = '' then pending := array_append(pending, 'priority'); end if;
    if payload ->> 'additional' = '' then pending := array_append(pending, 'additional'); end if;
    for item in select value from jsonb_array_elements(payload -> 'items') loop
      ordinal := ordinal + 1;
      if item ->> 'name' <> '' then named := named + 1; end if;
      if item ->> 'name' = '' then pending := array_append(pending, 'item.' || ordinal || '.name'); end if;
      if item ->> 'exam_type' = '' then pending := array_append(pending, 'item.' || ordinal || '.exam_type'); end if;
      if item ->> 'region' = '' then pending := array_append(pending, 'item.' || ordinal || '.region'); end if;
      if item ->> 'laterality' = '' then pending := array_append(pending, 'item.' || ordinal || '.laterality'); end if;
      if item ->> 'technical_details' = '' then pending := array_append(pending, 'item.' || ordinal || '.technical_details'); end if;
      if item ->> 'notes' = '' then pending := array_append(pending, 'item.' || ordinal || '.notes'); end if;
    end loop;
    if named = 0 then pending := array_append(pending, 'exam'); end if;
    return pending;
  end if;
  if payload ->> 'procedure' = '' then pending := array_append(pending, 'procedure'); end if;
  if payload ->> 'region' = '' then pending := array_append(pending, 'region'); end if;
  if payload ->> 'laterality' = '' then pending := array_append(pending, 'laterality'); end if;
  if payload ->> 'indication' = '' then pending := array_append(pending, 'indication'); end if;
  if payload ->> 'diagnosis' = '' then pending := array_append(pending, 'diagnosis'); end if;
  if payload ->> 'justification' = '' then pending := array_append(pending, 'justification'); end if;
  if payload ->> 'priority' = '' then pending := array_append(pending, 'priority'); end if;
  if payload ->> 'additional' = '' then pending := array_append(pending, 'additional'); end if;
  if payload ->> 'materials' = '' then pending := array_append(pending, 'materials'); end if;
  return pending;
end $$;

create or replace function clinical.document_ready(kind text, payload jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case kind
    when 'prescription' then exists (
      select 1 from jsonb_array_elements(payload -> 'items') item where item ->> 'name' <> ''
    )
    when 'exam_request' then exists (
      select 1 from jsonb_array_elements(payload -> 'items') item where item ->> 'name' <> ''
    )
    else payload ->> 'procedure' <> '' and payload ->> 'justification' <> ''
  end
$$;

create or replace function clinical.document_utterance_kind(utterance text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  plain text;
  named_prescription boolean;
  named_surgical boolean;
  named_exam boolean;
  hits integer := 0;
begin
  plain := pg_catalog.translate(pg_catalog.lower(coalesce(utterance, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  named_prescription := plain ~ 'prescri';
  named_surgical := plain ~ 'cirurg';
  named_exam := plain ~ 'exame' or plain ~ 'hemograma' or plain ~ 'ressonancia' or plain ~ 'radiografia' or plain ~ 'ultrasson';
  if named_prescription then hits := hits + 1; end if;
  if named_surgical then hits := hits + 1; end if;
  if named_exam then hits := hits + 1; end if;
  if hits > 1 then return 'both'; end if;
  if named_prescription then return 'prescription'; end if;
  if named_surgical then return 'surgical_order'; end if;
  if named_exam then return 'exam_request'; end if;
  return 'any';
end $$;

create or replace function clinical.draft_utterance_decision(utterance text)
returns text
language plpgsql immutable set search_path = '' as $$
declare
  plain text;
begin
  if utterance is null or pg_catalog.btrim(utterance) = '' or pg_catalog.length(utterance) > 240 then return 'reject'; end if;
  if pg_catalog.strpos(utterance, chr(63)) > 0 then return 'reject'; end if;
  plain := pg_catalog.translate(pg_catalog.lower(utterance), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  if plain ~ '(talvez|acho que|sera que|nao sei|nao salv|nao grav|nao confirm|cancele|cancelar|descarte|descartar|finaliz|assin|prescri|cirurg|exame)' then
    return 'reject';
  end if;
  if plain ~ '(pode|confirma|confirme|confirmar).{0,80}(salvar|salve|gravar|grave)' then return 'save'; end if;
  if plain ~ '(salvar|salve|gravar|grave) (o |a |esse |esta |este )?rascunho' then return 'save'; end if;
  if plain ~ 'confirm(ar|e|a) e salv' then return 'save'; end if;
  return 'reject';
end $$;

create or replace function public.document_browse(target uuid, filters jsonb default '{}') returns jsonb
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
  months integer := case
    when coalesce(filters->>'months', '') ~ '^[0-9]{1,2}$' then least(36, greatest(0, (filters->>'months')::integer))
    else 0
  end;
  kind text := coalesce(filters->>'kind', '');
  entry_status text := coalesce(filters->>'status', '');
  result jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  if kind not in ('', 'prescription', 'surgical_order', 'exam_request') or entry_status not in ('', 'draft', 'ready_for_review') then
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
        clinical.document_label(d.document_type, d.content) as label,
        requested.ordinality
      from requested
      join clinical.documents d on d.id = requested.id
      where d.athlete_id = target and d.author_id = actor
        and (kind = '' or d.document_type = kind)
        and (entry_status = '' or d.status = entry_status)
        and (months = 0 or d.updated_at >= pg_catalog.clock_timestamp() - pg_catalog.make_interval(months => months))
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
        clinical.document_label(d.document_type, d.content) as label
      from clinical.documents d
      where d.athlete_id = target and d.author_id = actor
        and (kind = '' or d.document_type = kind)
        and (entry_status = '' or d.status = entry_status)
        and (months = 0 or d.updated_at >= pg_catalog.clock_timestamp() - pg_catalog.make_interval(months => months))
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

create function clinical.document_label(kind text, content jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when kind in ('prescription', 'exam_request') then coalesce((
      select element->>'name' from jsonb_array_elements(content->'items') element
      where coalesce(element->>'name', '') <> '' limit 1
    ), '')
    else coalesce(content->>'procedure', '')
  end
$$;

revoke all on function clinical.document_label(text, jsonb) from public, anon, authenticated;

create function public.clinical_document_proposal_current(target uuid, kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  found integer;
  open_row clinical.document_proposals;
begin
  if actor is null then raise insufficient_privilege; end if;
  if kind not in ('prescription', 'surgical_order', 'exam_request') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not clinical.can_author_documents(actor, target) then
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  select count(*) into found from clinical.document_proposals found_row
  join clinical.conversation_sessions session on session.id = found_row.session_id
  where found_row.actor_id = actor and session.professional_id = actor and session.status = 'active'
    and found_row.athlete_id = target and found_row.document_type = kind
    and found_row.document_id is null and found_row.discarded_at is null;
  if found = 0 then return jsonb_build_object('ok', true, 'proposal', null); end if;
  if found > 1 then return jsonb_build_object('ok', false, 'error', 'ambiguous'); end if;
  select found_row.* into open_row from clinical.document_proposals found_row
  join clinical.conversation_sessions session on session.id = found_row.session_id
  where found_row.actor_id = actor and session.professional_id = actor and session.status = 'active'
    and found_row.athlete_id = target and found_row.document_type = kind
    and found_row.document_id is null and found_row.discarded_at is null;
  return jsonb_build_object('ok', true, 'requestId', open_row.request_id, 'content', open_row.content, 'version', open_row.version);
end $$;

revoke all on function public.clinical_document_proposal_current(uuid, text) from public, anon, authenticated;
grant execute on function public.clinical_document_proposal_current(uuid, text) to authenticated;

do $$
declare src text;
begin
  src := pg_get_functiondef('public.clinical_document_proposal_register(uuid, uuid, text, jsonb)'::regprocedure);
  src := replace(src, 'kind not in (''prescription'', ''surgical_order'')', 'kind not in (''prescription'', ''surgical_order'', ''exam_request'')');
  src := replace(src, 'athlete_name = athlete_name', 'athlete_name = (select coalesce(social_name, full_name) from clinical.athletes where id = target)');
  src := replace(src, 'professional_name = professional_name', 'professional_name = (select display_name from public.profiles where id = actor)');
  execute src;

  src := pg_get_functiondef('public.clinical_document_confirm_card(uuid, text, jsonb)'::regprocedure);
  src := replace(src, 'kind not in (''prescription'', ''surgical_order'')', 'kind not in (''prescription'', ''surgical_order'', ''exam_request'')');
  execute src;

  src := pg_get_functiondef('clinical.conversation_document(jsonb)'::regprocedure);
  src := replace(src, 'entry_kind not in (''prescription'', ''surgical_order'')', 'entry_kind not in (''prescription'', ''surgical_order'', ''exam_request'')');
  execute src;

  src := pg_get_functiondef('clinical.conversation_readings(jsonb)'::regprocedure);
  src := replace(src, 'entry_kind in (''prescription'', ''surgical_order'')', 'entry_kind in (''prescription'', ''surgical_order'', ''exam_request'')');
  src := replace(src, 'value->>''kind'' in (''prescription'', ''surgical_order'')', 'value->>''kind'' in (''prescription'', ''surgical_order'', ''exam_request'')');
  execute src;
end $$;
