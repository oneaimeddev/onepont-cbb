-- Files are private Storage objects. Clinical RPCs, not the Storage credential, authorize access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('clinical-attachments','clinical-attachments',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table clinical.attachments (
 id uuid primary key,
 athlete_id uuid not null references clinical.athletes(id),
 uploaded_by uuid not null references public.profiles(id),
 title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=2000),
 category text not null check(category in ('laboratory','imaging_report','clinical_image','medical_report','complementary','other')),
 document_date date check(document_date between date '1900-01-01' and current_date),
 original_filename text not null check(length(original_filename) between 1 and 200),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 20971520),
 checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','failed','ready','retired')),
 visibility text not null default 'author_only' check(visibility='author_only'),
 record_id uuid references clinical.records(id),
 document_id uuid references clinical.documents(id),
 origin_channel text not null check(origin_channel in ('traditional_ui','ai_chat')),
 session_id uuid references clinical.conversation_sessions(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 version integer not null default 1,
 active_attempt uuid,
 check(record_id is null or document_id is null)
);
create index on clinical.attachments(athlete_id,uploaded_by,created_at desc,id);
create unique index attachment_file_identity on clinical.attachments(athlete_id,uploaded_by,checksum);
create table clinical.attachment_uploads (
 id uuid primary key,
 attachment_id uuid not null references clinical.attachments(id),
 storage_path text not null unique,
 expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
 completed boolean not null default false,
 cleaned_at timestamptz
);
alter table clinical.attachments enable row level security;
alter table clinical.attachment_uploads enable row level security;
revoke all on clinical.attachments,clinical.attachment_uploads from public,anon,authenticated;
-- No object policy grants access to this bucket. Only the server transfers bytes after clinical authorization.
create policy clinical_attachment_no_direct_select on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'clinical-attachments');
create policy clinical_attachment_no_direct_insert on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'clinical-attachments');
create policy clinical_attachment_no_direct_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'clinical-attachments') with check(bucket_id<>'clinical-attachments');
create policy clinical_attachment_no_direct_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'clinical-attachments');

create function clinical.attachment_access(actor uuid,target uuid,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join clinical.athlete_access a on a.professional_id=p.id
 where p.id=actor and a.athlete_id=target and a.can_read_records and (not writing or a.can_write))
$$;
create function clinical.attachment_reference(actor uuid,target uuid,record_key uuid,document_key uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (record_key is null or exists(select 1 from clinical.records r where r.id=record_key and r.athlete_id=target
  and (r.author_id=actor or (r.status='finalized' and r.visibility='care_team'))))
 and (document_key is null or (clinical.can_author_documents(actor,target) and exists(select 1 from clinical.documents d
  where d.id=document_key and d.athlete_id=target and d.author_id=actor)))
 and (record_key is null or document_key is null)
$$;
create function clinical.attachment_audit(target uuid,athlete uuid,operation_name text,result text,channel text,method text default 'human_ui') returns void
language sql set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,origin_channel,execution_method)
 values(auth.uid(),'attachment',target,athlete,'attachment.'||operation_name,result,channel,method)
$$;
revoke all on function clinical.attachment_access(uuid,uuid,boolean),clinical.attachment_reference(uuid,uuid,uuid,uuid),clinical.attachment_audit(uuid,uuid,text,text,text,text) from public,anon,authenticated;

create function public.attachment_begin(target uuid,attachment_key uuid,payload jsonb,chat_session uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); entry clinical.attachments; token uuid; channel text:=case when chat_session is null then 'traditional_ui' else 'ai_chat' end;
 record_key uuid:=nullif(payload->>'record_id','')::uuid; document_key uuid:=nullif(payload->>'document_id','')::uuid;
begin
 if actor is null then raise insufficient_privilege; end if;
 if not clinical.attachment_access(actor,target,true) or not clinical.attachment_reference(actor,target,record_key,document_key)
 or (chat_session is not null and not exists(select 1 from clinical.conversation_sessions s where s.id=chat_session and s.professional_id=actor and s.status='active' and s.athlete_id=target)) then
  perform clinical.attachment_audit(null,null,'upload','denied',channel); return jsonb_build_object('error','denied');
 end if;
 -- Serialize same-file retries across tabs and request UUIDs, without disclosing another author's uploads.
 perform pg_advisory_xact_lock(hashtextextended(actor::text||target::text||coalesce(payload->>'checksum',''),0));
 select * into entry from clinical.attachments where athlete_id=target and uploaded_by=actor and checksum=payload->>'checksum' for update;
 if entry.id is not null and entry.status='ready' then
  if not clinical.attachment_reference(actor,target,entry.record_id,entry.document_id) then
   perform clinical.attachment_audit(null,null,'upload','denied',channel); return jsonb_build_object('error','denied');
  end if;
  perform clinical.attachment_audit(entry.id,target,'upload.reused','success',channel);
  return jsonb_build_object('id',entry.id,'status','ready','reused',true);
 end if;
 -- The server supplies the checksum, detected MIME and byte length after validating the entire file.
 insert into clinical.attachments(id,athlete_id,uploaded_by,title,description,category,document_date,original_filename,mime_type,size_bytes,checksum,record_id,document_id,origin_channel,session_id)
 values(coalesce(entry.id,attachment_key),target,actor,trim(payload->>'title'),coalesce(payload->>'description',''),payload->>'category',nullif(payload->>'document_date','')::date,
  payload->>'original_filename',payload->>'mime_type',(payload->>'size_bytes')::integer,payload->>'checksum',record_key,document_key,channel,chat_session)
 on conflict(id) do nothing;
 select * into entry from clinical.attachments where id=coalesce(entry.id,attachment_key) for update;
 if entry.uploaded_by<>actor or entry.athlete_id<>target or entry.checksum<>payload->>'checksum'
 or entry.mime_type<>payload->>'mime_type' or entry.size_bytes<>(payload->>'size_bytes')::integer then
  return jsonb_build_object('error','conflict');
 end if;
 if entry.status='ready' then return jsonb_build_object('id',entry.id,'status','ready'); end if;
 if entry.status='retired' then return jsonb_build_object('error','retired'); end if;
 if exists(select 1 from clinical.attachment_uploads where id=entry.active_attempt and expires_at>clock_timestamp() and cleaned_at is null) then
  return jsonb_build_object('error','busy');
 end if;
 token:=gen_random_uuid();
 insert into clinical.attachment_uploads(id,attachment_id,storage_path) values(token,entry.id,entry.id::text||'/'||token::text);
 update clinical.attachments set active_attempt=token,status='pending',title=trim(payload->>'title'),description=coalesce(payload->>'description',''),
  category=payload->>'category',document_date=nullif(payload->>'document_date','')::date,record_id=record_key,document_id=document_key,session_id=chat_session,origin_channel=channel where id=entry.id;
 perform clinical.attachment_audit(entry.id,target,'upload.started','success',channel);
 return jsonb_build_object('id',entry.id,'status','pending','token',token,'path',entry.id::text||'/'||token::text);
exception when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow then
 return jsonb_build_object('error','invalid');
end $$;

create function public.attachment_finish(attachment_key uuid,attempt uuid,success boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry clinical.attachments; transfer clinical.attachment_uploads;
begin
 select * into entry from clinical.attachments where id=attachment_key and uploaded_by=auth.uid() for update;
 if entry.id is null then return jsonb_build_object('error','unavailable'); end if;
 if entry.status='ready' and entry.active_attempt=attempt then return jsonb_build_object('id',entry.id,'status','ready'); end if;
 select * into transfer from clinical.attachment_uploads where id=attempt and attachment_id=entry.id for update;
 if entry.active_attempt is distinct from attempt or entry.status<>'pending' or transfer.id is null then return jsonb_build_object('error','conflict'); end if;
 if success is distinct from true then
  update clinical.attachments set status='failed' where id=entry.id;
  update clinical.attachment_uploads set expires_at=clock_timestamp() where id=attempt;
  perform clinical.attachment_audit(entry.id,entry.athlete_id,'upload.failed','failed',entry.origin_channel);
  return jsonb_build_object('status','failed');
 end if;
 if not clinical.attachment_access(auth.uid(),entry.athlete_id,true) or not clinical.attachment_reference(auth.uid(),entry.athlete_id,entry.record_id,entry.document_id)
 or transfer.expires_at<clock_timestamp()
 or (entry.session_id is not null and not exists(select 1 from clinical.conversation_sessions s where s.id=entry.session_id and s.professional_id=auth.uid() and s.status='active' and s.athlete_id=entry.athlete_id)) then
  update clinical.attachments set status='failed' where id=entry.id;
  update clinical.attachment_uploads set expires_at=clock_timestamp() where id=attempt;
  perform clinical.attachment_audit(entry.id,entry.athlete_id,'upload','denied',entry.origin_channel);
  return jsonb_build_object('error','denied');
 end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='clinical-attachments' and o.name=transfer.storage_path
  and (o.metadata->>'size')::bigint=entry.size_bytes and o.metadata->>'mimetype'=entry.mime_type) then return jsonb_build_object('error','missing_file'); end if;
 update clinical.attachment_uploads set completed=true where id=attempt;
 update clinical.attachments set status='ready',updated_at=clock_timestamp() where id=entry.id;
 perform clinical.attachment_audit(entry.id,entry.athlete_id,'created','success',entry.origin_channel);
 if entry.record_id is not null or entry.document_id is not null then perform clinical.attachment_audit(entry.id,entry.athlete_id,'associated','success',entry.origin_channel); end if;
 return jsonb_build_object('id',entry.id,'status','ready');
end $$;

create function public.attachment_cleanup(cleaned uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; entry record;
begin
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise insufficient_privilege; end if;
 for entry in select u.id,a.id as attachment_id,a.athlete_id,a.origin_channel from clinical.attachment_uploads u join clinical.attachments a on a.id=u.attachment_id
  where a.uploaded_by=auth.uid() and not u.completed and u.cleaned_at is null and u.expires_at<clock_timestamp()
  order by u.id limit 100 for update of a,u loop
  if entry.id=any(cleaned) and not exists(select 1 from storage.objects o join clinical.attachment_uploads u on u.storage_path=o.name where u.id=entry.id and o.bucket_id='clinical-attachments') then
   update clinical.attachment_uploads set cleaned_at=clock_timestamp() where id=entry.id;
   perform clinical.attachment_audit(entry.attachment_id,entry.athlete_id,'upload.cleaned','success',entry.origin_channel);
  end if;
  update clinical.attachments set status='failed' where id=entry.attachment_id and status='pending' and active_attempt=entry.id;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('token',u.id,'path',u.storage_path)),'[]') into result
 from clinical.attachment_uploads u join clinical.attachments a on a.id=u.attachment_id
 where a.uploaded_by=auth.uid() and not u.completed and u.cleaned_at is null and u.expires_at<clock_timestamp();
 return jsonb_build_object('objects',result);
end $$;

create function clinical.attachment_json(entry clinical.attachments) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',entry.id,'athlete_id',entry.athlete_id,'title',entry.title,'description',entry.description,
  'category',entry.category,'document_date',entry.document_date,'original_filename',entry.original_filename,'mime_type',entry.mime_type,
  'size_bytes',entry.size_bytes,'status',entry.status,'visibility',entry.visibility,'created_at',entry.created_at,'updated_at',entry.updated_at,
  'version',entry.version,'uploaded_by_name',(select display_name from public.profiles where id=entry.uploaded_by),
  'record_id',entry.record_id,'document_id',entry.document_id)
$$;
revoke all on function clinical.attachment_json(clinical.attachments) from public,anon,authenticated;

create function public.attachment_list(target uuid,filters jsonb default '{}',channel text default 'traditional_ui',method text default 'human_ui') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; page_no integer:=greatest(1,least(100000,coalesce((filters->>'page')::integer,1)));
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if channel not in ('traditional_ui','ai_chat','ai_voice') or method not in ('human_ui','agent_tool','human_voice','human_message') then raise invalid_parameter_value; end if;
 if not clinical.attachment_access(auth.uid(),target) then
  perform clinical.attachment_audit(null,null,'list','denied',channel,method); return jsonb_build_object('error','denied');
 end if;
 with matching as (
  select a.* from clinical.attachments a where a.athlete_id=target and a.uploaded_by=auth.uid() and a.status='ready'
   and clinical.attachment_reference(auth.uid(),target,a.record_id,a.document_id)
   and (coalesce(filters->>'category','')='' or a.category=filters->>'category')
   and (coalesce(filters->>'q','')='' or position(clinical.search_text(left(filters->>'q',160)) in clinical.search_text(a.title))>0)
   and (not (filters ? 'ids') or a.id::text in (select jsonb_array_elements_text(filters->'ids')))
 ), paged as (
  select * from matching order by
   case when filters->>'sort'='clinical' then document_date end desc nulls last,
   case when filters->>'sort'='oldest' then created_at end asc,
   created_at desc,id desc limit 25 offset (page_no-1)*25
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(clinical.attachment_json(p::clinical.attachments) order by
   case when filters->>'sort'='clinical' then p.document_date end desc nulls last,
   case when filters->>'sort'='oldest' then p.created_at end asc,p.created_at desc,p.id desc) from paged p),'[]'),
  'total',(select count(*) from matching),'page',page_no,'can_upload',clinical.attachment_access(auth.uid(),target,true)) into result;
 perform clinical.attachment_audit(null,target,'list','success',channel,method);
 return result;
end $$;

create function public.attachment_open(attachment_key uuid,action text default 'view',channel text default 'traditional_ui') returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry clinical.attachments; path text;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if action not in ('metadata','view','download') or channel not in ('traditional_ui','ai_chat') then raise invalid_parameter_value; end if;
 select * into entry from clinical.attachments where id=attachment_key and uploaded_by=auth.uid() and status='ready';
 if entry.id is null or not clinical.attachment_access(auth.uid(),entry.athlete_id) or not clinical.attachment_reference(auth.uid(),entry.athlete_id,entry.record_id,entry.document_id) then
  perform clinical.attachment_audit(null,null,action,'denied',channel); return jsonb_build_object('error','unavailable');
 end if;
 select storage_path into path from clinical.attachment_uploads where id=entry.active_attempt and completed;
 perform clinical.attachment_audit(entry.id,entry.athlete_id,action,'success',channel);
 return clinical.attachment_json(entry)||jsonb_build_object('internal_path',path,'can_edit',clinical.attachment_access(auth.uid(),entry.athlete_id,true));
end $$;

create function public.attachment_edit(attachment_key uuid,expected_version integer,payload jsonb,retire boolean default false,channel text default 'traditional_ui') returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry clinical.attachments; record_key uuid:=nullif(payload->>'record_id','')::uuid; document_key uuid:=nullif(payload->>'document_id','')::uuid;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if channel not in ('traditional_ui','ai_chat') or retire is null then raise invalid_parameter_value; end if;
 select * into entry from clinical.attachments where id=attachment_key and uploaded_by=auth.uid() and status='ready' for update;
 if entry.id is null or not clinical.attachment_access(auth.uid(),entry.athlete_id,true) or not clinical.attachment_reference(auth.uid(),entry.athlete_id,entry.record_id,entry.document_id) then
  perform clinical.attachment_audit(null,null,'edit','denied',channel); return jsonb_build_object('error','denied');
 end if;
 if entry.version<>expected_version then return jsonb_build_object('error','conflict'); end if;
 if retire then
  if exists(select 1 from clinical.records where id=entry.record_id and status='finalized')
   or exists(select 1 from clinical.documents where id=entry.document_id and status::text='finalized') then return jsonb_build_object('error','retention'); end if;
  update clinical.attachments set status='retired',version=version+1,updated_at=clock_timestamp() where id=entry.id;
  perform clinical.attachment_audit(entry.id,entry.athlete_id,'retired','success',channel);
 else
  if (entry.record_id is distinct from record_key or entry.document_id is distinct from document_key)
   and (exists(select 1 from clinical.records where id=entry.record_id and status='finalized')
    or exists(select 1 from clinical.documents where id=entry.document_id and status::text='finalized')) then return jsonb_build_object('error','retention'); end if;
  if not clinical.attachment_reference(auth.uid(),entry.athlete_id,record_key,document_key) then return jsonb_build_object('error','denied'); end if;
  update clinical.attachments set title=trim(payload->>'title'),description=coalesce(payload->>'description',''),category=payload->>'category',
   document_date=nullif(payload->>'document_date','')::date,record_id=record_key,document_id=document_key,version=version+1,updated_at=clock_timestamp() where id=entry.id;
  perform clinical.attachment_audit(entry.id,entry.athlete_id,'metadata.updated','success',channel);
  if entry.record_id is distinct from record_key or entry.document_id is distinct from document_key then perform clinical.attachment_audit(entry.id,entry.athlete_id,'associated','success',channel); end if;
 end if;
 return jsonb_build_object('ok',true);
exception when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow then return jsonb_build_object('error','invalid');
end $$;

create function public.attachment_options(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not clinical.attachment_access(auth.uid(),target,true) then return jsonb_build_object('error','denied'); end if;
 return jsonb_build_object('athlete_name',(select coalesce(social_name,full_name) from clinical.athletes where id=target),
 'references',coalesce((select jsonb_agg(x) from (
  (select r.id,'evolution'::text as kind,r.title from clinical.records r where r.athlete_id=target
   and (r.author_id=auth.uid() or (r.status='finalized' and r.visibility='care_team')) order by r.occurred_at desc limit 100)
  union all
  (select d.id,d.document_type as kind,clinical.document_label(d.document_type,d.content) as title from clinical.documents d
   where d.athlete_id=target and d.author_id=auth.uid() and clinical.can_author_documents(auth.uid(),target) order by d.created_at desc limit 100)
 ) x),'[]'));
end $$;

revoke all on function public.attachment_begin(uuid,uuid,jsonb,uuid),public.attachment_finish(uuid,uuid,boolean),public.attachment_cleanup(uuid[]),
 public.attachment_list(uuid,jsonb,text,text),public.attachment_open(uuid,text,text),public.attachment_edit(uuid,integer,jsonb,boolean,text),public.attachment_options(uuid)
 from public,anon,authenticated;
grant execute on function public.attachment_begin(uuid,uuid,jsonb,uuid),public.attachment_finish(uuid,uuid,boolean),public.attachment_cleanup(uuid[]),
 public.attachment_list(uuid,jsonb,text,text),public.attachment_open(uuid,text,text),public.attachment_edit(uuid,integer,jsonb,boolean,text),public.attachment_options(uuid) to authenticated;

-- Conversation cards persist authorized identifiers only; metadata and bytes are reloaded on every view.
alter table clinical.conversation_messages add column attachments jsonb;
create function clinical.conversation_attachments(value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid; ids jsonb; open_key text;
begin
 if jsonb_typeof(value)<>'object' or (value->>'athleteId') !~* '^[0-9a-f]{8}-[0-9a-f-]{27}$' then return null; end if;
 target:=(value->>'athleteId')::uuid;
 if not clinical.attachment_access(auth.uid(),target) or jsonb_typeof(value->'ids')<>'array' then return null; end if;
 select coalesce(jsonb_agg(a.id order by r.ordinality),'[]') into ids
 from jsonb_array_elements_text(value->'ids') with ordinality r(id,ordinality)
 join clinical.attachments a on a.id::text=r.id and a.athlete_id=target and a.uploaded_by=auth.uid() and a.status='ready'
 where r.ordinality<=25 and clinical.attachment_reference(auth.uid(),target,a.record_id,a.document_id);
 open_key:=case when ids ? (value->>'openId') then value->>'openId' else null end;
 return jsonb_build_object('athleteId',target,'ids',ids,'openId',open_key);
exception when invalid_text_representation then return null;
end $$;
revoke all on function clinical.conversation_attachments(jsonb) from public,anon,authenticated;
do $$
declare source text; modified text;
begin
 source:=pg_get_functiondef('public.conversation_save(uuid,uuid,jsonb)'::regprocedure);
 modified:=replace(source,'readings jsonb;','readings jsonb;'||chr(10)||'  attachments jsonb;');
 if modified=source then raise exception 'conversation readings declaration unavailable'; end if; source:=modified;
 modified:=replace(source,'readings := clinical.conversation_readings(element->''readings'');',
  'readings := clinical.conversation_readings(element->''readings'');'||chr(10)||'    attachments := clinical.conversation_attachments(element->''attachments'');');
 if modified=source then raise exception 'conversation readings assignment unavailable'; end if; source:=modified;
 modified:=replace(source,'|| case when readings is null then ''{}''::jsonb else jsonb_build_object(''readings'', readings) end',
  '|| case when readings is null then ''{}''::jsonb else jsonb_build_object(''readings'', readings) end'||chr(10)||'      || case when attachments is null then ''{}''::jsonb else jsonb_build_object(''attachments'', attachments) end');
 if modified=source then raise exception 'conversation readings payload unavailable'; end if; source:=modified;
 modified:=replace(source,'document, readings','document, readings, attachments');
 if modified=source then raise exception 'conversation readings columns unavailable'; end if; source:=modified;
 modified:=replace(source,'entry->''document'', entry->''readings''','entry->''document'', entry->''readings'', entry->''attachments''');
 if modified=source then raise exception 'conversation readings values unavailable'; end if;
 execute modified;
 source:=pg_get_functiondef('clinical.conversation_payload(clinical.conversation_sessions)'::regprocedure);
 modified:=replace(source,'''readings'', message.readings','''readings'', message.readings,'||chr(10)||'    ''attachments'', clinical.conversation_attachments(message.attachments)');
 if modified=source then raise exception 'conversation response readings unavailable'; end if;
 execute modified;
end $$;
