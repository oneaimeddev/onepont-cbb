-- Receipt consumption and the existing clinical orchestrator run atomically.
create table clinical.chat_operation_executions (
 authorization_id uuid primary key references clinical.chat_operation_authorizations(id),
 professional_id uuid not null references public.profiles(id),session_id uuid not null references clinical.conversation_sessions(id),
 document_id uuid not null references clinical.documents(id),result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table clinical.chat_operation_executions enable row level security;
revoke all on clinical.chat_operation_executions from public,anon,authenticated,service_role;
create function clinical.chat_execution_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'execution_receipt_immutable';end $$;
create trigger chat_execution_immutable before update on clinical.chat_operation_executions for each row execute function clinical.chat_execution_immutable();
revoke all on function clinical.chat_execution_immutable() from public,anon,authenticated,service_role;

-- Preserve existing traditional provenance; chat inherits authenticated input provenance.
create or replace function clinical.signing_audit(op text,resource uuid,meta jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(auth.uid(),'signature_demo',resource,op,'success',clinical.audit_channel(),clinical.audit_method(),meta||jsonb_build_object('simulated',op like 'signature.%'));
$$;
create or replace function clinical.workflow_audit(actor uuid,op text,resource uuid,mode text,meta jsonb default '{}',result text default 'success') returns void language sql security definer set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(actor,'document_workflow',resource,op,result,clinical.audit_channel(),case when clinical.audit_channel()='ai_chat' then clinical.audit_method() else 'system' end,meta||jsonb_build_object('execution_mode',mode,'provenance',case when mode='demo' then 'simulated' when mode='production' then 'verified' else 'unknown' end));
$$;
create function public.chat_operation_execute(authorization_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a clinical.chat_operation_authorizations;c clinical.chat_operation_challenges;w clinical.chat_document_workspaces;i clinical.chat_human_inputs;rv clinical.document_reviews;e clinical.chat_operation_executions;r jsonb;reason text;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into a from clinical.chat_operation_authorizations where id=authorization_id and professional_id=auth.uid() for update;
 if a.id is null or not clinical.chat_operation_session(auth.uid(),a.session_id) then return '{"error":"denied"}';end if;
 perform 1 from clinical.athlete_access where professional_id=auth.uid() for share;
 perform 1 from clinical.medical_authors where professional_id=auth.uid() for share;
 select * into c from clinical.chat_operation_challenges where id=a.challenge_id for update;
 if not clinical.can_author_documents(auth.uid(),c.athlete_id) or not exists(select 1 from clinical.conversation_sessions where id=a.session_id and athlete_id=c.athlete_id and operation_epoch=c.session_operation_epoch and security_epoch=c.security_epoch) then return '{"error":"denied"}';end if;
 select * into e from clinical.chat_operation_executions where clinical.chat_operation_executions.authorization_id=a.id;
 if e.authorization_id is not null then return e.result||jsonb_build_object('duplicate',true);end if;
 select * into w from clinical.chat_document_workspaces where id=a.workspace_id for update;
 perform 1 from clinical.signing_identities where id=c.identity_id for share;
 perform 1 from clinical.signature_connections where id=(select connection_id from clinical.signing_identities where id=c.identity_id) for share;
 perform 1 from clinical.athlete_contacts where athlete_id=c.athlete_id for share;
 select * into rv from clinical.document_reviews where id=c.review_id for update;
 select * into i from clinical.chat_human_inputs where id=a.input_id;
 if c.phase<>'confirmed' or c.presented_at is null or i.outcome<>'accepted' or i.challenge_id<>c.id or i.input_sequence<=c.presented_input_sequence or i.input_mode<>'text' or a.summary_hash<>c.summary_hash or a.workspace_revision<>w.revision or a.review_id<>rv.id then reason:='invalid_authorization';
 elsif c.expires_at<=clock_timestamp() then reason:='expired';
 elsif not exists(select 1 from clinical.signing_environment where id and demo_enabled) then reason:='mode_unavailable';
 elsif not clinical.chat_challenge_current(c) then reason:='stale';
 else reason:=clinical.chat_review_current(w);end if;
 if reason is null and (rv.content_hash<>c.content_hash or encode(extensions.digest(rv.material::text,'sha256'),'hex')<>c.material_hash or coalesce(rv.saved_version,rv.expected_version)<>c.expected_document_version or (rv.material->>'version')::integer<>c.document_version) then reason:='stale';end if;
 if reason is not null then perform clinical.chat_operation_audit(auth.uid(),a.session_id,c.id,'chat_operation.execution_rejected','denied',jsonb_build_object('reason',reason));return jsonb_build_object('error',reason);end if;
 perform set_config('cbb.origin_channel','ai_chat',true);perform set_config('cbb.execution_method','human_message',true);
 begin
  r:=public.document_review_command('sign',jsonb_build_object('review_id',rv.id,'review_hash',rv.content_hash,'identity_id',c.identity_id,'idempotency_key',a.id,'scenario','success','confirmed',true,'delivery_requested',c.delivery_requested,'delivery_scenario','success'));
  if r ? 'error' then raise exception 'chat_execution_failed';end if;
  update clinical.document_proposals set document_id=c.document_id,saved_document_version=(select version from clinical.documents where id=c.document_id) where request_id=c.document_id and actor_id=auth.uid();
  r:=jsonb_build_object('effect','orchestration_started','documentId',c.document_id,'authorizationId',a.id,'attempt',r->'attempt','simulated',true);
  insert into clinical.chat_operation_executions(authorization_id,professional_id,session_id,document_id,result) values(a.id,auth.uid(),a.session_id,c.document_id,r);
  perform clinical.chat_operation_audit(auth.uid(),a.session_id,c.id,'chat_operation.executed','success',jsonb_build_object('authorization_id',a.id,'document_id',c.document_id));
 exception when raise_exception then return jsonb_build_object('error',coalesce(r->>'error','unavailable'));end;
 return r;
end $$;
revoke all on function public.chat_operation_execute(uuid) from public,anon,authenticated,service_role;
grant execute on function public.chat_operation_execute(uuid) to authenticated;

-- Scoped status and post-finalization actions never reuse a signing authorization.
create function public.chat_document_workflow(request_id uuid,expected_version integer,expected_hash text,action text default 'get',message_key uuid default null,utterance text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;r jsonb;d clinical.documents;clean text;reason text;kind text;begin
 p:=clinical.chat_proposal_lock(request_id);if p.request_id is null then return '{"error":"denied"}';end if;
 if p.version is distinct from expected_version or p.content_hash is distinct from expected_hash then return '{"error":"conflict"}';end if;
 if action='get' then
  if p.document_id is null then return jsonb_build_object('document',clinical.chat_proposal_dto(p),'workflow',null);end if;
  r:=public.document_workflow_get(p.document_id);return r||jsonb_build_object('document',clinical.chat_proposal_dto(p));
 end if;
 if message_key is null or length(utterance)>800 then return '{"error":"invalid"}';end if;
 clean:=regexp_replace(lower(btrim(utterance)),'[.!]+$','');
 perform set_config('cbb.origin_channel','ai_chat',true);perform set_config('cbb.execution_method','human_message',true);
 if action='derive' then
  if clean<>'confirmo criar um documento derivado' then return '{"error":"confirmation_required"}';end if;
  r:=public.document_workflow_action('derive',jsonb_build_object('document_id',p.document_id,'idempotency_key',message_key));
  if r ? 'error' then return r;end if;
  select * into d from clinical.documents where id=(r->>'documentId')::uuid;
  if exists(select 1 from clinical.document_proposals where clinical.document_proposals.request_id=d.id) then
   p:=clinical.chat_proposal_lock(d.id);if p.request_id is null then return '{"error":"denied"}';end if;return jsonb_build_object('document',clinical.chat_proposal_dto(p),'effect','derived');
  end if;
  r:=public.clinical_document_proposal_register(p.athlete_id,d.id,d.document_type,d.content);
  if r->>'ok' is distinct from 'true' then raise exception 'derived_proposal_failed';end if;
  update clinical.document_proposals set document_id=d.id,saved_document_version=d.version where clinical.document_proposals.request_id=d.id and actor_id=auth.uid() returning * into p;
  return jsonb_build_object('document',clinical.chat_proposal_dto(p),'effect','derived');
 elsif action in('retry','resend') then
  if action='retry' and clean !~ '^confirmo tentar novamente a entrega; justificativa: .{8,}$' or action='resend' and clean !~ '^confirmo reenviar o documento; justificativa: .{8,}$' then return '{"error":"confirmation_required"}';end if;
  reason:=btrim(substr(utterance,strpos(utterance,':')+1));
  select a.request_id::text into kind from clinical.document_delivery_actions a where a.professional_id=auth.uid() and a.idempotency_key=message_key;
  if kind is not null and not exists(select 1 from clinical.document_delivery_actions a join clinical.document_delivery_requests dr on dr.id=a.request_id where a.professional_id=auth.uid() and a.idempotency_key=message_key and a.action=chat_document_workflow.action and a.justification=reason and dr.document_id=p.document_id) then return '{"error":"conflict"}';end if;
  if kind is null then select id::text into kind from clinical.document_delivery_requests where document_id=p.document_id and professional_id=auth.uid() order by created_at desc,id desc limit 1;end if;
  if kind is null then return '{"error":"unavailable"}';end if;
  r:=public.document_workflow_action(action,jsonb_build_object('request_id',kind,'idempotency_key',message_key,'confirmed',true,'justification',reason));
  return r||jsonb_build_object('document',clinical.chat_proposal_dto(p));
 end if;return '{"error":"invalid"}';
end $$;
revoke all on function public.chat_document_workflow(uuid,integer,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.chat_document_workflow(uuid,integer,text,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
