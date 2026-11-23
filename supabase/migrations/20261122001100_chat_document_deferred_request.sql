-- Resolve the current save separately from a future document. A trailing
-- clause may be detached only if it is entirely a deferred opening request.
create function public.chat_document_save_turn(utterance text)
returns jsonb language plpgsql immutable strict security invoker set search_path='' as $$
declare
 spoken text;
 parts text[];
 directive text;
 deferred_kind text;
begin
 if length(utterance) not between 1 and 240 then return null;end if;
 spoken:=translate(lower(regexp_replace(btrim(utterance),'[[:space:]]+',' ','g')),
                   'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
 parts:=regexp_match(spoken,
   '^(.*?)(?:[.,!;]+ *| +)(?:e +)?(?:ai +)?(?:depois|em seguida|mais tarde|na sequencia) *,? *(?:(?:a gente vai|nos vamos|eu vou|vamos|vou) +)(?:abrir|criar|fazer|preparar) +(?:(?:um|uma|o|a) +)?(?:nov[oa] +)?(pedido cirurgico|prescricao|receita|pedido de exames?|solicitacao de exames?)[.!]*$');
 if parts is not null then
   directive:=public.chat_document_save_directive(parts[1]);
   deferred_kind:=case when parts[2]='pedido cirurgico' then 'surgical_order'
                       when parts[2] in ('prescricao','receita') then 'prescription'
                       else 'exam_request' end;
 else
   directive:=public.chat_document_save_directive(utterance);
 end if;
 if directive is null then return null;end if;
 return jsonb_build_object('directive',directive,'deferredKind',deferred_kind);
end $$;
revoke all on function public.chat_document_save_turn(text) from public,anon;
grant execute on function public.chat_document_save_turn(text) to authenticated;

create or replace function public.chat_document_save_message(request_id uuid,expected_version integer,expected_hash text,message_key uuid,utterance text,input_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;prior clinical.chat_proposal_changes;r jsonb;clean text;named text;
fingerprint text;engine_key uuid;old_method text;method text;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise insufficient_privilege;end if;
 method:=case when input_mode='voice' then 'human_voice' else 'human_message' end;
 perform set_config('cbb.origin_channel','ai_chat',true);perform set_config('cbb.execution_method',method,true);
 if input_mode is null or input_mode not in('text','voice') or message_key is null or utterance is null or length(utterance) not between 1 and 240 then return clinical.chat_message_save_rejected(null,'unapproved');end if;
 clean:=public.chat_document_save_turn(utterance)->>'directive';
 if clean is null or clean !~ '^(pode confirmar e salvar|confirme e salve|confirmar e salvar|pode salvar|salve)( (a prescricao|a receita|o pedido|o pedido de exames?|o pedido cirurgico|a solicitacao de exames|o rascunho|este documento|esta proposta))?( sem assinar)?$'
 then return clinical.chat_message_save_rejected(null,'unapproved');end if;
 p:=clinical.chat_proposal_lock(request_id);if p.request_id is null then return clinical.chat_message_save_rejected(null,'denied');end if;
 if clean ~ ' o pedido( sem assinar)?$' and p.document_type not in ('exam_request','surgical_order') then
   return clinical.chat_message_save_rejected(p.session_id,'ambiguous');
 end if;
 named:=clinical.document_utterance_kind(clean);
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
