-- A spoken or typed confirmation can save a draft only when the database
-- accepts the professional's own message. The model has no save flag.
-- Finalizing, signing and prescriptions stay on the explicit card action.
-- Context selection still goes through conversation_set_context.

create table if not exists clinical.draft_proposals (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references clinical.conversation_sessions(id) on delete cascade,
  athlete_id uuid not null references clinical.athletes(id) on delete cascade,
  title text not null,
  body text not null,
  occurred_on date,
  restricted boolean not null,
  content_hash text not null,
  version integer not null default 1 check (version > 0),
  record_id uuid references clinical.records(id) on delete set null,
  discarded_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

alter table clinical.draft_proposals enable row level security;
revoke all on clinical.draft_proposals from public, anon, authenticated;

create or replace function clinical.audit_method() returns text
language sql stable set search_path = '' as $$
  select case pg_catalog.current_setting('cbb.execution_method', true)
    when 'agent_tool' then 'agent_tool'
    when 'human_voice' then 'human_voice'
    when 'human_message' then 'human_message'
    else 'human_ui' end
$$;

create or replace function clinical.draft_utterance_decision(utterance text)
returns text
language plpgsql immutable set search_path = '' as $$
declare
  plain text;
begin
  if utterance is null or pg_catalog.btrim(utterance) = '' or pg_catalog.length(utterance) > 240 then return 'reject'; end if;
  if pg_catalog.strpos(utterance, chr(63)) > 0 then return 'reject'; end if;
  plain := pg_catalog.translate(pg_catalog.lower(utterance), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  if plain ~ '(talvez|acho que|sera que|nao sei|nao salv|nao grav|nao confirm|cancele|cancelar|descarte|descartar|finaliz|assin|prescri)' then
    return 'reject';
  end if;
  if plain ~ '(pode|confirma|confirme|confirmar).{0,80}(salvar|salve|gravar|grave)' then return 'save'; end if;
  if plain ~ '(salvar|salve|gravar|grave) (o |a |esse |esta |este )?rascunho' then return 'save'; end if;
  if plain ~ 'confirm(ar|e|a) e salv' then return 'save'; end if;
  return 'reject';
end $$;

revoke all on function clinical.draft_utterance_decision(text) from public, anon, authenticated;

create or replace function public.clinical_draft_proposal_register(
  target uuid,
  request_id uuid,
  entry_title text,
  entry_body text,
  occurred_on date,
  restricted boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  access clinical.athlete_access;
  session_row clinical.conversation_sessions;
  proposal clinical.draft_proposals;
  wanted text;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if request_id is null or restricted is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'agent_tool', true);
  select * into access from clinical.athlete_access where athlete_id = target and professional_id = actor;
  if access is null or not access.can_read_records or not access.can_write
    or not clinical.draft_content_ok(entry_title, entry_body, occurred_on) then
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  perform clinical.conversation_idle_stale(actor);
  select * into session_row from clinical.conversation_sessions
  where professional_id = actor and status = 'active';
  if session_row.id is null then
    insert into clinical.conversation_sessions(professional_id)
    values (actor)
    returning * into session_row;
    perform clinical.conversation_audit(actor, session_row.id, null, 'conversation.start', 'success');
  end if;
  wanted := clinical.draft_hash(target, entry_title, entry_body, occurred_on, restricted);
  select * into proposal from clinical.draft_proposals
  where clinical.draft_proposals.request_id = clinical_draft_proposal_register.request_id
    and actor_id = actor
  for update;
  if proposal.request_id is not null and proposal.record_id is not null then
    return jsonb_build_object('ok', true, 'sessionId', proposal.session_id, 'version', proposal.version, 'contentHash', proposal.content_hash);
  end if;
  if proposal.request_id is null then
    insert into clinical.draft_proposals(request_id, actor_id, session_id, athlete_id, title, body, occurred_on, restricted, content_hash)
    values (request_id, actor, session_row.id, target, btrim(entry_title), entry_body, occurred_on, restricted, wanted)
    returning * into proposal;
  elsif proposal.content_hash is distinct from wanted or proposal.athlete_id is distinct from target or proposal.session_id is distinct from session_row.id then
    update clinical.draft_proposals set
      session_id = session_row.id,
      athlete_id = target,
      title = btrim(entry_title),
      body = entry_body,
      occurred_on = clinical_draft_proposal_register.occurred_on,
      restricted = clinical_draft_proposal_register.restricted,
      content_hash = wanted,
      version = version + 1,
      discarded_at = null
    where clinical.draft_proposals.request_id = proposal.request_id
    returning * into proposal;
  end if;
  return jsonb_build_object('ok', true, 'sessionId', proposal.session_id, 'version', proposal.version, 'contentHash', proposal.content_hash);
end $$;

create or replace function public.clinical_draft_proposal_attach(request_id uuid, saved_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise insufficient_privilege; end if;
  if request_id is null or saved_id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update clinical.draft_proposals proposal
  set record_id = saved_id
  where proposal.request_id = clinical_draft_proposal_attach.request_id
    and proposal.actor_id = actor
    and proposal.record_id is null
    and exists (
      select 1 from clinical.records record
      where record.id = saved_id and record.author_id = actor and record.encounter_id = request_id
    );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.clinical_draft_proposal_discard(request_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise insufficient_privilege; end if;
  if request_id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update clinical.draft_proposals
  set discarded_at = pg_catalog.clock_timestamp()
  where clinical.draft_proposals.request_id = clinical_draft_proposal_discard.request_id
    and actor_id = actor
    and record_id is null
    and discarded_at is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.clinical_draft_confirm_utterance(
  utterance text,
  request_id uuid,
  entry_title text,
  entry_body text,
  occurred_on date,
  restricted boolean,
  input_mode text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  access clinical.athlete_access;
  session_row clinical.conversation_sessions;
  proposal clinical.draft_proposals;
  approval_row clinical.evolution_approvals;
  pending_count integer;
  presented text;
  saved jsonb;
  saved_id uuid;
  method text;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if clinical.draft_utterance_decision(utterance) is distinct from 'save' then
    return jsonb_build_object('ok', false, 'error', 'ignored');
  end if;
  if input_mode is distinct from 'voice' and input_mode is distinct from 'text' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  method := case when input_mode = 'voice' then 'human_voice' else 'human_message' end;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', method, true);
  perform clinical.conversation_idle_stale(actor);
  select * into session_row from clinical.conversation_sessions
  where professional_id = actor and status = 'active';
  if session_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if request_id is not null then
    select * into proposal from clinical.draft_proposals
    where clinical.draft_proposals.request_id = clinical_draft_confirm_utterance.request_id
      and actor_id = actor
      and session_id = session_row.id
      and discarded_at is null
    for update;
    if proposal.record_id is not null then
      return jsonb_build_object('ok', true, 'id', proposal.record_id, 'athleteId', proposal.athlete_id);
    end if;
  end if;
  select count(*) into pending_count from clinical.draft_proposals
  where actor_id = actor and session_id = session_row.id and record_id is null and discarded_at is null;
  if pending_count is distinct from 1 or request_id is null or proposal.request_id is null then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', null, 'clinical_draft.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'ambiguous');
  end if;
  presented := clinical.draft_hash(proposal.athlete_id, entry_title, entry_body, occurred_on, restricted);
  if restricted is null or presented is distinct from proposal.content_hash then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', proposal.request_id, proposal.athlete_id, 'clinical_draft.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'modified');
  end if;
  select * into access from clinical.athlete_access
  where athlete_id = proposal.athlete_id and professional_id = actor;
  if access is null or not access.can_read_records or not access.can_write then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', proposal.athlete_id, 'clinical_draft.confirmed', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  select * into approval_row from clinical.evolution_approvals
  where actor_id = actor and clinical.evolution_approvals.request_id = proposal.request_id
  for update;
  if approval_row.id is not null and (approval_row.content_hash is distinct from proposal.content_hash or approval_row.athlete_id is distinct from proposal.athlete_id) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_record', approval_row.id, proposal.athlete_id, 'clinical_draft.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'reused');
  end if;
  if approval_row.id is null then
    insert into clinical.evolution_approvals(actor_id, athlete_id, request_id, content_hash)
    values (actor, proposal.athlete_id, proposal.request_id, proposal.content_hash)
    returning * into approval_row;
  end if;
  if approval_row.record_id is not null then
    update clinical.draft_proposals set record_id = approval_row.record_id where clinical.draft_proposals.request_id = proposal.request_id;
    return jsonb_build_object('ok', true, 'id', approval_row.record_id, 'athleteId', proposal.athlete_id);
  end if;
  begin
    saved := public.clinical_save(proposal.athlete_id, proposal.request_id, null, null, proposal.title, proposal.body, proposal.restricted, false);
  exception
    when invalid_parameter_value then
      insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
      values (actor, 'clinical_record', proposal.request_id, proposal.athlete_id, 'clinical_draft.commit', 'failed', clinical.audit_channel(), clinical.audit_method());
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  if saved is null or saved ? 'error' then
    return jsonb_build_object('ok', false, 'error', coalesce(saved->>'error', 'invalid'));
  end if;
  saved_id := (saved->>'id')::uuid;
  update clinical.evolution_approvals set record_id = saved_id where id = approval_row.id;
  update clinical.draft_proposals set record_id = saved_id where clinical.draft_proposals.request_id = proposal.request_id;
  if proposal.occurred_on is not null then
    update clinical.records
    set occurred_at = ((proposal.occurred_on::timestamp + time '12:00') at time zone 'America/Sao_Paulo')
    where id = saved_id and author_id = actor and status = 'draft';
  end if;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, approved_by_user_id, origin_channel, execution_method)
  values (actor, 'clinical_record', approval_row.id, proposal.athlete_id, 'clinical_draft.confirmed', 'success', actor, clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('ok', true, 'id', saved_id, 'athleteId', proposal.athlete_id);
end $$;

revoke all on function
  public.clinical_draft_proposal_register(uuid, uuid, text, text, date, boolean),
  public.clinical_draft_proposal_attach(uuid, uuid),
  public.clinical_draft_proposal_discard(uuid),
  public.clinical_draft_confirm_utterance(text, uuid, text, text, date, boolean, text)
from public, anon, authenticated;

grant execute on function
  public.clinical_draft_proposal_register(uuid, uuid, text, text, date, boolean),
  public.clinical_draft_proposal_attach(uuid, uuid),
  public.clinical_draft_proposal_discard(uuid),
  public.clinical_draft_confirm_utterance(text, uuid, text, text, date, boolean, text)
to authenticated;
