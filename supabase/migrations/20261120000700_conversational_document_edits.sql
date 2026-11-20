-- Corte C (internal foundation only): existing proposals remain the editable authority.
-- No API/model/UI exposure, registration replacement or signing execution.
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

-- A workspace points to the exact proposal revision used by the shared review.
-- A confirmed receipt remains historical evidence; it cannot authorize a newer source.
alter table clinical.chat_document_workspaces add column source_proposal_version integer;

create function clinical.chat_review_source_bind() returns trigger
language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;rv clinical.document_reviews;
begin
 select * into p from clinical.document_proposals where request_id=new.document_id;
 if p.request_id is null then new.source_proposal_version:=null;return new;end if;
 select * into rv from clinical.document_reviews where id=new.review_id;
 if p.actor_id is distinct from new.professional_id
  or p.session_id is distinct from new.session_id or p.athlete_id is distinct from new.athlete_id
  or p.discarded_at is not null or rv.professional_id is distinct from p.actor_id
  or rv.document_type is distinct from p.document_type or rv.content is distinct from p.content
  or coalesce(rv.saved_version,rv.expected_version) is distinct from coalesce(p.saved_document_version,0)
 then raise check_violation using message='proposal_review_mismatch';end if;
 new.source_proposal_version:=p.version;
 return new;
end $$;
create trigger chat_review_source_bind before insert or update of review_id
on clinical.chat_document_workspaces for each row execute function clinical.chat_review_source_bind();

create or replace function clinical.chat_workspace_current(w clinical.chat_document_workspaces)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from clinical.conversation_sessions s join clinical.chat_document_contexts c on c.session_id=s.id
 where s.id=w.session_id and s.professional_id=w.professional_id and s.status='active' and s.athlete_id=w.athlete_id
 and s.operation_epoch=w.session_operation_epoch and s.security_epoch=w.security_epoch
 and s.security_epoch=clinical.conversation_epoch(w.professional_id) and c.workspace_id=w.id)
 and clinical.can_author_documents(w.professional_id,w.athlete_id)
 and (
  not exists(select 1 from clinical.document_proposals p where p.request_id=w.document_id)
  or exists(select 1 from clinical.document_proposals p join clinical.document_reviews rv on rv.id=w.review_id
   where p.request_id=w.document_id and p.actor_id=w.professional_id and p.session_id=w.session_id
   and p.athlete_id=w.athlete_id and p.discarded_at is null and p.version=w.source_proposal_version
   and rv.document_type=p.document_type and rv.content=p.content
   and coalesce(rv.saved_version,rv.expected_version)=coalesce(p.saved_document_version,0))
 );
$$;

-- Defaults stay traditional_ui/human_ui. Controlled chat services set provenance
-- before calling this SAME review engine, instead of inventing clinical events.
create or replace function clinical.review_audit(op text,resource uuid,meta jsonb default '{}',result text default 'success')
returns void language sql security definer set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(auth.uid(),'document_review',resource,op,result,clinical.audit_channel(),clinical.audit_method(),meta);
$$;

create function clinical.chat_document_proposal_review(request_id uuid,expected_version integer,idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;rv jsonb;bound jsonb;revision integer;
begin
 p:=clinical.chat_proposal_lock(request_id);
 if p.request_id is null then return '{"error":"denied"}';end if;
 if idempotency_key is null then return '{"error":"invalid"}';end if;
 if p.version is distinct from expected_version then return '{"error":"conflict"}';end if;
 if clinical.document_lock_reason(p.request_id) is not null then return '{"error":"locked"}';end if;
 perform pg_catalog.set_config('cbb.origin_channel','ai_chat',true);
 perform pg_catalog.set_config('cbb.execution_method','agent_tool',true);
 rv:=public.document_review_command('open',jsonb_build_object(
  'athlete_id',p.athlete_id,'document_id',p.request_id,'version',coalesce(p.saved_document_version,0),
  'kind',p.document_type,'content',p.content,'idempotency_key',idempotency_key));
 if rv ? 'error' then return rv;end if;
 select w.revision into revision from clinical.chat_document_workspaces w
 where w.session_id=p.session_id and w.document_id=p.request_id for update;
 bound:=public.chat_document_bind(p.session_id,(rv->'review'->>'id')::uuid,coalesce(revision,0),idempotency_key);
 if bound ? 'error' then return bound;end if;
 return bound||jsonb_build_object('document',clinical.chat_proposal_dto(p));
end $$;

-- Private application service: callers must first verify the ORIGINAL human save
-- request. Never expose this helper as a model tool or accept a model boolean.
-- Complete documents use document_review_command:save; incomplete ones retain
-- the traditional document_save draft contract. Neither path signs or emits.
create function clinical.chat_document_proposal_save(request_id uuid,expected_version integer,idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p clinical.document_proposals;prior clinical.chat_proposal_changes;reviewed jsonb;saved jsonb;
 fingerprint text;review_id uuid;before_version integer;before_hash text;
begin
 p:=clinical.chat_proposal_lock(request_id);
 if p.request_id is null then return '{"error":"denied"}';end if;
 if idempotency_key is null then return '{"error":"invalid"}';end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('operation','save_without_signature','expectedVersion',expected_version)::text,'sha256'),'hex');
 select * into prior from clinical.chat_proposal_changes c where c.professional_id=auth.uid() and c.idempotency_key=chat_document_proposal_save.idempotency_key;
 if prior.id is not null then
  if prior.proposal_id<>p.request_id or prior.fingerprint<>fingerprint or prior.after_version<>p.version then return '{"error":"conflict"}';end if;
  return jsonb_build_object('document',clinical.chat_proposal_dto(p),'effect','saved_without_signature');
 end if;
 if p.version is distinct from expected_version then return '{"error":"conflict"}';end if;
 if clinical.document_lock_reason(p.request_id) is not null then return '{"error":"locked"}';end if;
 before_version:=p.version;before_hash:=p.content_hash;
 perform pg_catalog.set_config('cbb.origin_channel','ai_chat',true);
 perform pg_catalog.set_config('cbb.execution_method','agent_tool',true);
 -- The subtransaction keeps review, binding, domain save and proposal linkage atomic.
 begin
  if clinical.document_ready(p.document_type,p.content) then
   reviewed:=clinical.chat_document_proposal_review(p.request_id,p.version,idempotency_key);
   if reviewed ? 'error' then return reviewed;end if;
   review_id:=(reviewed->'review'->>'id')::uuid;
   saved:=public.document_review_command('save',jsonb_build_object('review_id',review_id));
  else
   saved:=public.document_save(p.athlete_id,p.request_id,coalesce(p.saved_document_version,0),p.document_type,p.content,'save');
  end if;
  if saved ? 'error' then raise exception 'chat_save_rejected';end if;
  update clinical.document_proposals set document_id=p.request_id,
   saved_document_version=(select d.version from clinical.documents d where d.id=p.request_id)
   where clinical.document_proposals.request_id=p.request_id returning * into p;
  if p.saved_document_version is null then raise exception 'chat_save_rejected';end if;
  insert into clinical.chat_proposal_changes(professional_id,session_id,proposal_id,idempotency_key,fingerprint,before_version,after_version,before_hash,after_hash,operation)
  values(p.actor_id,p.session_id,p.request_id,idempotency_key,fingerprint,before_version,p.version,before_hash,p.content_hash,'document.proposal_saved');
  perform clinical.chat_operation_audit(p.actor_id,p.session_id,p.request_id,'document.proposal_saved','success',jsonb_build_object('version',p.version,'clinical_version',p.saved_document_version,'idempotency_key',idempotency_key));
 exception when raise_exception then
  return jsonb_build_object('error',coalesce(saved->>'error','unavailable'));
 end;
 return jsonb_build_object('document',clinical.chat_proposal_dto(p),'effect','saved_without_signature');
end $$;

revoke all on function clinical.chat_review_source_bind(),clinical.chat_workspace_current(clinical.chat_document_workspaces),
clinical.review_audit(text,uuid,jsonb,text),clinical.chat_document_proposal_review(uuid,integer,uuid),
clinical.chat_document_proposal_save(uuid,integer,uuid) from public,anon,authenticated,service_role;
