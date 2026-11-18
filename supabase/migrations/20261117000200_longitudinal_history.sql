-- Authorized longitudinal read for CBB Intelligence.
-- Pages return identifiers and clinical dates. Opening a source uses the existing read path.

create function public.clinical_history_page(target uuid, filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  page_number integer := case
    when coalesce(filters->>'page', '') ~ '^[0-9]{1,6}$' then greatest(1, least(50, (filters->>'page')::integer))
    else 1
  end;
  page_size integer := case
    when coalesce(filters->>'page_size', '') ~ '^[0-9]{1,2}$' then greatest(1, least(20, (filters->>'page_size')::integer))
    else 20
  end;
  from_date date := case when coalesce(filters->>'from', '') ~ '^\d{4}-\d{2}-\d{2}$' then (filters->>'from')::date else null end;
  to_date date := case when coalesce(filters->>'to', '') ~ '^\d{4}-\d{2}-\d{2}$' then (filters->>'to')::date else null end;
  kind_text text := coalesce(filters->>'kinds', '');
  specialty_text text := coalesce(filters->>'specialties', '');
  kind_list text[];
  specialty_list text[];
  include_documents boolean;
  athlete_name text;
  result jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  if coalesce(filters->>'from', '') <> '' and filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('error', 'invalid');
  end if;
  if coalesce(filters->>'to', '') <> '' and filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('error', 'invalid');
  end if;
  if kind_text = '' then
    kind_list := array['evolution', 'prescription', 'surgical_order', 'exam_request'];
  elsif kind_text ~ '^(evolution|prescription|surgical_order|exam_request)(,(evolution|prescription|surgical_order|exam_request)){0,3}$' then
    kind_list := string_to_array(kind_text, ',');
  else
    return jsonb_build_object('error', 'invalid');
  end if;
  if specialty_text = '' then
    specialty_list := array[]::text[];
  elsif specialty_text ~ '^[a-z]{3,40}(,[a-z]{3,40}){0,3}$' then
    specialty_list := string_to_array(specialty_text, ',');
  else
    return jsonb_build_object('error', 'invalid');
  end if;
  if not exists (
    select 1 from clinical.athlete_access access
    where access.athlete_id = target and access.professional_id = actor and access.can_read_records
  ) then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_history', target, 'history.read', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;

  select coalesce(athlete.social_name, athlete.full_name, '') into athlete_name
  from clinical.athletes athlete where athlete.id = target;
  include_documents := cardinality(specialty_list) = 0
    and kind_list && array['prescription', 'surgical_order', 'exam_request']
    and clinical.can_author_documents(actor, target);

  with evolutions as (
    select r.id, 'evolution'::text as kind, r.occurred_at::date as clinical_at, r.occurred_at as created_at,
      (select max(revision.occurred_at) from clinical.record_revisions revision where revision.record_id = r.id) as updated_at,
      r.specialty, r.author_name, r.status, r.version, r.title
    from clinical.records r
    where r.athlete_id = target
      and ((r.status = 'finalized' and r.visibility = 'care_team') or r.author_id = actor)
      and 'evolution' = any(kind_list)
      and (cardinality(specialty_list) = 0 or clinical.search_text(r.specialty) = any(specialty_list))
      and (from_date is null or r.occurred_at::date >= from_date)
      and (to_date is null or r.occurred_at::date <= to_date)
  ), documents as (
    select d.id, d.document_type as kind,
      case
        when d.document_type = 'exam_request' and d.content->>'occurred_at' ~ '^\d{4}-\d{2}-\d{2}$' then (d.content->>'occurred_at')::date
        else d.created_at::date
      end as clinical_at,
      d.created_at, d.updated_at, ''::text as specialty, d.author_name, d.status, d.version,
      clinical.document_label(d.document_type, d.content) as title
    from clinical.documents d
    where include_documents
      and d.athlete_id = target
      and d.author_id = actor
      and d.document_type = any(kind_list)
  ), dated as (
    select * from documents
    where (from_date is null or clinical_at >= from_date)
      and (to_date is null or clinical_at <= to_date)
  ), combined as (
    select * from evolutions
    union all
    select * from dated
  ), paged as (
    select * from combined
    order by clinical_at desc, id desc
    limit page_size offset (page_number - 1) * page_size
  )
  select jsonb_build_object(
    'athlete_name', athlete_name,
    'documents_included', include_documents,
    'total', (select count(*) from combined),
    'page', page_number,
    'page_size', page_size,
    'records', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'clinical_at', clinical_at, 'created_at', created_at, 'updated_at', updated_at,
      'specialty', specialty, 'author_name', author_name, 'status', status, 'version', version, 'title', title
    ) order by clinical_at desc, id desc) from paged), '[]'::jsonb)
  ) into result;

  insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'clinical_history', target, 'history.read', 'success', clinical.audit_channel(), clinical.audit_method());
  return result;
end $$;

create function public.agent_history_page(target uuid, filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'agent_tool', true);
  return public.clinical_history_page(target, filters);
end $$;

create function public.chat_history_page(target uuid, filters jsonb default '{}', mode text default 'text') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', case when mode = 'voice' then 'human_voice' else 'human_message' end, true);
  return public.clinical_history_page(target, filters);
end $$;

revoke all on function public.clinical_history_page(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.agent_history_page(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.chat_history_page(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.agent_history_page(uuid, jsonb) to authenticated;
grant execute on function public.chat_history_page(uuid, jsonb, text) to authenticated;

create or replace function clinical.conversation_analysis(value jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  item jsonb;
  kept jsonb := '[]'::jsonb;
  entry_id uuid;
  entry_kind text;
  clinical_at text;
begin
  if value is null or jsonb_typeof(value) is distinct from 'object' then return null; end if;
  if jsonb_typeof(value->'items') = 'array' then
    for item in select entry from jsonb_array_elements(value->'items') as entry loop
      exit when jsonb_array_length(kept) >= 200;
      begin
        entry_id := (item->>'id')::uuid;
      exception when invalid_text_representation then
        continue;
      end;
      entry_kind := item->>'kind';
      if entry_kind not in ('evolution', 'prescription', 'surgical_order', 'exam_request') then continue; end if;
      clinical_at := coalesce(item->>'clinicalAt', '');
      if clinical_at !~ '^\d{4}-\d{2}-\d{2}' then clinical_at := ''; end if;
      kept := kept || jsonb_build_array(jsonb_build_object(
        'id', entry_id,
        'kind', entry_kind,
        'clinicalAt', left(clinical_at, 10),
        'status', left(coalesce(item->>'status', ''), 40),
        'specialty', left(coalesce(item->>'specialty', ''), 80)
      ));
    end loop;
  end if;
  return jsonb_build_object(
    'athleteId', coalesce(value->>'athleteId', ''),
    'athleteName', left(coalesce(value->>'athleteName', ''), 160),
    'from', case when coalesce(value->>'from', '') ~ '^\d{4}-\d{2}-\d{2}$' then value->>'from' else '' end,
    'to', case when coalesce(value->>'to', '') ~ '^\d{4}-\d{2}-\d{2}$' then value->>'to' else '' end,
    'unbounded', coalesce(value->>'unbounded', '') = 'true',
    'periodLabel', left(coalesce(value->>'periodLabel', ''), 120),
    'specialties', case when jsonb_typeof(value->'specialties') = 'array' then value->'specialties' else '[]'::jsonb end,
    'kinds', case when jsonb_typeof(value->'kinds') = 'array' then value->'kinds' else '[]'::jsonb end,
    'complete', coalesce(value->>'complete', '') = 'true',
    'reason', case when value->>'reason' in ('complete', 'empty', 'limit', 'failed', 'cancelled') then value->>'reason' else 'failed' end,
    'examined', least(200, greatest(0, coalesce((value->>'examined')::integer, 0))),
    'total', least(100000, greatest(0, coalesce((value->>'total')::integer, 0))),
    'documentsIncluded', coalesce(value->>'documentsIncluded', '') = 'true',
    'counts', case when jsonb_typeof(value->'counts') = 'object' then value->'counts' else '{}'::jsonb end,
    'gaps', case when jsonb_typeof(value->'gaps') = 'array' then (select coalesce(jsonb_agg(left(gap_text, 160)), '[]'::jsonb) from jsonb_array_elements_text(value->'gaps') with ordinality as gap_list(gap_text, gap_ordinal) where gap_ordinal <= 12) else '[]'::jsonb end,
    'notices', case when jsonb_typeof(value->'notices') = 'array' then (select coalesce(jsonb_agg(left(notice_text, 240)), '[]'::jsonb) from jsonb_array_elements_text(value->'notices') with ordinality as notice_list(notice_text, notice_ordinal) where notice_ordinal <= 8) else '[]'::jsonb end,
    'summary', left(coalesce(value->>'summary', ''), 500),
    'items', kept,
    'analyzedAt', left(coalesce(value->>'analyzedAt', ''), 40),
    'asksChange', coalesce(value->>'asksChange', '') = 'true'
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end $$;

revoke all on function clinical.conversation_analysis(jsonb) from public, anon, authenticated;

alter table clinical.conversation_messages
  add column analysis jsonb,
  add constraint conversation_messages_analysis_thin check (
    analysis is null or (
      jsonb_typeof(analysis) = 'object'
      and not (analysis ?| array['content', 'dose', 'body', 'justification', 'notes', 'indication', 'instructions', 'title'])
    )
  );

do $$
declare
  source text;
  next text;
begin
  source := pg_get_functiondef('public.conversation_save(uuid, uuid, jsonb)'::regprocedure);
  next := replace(source, 'readings jsonb;', 'readings jsonb;' || chr(10) || '  analysis jsonb;');
  if next = source then raise exception 'conversation_save readings declaration missing'; end if;
  source := next;
  next := replace(source,
    'readings := clinical.conversation_readings(element->''readings'');',
    'readings := clinical.conversation_readings(element->''readings'');' || chr(10) || '    analysis := clinical.conversation_analysis(element->''analysis'');');
  if next = source then raise exception 'conversation_save readings assignment missing'; end if;
  source := next;
  next := replace(source,
    'and readings is null then continue;',
    'and readings is null and analysis is null then continue;');
  if next = source then raise exception 'conversation_save continue missing'; end if;
  source := next;
  next := replace(source,
    '|| case when readings is null then ''{}''::jsonb else jsonb_build_object(''readings'', readings) end);',
    '|| case when readings is null then ''{}''::jsonb else jsonb_build_object(''readings'', readings) end'
    || chr(10) || '      || case when analysis is null then ''{}''::jsonb else jsonb_build_object(''analysis'', analysis) end);');
  if next = source then raise exception 'conversation_save analysis object missing'; end if;
  source := next;
  next := replace(source, 'document, readings)', 'document, readings, analysis)');
  if next = source then raise exception 'conversation_save insert columns missing'; end if;
  source := next;
  next := replace(source, 'entry->''document'', entry->''readings''', 'entry->''document'', entry->''readings'', entry->''analysis''');
  if next = source then raise exception 'conversation_save insert values missing'; end if;
  execute next;

  source := pg_get_functiondef('clinical.conversation_payload(clinical.conversation_sessions)'::regprocedure);
  next := replace(source, '''readings'', message.readings', '''readings'', message.readings,' || chr(10) || '    ''analysis'', message.analysis');
  if next = source then raise exception 'conversation_payload readings missing'; end if;
  execute next;
end $$;
