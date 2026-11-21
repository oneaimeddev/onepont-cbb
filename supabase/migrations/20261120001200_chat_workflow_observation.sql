-- Poll through the same scoped authority, keeping asynchronous provenance.
create function public.chat_document_status(request_id uuid,expected_version integer,expected_hash text,advance boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;s jsonb;begin
 perform set_config('cbb.origin_channel','ai_chat',true);perform set_config('cbb.execution_method','system',true);
 r:=public.chat_document_workflow(request_id,expected_version,expected_hash,'get');if r ? 'error' then return r;end if;
 s:=r->'workflow'->'signature';
 if advance and s->>'state' in('authorizing','processing') and exists(select 1 from clinical.signing_environment where id and demo_enabled) then
  s:=public.signing_demo_command('status',jsonb_build_object('attempt_id',s->>'attemptId'));
  if s ? 'error' then return s;end if;
  r:=public.chat_document_workflow(request_id,expected_version,expected_hash,'get');
 end if;return r;
end $$;
revoke all on function public.chat_document_status(uuid,integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.chat_document_status(uuid,integer,text,boolean) to authenticated;
create or replace function clinical.workflow_audit(actor uuid,op text,resource uuid,mode text,meta jsonb default '{}',result text default 'success') returns void language sql security definer set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(actor,'document_workflow',resource,op,result,
 case when auth.uid() is null and exists(select 1 from clinical.chat_operation_executions e where e.professional_id=actor and (e.document_id=resource or e.document_id in(select document_id from clinical.document_delivery_requests where id=resource) or e.document_id in(select document_id from clinical.document_signature_operations where id=resource))) then 'ai_chat' else clinical.audit_channel() end,
 case when auth.uid() is null then 'system' when clinical.audit_channel()='ai_chat' then clinical.audit_method() else 'system' end,
 meta||jsonb_build_object('execution_mode',mode,'provenance',case when mode='demo' then 'simulated' when mode='production' then 'verified' else 'unknown' end));
$$;
notify pgrst,'reload schema';
