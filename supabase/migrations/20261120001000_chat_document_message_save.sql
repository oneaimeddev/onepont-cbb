-- Unsigned draft saving uses the original authenticated message, displayed CAS
-- and the shared save service. It is not signature consent or a signer tool.
create function clinical.chat_message_save_rejected(sid uuid,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(auth.uid(),'clinical_document','document.save_rejected','denied','ai_chat',clinical.audit_method(),jsonb_build_object('session_id',sid,'reason',reason));
 return jsonb_build_object('error',reason);
end $$;
revoke all on function clinical.chat_message_save_rejected(uuid,text) from public,anon,authenticated,service_role;

do $$ declare n text;s text;needle text:='case when current_setting(''cbb.proposal_human_save'',true)=''yes'' then ''human_ui'' else ''agent_tool'' end';begin
 foreach n in array array['clinical.chat_document_proposal_review(uuid,integer,uuid)','clinical.chat_document_proposal_save(uuid,integer,uuid)'] loop
  s:=pg_get_functiondef(n::regprocedure);
  if position(needle in s)=0 then raise exception 'unexpected_save_provenance_definition';end if;
  s:=replace(s,needle,'case when current_setting(''cbb.proposal_human_save'',true)=''yes'' then ''human_ui'' when current_setting(''cbb.proposal_human_save'',true) in(''human_message'',''human_voice'') then current_setting(''cbb.proposal_human_save'',true) else ''agent_tool'' end');
  execute s;
 end loop;
end $$;

create function public.chat_document_save_message(request_id uuid,expected_version integer,expected_hash text,message_key uuid,utterance text,input_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;prior clinical.chat_proposal_changes;r jsonb;clean text;named text;
fingerprint text;engine_key uuid;old_method text;method text;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise insufficient_privilege;end if;
 method:=case when input_mode='voice' then 'human_voice' else 'human_message' end;
 perform set_config('cbb.origin_channel','ai_chat',true);perform set_config('cbb.execution_method',method,true);
 if input_mode is null or input_mode not in('text','voice') or message_key is null or utterance is null or length(utterance) not between 1 and 240 then return clinical.chat_message_save_rejected(null,'unapproved');end if;
 clean:=translate(lower(regexp_replace(btrim(utterance),'[[:space:]]+',' ','g')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
 clean:=regexp_replace(clean,'[.!]+$','');
 if clean !~ '^(pode confirmar e salvar|confirme e salve|confirmar e salvar)( (a prescricao|a receita|o pedido cirurgico|a solicitacao de exames|o rascunho|este documento|esta proposta))?( sem assinar)?$'
  and clean !~ '^salve (a prescricao|a receita|o pedido cirurgico|a solicitacao de exames|o rascunho|este documento|esta proposta)( sem assinar)?$'
 then return clinical.chat_message_save_rejected(null,'unapproved');end if;
 p:=clinical.chat_proposal_lock(request_id);if p.request_id is null then return clinical.chat_message_save_rejected(null,'denied');end if;
 named:=clinical.document_utterance_kind(utterance);
 if named='both' or named not in('any',p.document_type) then return clinical.chat_message_save_rejected(p.session_id,'ambiguous');end if;
 if named='any' and exists(select 1 from clinical.draft_proposals where actor_id=auth.uid() and session_id=p.session_id and record_id is null and discarded_at is null) then return clinical.chat_message_save_rejected(p.session_id,'ambiguous');end if;
 if p.version is distinct from expected_version or p.content_hash is distinct from expected_hash then return clinical.chat_message_save_rejected(p.session_id,'conflict');end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('proposal_id',p.request_id,'session_id',p.session_id,'version',expected_version,'hash',expected_hash,'message',utterance,'mode',input_mode)::text,'sha256'),'hex');
 select * into prior from clinical.chat_proposal_changes c where c.professional_id=auth.uid() and c.idempotency_key=chat_document_save_message.message_key;
 if prior.id is not null then
  if prior.proposal_id<>p.request_id or prior.operation<>'document.draft_save_confirmed' or prior.fingerprint<>fingerprint then return clinical.chat_message_save_rejected(p.session_id,'conflict');end if;
  return jsonb_build_object('document',clinical.chat_proposal_dto(p),'effect','saved_without_signature');
 end if;
 engine_key:=md5(message_key::text||':message_save')::uuid;
 old_method:=current_setting('cbb.proposal_human_save',true);
 perform set_config('cbb.proposal_human_save',method,true);
 begin
  r:=clinical.chat_document_proposal_save(p.request_id,expected_version,engine_key);
  if r ? 'error' then raise exception 'message_save_rejected';end if;
  insert into clinical.chat_proposal_changes(professional_id,session_id,proposal_id,idempotency_key,fingerprint,before_version,after_version,before_hash,after_hash,operation)
  values(auth.uid(),p.session_id,p.request_id,message_key,fingerprint,p.version,p.version,p.content_hash,p.content_hash,'document.draft_save_confirmed');
  insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,approved_by_user_id,origin_channel,execution_method,safe_metadata)
  values(auth.uid(),'clinical_document',p.request_id,p.athlete_id,'document.confirmed','success',auth.uid(),'ai_chat',method,jsonb_build_object('session_id',p.session_id,'message_id',message_key,'proposal_version',p.version,'content_hash',p.content_hash));
 exception when raise_exception then
  perform set_config('cbb.proposal_human_save',coalesce(old_method,''),true);
  return clinical.chat_message_save_rejected(p.session_id,coalesce(r->>'error','unavailable'));
 end;
 perform set_config('cbb.proposal_human_save',coalesce(old_method,''),true);
 return r;
end $$;
revoke all on function public.chat_document_save_message(uuid,integer,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.chat_document_save_message(uuid,integer,text,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
