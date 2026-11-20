-- Creation is immutable per actor/session/human-message/type. Model retries
-- cannot replace a proposal changed by another request or resurrect discarded data.
create function clinical.chat_creation_rejected(sid uuid,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(auth.uid(),'clinical_document','document.creation_rejected','denied','ai_chat','agent_tool',jsonb_build_object('session_id',sid,'reason',reason));
 return jsonb_build_object('error',reason);
end $$;
revoke all on function clinical.chat_creation_rejected(uuid,text) from public,anon,authenticated,service_role;
create function public.chat_document_proposal_create(target uuid,kind text,payload jsonb,message_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();s clinical.conversation_sessions;p clinical.document_proposals;
canonical jsonb;digest text;request_key uuid;r jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise insufficient_privilege;end if;
 if message_key is null or kind not in('prescription','surgical_order','exam_request') or kind is null then return clinical.chat_creation_rejected(null,'invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 perform clinical.conversation_idle_stale(actor);
 select * into s from clinical.conversation_sessions where professional_id=actor and status='active' for update;
 if s.id is null or s.athlete_id is distinct from target then return clinical.chat_creation_rejected(s.id,'context_required');end if;
 perform 1 from clinical.athlete_access where athlete_id=target and professional_id=actor for share;
 perform 1 from clinical.medical_authors where professional_id=actor for share;
 if not clinical.conversation_readable(s) or not clinical.can_author_documents(actor,target) then return clinical.chat_creation_rejected(s.id,'denied');end if;
 canonical:=clinical.canonical_document(kind,payload);if canonical is null then return clinical.chat_creation_rejected(s.id,'invalid');end if;
 digest:=md5(actor::text||':'||s.id::text||':'||message_key::text||':'||kind);
 request_key:=(substr(digest,1,12)||'4'||substr(digest,14,3)||'8'||substr(digest,18,15))::uuid;
 select * into p from clinical.document_proposals where request_id=request_key for update;
 if p.request_id is not null then
  if p.actor_id<>actor or p.session_id<>s.id or p.athlete_id<>target or p.document_type<>kind or p.content is distinct from canonical or p.discarded_at is not null then return clinical.chat_creation_rejected(s.id,'conflict');end if;
  p:=clinical.chat_proposal_lock(p.request_id);if p.request_id is null then return clinical.chat_creation_rejected(s.id,'denied');end if;
 else
  r:=public.clinical_document_proposal_register(target,request_key,kind,canonical);
  if r->>'ok' is distinct from 'true' then return jsonb_build_object('error',coalesce(r->>'error','denied'));end if;
  select * into p from clinical.document_proposals where request_id=request_key and actor_id=actor;
 end if;
 return jsonb_build_object('document',clinical.chat_proposal_dto(p),'sessionId',s.id);
end $$;
revoke all on function public.chat_document_proposal_create(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.chat_document_proposal_create(uuid,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
