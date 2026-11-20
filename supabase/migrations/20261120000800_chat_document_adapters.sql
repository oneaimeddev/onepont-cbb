-- Typed authenticated adapters. No signing, delivery or model confirmation tool.
-- Preserve legacy save compatibility while capturing its exact clinical version.
update clinical.document_proposals p set saved_document_version=d.version from clinical.documents d
where p.document_id=d.id and p.saved_document_version is null and p.actor_id=d.author_id and p.athlete_id=d.athlete_id and p.content=d.content;
create function clinical.chat_proposal_saved_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.document_id is not null and new.saved_document_version is null then
  select d.version into new.saved_document_version from clinical.documents d where d.id=new.document_id and d.author_id=new.actor_id and d.athlete_id=new.athlete_id and d.content=new.content;
 end if;return new;
end $$;
create trigger chat_proposal_saved_version before insert or update of document_id on clinical.document_proposals for each row execute function clinical.chat_proposal_saved_version();
revoke all on function clinical.chat_proposal_saved_version() from public,anon,authenticated,service_role;
create function public.chat_document_proposal_read(request_id uuid default null,kind text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 r:=clinical.chat_document_proposal_read(request_id,kind);
 if kind is not null and r->'document'->>'kind' is distinct from kind then return '{"error":"not_found"}';end if;
 return r;
end $$;

create function public.chat_document_proposal_patch(request_id uuid,expected_version integer,expected_hash text,changes jsonb,idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;prior clinical.chat_proposal_changes;r jsonb;rv jsonb;begin
 p:=clinical.chat_proposal_lock(request_id);if p.request_id is null then return '{"error":"denied"}';end if;
 select * into prior from clinical.chat_proposal_changes c where c.professional_id=auth.uid() and c.idempotency_key=chat_document_proposal_patch.idempotency_key;
 if expected_hash is distinct from coalesce(prior.before_hash,p.content_hash) then return '{"error":"conflict"}';end if;
 r:=clinical.chat_document_proposal_patch(request_id,expected_version,changes,idempotency_key);
 if r ? 'error' then return r;end if;
 rv:=clinical.chat_document_proposal_review(request_id,(r->'document'->>'version')::integer,idempotency_key);
 -- An incomplete proposal remains editable; no clinical values are filled in.
 return r||jsonb_build_object('review',rv->'review','reviewError',rv->>'error');
end $$;

create function public.chat_document_proposal_review(request_id uuid,expected_version integer,expected_hash text,idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;r jsonb;begin
 p:=clinical.chat_proposal_lock(request_id);if p.request_id is null then return '{"error":"denied"}';end if;
 if p.version is distinct from expected_version or p.content_hash is distinct from expected_hash then return '{"error":"conflict"}';end if;
 r:=clinical.chat_document_proposal_review(request_id,expected_version,idempotency_key);
 return r||jsonb_build_object('document',clinical.chat_proposal_dto(p));
end $$;

-- Preserve the actual UI source in shared review/save events. Private calls keep
-- agent_tool by default; a card adapter fixes human_ui itself, never from input.
do $$ declare n text;s text;needle text:='set_config(''cbb.execution_method'',''agent_tool'',true)';begin
 foreach n in array array['clinical.chat_document_proposal_review(uuid,integer,uuid)','clinical.chat_document_proposal_save(uuid,integer,uuid)'] loop
  s:=pg_get_functiondef(n::regprocedure);
  if position(needle in s)=0 then raise exception 'unexpected_private_service_definition';end if;
  s:=replace(s,needle,'set_config(''cbb.execution_method'',case when current_setting(''cbb.proposal_human_save'',true)=''yes'' then ''human_ui'' else ''agent_tool'' end,true)');
  execute s;
 end loop;
end $$;

create function public.chat_document_card(request_id uuid,expected_version integer,expected_hash text,kind text,payload jsonb,idempotency_key uuid,intent text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;prior clinical.chat_proposal_changes;canonical jsonb;fingerprint text;edit_key uuid;r jsonb;old_method text;
begin
 p:=clinical.chat_proposal_lock(request_id);if p.request_id is null then return '{"error":"denied"}';end if;
 if intent not in('review','save') or intent is null or idempotency_key is null or p.document_type is distinct from kind then return '{"error":"invalid"}';end if;
 canonical:=clinical.canonical_document(kind,payload);if canonical is null then return '{"error":"invalid"}';end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('intent',intent,'kind',kind,'content',canonical,'version',expected_version,'hash',expected_hash)::text,'sha256'),'hex');
 edit_key:=md5(idempotency_key::text||':card_edit')::uuid;
 select * into prior from clinical.chat_proposal_changes c where c.professional_id=auth.uid() and c.idempotency_key=edit_key;
 if prior.id is not null then
  if prior.proposal_id<>p.request_id or prior.fingerprint<>fingerprint or prior.after_version<>p.version then return '{"error":"conflict"}';end if;
 elsif p.version is distinct from expected_version or p.content_hash is distinct from expected_hash then return '{"error":"conflict"}';end if;
 old_method:=current_setting('cbb.proposal_human_save',true);
 perform set_config('cbb.proposal_human_save','yes',true);
 perform set_config('cbb.execution_method','human_ui',true);
 begin
  if prior.id is not null or canonical is distinct from p.content then
   r:=clinical.chat_proposal_replace(p,canonical,expected_version,edit_key,fingerprint,'document.proposal_patched');
   if r ? 'error' then raise exception 'card_rejected';end if;
   select * into p from clinical.document_proposals where clinical.document_proposals.request_id=chat_document_card.request_id;
  end if;
  if intent='save' then r:=clinical.chat_document_proposal_save(p.request_id,p.version,idempotency_key);
  else r:=clinical.chat_document_proposal_review(p.request_id,p.version,idempotency_key);end if;
  if r ? 'error' and not(intent='review' and r->>'error'='incomplete') then raise exception 'card_rejected';end if;
  select * into p from clinical.document_proposals where clinical.document_proposals.request_id=chat_document_card.request_id;
  r:=r||jsonb_build_object('document',clinical.chat_proposal_dto(p));
 exception when raise_exception then
  perform set_config('cbb.proposal_human_save',coalesce(old_method,''),true);
  return coalesce(r,'{"error":"unavailable"}'::jsonb);
 end;
 perform set_config('cbb.proposal_human_save',coalesce(old_method,''),true);
 return r;
end $$;

-- Store references only; each read hydrates from authorized persistence.
alter function clinical.conversation_document(jsonb) rename to conversation_document_saved_before_c;
revoke all on function clinical.conversation_document_saved_before_c(jsonb) from public,anon,authenticated,service_role;
create function clinical.conversation_document(value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p clinical.document_proposals;s clinical.conversation_sessions;begin
 if jsonb_typeof(value) is distinct from 'object' or value ?| array['content','items','body','notes','justification','indication'] then return null;end if;
 if coalesce(value->>'requestId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
 select * into p from clinical.document_proposals where request_id=(value->>'requestId')::uuid and actor_id=auth.uid() and discarded_at is null;
 if p.request_id is null then return clinical.conversation_document_saved_before_c(value);end if;
 select * into s from clinical.conversation_sessions where id=p.session_id and professional_id=auth.uid();
 if s.status<>'active' or not clinical.conversation_readable(s) or not clinical.can_author_documents(auth.uid(),p.athlete_id)
  or value->>'athleteId' is distinct from p.athlete_id::text or value->>'kind' is distinct from p.document_type then return null;end if;
 return jsonb_build_object('requestId',p.request_id,'athleteId',p.athlete_id,'kind',p.document_type,'state',case when p.document_id is null then 'proposal' else 'saved' end,'documentId',p.document_id);
end $$;

create function clinical.conversation_document_hydrate(value jsonb,s clinical.conversation_sessions) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p clinical.document_proposals;r jsonb;d clinical.documents;begin
 if value is null or not clinical.conversation_readable(s) then return null;end if;
 if coalesce(value->>'requestId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
 select * into p from clinical.document_proposals where request_id=(value->>'requestId')::uuid and actor_id=auth.uid() and session_id=s.id and discarded_at is null;
 if p.request_id is null then
  if clinical.can_author_documents(auth.uid(),(value->>'athleteId')::uuid) then return clinical.conversation_document_saved_before_c(value);end if;
  return null;
 end if;
 if not clinical.can_author_documents(auth.uid(),p.athlete_id) then return null;end if;
 if p.document_id is not null then
  select * into d from clinical.documents where id=p.document_id and author_id=auth.uid();
  if d.id is null or d.version is distinct from p.saved_document_version then return null;end if;
 end if;
 r:=clinical.chat_proposal_dto(p);
 if s.status<>'active' or s.athlete_id is distinct from p.athlete_id then r:=r||'{"readOnlyReason":"historical"}'::jsonb;end if;
 return r;
exception when invalid_text_representation then return null;
end $$;

do $$ declare s text;begin
 s:=pg_get_functiondef('clinical.conversation_payload(clinical.conversation_sessions)'::regprocedure);
 if position('''document'', message.document' in s)=0 then raise exception 'unexpected_conversation_payload_definition';end if;
 s:=replace(s,'''document'', message.document','''document'', clinical.conversation_document_hydrate(message.document,session_row)');
 execute s;
end $$;

revoke all on function clinical.conversation_document(jsonb),clinical.conversation_document_hydrate(jsonb,clinical.conversation_sessions) from public,anon,authenticated,service_role;
revoke all on function public.chat_document_proposal_read(uuid,text),public.chat_document_proposal_patch(uuid,integer,text,jsonb,uuid),public.chat_document_card(uuid,integer,text,text,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.chat_document_proposal_read(uuid,text),public.chat_document_proposal_patch(uuid,integer,text,jsonb,uuid),public.chat_document_card(uuid,integer,text,text,jsonb,uuid,text) to authenticated;
revoke all on function public.chat_document_proposal_review(uuid,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.chat_document_proposal_review(uuid,integer,text,uuid) to authenticated;
notify pgrst,'reload schema';
