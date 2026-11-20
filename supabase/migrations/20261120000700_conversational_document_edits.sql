-- Corte C (internal foundation only): existing proposals remain the editable authority.
-- No API/model/UI exposure, registration replacement, review/save or signing execution.
-- All helpers remain owner-only until the complete conversational integration is validated.
alter table clinical.document_proposals add column saved_document_version integer;
update clinical.document_proposals p set saved_document_version=d.version from clinical.documents d where d.id=p.document_id and d.author_id=p.actor_id and d.athlete_id=p.athlete_id and d.content=p.content;
create table clinical.chat_proposal_changes(id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.profiles(id),session_id uuid not null references clinical.conversation_sessions(id),proposal_id uuid not null references clinical.document_proposals(request_id),idempotency_key uuid not null,fingerprint text not null,before_version integer not null,after_version integer not null,before_hash text not null,after_hash text not null,operation text not null,occurred_at timestamptz not null default clock_timestamp(),unique(professional_id,idempotency_key));
alter table clinical.chat_proposal_changes enable row level security;
revoke all on clinical.chat_proposal_changes from public,anon,authenticated,service_role;

create function clinical.chat_proposal_lock(request uuid) returns clinical.document_proposals language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;s clinical.conversation_sessions;d clinical.documents;begin
 if not clinical.chat_proposal_guard(request,true) then return null;end if;
 select * into p from clinical.document_proposals where request_id=request and actor_id=auth.uid() and discarded_at is null for update;
 select * into s from clinical.conversation_sessions where id=p.session_id;
 if p.request_id is null or s.athlete_id is distinct from p.athlete_id then return null;end if;
 if p.document_id is not null then
  select * into d from clinical.documents where id=p.document_id for share;
  if d.author_id is distinct from p.actor_id or d.athlete_id is distinct from p.athlete_id or d.version is distinct from p.saved_document_version then return null;end if;
 end if;
 return p;
end $$;
create function clinical.chat_proposal_dto(p clinical.document_proposals) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d clinical.documents;state text:='proposal';locked text;begin
 if p.actor_id is distinct from auth.uid() or not clinical.can_author_documents(auth.uid(),p.athlete_id) then return null;end if;
 if p.document_id is not null then select * into d from clinical.documents where id=p.document_id;locked:=clinical.document_lock_reason(p.document_id);if d.content=p.content then state:='saved';end if;end if;
 return jsonb_build_object('requestId',p.request_id,'athleteId',p.athlete_id,'athleteName',p.athlete_name,'professionalName',p.professional_name,'credentialLabel',p.credential_label,'kind',p.document_type,'title',case when p.document_type='surgical_order' then coalesce(nullif(p.content->>'procedure',''),'Pedido cirúrgico') else coalesce(nullif(p.content->'items'->0->>'name',''),case when p.document_type='prescription' then 'Prescrição' else 'Solicitação de exames' end) end,'content',p.content,'version',p.version,'contentHash',p.content_hash,'state',state,'documentId',p.document_id,'error',null,'readOnlyReason',locked);
end $$;
create function clinical.chat_document_proposal_read(request_id uuid default null,kind text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;s clinical.conversation_sessions;n integer;begin
 perform clinical.conversation_idle_stale(auth.uid());
 select * into s from clinical.conversation_sessions where professional_id=auth.uid() and status='active';
 if s.id is null or not clinical.conversation_readable(s) then return '{"error":"denied"}';end if;
 if request_id is not null then select * into p from clinical.document_proposals where clinical.document_proposals.request_id=chat_document_proposal_read.request_id and actor_id=auth.uid() and session_id=s.id and athlete_id=s.athlete_id and discarded_at is null;
 else
   select count(*) into n from clinical.document_proposals pr where pr.actor_id=auth.uid() and pr.session_id=s.id and pr.athlete_id=s.athlete_id and pr.discarded_at is null and pr.document_id is null and (kind is null or pr.document_type=kind);
   if n>1 then return '{"error":"ambiguous"}';end if;
   select * into p from clinical.document_proposals pr where pr.actor_id=auth.uid() and pr.session_id=s.id and pr.athlete_id=s.athlete_id and pr.discarded_at is null and pr.document_id is null and (kind is null or pr.document_type=kind);
 end if;
 if p.request_id is null then return '{"error":"not_found"}';end if;
 p:=clinical.chat_proposal_lock(p.request_id);
 if p.request_id is null then return '{"error":"denied"}';end if;
 return jsonb_build_object('document',clinical.chat_proposal_dto(p),'sessionId',s.id);
end $$;

create function clinical.chat_proposal_replace(p clinical.document_proposals,canonical jsonb,expected integer,key uuid,fingerprint text,verb text) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior clinical.chat_proposal_changes;before_hash text:=p.content_hash;before_version integer:=p.version;begin
 if key is null or canonical is null then return '{"error":"invalid"}';end if;
 select * into prior from clinical.chat_proposal_changes where professional_id=auth.uid() and idempotency_key=key;
 if prior.id is not null then
  if prior.proposal_id<>p.request_id or prior.fingerprint<>fingerprint or prior.after_version<>p.version then return '{"error":"conflict"}';end if;
  return jsonb_build_object('document',clinical.chat_proposal_dto(p));
 end if;
 if p.version is distinct from expected then return '{"error":"conflict"}';end if;
 if clinical.document_lock_reason(p.request_id) is not null then return '{"error":"locked"}';end if;
 if canonical is distinct from p.content then
  update clinical.document_proposals set content=canonical,content_hash=clinical.document_hash(p.document_type,canonical),version=version+1 where request_id=p.request_id returning * into p;
  update clinical.chat_operation_challenges set phase='invalidated' where document_id=p.request_id and professional_id=p.actor_id and phase='pending';
 end if;
 insert into clinical.chat_proposal_changes(professional_id,session_id,proposal_id,idempotency_key,fingerprint,before_version,after_version,before_hash,after_hash,operation) values(p.actor_id,p.session_id,p.request_id,key,fingerprint,before_version,p.version,before_hash,p.content_hash,verb);
 perform pg_catalog.set_config('cbb.origin_channel','ai_chat',true);
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,origin_channel,execution_method,safe_metadata) values(p.actor_id,'clinical_document_proposal',p.request_id,p.athlete_id,verb,'success','ai_chat',clinical.audit_method(),jsonb_build_object('session_id',p.session_id,'before_version',before_version,'version',p.version,'idempotency_key',key));
 return jsonb_build_object('document',clinical.chat_proposal_dto(p));
end $$;
create function clinical.chat_document_proposal_patch(request_id uuid,expected_version integer,changes jsonb,idempotency_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;content jsonb;canonical jsonb;op jsonb;items jsonb;updated jsonb;item jsonb;ids jsonb;field text;value text;i integer;idx integer;fields text[];root_fields text[];fingerprint text;begin
 p:=clinical.chat_proposal_lock(request_id);if p.request_id is null then return '{"error":"denied"}';end if;
 if jsonb_typeof(changes) is distinct from 'array' then return '{"error":"invalid"}';end if;
 if jsonb_array_length(changes) not between 1 and 40 or octet_length(changes::text)>50000 then return '{"error":"invalid"}';end if;
 content:=p.content;fingerprint:=encode(extensions.digest(jsonb_build_object('changes',changes,'expectedVersion',expected_version)::text,'sha256'),'hex');
 if exists(select 1 from clinical.chat_proposal_changes where professional_id=auth.uid() and clinical.chat_proposal_changes.idempotency_key=chat_document_proposal_patch.idempotency_key) then return clinical.chat_proposal_replace(p,content,expected_version,idempotency_key,fingerprint,'document.proposal_patched');end if;
 fields:=case when p.document_type='prescription' then array['name','presentation','dose','dose_unit','route','schedule','duration','quantity','instructions'] else array['name','exam_type','region','laterality','technical_details','notes'] end;
 root_fields:=case p.document_type when 'prescription' then array['notes'] when 'exam_request' then array['occurred_at','indication','justification','diagnosis','priority','additional'] else array['procedure','region','laterality','indication','diagnosis','justification','priority','materials','additional'] end;
 for op in select * from jsonb_array_elements(changes) loop
  if jsonb_typeof(op)<>'object' or exists(select 1 from jsonb_object_keys(op) k where k not in('operation','itemId','field','value','item','itemIds')) then return '{"error":"invalid"}';end if;
  field:=op->>'field';value:=op->>'value';items:=content->'items';idx:=null;
  if op ? 'itemId' then select ordinality::integer-1 into idx from jsonb_array_elements(coalesce(items,'[]')) with ordinality a(v,ordinality) where v->>'id'=op->>'itemId';if idx is null then return '{"error":"item_not_found"}';end if;end if;
  if op->>'operation' in('set_field','append_field') then
   if jsonb_typeof(op->'value') is distinct from 'string' or (op ? 'itemId' and not field=any(fields)) or (not (op ? 'itemId') and not field=any(root_fields)) or field is null then return '{"error":"invalid"}';end if;
   if op->>'operation'='append_field' then value:=concat_ws(E'\n',nullif(case when idx is null then content->>field else items->idx->>field end,''),value);end if;
   if length(value)>(case when field in('notes','indication','justification','additional') and not (op ? 'itemId') then 2000 when field='procedure' then 200 when field='materials' then 1000 when field in('instructions','technical_details','notes','diagnosis') then 500 when field='region' and p.document_type='surgical_order' then 120 when field in('laterality','priority') then 20 when field='occurred_at' then 10 else 160 end) then return '{"error":"invalid"}';end if;
   content:=jsonb_set(content,case when idx is null then array[field] else array['items',idx::text,field] end,to_jsonb(value));
  elsif op->>'operation'='remove_item' then
   if idx is null or p.document_type='surgical_order' then return '{"error":"invalid"}';end if;content:=jsonb_set(content,'{items}',items-idx);
  elsif op->>'operation'='add_item' then
   if p.document_type='surgical_order' or jsonb_typeof(op->'item') is distinct from 'object' or jsonb_array_length(items)>=12 then return '{"error":"invalid"}';end if;
   item:=op->'item';if exists(select 1 from jsonb_object_keys(item) k where k<>'id' and not k=any(fields)) then return '{"error":"invalid"}';end if;
   for field,value in select e.k,e.v #>> '{}' from jsonb_each(item) e(k,v) loop
    if field<>'id' and (jsonb_typeof(item->field) is distinct from 'string' or length(value)>case when field in('instructions','technical_details','notes') then 500 else 160 end) then return '{"error":"invalid"}';end if;
   end loop;
   content:=jsonb_set(content,'{items}',items||jsonb_build_array(item));
  elsif op->>'operation'='reorder_items' then
   ids:=op->'itemIds';if p.document_type='surgical_order' or jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids)<>jsonb_array_length(items) or (select count(distinct v) from jsonb_array_elements_text(ids) a(v))<>jsonb_array_length(items) then return '{"error":"invalid"}';end if;
   updated:='[]';for value in select * from jsonb_array_elements_text(ids) loop select v into item from jsonb_array_elements(items) a(v) where v->>'id'=value;if item is null then return '{"error":"item_not_found"}';end if;updated:=updated||jsonb_build_array(item);end loop;content:=jsonb_set(content,'{items}',updated);
  else return '{"error":"invalid"}';end if;
 end loop;
 canonical:=clinical.canonical_document(p.document_type,content);if canonical is null then return '{"error":"invalid"}';end if;
 perform pg_catalog.set_config('cbb.execution_method','agent_tool',true);
 return clinical.chat_proposal_replace(p,canonical,expected_version,idempotency_key,fingerprint,'document.proposal_patched');
end $$;

-- Not exposed to authenticated clients or the service gateway in this foundation.
revoke all on function clinical.chat_proposal_lock(uuid),clinical.chat_proposal_dto(clinical.document_proposals),clinical.chat_document_proposal_read(uuid,text),clinical.chat_proposal_replace(clinical.document_proposals,jsonb,integer,uuid,text,text),clinical.chat_document_proposal_patch(uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
