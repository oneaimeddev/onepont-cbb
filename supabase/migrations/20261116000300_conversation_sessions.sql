-- Conversation sessions for CBB Intelligence.
-- Messages keep the chat text and directory cards already shown to the professional.
-- Clinical record bodies are not stored here.

create table clinical.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid references clinical.athletes(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'idle', 'closed', 'archived')),
  started_at timestamptz not null default clock_timestamp(),
  last_activity_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz
);

create unique index conversation_sessions_one_active
  on clinical.conversation_sessions (professional_id)
  where status = 'active';

create index conversation_sessions_owner_idx
  on clinical.conversation_sessions (professional_id, last_activity_at desc);

create table clinical.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references clinical.conversation_sessions(id) on delete cascade,
  position integer not null check (position >= 0 and position < 40),
  client_id text not null check (char_length(client_id) between 1 and 80),
  role text not null check (role in ('user', 'assistant')),
  text text not null check (char_length(text) <= 4000),
  cards jsonb not null default '[]'::jsonb,
  navigation jsonb,
  search jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (session_id, position),
  unique (session_id, client_id)
);

create index conversation_messages_session_idx
  on clinical.conversation_messages (session_id, position);

alter table clinical.conversation_sessions enable row level security;
alter table clinical.conversation_messages enable row level security;
revoke all on clinical.conversation_sessions, clinical.conversation_messages from public, anon, authenticated;

create function clinical.conversation_audit(actor uuid, resource uuid, athlete uuid, operation_name text, result text)
returns void language sql security definer set search_path = '' as $$
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'conversation', resource, athlete, operation_name, result, 'ai_chat', 'human_ui')
$$;

create function clinical.conversation_idle_stale(actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare row record;
begin
  for row in
    update clinical.conversation_sessions
    set status = 'idle'
    where professional_id = actor
      and status = 'active'
      and last_activity_at <= clock_timestamp() - interval '24 hours'
    returning id, athlete_id
  loop
    perform clinical.conversation_audit(actor, row.id, row.athlete_id, 'conversation.idle', 'success');
  end loop;
end
$$;

create function clinical.conversation_close_active(actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare row record;
begin
  for row in
    update clinical.conversation_sessions
    set status = 'closed', closed_at = clock_timestamp()
    where professional_id = actor and status = 'active'
    returning id, athlete_id
  loop
    perform clinical.conversation_audit(actor, row.id, row.athlete_id, 'conversation.close', 'success');
  end loop;
end
$$;

create function clinical.conversation_cards(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := '[]'::jsonb;
  element jsonb;
  facts jsonb;
  fact text;
  seen text[] := '{}';
  athlete_name text;
  athlete_key text;
begin
  if jsonb_typeof(value) is distinct from 'array' then return '[]'::jsonb; end if;
  for element in select entry from jsonb_array_elements(value) as entry loop
    exit when jsonb_array_length(result) >= 100;
    if jsonb_typeof(element) is distinct from 'object' then continue; end if;
    athlete_key := element->>'id';
    if athlete_key is null or athlete_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
    if athlete_key = any (seen) then continue; end if;
    athlete_name := left(trim(coalesce(element->>'name', '')), 160);
    if athlete_name = '' then continue; end if;
    facts := '[]'::jsonb;
    if jsonb_typeof(element->'facts') = 'array' then
      for fact in select entry from jsonb_array_elements_text(element->'facts') as entry loop
        exit when jsonb_array_length(facts) >= 4;
        if trim(fact) <> '' then facts := facts || jsonb_build_array(left(trim(fact), 80)); end if;
      end loop;
    end if;
    seen := array_append(seen, athlete_key);
    result := result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', athlete_key,
      'name', athlete_name,
      'facts', facts,
      'category', nullif(left(trim(coalesce(element->>'category', '')), 80), ''),
      'division', nullif(left(trim(coalesce(element->>'division', '')), 80), ''),
      'club', nullif(left(trim(coalesce(element->>'club', '')), 120), '')
    )));
  end loop;
  return result;
end
$$;

create function clinical.conversation_navigation(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare athlete_key text; athlete_name text; href text;
begin
  if jsonb_typeof(value) is distinct from 'object' then return null; end if;
  athlete_key := value->>'id';
  athlete_name := left(trim(coalesce(value->>'name', '')), 160);
  href := '/atletas/' || athlete_key;
  if athlete_key is null or athlete_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if athlete_name = '' or value->>'href' is distinct from href then return null; end if;
  return jsonb_build_object('id', athlete_key, 'href', href, 'name', athlete_name);
end
$$;

create function clinical.conversation_search(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  total integer;
  page_number integer;
  page_size integer;
  filters jsonb := '{}'::jsonb;
  key text;
  item text;
  limits jsonb := '{"q":160,"category":80,"division":80,"modality":40,"club":120,"status":20}'::jsonb;
begin
  if jsonb_typeof(value) is distinct from 'object' or jsonb_typeof(value->'filters') is distinct from 'object' then return null; end if;
  if coalesce(value->>'total', '') !~ '^[0-9]+$' or coalesce(value->>'page', '') !~ '^[0-9]+$' or coalesce(value->>'pageSize', '') !~ '^[0-9]+$' then return null; end if;
  total := (value->>'total')::integer;
  page_number := (value->>'page')::integer;
  page_size := (value->>'pageSize')::integer;
  if total > 100000 or page_number < 1 or page_number > 40 or page_size < 1 or page_size > 25 then return null; end if;
  for key in select jsonb_object_keys(value->'filters') loop
    if not limits ? key then return null; end if;
    if jsonb_typeof(value->'filters'->key) is distinct from 'string' then return null; end if;
    item := left(trim(value->'filters'->>key), (limits->>key)::integer);
    if item = '' then continue; end if;
    if key = 'status' and item not in ('active', 'inactive') then return null; end if;
    filters := filters || jsonb_build_object(key, item);
  end loop;
  return jsonb_build_object('total', total, 'page', page_number, 'pageSize', page_size, 'filters', filters);
end
$$;

create function clinical.conversation_payload(session_row clinical.conversation_sessions) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare messages jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', message.client_id,
    'role', message.role,
    'text', message.text,
    'athletes', message.cards,
    'navigation', message.navigation,
    'search', message.search
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
end
$$;

revoke all on function clinical.conversation_audit(uuid, uuid, uuid, text, text),
  clinical.conversation_idle_stale(uuid), clinical.conversation_close_active(uuid),
  clinical.conversation_cards(jsonb), clinical.conversation_navigation(jsonb), clinical.conversation_search(jsonb),
  clinical.conversation_payload(clinical.conversation_sessions)
from public, anon, authenticated;

create function public.conversation_current() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare session_row clinical.conversation_sessions;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  perform clinical.conversation_idle_stale(actor);
  select * into session_row from clinical.conversation_sessions
  where professional_id = actor and status = 'active';
  if session_row.id is null then return jsonb_build_object('ok', true, 'session', null, 'messages', '[]'::jsonb); end if;
  return clinical.conversation_payload(session_row);
end
$$;

create function public.conversation_start() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare session_row clinical.conversation_sessions;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  perform clinical.conversation_close_active(actor);
  insert into clinical.conversation_sessions(professional_id)
  values (actor)
  returning * into session_row;
  perform clinical.conversation_audit(actor, session_row.id, null, 'conversation.start', 'success');
  return clinical.conversation_payload(session_row);
end
$$;

create function public.conversation_close() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  perform clinical.conversation_close_active(actor);
  return jsonb_build_object('ok', true, 'session', null, 'messages', '[]'::jsonb);
end
$$;

create function public.conversation_set_context(context_athlete uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare session_row clinical.conversation_sessions;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  perform clinical.conversation_idle_stale(actor);
  select * into session_row from clinical.conversation_sessions
  where professional_id = actor and status = 'active';
  if session_row.id is null then return jsonb_build_object('ok', true, 'session', null, 'messages', '[]'::jsonb); end if;
  if context_athlete is not null and not exists (
    select 1 from clinical.athlete_access where athlete_id = context_athlete and professional_id = actor
  ) then
    perform clinical.conversation_audit(actor, session_row.id, context_athlete, 'conversation.context', 'denied');
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  update clinical.conversation_sessions
  set athlete_id = context_athlete, last_activity_at = clock_timestamp()
  where id = session_row.id
  returning * into session_row;
  perform clinical.conversation_audit(actor, session_row.id, context_athlete, 'conversation.context', 'success');
  return clinical.conversation_payload(session_row);
end
$$;

create function public.conversation_save(target uuid, context_athlete uuid, transcript jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    if trim(message_text) = '' and cards = '[]'::jsonb and navigation is null then continue; end if;
    seen := array_append(seen, message_id);
    clean := clean || jsonb_build_array(jsonb_build_object(
      'id', message_id,
      'role', message_role,
      'text', message_text,
      'athletes', cards,
      'navigation', navigation,
      'search', search
    ));
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
  insert into clinical.conversation_messages(session_id, position, client_id, role, text, cards, navigation, search)
  select session_row.id, ordinality - 1, entry->>'id', entry->>'role', entry->>'text',
    entry->'athletes', entry->'navigation', entry->'search'
  from jsonb_array_elements(clean) with ordinality as item(entry, ordinality);

  update clinical.conversation_sessions
  set athlete_id = context_athlete, last_activity_at = clock_timestamp()
  where id = session_row.id
  returning * into session_row;
  return clinical.conversation_payload(session_row);
end
$$;

create function public.conversation_archive(target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare session_row clinical.conversation_sessions;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  select * into session_row from clinical.conversation_sessions
  where id = target and professional_id = actor;
  if session_row.id is null then
    perform clinical.conversation_audit(actor, target, null, 'conversation.archive', 'denied');
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  if session_row.status = 'archived' then return clinical.conversation_payload(session_row); end if;
  if session_row.status not in ('closed', 'idle') then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update clinical.conversation_sessions
  set status = 'archived'
  where id = session_row.id
  returning * into session_row;
  perform clinical.conversation_audit(actor, session_row.id, session_row.athlete_id, 'conversation.archive', 'success');
  return clinical.conversation_payload(session_row);
end
$$;

create function public.conversation_recent() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare rows jsonb;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  perform clinical.conversation_idle_stale(actor);
  select coalesce(jsonb_agg(item order by item->>'lastActivityAt' desc), '[]'::jsonb) into rows
  from (
    select jsonb_build_object(
      'id', session.id,
      'status', session.status,
      'athleteId', case when access.athlete_id is not null then session.athlete_id else null end,
      'athleteName', case when access.athlete_id is not null then coalesce(athlete.social_name, athlete.full_name) else null end,
      'startedAt', session.started_at,
      'lastActivityAt', session.last_activity_at,
      'messageCount', (select count(*) from clinical.conversation_messages message where message.session_id = session.id)
    ) as item
    from clinical.conversation_sessions session
    left join clinical.athlete_access access
      on access.athlete_id = session.athlete_id and access.professional_id = actor
    left join clinical.athletes athlete on athlete.id = access.athlete_id
    where session.professional_id = actor
    order by session.last_activity_at desc
    limit 20
  ) listed;
  return jsonb_build_object('ok', true, 'sessions', rows);
end
$$;

revoke all on function public.conversation_current(), public.conversation_start(), public.conversation_close(),
  public.conversation_set_context(uuid), public.conversation_save(uuid, uuid, jsonb),
  public.conversation_archive(uuid), public.conversation_recent()
from public, anon, authenticated;

grant execute on function public.conversation_current(), public.conversation_start(), public.conversation_close(),
  public.conversation_set_context(uuid), public.conversation_save(uuid, uuid, jsonb),
  public.conversation_archive(uuid), public.conversation_recent()
to authenticated;
