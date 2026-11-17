-- Assisted prescription and surgical-order drafts.
-- The proposal is an approval snapshot. The document is created only by document_save
-- as an unsigned draft. This does not emit, sign, or mark a document ready for review.

create table clinical.document_proposals (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references clinical.conversation_sessions (id) on delete cascade,
  athlete_id uuid not null references clinical.athletes (id) on delete cascade,
  document_type text not null check (document_type in ('prescription', 'surgical_order')),
  content jsonb not null,
  content_hash text not null,
  version integer not null default 1 check (version >= 1),
  document_id uuid references clinical.documents (id) on delete set null,
  athlete_name text not null,
  professional_name text not null,
  credential_label text,
  discarded_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index document_proposals_open_idx
  on clinical.document_proposals (actor_id, session_id)
  where document_id is null and discarded_at is null;

alter table clinical.document_proposals enable row level security;
revoke all on clinical.document_proposals from public, anon, authenticated;

create function clinical.document_hash(kind text, payload jsonb) returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.md5(kind || ':' || payload::text)
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
  if plain ~ '(talvez|acho que|sera que|nao sei|nao salv|nao grav|nao confirm|cancele|cancelar|descarte|descartar|finaliz|assin|prescri|cirurg)' then
    return 'reject';
  end if;
  if plain ~ '(pode|confirma|confirme|confirmar).{0,80}(salvar|salve|gravar|grave)' then return 'save'; end if;
  if plain ~ '(salvar|salve|gravar|grave) (o |a |esse |esta |este )?rascunho' then return 'save'; end if;
  if plain ~ 'confirm(ar|e|a) e salv' then return 'save'; end if;
  return 'reject';
end $$;

create function clinical.document_utterance_decision(utterance text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  plain text;
begin
  if utterance is null or pg_catalog.btrim(utterance) = '' or pg_catalog.length(utterance) > 240 then return 'reject'; end if;
  if pg_catalog.strpos(utterance, chr(63)) > 0 then return 'reject'; end if;
  plain := pg_catalog.translate(pg_catalog.lower(utterance), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  if plain ~ '(talvez|acho que|sera que|nao sei|nao salv|nao grav|nao confirm|cancele|cancelar|descarte|descartar|finaliz|assin|emitir|emita|emissao|sncr)' then
    return 'reject';
  end if;
  if plain ~ '(pode|confirma|confirme|confirmar).{0,80}(salvar|salve|gravar|grave)' then return 'save'; end if;
  if plain ~ '(salvar|salve|gravar|grave) (o |a |esse |esta |este )?rascunho' then return 'save'; end if;
  if plain ~ 'confirm(ar|e|a) e salv' then return 'save'; end if;
  return 'reject';
end $$;

create function clinical.document_utterance_kind(utterance text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  plain text;
  named_prescription boolean;
  named_surgical boolean;
begin
  plain := pg_catalog.translate(pg_catalog.lower(coalesce(utterance, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  named_prescription := plain ~ 'prescri';
  named_surgical := plain ~ 'cirurg';
  if named_prescription and named_surgical then return 'both'; end if;
  if named_prescription then return 'prescription'; end if;
  if named_surgical then return 'surgical_order'; end if;
  return 'any';
end $$;

create function clinical.open_proposal_count(actor uuid, session_key uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select (
    select count(*)::integer from clinical.draft_proposals
    where actor_id = open_proposal_count.actor and session_id = open_proposal_count.session_key
      and record_id is null and discarded_at is null
  ) + (
    select count(*)::integer from clinical.document_proposals
    where actor_id = open_proposal_count.actor and session_id = open_proposal_count.session_key
      and document_id is null and discarded_at is null
  )
$$;

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
  select clinical.open_proposal_count(actor, session_row.id) into pending_count;
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

create function clinical.document_store(request_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  proposal clinical.document_proposals;
  saved jsonb;
  saved_id uuid;
begin
  select * into proposal from clinical.document_proposals
  where request_id = request_key and actor_id = actor
  for update;
  if proposal.request_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if proposal.document_id is not null then
    return jsonb_build_object('ok', true, 'id', proposal.document_id, 'athleteId', proposal.athlete_id, 'requestId', proposal.request_id);
  end if;
  if not clinical.can_author_documents(actor, proposal.athlete_id) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', proposal.request_id, proposal.athlete_id, 'document.confirmed', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  saved := public.document_save(proposal.athlete_id, proposal.request_id, 0, proposal.document_type, proposal.content, 'save');
  if saved is null or (saved ? 'error' and saved->>'error' is distinct from 'conflict') or coalesce(saved->>'status', 'draft') is distinct from 'draft' then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', proposal.request_id, proposal.athlete_id, 'document.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', coalesce(saved->>'error', 'invalid'));
  end if;
  if saved ? 'id' then
    saved_id := (saved->>'id')::uuid;
  else
    select id into saved_id from clinical.documents
    where id = proposal.request_id and author_id = actor and athlete_id = proposal.athlete_id
      and document_type = proposal.document_type and content = proposal.content and status = 'draft';
  end if;
  if saved_id is null then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', proposal.request_id, proposal.athlete_id, 'document.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update clinical.document_proposals set document_id = saved_id where request_id = proposal.request_id;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, approved_by_user_id, origin_channel, execution_method)
  values (actor, 'clinical_document', saved_id, proposal.athlete_id, 'document.confirmed', 'success', actor, clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('ok', true, 'id', saved_id, 'athleteId', proposal.athlete_id, 'requestId', proposal.request_id);
end $$;

create function public.clinical_document_proposal_register(target uuid, request_id uuid, kind text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  session_row clinical.conversation_sessions;
  proposal clinical.document_proposals;
  canonical jsonb;
  wanted text;
  athlete_name text;
  professional_name text;
  credential text;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if request_id is null or kind not in ('prescription', 'surgical_order') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'agent_tool', true);
  select coalesce(social_name, full_name) into athlete_name from clinical.athletes where id = target;
  select display_name into professional_name from public.profiles where id = actor;
  select credential_label into credential from clinical.medical_authors where professional_id = actor and enabled;
  if not clinical.can_author_documents(actor, target) or athlete_name is null or professional_name is null then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', target, 'document.proposal_prepared', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  canonical := clinical.canonical_document(kind, payload);
  if canonical is null then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', target, 'document.proposal_prepared', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform clinical.conversation_idle_stale(actor);
  select * into session_row from clinical.conversation_sessions
  where professional_id = actor and status = 'active';
  if session_row.id is null then
    insert into clinical.conversation_sessions(professional_id) values (actor) returning * into session_row;
    perform clinical.conversation_audit(actor, session_row.id, null, 'conversation.start', 'success');
  end if;
  wanted := clinical.document_hash(kind, canonical);
  select * into proposal from clinical.document_proposals
  where clinical.document_proposals.request_id = clinical_document_proposal_register.request_id
    and actor_id = actor
  for update;
  if proposal.request_id is not null and proposal.document_id is not null then
    return jsonb_build_object(
      'ok', true, 'sessionId', proposal.session_id, 'version', proposal.version, 'contentHash', proposal.content_hash,
      'athleteName', proposal.athlete_name, 'professionalName', proposal.professional_name, 'credentialLabel', proposal.credential_label
    );
  end if;
  if proposal.request_id is null then
    insert into clinical.document_proposals(
      request_id, actor_id, session_id, athlete_id, document_type, content, content_hash, athlete_name, professional_name, credential_label
    ) values (
      request_id, actor, session_row.id, target, kind, canonical, wanted, athlete_name, professional_name, credential
    ) returning * into proposal;
  elsif proposal.content_hash is distinct from wanted or proposal.athlete_id is distinct from target
    or proposal.document_type is distinct from kind or proposal.session_id is distinct from session_row.id then
    update clinical.document_proposals set
      session_id = session_row.id,
      athlete_id = target,
      document_type = kind,
      content = canonical,
      content_hash = wanted,
      version = version + 1,
      athlete_name = athlete_name,
      professional_name = professional_name,
      credential_label = credential,
      discarded_at = null
    where clinical.document_proposals.request_id = proposal.request_id
    returning * into proposal;
  end if;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'clinical_document', proposal.request_id, target, 'document.proposal_prepared', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object(
    'ok', true, 'sessionId', proposal.session_id, 'version', proposal.version, 'contentHash', proposal.content_hash,
    'athleteName', proposal.athlete_name, 'professionalName', proposal.professional_name, 'credentialLabel', proposal.credential_label
  );
end $$;

create function public.clinical_document_proposal_discard(request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise insufficient_privilege; end if;
  if request_id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update clinical.document_proposals
  set discarded_at = pg_catalog.clock_timestamp()
  where clinical.document_proposals.request_id = clinical_document_proposal_discard.request_id
    and actor_id = actor and document_id is null and discarded_at is null;
  return jsonb_build_object('ok', true);
end $$;

create function public.clinical_document_confirm_card(request_id uuid, kind text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  proposal clinical.document_proposals;
  canonical jsonb;
  wanted text;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if request_id is null or kind not in ('prescription', 'surgical_order') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'human_ui', true);
  select * into proposal from clinical.document_proposals
  where clinical.document_proposals.request_id = clinical_document_confirm_card.request_id
    and actor_id = actor and discarded_at is null
  for update;
  if proposal.request_id is null or proposal.document_type is distinct from kind then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  canonical := clinical.canonical_document(kind, payload);
  if canonical is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  wanted := clinical.document_hash(kind, canonical);
  if proposal.document_id is not null then
    if proposal.content_hash is distinct from wanted then
      return jsonb_build_object('ok', false, 'error', 'reused');
    end if;
    return jsonb_build_object('ok', true, 'id', proposal.document_id, 'athleteId', proposal.athlete_id, 'requestId', proposal.request_id);
  end if;
  if proposal.content_hash is distinct from wanted then
    update clinical.document_proposals set
      content = canonical,
      content_hash = wanted,
      version = version + 1
    where clinical.document_proposals.request_id = proposal.request_id;
  end if;
  return clinical.document_store(proposal.request_id);
end $$;

create function public.clinical_document_confirm_utterance(
  utterance text,
  request_id uuid,
  kind text,
  payload jsonb,
  input_mode text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  session_row clinical.conversation_sessions;
  proposal clinical.document_proposals;
  named text;
  pending_count integer;
  evolution_count integer;
  canonical jsonb;
  method text;
  locked boolean := false;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if clinical.document_utterance_decision(utterance) is distinct from 'save' then
    return jsonb_build_object('ok', false, 'error', 'ignored');
  end if;
  if input_mode is distinct from 'voice' and input_mode is distinct from 'text' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  named := clinical.document_utterance_kind(utterance);
  method := case when input_mode = 'voice' then 'human_voice' else 'human_message' end;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', method, true);
  perform clinical.conversation_idle_stale(actor);
  select * into session_row from clinical.conversation_sessions
  where professional_id = actor and status = 'active';
  if session_row.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if named = 'both' then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', null, 'document.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'ambiguous');
  end if;
  if request_id is not null then
    select * into proposal from clinical.document_proposals
    where clinical.document_proposals.request_id = clinical_document_confirm_utterance.request_id
      and actor_id = actor and session_id = session_row.id and discarded_at is null
    for update;
    if proposal.request_id is not null then locked := true; end if;
    if proposal.document_id is not null and (named = 'any' or named = proposal.document_type) then
      return jsonb_build_object('ok', true, 'id', proposal.document_id, 'athleteId', proposal.athlete_id, 'requestId', proposal.request_id);
    end if;
  end if;
  if named = 'any' then
    select count(*) into pending_count from clinical.document_proposals
    where actor_id = actor and session_id = session_row.id and document_id is null and discarded_at is null;
    select count(*) into evolution_count from clinical.draft_proposals
    where actor_id = actor and session_id = session_row.id and record_id is null and discarded_at is null;
    pending_count := pending_count + evolution_count;
  else
    select count(*) into pending_count from clinical.document_proposals
    where actor_id = actor and session_id = session_row.id and document_id is null and discarded_at is null
      and document_type = named;
  end if;
  if locked and named <> 'any' and proposal.document_type is distinct from named then
    locked := false;
  end if;
  if pending_count is distinct from 1 then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', null, 'document.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'ambiguous');
  end if;
  if not locked or proposal.document_id is not null then
    select * into proposal from clinical.document_proposals
    where actor_id = actor and session_id = session_row.id and document_id is null and discarded_at is null
      and (named = 'any' or document_type = named)
    for update;
  end if;
  if proposal.request_id is null then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', null, 'document.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'ambiguous');
  end if;
  if payload is not null and jsonb_typeof(payload) = 'object' then
    canonical := clinical.canonical_document(proposal.document_type, payload);
    if canonical is null or clinical.document_hash(proposal.document_type, canonical) is distinct from proposal.content_hash then
      insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
      values (actor, 'clinical_document', proposal.request_id, proposal.athlete_id, 'document.confirmed', 'failed', clinical.audit_channel(), clinical.audit_method());
      return jsonb_build_object('ok', false, 'error', case when canonical is null then 'invalid' else 'modified' end);
    end if;
  end if;
  return clinical.document_store(proposal.request_id);
end $$;

revoke all on function
  clinical.document_hash(text, jsonb),
  clinical.document_utterance_decision(text),
  clinical.document_utterance_kind(text),
  clinical.open_proposal_count(uuid, uuid),
  clinical.document_store(uuid)
from public, anon, authenticated;

revoke all on function
  public.clinical_document_proposal_register(uuid, uuid, text, jsonb),
  public.clinical_document_proposal_discard(uuid),
  public.clinical_document_confirm_card(uuid, text, jsonb),
  public.clinical_document_confirm_utterance(text, uuid, text, jsonb, text)
from public, anon, authenticated;

grant execute on function
  public.clinical_document_proposal_register(uuid, uuid, text, jsonb),
  public.clinical_document_proposal_discard(uuid),
  public.clinical_document_confirm_card(uuid, text, jsonb),
  public.clinical_document_confirm_utterance(text, uuid, text, jsonb, text)
to authenticated;

alter table clinical.conversation_messages
  add column document jsonb,
  add constraint conversation_messages_document_thin check (
    document is null or (
      jsonb_typeof(document) = 'object'
      and not (document ? 'content')
      and not (document ? 'items')
      and not (document ? 'notes')
      and not (document ? 'body')
      and not (document ? 'justification')
      and not (document ? 'indication')
    )
  );

create function clinical.conversation_document(value jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  request_key text;
  athlete_key text;
  document_key text;
  athlete_name text;
  professional_name text;
  entry_title text;
  entry_kind text;
begin
  if jsonb_typeof(value) is distinct from 'object' then return null; end if;
  if value->>'state' is distinct from 'saved' then return null; end if;
  if value ? 'content' or value ? 'items' or value ? 'notes' or value ? 'body' or value ? 'justification' or value ? 'indication' then
    return null;
  end if;
  request_key := value->>'requestId';
  athlete_key := value->>'athleteId';
  document_key := value->>'documentId';
  entry_kind := value->>'kind';
  if request_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if athlete_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if document_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if entry_kind not in ('prescription', 'surgical_order') then return null; end if;
  athlete_name := left(btrim(coalesce(value->>'athleteName', '')), 160);
  professional_name := left(btrim(coalesce(value->>'professionalName', '')), 160);
  entry_title := left(btrim(coalesce(value->>'title', '')), 160);
  if athlete_name = '' or professional_name = '' or entry_title = '' then return null; end if;
  if not exists (
    select 1 from clinical.documents document
    where document.id = document_key::uuid
      and document.athlete_id = athlete_key::uuid
      and document.author_id = auth.uid()
      and document.document_type = entry_kind
      and document.status in ('draft', 'ready_for_review')
  ) then return null; end if;
  return jsonb_build_object(
    'state', 'saved',
    'requestId', request_key,
    'athleteId', athlete_key,
    'documentId', document_key,
    'athleteName', athlete_name,
    'professionalName', professional_name,
    'kind', entry_kind,
    'title', entry_title
  );
end $$;

revoke all on function clinical.conversation_document(jsonb) from public, anon, authenticated;

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
    'document', message.document
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
    if trim(message_text) = '' and cards = '[]'::jsonb and navigation is null and draft is null and document is null then continue; end if;
    seen := array_append(seen, message_id);
    clean := clean || jsonb_build_array(jsonb_build_object(
      'id', message_id,
      'role', message_role,
      'text', message_text,
      'athletes', cards,
      'navigation', navigation,
      'search', search
    ) || case when draft is null then '{}'::jsonb else jsonb_build_object('draft', draft) end
      || case when document is null then '{}'::jsonb else jsonb_build_object('document', document) end);
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
  insert into clinical.conversation_messages(session_id, position, client_id, role, text, cards, navigation, search, draft, document)
  select session_row.id, ordinality - 1, entry->>'id', entry->>'role', entry->>'text',
    entry->'athletes', entry->'navigation', entry->'search', entry->'draft', entry->'document'
  from jsonb_array_elements(clean) with ordinality as item(entry, ordinality);

  update clinical.conversation_sessions
  set athlete_id = context_athlete, last_activity_at = clock_timestamp()
  where id = session_row.id
  returning * into session_row;
  return clinical.conversation_payload(session_row);
end $$;
