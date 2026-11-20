-- 007.10.6B.3 Corte A. Additive guards; no history deletion.
create table clinical.conversation_security_epochs(professional_id uuid primary key references public.profiles(id) on delete cascade,epoch bigint not null default 0);
alter table clinical.conversation_security_epochs enable row level security;
revoke all on clinical.conversation_security_epochs from public,anon,authenticated;
alter table clinical.conversation_sessions add column security_epoch bigint;
create function clinical.conversation_epoch(actor uuid) returns bigint language sql stable security definer set search_path='' as $$select coalesce((select epoch from clinical.conversation_security_epochs where professional_id=actor),0);$$;
create function clinical.bump_conversation_epoch(actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from public.profiles where id=actor) then insert into clinical.conversation_security_epochs values(actor,1) on conflict(professional_id) do update set epoch=clinical.conversation_security_epochs.epoch+1;end if;end $$;
create function clinical.conversation_permission_change() returns trigger language plpgsql security definer set search_path='' as $$
declare x record;begin
 if tg_table_name='athlete_access' then
  if tg_op='DELETE' then perform clinical.bump_conversation_epoch(old.professional_id);
  elsif old.can_read_records and not new.can_read_records or old.can_edit and not new.can_edit then perform clinical.bump_conversation_epoch(old.professional_id);end if;
 elsif tg_table_name='medical_authors' then
  if tg_op='DELETE' then perform clinical.bump_conversation_epoch(old.professional_id);
  elsif old.enabled and not new.enabled then perform clinical.bump_conversation_epoch(old.professional_id);end if;
 elsif old.visibility='care_team' and new.visibility='author_only' or old.author_id<>new.author_id then
  for x in select professional_id from clinical.athlete_access where athlete_id=old.athlete_id and can_read_records loop perform clinical.bump_conversation_epoch(x.professional_id);end loop;
 end if;return null;end $$;
create trigger conversation_access_revocation after update or delete on clinical.athlete_access for each row execute function clinical.conversation_permission_change();
create trigger conversation_medical_revocation after update or delete on clinical.medical_authors for each row execute function clinical.conversation_permission_change();
create trigger conversation_record_restriction after update of visibility,author_id on clinical.records for each row execute function clinical.conversation_permission_change();
create function clinical.initialize_conversation_epoch() returns trigger language plpgsql security definer set search_path='' as $$begin new.security_epoch:=clinical.conversation_epoch(new.professional_id);return new;end $$;
create trigger conversation_initial_security before insert on clinical.conversation_sessions for each row execute function clinical.initialize_conversation_epoch();
-- Only empty legacy sessions can safely receive the current authorization version.
update clinical.conversation_sessions s set security_epoch=clinical.conversation_epoch(s.professional_id) where not exists(select 1 from clinical.conversation_messages m where m.session_id=s.id);
create function clinical.conversation_readable(s clinical.conversation_sessions) returns boolean language sql stable security definer set search_path='' as $$
 select s.professional_id=auth.uid() and s.security_epoch is not null and s.security_epoch=clinical.conversation_epoch(auth.uid()) and (s.athlete_id is null or exists(select 1 from clinical.athlete_access where athlete_id=s.athlete_id and professional_id=auth.uid() and can_read_records));$$;
create function clinical.chat_proposal_guard(request uuid,document_proposal boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();sid uuid;aid uuid;s clinical.conversation_sessions;a clinical.athlete_access;begin
 if actor is null then return false;end if;perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if document_proposal then select session_id,athlete_id into sid,aid from clinical.document_proposals where request_id=request and actor_id=actor;
 else select session_id,athlete_id into sid,aid from clinical.draft_proposals where request_id=request and actor_id=actor;end if;
 -- Preserve legacy manual approvals, which have no conversational proposal; original clinical checks still apply.
 if sid is null then return not document_proposal;end if;
 select * into s from clinical.conversation_sessions where id=sid and professional_id=actor for update;
 select * into a from clinical.athlete_access where athlete_id=aid and professional_id=actor for share;
 if s.status='active' and clinical.conversation_readable(s) and a.can_read_records and (case when document_proposal then clinical.can_author_documents(actor,aid) else a.can_write end) then return true;end if;
 perform clinical.conversation_audit(actor,sid,null,'conversation.mutation','denied');return false;
end $$;

alter function public.clinical_draft_approve(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) rename to clinical_draft_approve_before_b3;
revoke all on function public.clinical_draft_approve_before_b3(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) from public,anon,authenticated;
create function public.clinical_draft_approve(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
if not clinical.chat_proposal_guard(request_id) then return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_draft_approve_before_b3(target,request_id,entry_title,entry_body,occurred_on,restricted);

return result;end $$;
revoke all on function public.clinical_draft_approve(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) from public,anon,authenticated;grant execute on function public.clinical_draft_approve(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) to authenticated;

alter function public.clinical_draft_commit(approval_id uuid, target uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) rename to clinical_draft_commit_before_b3;
revoke all on function public.clinical_draft_commit_before_b3(approval_id uuid, target uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) from public,anon,authenticated;
create function public.clinical_draft_commit(approval_id uuid, target uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
select request_id into req from clinical.evolution_approvals where id=approval_id and actor_id=auth.uid();if not clinical.chat_proposal_guard(req) then return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_draft_commit_before_b3(approval_id,target,entry_title,entry_body,occurred_on,restricted);
if result->>'ok'='true' then update clinical.draft_proposals set record_id=(result->>'id')::uuid where request_id=req and actor_id=auth.uid();end if;
return result;end $$;
revoke all on function public.clinical_draft_commit(approval_id uuid, target uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) from public,anon,authenticated;grant execute on function public.clinical_draft_commit(approval_id uuid, target uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) to authenticated;

alter function public.clinical_draft_confirm_utterance(utterance text, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean, input_mode text) rename to clinical_draft_confirm_utterance_before_b3;
revoke all on function public.clinical_draft_confirm_utterance_before_b3(utterance text, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean, input_mode text) from public,anon,authenticated;
create function public.clinical_draft_confirm_utterance(utterance text, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean, input_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
if not clinical.chat_proposal_guard(request_id) then return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_draft_confirm_utterance_before_b3(utterance,request_id,entry_title,entry_body,occurred_on,restricted,input_mode);

return result;end $$;
revoke all on function public.clinical_draft_confirm_utterance(utterance text, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean, input_mode text) from public,anon,authenticated;grant execute on function public.clinical_draft_confirm_utterance(utterance text, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean, input_mode text) to authenticated;

alter function public.clinical_draft_finalize(target uuid, record_id uuid) rename to clinical_draft_finalize_before_b3;
revoke all on function public.clinical_draft_finalize_before_b3(target uuid, record_id uuid) from public,anon,authenticated;
create function public.clinical_draft_finalize(target uuid, record_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
select request_id into req from clinical.draft_proposals where record_id=clinical_draft_finalize.record_id and actor_id=auth.uid();if not clinical.chat_proposal_guard(req) then return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_draft_finalize_before_b3(target,record_id);

return result;end $$;
revoke all on function public.clinical_draft_finalize(target uuid, record_id uuid) from public,anon,authenticated;grant execute on function public.clinical_draft_finalize(target uuid, record_id uuid) to authenticated;

alter function public.clinical_document_confirm_card(request_id uuid, kind text, payload jsonb) rename to clinical_document_confirm_card_before_b3;
revoke all on function public.clinical_document_confirm_card_before_b3(request_id uuid, kind text, payload jsonb) from public,anon,authenticated;
create function public.clinical_document_confirm_card(request_id uuid, kind text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
if not clinical.chat_proposal_guard(request_id,true) then return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_document_confirm_card_before_b3(request_id,kind,payload);

return result;end $$;
revoke all on function public.clinical_document_confirm_card(request_id uuid, kind text, payload jsonb) from public,anon,authenticated;grant execute on function public.clinical_document_confirm_card(request_id uuid, kind text, payload jsonb) to authenticated;

alter function public.clinical_document_confirm_utterance(utterance text, request_id uuid, kind text, payload jsonb, input_mode text) rename to clinical_document_confirm_utterance_before_b3;
revoke all on function public.clinical_document_confirm_utterance_before_b3(utterance text, request_id uuid, kind text, payload jsonb, input_mode text) from public,anon,authenticated;
create function public.clinical_document_confirm_utterance(utterance text, request_id uuid, kind text, payload jsonb, input_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));select * into s from clinical.conversation_sessions where professional_id=auth.uid() and status='active' for update;if s.id is null or not clinical.conversation_readable(s) then return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_document_confirm_utterance_before_b3(utterance,request_id,kind,payload,input_mode);

return result;end $$;
revoke all on function public.clinical_document_confirm_utterance(utterance text, request_id uuid, kind text, payload jsonb, input_mode text) from public,anon,authenticated;grant execute on function public.clinical_document_confirm_utterance(utterance text, request_id uuid, kind text, payload jsonb, input_mode text) to authenticated;

create or replace function public.clinical_draft_proposal_attach(request_id uuid,saved_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p clinical.draft_proposals;begin
 if actor is null then raise insufficient_privilege;end if;
 if not clinical.chat_proposal_guard(request_id) then return '{"ok":false,"error":"denied"}';end if;
 select * into p from clinical.draft_proposals where clinical.draft_proposals.request_id=clinical_draft_proposal_attach.request_id and actor_id=actor for update;
 if p.request_id is null or not exists(select 1 from clinical.records r where r.id=saved_id and r.author_id=actor and r.athlete_id=p.athlete_id and r.encounter_id=clinical_draft_proposal_attach.request_id) then return '{"ok":false,"error":"invalid"}';end if;
 if p.record_id is not null and p.record_id<>saved_id then return '{"ok":false,"error":"reused"}';end if;
 update clinical.draft_proposals set record_id=saved_id where clinical.draft_proposals.request_id=clinical_draft_proposal_attach.request_id and actor_id=actor;
 return '{"ok":true}';end $$;

CREATE OR REPLACE FUNCTION clinical.conversation_payload(session_row clinical.conversation_sessions)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare messages jsonb;
begin
 if not clinical.conversation_readable(session_row) then
  perform clinical.conversation_audit(auth.uid(),session_row.id,null,'conversation.read','denied');
  return '{"ok":false,"error":"access_changed","session":null,"messages":[]}';
 end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', message.client_id,
    'role', message.role,
    'text', message.text,
    'athletes', message.cards,
    'navigation', message.navigation,
    'search', message.search,
    'draft', message.draft,
    'document', message.document,
    'readings', message.readings,
    'clinicalSearch', clinical.conversation_clinical_search(message.clinical_search),
    'attachments', clinical.conversation_attachments(message.attachments),
    'analysis', message.analysis
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
end $function$;

alter function public.conversation_resume(target uuid) rename to conversation_resume_before_b3;
revoke all on function public.conversation_resume_before_b3(target uuid) from public,anon,authenticated;
create function public.conversation_resume(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));select * into s from clinical.conversation_sessions where id=target and professional_id=auth.uid() for update;if s.id is null or not clinical.conversation_readable(s) then return '{"ok":false,"error":"denied"}';end if;if s.status not in ('active','idle') then return '{"ok":false,"error":"closed"}';end if;
result:=public.conversation_resume_before_b3(target);

return result;end $$;
revoke all on function public.conversation_resume(target uuid) from public,anon,authenticated;grant execute on function public.conversation_resume(target uuid) to authenticated;

alter function public.conversation_save(target uuid, context_athlete uuid, transcript jsonb) rename to conversation_save_before_b3;
revoke all on function public.conversation_save_before_b3(target uuid, context_athlete uuid, transcript jsonb) from public,anon,authenticated;
create function public.conversation_save(target uuid, context_athlete uuid, transcript jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));select * into s from clinical.conversation_sessions where professional_id=auth.uid() and (id=target or target is null and status='active') for update;if s.id is not null and (s.status<>'active' or not clinical.conversation_readable(s)) then return '{"ok":false,"error":"closed"}';end if;
result:=public.conversation_save_before_b3(target,context_athlete,transcript);

return result;end $$;
revoke all on function public.conversation_save(target uuid, context_athlete uuid, transcript jsonb) from public,anon,authenticated;grant execute on function public.conversation_save(target uuid, context_athlete uuid, transcript jsonb) to authenticated;

alter function public.conversation_recent() rename to conversation_recent_before_b3;
revoke all on function public.conversation_recent_before_b3() from public,anon,authenticated;
create function public.conversation_recent() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin

result:=public.conversation_recent_before_b3();
result:=jsonb_set(result,'{sessions}',coalesce((select jsonb_agg(item) from jsonb_array_elements(result->'sessions') item join clinical.conversation_sessions cs on cs.id=(item->>'id')::uuid where clinical.conversation_readable(cs)),'[]'));
return result;end $$;
revoke all on function public.conversation_recent() from public,anon,authenticated;grant execute on function public.conversation_recent() to authenticated;

create function public.conversation_history_read(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s clinical.conversation_sessions;begin select * into s from clinical.conversation_sessions where id=target and professional_id=auth.uid();if s.id is null then return '{"ok":false,"error":"denied"}';end if;return clinical.conversation_payload(s)||jsonb_build_object('readOnly',true);end $$;
revoke all on function public.conversation_history_read(uuid) from public,anon,authenticated;grant execute on function public.conversation_history_read(uuid) to authenticated;
alter function clinical.document_store(uuid) rename to document_store_before_b3;
create function clinical.document_store(request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin if not clinical.chat_proposal_guard(request_key,true) then return '{"ok":false,"error":"denied"}';end if;return clinical.document_store_before_b3(request_key);end $$;
do $$ declare f record;begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clinical' and p.proname=any(array['conversation_epoch','bump_conversation_epoch','conversation_permission_change','initialize_conversation_epoch','conversation_readable','chat_proposal_guard','conversation_payload','document_store','document_store_before_b3']) loop execute format('revoke all on function %s from public,anon,authenticated',f.oid::regprocedure);end loop;end $$;

-- Reject new proposal/context writes into a session whose read authority was invalidated.
alter function public.clinical_draft_proposal_register(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) rename to clinical_draft_proposal_register_before_b3;
revoke all on function public.clinical_draft_proposal_register_before_b3(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) from public,anon,authenticated;
create function public.clinical_draft_proposal_register(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare s clinical.conversation_sessions;begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into s from clinical.conversation_sessions where professional_id=auth.uid() and status='active' for update;
 if s.id is not null and not clinical.conversation_readable(s) then return '{"ok":false,"error":"denied"}';end if;
 return public.clinical_draft_proposal_register_before_b3(target,request_id,entry_title,entry_body,occurred_on,restricted);end $$;
revoke all on function public.clinical_draft_proposal_register(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) from public,anon,authenticated;grant execute on function public.clinical_draft_proposal_register(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean) to authenticated;
alter function public.clinical_document_proposal_register(target uuid, request_id uuid, kind text, payload jsonb) rename to clinical_document_proposal_register_before_b3;
revoke all on function public.clinical_document_proposal_register_before_b3(target uuid, request_id uuid, kind text, payload jsonb) from public,anon,authenticated;
create function public.clinical_document_proposal_register(target uuid, request_id uuid, kind text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s clinical.conversation_sessions;begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into s from clinical.conversation_sessions where professional_id=auth.uid() and status='active' for update;
 if s.id is not null and not clinical.conversation_readable(s) then return '{"ok":false,"error":"denied"}';end if;
 return public.clinical_document_proposal_register_before_b3(target,request_id,kind,payload);end $$;
revoke all on function public.clinical_document_proposal_register(target uuid, request_id uuid, kind text, payload jsonb) from public,anon,authenticated;grant execute on function public.clinical_document_proposal_register(target uuid, request_id uuid, kind text, payload jsonb) to authenticated;
alter function public.conversation_set_context(context_athlete uuid) rename to conversation_set_context_before_b3;
revoke all on function public.conversation_set_context_before_b3(context_athlete uuid) from public,anon,authenticated;
create function public.conversation_set_context(context_athlete uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s clinical.conversation_sessions;begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into s from clinical.conversation_sessions where professional_id=auth.uid() and status='active' for update;
 if s.id is not null and not clinical.conversation_readable(s) then return '{"ok":false,"error":"denied"}';end if;
 return public.conversation_set_context_before_b3(context_athlete);end $$;
revoke all on function public.conversation_set_context(context_athlete uuid) from public,anon,authenticated;grant execute on function public.conversation_set_context(context_athlete uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.clinical_document_proposal_current(target uuid, kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where found_row.actor_id = actor and session.professional_id = actor and session.status = 'active' and clinical.conversation_readable(session)
    and found_row.athlete_id = target and found_row.document_type = kind
    and found_row.document_id is null and found_row.discarded_at is null;
  if found = 0 then return jsonb_build_object('ok', true, 'proposal', null); end if;
  if found > 1 then return jsonb_build_object('ok', false, 'error', 'ambiguous'); end if;
  select found_row.* into open_row from clinical.document_proposals found_row
  join clinical.conversation_sessions session on session.id = found_row.session_id
  where found_row.actor_id = actor and session.professional_id = actor and session.status = 'active' and clinical.conversation_readable(session)
    and found_row.athlete_id = target and found_row.document_type = kind
    and found_row.document_id is null and found_row.discarded_at is null;
  return jsonb_build_object('ok', true, 'requestId', open_row.request_id, 'content', open_row.content, 'version', open_row.version);
end $function$;

-- Preserve PL/pgSQL argument qualification after renaming implementation functions.
CREATE OR REPLACE FUNCTION public.clinical_draft_confirm_utterance_before_b3(utterance text, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean, input_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where clinical.draft_proposals.request_id = clinical_draft_confirm_utterance_before_b3.request_id
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
end $function$
;
CREATE OR REPLACE FUNCTION public.clinical_document_confirm_card_before_b3(request_id uuid, kind text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  proposal clinical.document_proposals;
  canonical jsonb;
  wanted text;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if request_id is null or kind not in ('prescription', 'surgical_order', 'exam_request') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'human_ui', true);
  select * into proposal from clinical.document_proposals
  where clinical.document_proposals.request_id = clinical_document_confirm_card_before_b3.request_id
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
end $function$
;
CREATE OR REPLACE FUNCTION public.clinical_draft_approve_before_b3(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where approval.actor_id = actor and approval.request_id = clinical_draft_approve_before_b3.request_id
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
end $function$
;
CREATE OR REPLACE FUNCTION public.clinical_document_confirm_utterance_before_b3(utterance text, request_id uuid, kind text, payload jsonb, input_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where clinical.document_proposals.request_id = clinical_document_confirm_utterance_before_b3.request_id
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
end $function$
;
CREATE OR REPLACE FUNCTION public.clinical_draft_proposal_register_before_b3(target uuid, request_id uuid, entry_title text, entry_body text, occurred_on date, restricted boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where clinical.draft_proposals.request_id = clinical_draft_proposal_register_before_b3.request_id
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
      occurred_on = clinical_draft_proposal_register_before_b3.occurred_on,
      restricted = clinical_draft_proposal_register_before_b3.restricted,
      content_hash = wanted,
      version = version + 1,
      discarded_at = null
    where clinical.draft_proposals.request_id = proposal.request_id
    returning * into proposal;
  end if;
  return jsonb_build_object('ok', true, 'sessionId', proposal.session_id, 'version', proposal.version, 'contentHash', proposal.content_hash);
end $function$
;
CREATE OR REPLACE FUNCTION public.clinical_document_proposal_register_before_b3(target uuid, request_id uuid, kind text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if request_id is null or kind not in ('prescription', 'surgical_order', 'exam_request') then
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
  where clinical.document_proposals.request_id = clinical_document_proposal_register_before_b3.request_id
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
      athlete_name = (select coalesce(social_name, full_name) from clinical.athletes where id = target),
      professional_name = (select display_name from public.profiles where id = actor),
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
end $function$
;
CREATE OR REPLACE FUNCTION public.clinical_draft_finalize(target uuid, record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
select request_id into req from clinical.draft_proposals p where p.record_id=clinical_draft_finalize.record_id and actor_id=auth.uid();if not clinical.chat_proposal_guard(req) then return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_draft_finalize_before_b3(target,record_id);

return result;end $function$;
CREATE OR REPLACE FUNCTION public.clinical_document_confirm_utterance(utterance text, request_id uuid, kind text, payload jsonb, input_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));select * into s from clinical.conversation_sessions where professional_id=auth.uid() and status='active' for update;if s.id is null or not clinical.conversation_readable(s) then return '{"ok":false,"error":"denied"}';end if;
if request_id is not null and not clinical.chat_proposal_guard(request_id,true) then return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_document_confirm_utterance_before_b3(utterance,request_id,kind,payload,input_mode);

return result;end $function$;

-- Preserve denied-operation audit events at the new authorization boundaries.
CREATE OR REPLACE FUNCTION public.conversation_resume(target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));select * into s from clinical.conversation_sessions where id=target and professional_id=auth.uid() for update;if s.id is null or not clinical.conversation_readable(s) then perform clinical.conversation_audit(auth.uid(),null,null,'conversation.resume','denied');return '{"ok":false,"error":"denied"}';end if;if s.status not in ('active','idle') then perform clinical.conversation_audit(auth.uid(),null,null,'conversation.resume','denied');return '{"ok":false,"error":"closed"}';end if;
result:=public.conversation_resume_before_b3(target);

return result;end $function$;
CREATE OR REPLACE FUNCTION public.conversation_history_read(target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s clinical.conversation_sessions;begin select * into s from clinical.conversation_sessions where id=target and professional_id=auth.uid();if s.id is null then perform clinical.conversation_audit(auth.uid(),null,null,'conversation.history','denied');return '{"ok":false,"error":"denied"}';end if;return clinical.conversation_payload(s)||jsonb_build_object('readOnly',true);end $function$;
CREATE OR REPLACE FUNCTION public.conversation_save(target uuid, context_athlete uuid, transcript jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));select * into s from clinical.conversation_sessions where professional_id=auth.uid() and (id=target or target is null and status='active') for update;if s.id is not null and (s.status<>'active' or not clinical.conversation_readable(s)) then perform clinical.conversation_audit(auth.uid(),null,null,'conversation.save','denied');return '{"ok":false,"error":"closed"}';end if;
result:=public.conversation_save_before_b3(target,context_athlete,transcript);

return result;end $function$;
CREATE OR REPLACE FUNCTION public.clinical_document_confirm_utterance(utterance text, request_id uuid, kind text, payload jsonb, input_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;req uuid;s clinical.conversation_sessions;begin
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));select * into s from clinical.conversation_sessions where professional_id=auth.uid() and status='active' for update;if s.id is null or not clinical.conversation_readable(s) then perform clinical.conversation_audit(auth.uid(),null,null,'conversation.confirm','denied');return '{"ok":false,"error":"denied"}';end if;
if request_id is not null and not clinical.chat_proposal_guard(request_id,true) then perform clinical.conversation_audit(auth.uid(),null,null,'conversation.confirm','denied');return '{"ok":false,"error":"denied"}';end if;
result:=public.clinical_document_confirm_utterance_before_b3(utterance,request_id,kind,payload,input_mode);

return result;end $function$;
CREATE OR REPLACE FUNCTION clinical.chat_proposal_guard(request uuid, document_proposal boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();sid uuid;aid uuid;s clinical.conversation_sessions;a clinical.athlete_access;begin
 if actor is null then return false;end if;perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if document_proposal then select session_id,athlete_id into sid,aid from clinical.document_proposals where request_id=request and actor_id=actor;
 else select session_id,athlete_id into sid,aid from clinical.draft_proposals where request_id=request and actor_id=actor;end if;
 -- Preserve legacy manual approvals, which have no conversational proposal; original clinical checks still apply.
 if sid is null then if document_proposal then perform clinical.conversation_audit(actor,null,null,'conversation.mutation','denied');end if;return not document_proposal;end if;
 select * into s from clinical.conversation_sessions where id=sid and professional_id=actor for update;
 select * into a from clinical.athlete_access where athlete_id=aid and professional_id=actor for share;
 if s.status='active' and clinical.conversation_readable(s) and a.can_read_records and (case when document_proposal then clinical.can_author_documents(actor,aid) else a.can_write end) then return true;end if;
 perform clinical.conversation_audit(actor,sid,null,'conversation.mutation','denied');return false;
end $function$;
