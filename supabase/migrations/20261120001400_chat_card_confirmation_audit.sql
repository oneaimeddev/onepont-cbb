-- Keep the legacy human-card confirmation event after shared-service saving.
-- Message/voice saving has its own confirmation event and must not duplicate it.
do $$ declare definition text;needle text;addition text;begin
 definition:=pg_get_functiondef('clinical.chat_document_proposal_save(uuid,integer,uuid)'::regprocedure);
 needle:='  perform clinical.chat_operation_audit(p.actor_id,p.session_id,p.request_id,''document.proposal_saved'',''success'',jsonb_build_object(''version'',p.version,''clinical_version'',p.saved_document_version,''idempotency_key'',idempotency_key));';
 if position(needle in definition)=0 then raise exception 'unexpected_chat_save_audit_definition';end if;
 addition:=$audit$
  if current_setting('cbb.proposal_human_save',true)='yes' then
   insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,approved_by_user_id,origin_channel,execution_method,safe_metadata)
   values(auth.uid(),'clinical_document',p.request_id,p.athlete_id,'document.confirmed','success',auth.uid(),'ai_chat','human_ui',jsonb_build_object('session_id',p.session_id,'proposal_version',p.version,'clinical_version',p.saved_document_version,'content_hash',p.content_hash));
  end if;
$audit$;
 execute replace(definition,needle,needle||addition);
end $$;
notify pgrst,'reload schema';
