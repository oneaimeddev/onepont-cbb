-- Assisted clinical evolutions reuse clinical_save.
-- A proposal is not a record. The model cannot pass a confirmation flag.
-- The approval row binds the authenticated professional, the athlete, and the exact text.
-- Audit rows do not store the clinical title or body.

create table clinical.evolution_approvals (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references clinical.athletes(id) on delete cascade,
  request_id uuid not null,
  content_hash text not null,
  record_id uuid references clinical.records(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_id, request_id)
);

alter table clinical.evolution_approvals enable row level security;
revoke all on clinical.evolution_approvals from public, anon, authenticated;

create function clinical.draft_hash(target uuid, entry_title text, entry_body text, occurred_on date, restricted boolean)
returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.md5(
    target::text || E'\x1f' || pg_catalog.btrim(entry_title) || E'\x1f' || entry_body || E'\x1f'
    || coalesce(occurred_on::text, '') || E'\x1f' || restricted::text
  )
$$;

create function clinical.draft_content_ok(entry_title text, entry_body text, occurred_on date)
returns boolean
language sql stable set search_path = '' as $$
  select entry_title is not null and entry_body is not null
    and pg_catalog.length(pg_catalog.btrim(entry_title)) between 1 and 160
    and pg_catalog.length(pg_catalog.btrim(entry_body)) between 1 and 20000
    and pg_catalog.length(entry_body) <= 20000
    and (occurred_on is null or (
      occurred_on >= date '1900-01-01'
      and occurred_on <= (pg_catalog.clock_timestamp() at time zone 'America/Sao_Paulo')::date
    ))
$$;

revoke all on function clinical.draft_hash(uuid, text, text, date, boolean), clinical.draft_content_ok(text, text, date)
from public, anon, authenticated;

create or replace function public.clinical_save(target uuid, request_id uuid, record_id uuid, expected_version integer, entry_title text, entry_body text, restricted boolean, finalize boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); access clinical.athlete_access; record clinical.records; prof public.profiles; enc uuid;
begin
 if actor is null then raise insufficient_privilege; end if;
 select * into access from clinical.athlete_access where athlete_id=target and professional_id=actor for share;
 if access is null or not access.can_read_records or not access.can_write or (finalize and not access.can_finalize) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
  values(actor,'clinical_record','clinical_record.save','denied',clinical.audit_channel(),clinical.audit_method());
  return jsonb_build_object('error','denied');
 end if;
 select * into prof from public.profiles where id=actor;
 if record_id is null then
  if finalize or request_id is null then raise invalid_parameter_value; end if;
  if exists(select 1 from clinical.encounters where id=request_id and athlete_id=target and author_id=actor) then
   select * into record from clinical.records where encounter_id=request_id;
   return jsonb_build_object('id',record.id,'version',record.version);
  end if;
  if length(trim(entry_title)) not between 1 and 160 or length(trim(entry_body)) not between 1 and 20000 then raise invalid_parameter_value; end if;
  insert into clinical.encounters(id,athlete_id,author_id,specialty) values(request_id,target,actor,prof.profession);
  insert into clinical.records(athlete_id,author_id,author_name,specialty,title,body,occurred_at,status,visibility,encounter_id)
  values(target,actor,prof.display_name,prof.profession,trim(entry_title),entry_body,now(),'draft',
   case when restricted then 'author_only' else 'care_team' end,request_id) returning * into record;
 else
  select * into record from clinical.records where id=record_id and athlete_id=target and author_id=actor for update;
  if record is null then
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
 values(actor,'clinical_record','clinical_record.save','denied',clinical.audit_channel(),clinical.audit_method());
 return jsonb_build_object('error','denied'); end if;
  if record.status='finalized' and finalize and record.version=expected_version+1 then
   return jsonb_build_object('id',record.id,'version',record.version);
  end if;
  if record.status<>'draft' or expected_version is null or record.version<>expected_version then
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,origin_channel,execution_method)
 values(actor,'clinical_record',record.id,target,'clinical_record.save','failed',clinical.audit_channel(),clinical.audit_method());
 return jsonb_build_object('error','conflict'); end if;
  if not finalize and (length(trim(entry_title)) not between 1 and 160 or length(trim(entry_body)) not between 1 and 20000) then raise invalid_parameter_value; end if;
  insert into clinical.record_revisions(record_id,actor_id,version,title,body)
  values(record.id,actor,record.version,record.title,record.body);
  update clinical.records r set
   title=case when finalize then r.title else trim(entry_title) end,
   body=case when finalize then r.body else entry_body end,
   visibility=case
    when r.visibility='author_only' then 'author_only'
    when finalize then r.visibility
    when restricted then 'author_only'
    else 'care_team' end,
   status=case when finalize then 'finalized' else 'draft' end,
   version=r.version+1 where r.id=record.id returning * into record;
  if finalize then update clinical.encounters set status='closed' where id=record.encounter_id; end if;
 end if;
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,approved_by_user_id,origin_channel,execution_method)
 values(actor,'clinical_record',record.id,target,case when finalize then 'clinical_record.finalized' else 'clinical_record.draft_saved' end,'success',case when finalize then actor end,clinical.audit_channel(),clinical.audit_method());
 return jsonb_build_object('id',record.id,'version',record.version);
end $$;

create function public.agent_clinical_draft_prepare(target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  access clinical.athlete_access;
  athlete_name text;
  professional_name text;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'agent_tool', true);
  select * into access from clinical.athlete_access where athlete_id = target and professional_id = actor;
  select coalesce(social_name, full_name) into athlete_name from clinical.athletes where id = target;
  select display_name into professional_name from public.profiles where id = actor;
  if access is null or not access.can_read_records or not access.can_write or athlete_name is null then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', target, 'clinical_draft.prepared', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'clinical_record', target, 'clinical_draft.prepared', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('ok', true, 'athleteName', athlete_name, 'professionalName', professional_name);
end $$;

create function public.clinical_draft_approve(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  access clinical.athlete_access;
  wanted text;
  approval_row clinical.evolution_approvals;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if request_id is null or restricted is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'human_ui', true);
  select * into access from clinical.athlete_access where athlete_id = target and professional_id = actor;
  if access is null or not access.can_read_records or not access.can_write then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', target, 'clinical_draft.confirmed', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  if not clinical.draft_content_ok(entry_title, entry_body, occurred_on) then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', target, 'clinical_draft.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  wanted := clinical.draft_hash(target, entry_title, entry_body, occurred_on, restricted);
  select * into approval_row from clinical.evolution_approvals approval
  where approval.actor_id = actor and approval.request_id = clinical_draft_approve.request_id
  for update;
  if approval_row.id is not null and (approval_row.content_hash is distinct from wanted or approval_row.athlete_id is distinct from target) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', approval_row.id, target, 'clinical_draft.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'reused');
  end if;
  if approval_row.id is null then
    insert into clinical.evolution_approvals(actor_id, athlete_id, request_id, content_hash)
    values (actor, target, request_id, wanted)
    returning * into approval_row;
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, approved_by_user_id, origin_channel, execution_method)
    values (actor, 'clinical_record', approval_row.id, target, 'clinical_draft.confirmed', 'success', actor, clinical.audit_channel(), clinical.audit_method());
  end if;
  return jsonb_build_object('ok', true, 'approvalId', approval_row.id, 'recordId', approval_row.record_id);
end $$;

create function public.clinical_draft_commit(approval_id uuid, target uuid, entry_title text, entry_body text, occurred_on date, restricted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  approval_row clinical.evolution_approvals;
  existing clinical.records;
  wanted text;
  saved jsonb;
  saved_id uuid;
  visibility_name text;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if approval_id is null or restricted is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'human_ui', true);
  select * into approval_row from clinical.evolution_approvals
  where id = approval_id and actor_id = actor
  for update;
  if approval_row.id is null then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', 'clinical_draft.commit', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not clinical.draft_content_ok(entry_title, entry_body, occurred_on) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', approval_row.id, approval_row.athlete_id, 'clinical_draft.commit', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  wanted := clinical.draft_hash(target, entry_title, entry_body, occurred_on, restricted);
  if approval_row.content_hash is distinct from wanted or approval_row.athlete_id is distinct from target then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', approval_row.id, approval_row.athlete_id, 'clinical_draft.commit', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'reused');
  end if;
  if approval_row.record_id is not null then
    return jsonb_build_object('ok', true, 'id', approval_row.record_id);
  end if;
  visibility_name := case when restricted then 'author_only' else 'care_team' end;
  select record.* into existing
  from clinical.records record
  join clinical.encounters encounter on encounter.id = record.encounter_id
  where encounter.id = approval_row.request_id and record.author_id = actor;
  if existing.id is not null then
    if existing.athlete_id = target
      and existing.title = pg_catalog.btrim(entry_title)
      and existing.body = entry_body
      and existing.status = 'draft'
      and existing.visibility = visibility_name then
      update clinical.evolution_approvals set record_id = existing.id where id = approval_row.id;
      return jsonb_build_object('ok', true, 'id', existing.id);
    end if;
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', approval_row.id, target, 'clinical_draft.commit', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'reused');
  end if;
  begin
    saved := public.clinical_save(target, approval_row.request_id, null, null, entry_title, entry_body, restricted, false);
  exception
    when invalid_parameter_value then
      insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
      values (actor, 'clinical_record', approval_row.id, target, 'clinical_draft.commit', 'failed', clinical.audit_channel(), clinical.audit_method());
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  if saved is null or saved ? 'error' then
    return jsonb_build_object('ok', false, 'error', coalesce(saved->>'error', 'invalid'));
  end if;
  saved_id := (saved->>'id')::uuid;
  update clinical.evolution_approvals set record_id = saved_id where id = approval_row.id;
  if occurred_on is not null then
    update clinical.records
    set occurred_at = ((occurred_on::timestamp + time '12:00') at time zone 'America/Sao_Paulo')
    where id = saved_id and author_id = actor and status = 'draft';
  end if;
  return jsonb_build_object('ok', true, 'id', saved_id);
end $$;

revoke all on function
  public.agent_clinical_draft_prepare(uuid),
  public.clinical_draft_approve(uuid, uuid, text, text, date, boolean),
  public.clinical_draft_commit(uuid, uuid, text, text, date, boolean)
from public, anon, authenticated;

grant execute on function
  public.agent_clinical_draft_prepare(uuid),
  public.clinical_draft_approve(uuid, uuid, text, text, date, boolean),
  public.clinical_draft_commit(uuid, uuid, text, text, date, boolean)
to authenticated;

alter table clinical.conversation_messages
  add column draft jsonb;

alter table clinical.conversation_messages
  add constraint conversation_messages_draft_no_body check (
    draft is null or (
      jsonb_typeof(draft) = 'object'
      and not (draft ? 'body')
      and not (draft ? 'missing')
      and not (draft ? 'error')
    )
  );

create function clinical.conversation_draft(value jsonb)
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
begin
  if jsonb_typeof(value) is distinct from 'object' then return null; end if;
  if value->>'state' is distinct from 'saved' then return null; end if;
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
  if not exists (
    select 1 from clinical.records record
    where record.id = record_key::uuid and record.athlete_id = athlete_key::uuid and record.author_id = auth.uid() and record.status = 'draft'
  ) then return null; end if;
  return jsonb_build_object(
    'state', 'saved',
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

revoke all on function clinical.conversation_draft(jsonb) from public, anon, authenticated;

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
    'draft', message.draft
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
    if trim(message_text) = '' and cards = '[]'::jsonb and navigation is null and draft is null then continue; end if;
    seen := array_append(seen, message_id);
    clean := clean || jsonb_build_array(jsonb_build_object(
      'id', message_id,
      'role', message_role,
      'text', message_text,
      'athletes', cards,
      'navigation', navigation,
      'search', search
    ) || case when draft is null then '{}'::jsonb else jsonb_build_object('draft', draft) end);
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
  insert into clinical.conversation_messages(session_id, position, client_id, role, text, cards, navigation, search, draft)
  select session_row.id, ordinality - 1, entry->>'id', entry->>'role', entry->>'text',
    entry->'athletes', entry->'navigation', entry->'search', entry->'draft'
  from jsonb_array_elements(clean) with ordinality as item(entry, ordinality);

  update clinical.conversation_sessions
  set athlete_id = context_athlete, last_activity_at = clock_timestamp()
  where id = session_row.id
  returning * into session_row;
  return clinical.conversation_payload(session_row);
end $$;
