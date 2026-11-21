-- Published rows stay immutable. Corrections are append-only, not new encounters.
create table clinical.record_corrections (
 id uuid primary key default gen_random_uuid(), record_id uuid not null references clinical.records(id) on delete cascade,
 actor_id uuid not null references public.profiles(id), request_id uuid not null,
 version integer not null, title text not null, body text not null, reason text not null,
 kind text not null check(kind in ('revision','addendum')), created_at timestamptz not null default clock_timestamp(),
 unique(record_id,version),unique(actor_id,request_id),
 check(length(trim(title)) between 1 and 160),check(length(trim(body)) between 1 and 20000 and length(body)<=20000),
 check(length(trim(reason)) between 3 and 1000)
);
-- Server/institution-owned lock for signed evolution versions. No signing UI is introduced.
create table clinical.evolution_signature_locks (
 record_id uuid primary key references clinical.records(id) on delete cascade,
 signed_version integer not null check(signed_version>0), established_at timestamptz not null default clock_timestamp()
);
alter table clinical.record_corrections enable row level security;
alter table clinical.evolution_signature_locks enable row level security;
revoke all on clinical.record_corrections,clinical.evolution_signature_locks from public,anon,authenticated;
create function clinical.correction_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise check_violation using message='Correction is immutable';end $$;
create trigger correction_immutable before update on clinical.record_corrections for each row execute function clinical.correction_immutable();

create function clinical.evolution_current(r clinical.records) returns clinical.records language plpgsql stable security definer set search_path='' as $$
declare result clinical.records:=r; latest clinical.record_corrections;begin
 select * into latest from clinical.record_corrections where record_id=r.id and kind='revision' order by version desc limit 1;
 if latest.id is not null then result.title:=latest.title;result.body:=latest.body;end if;
 select coalesce(max(version),r.version) into result.version from clinical.record_corrections where record_id=r.id;
 return result;
end $$;
create or replace function clinical.evolution_json(actor uuid,r clinical.records) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare current clinical.records; linked jsonb; signed boolean;begin
 if not clinical.record_content_allowed(actor,r) then
  return jsonb_build_object('id',r.id,'occurred_at',r.occurred_at,'author_name',r.author_name,'title','Conteúdo restrito',
   'content_restricted',true,'is_restricted',true,'can_edit',false);
 end if;
 current:=clinical.evolution_current(r);
 signed:=exists(select 1 from clinical.evolution_signature_locks where record_id=r.id);
 select coalesce(jsonb_agg(jsonb_build_object('version',c.version,'title',c.title,'body',c.body,'reason',c.reason,
  'actor_name',p.display_name,'created_at',c.created_at) order by c.version),'[]') into linked
 from clinical.record_corrections c join public.profiles p on p.id=c.actor_id where c.record_id=r.id and c.kind='addendum';
 return (to_jsonb(current)-'author_id'-'athlete_id'-'visibility') || jsonb_build_object('is_author',r.author_id=actor,
  'is_restricted',clinical.record_confidential(r),'content_restricted',false,
  'can_edit',clinical.record_edit_allowed(actor,r) and (r.status='draft' or exists(select 1 from clinical.athlete_access where athlete_id=r.athlete_id and professional_id=actor and can_finalize)),
  'signed_version',(select signed_version from clinical.evolution_signature_locks where record_id=r.id),
  'has_signature',signed,'linked_corrections',linked,'version_count',
  (select count(*)+1 from clinical.record_revisions where record_id=r.id)+(select count(*) from clinical.record_corrections where record_id=r.id),
  'encounter_status',(select status from clinical.encounters where id=r.encounter_id));
end $$;

-- Same draft contract, now with explicit delegated edit permission and serialized creation.
create or replace function public.clinical_save(target uuid,request_id uuid,record_id uuid,expected_version integer,
 entry_title text,entry_body text,restricted boolean,finalize boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); access clinical.athlete_access; record clinical.records; prof public.profiles;
begin
 if actor is null then raise insufficient_privilege;end if;
 select * into access from clinical.athlete_access where athlete_id=target and professional_id=actor for share;
 if access is null or not access.can_read_records or not access.can_write or (finalize and not access.can_finalize) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
  values(actor,'clinical_record','clinical_record.save','denied',clinical.audit_channel(),clinical.audit_method());
  return '{"error":"denied"}';
 end if;
 select * into prof from public.profiles where id=actor;
 if record_id is null then
  if finalize or request_id is null or restricted is null or not clinical.draft_content_ok(entry_title,entry_body,null) then return '{"error":"invalid"}';end if;
  perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
  if exists(select 1 from clinical.encounters where id=request_id and athlete_id=target and author_id=actor) then
   select * into record from clinical.records where encounter_id=request_id;
   return jsonb_build_object('id',record.id,'version',record.version);
  end if;
  insert into clinical.encounters(id,athlete_id,author_id,specialty) values(request_id,target,actor,prof.profession);
  insert into clinical.records(athlete_id,author_id,author_name,specialty,title,body,occurred_at,status,visibility,encounter_id)
  values(target,actor,prof.display_name,prof.profession,trim(entry_title),entry_body,now(),'draft',
   case when restricted or clinical.psychology_required(actor) then 'author_only' else 'care_team' end,request_id) returning * into record;
 else
  select * into record from clinical.records where id=record_id and athlete_id=target for update;
  if record.id is null or not clinical.record_edit_allowed(actor,record) then
   insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
   values(actor,'clinical_record','clinical_record.save','denied',clinical.audit_channel(),clinical.audit_method());return '{"error":"denied"}';
  end if;
  if record.status='finalized' and finalize and record.version=expected_version+1 then return jsonb_build_object('id',record.id,'version',record.version);end if;
  if record.status<>'draft' or expected_version is null or record.version<>expected_version then
   insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,origin_channel,execution_method)
   values(actor,'clinical_record',record.id,target,'clinical_record.save','failed',clinical.audit_channel(),clinical.audit_method());return '{"error":"conflict"}';
  end if;
  if not finalize and (restricted is null or not clinical.draft_content_ok(entry_title,entry_body,null)) then return '{"error":"invalid"}';end if;
  if exists(select 1 from clinical.evolution_signature_locks where record_id=record.id) then return '{"error":"signed"}';end if;
  insert into clinical.record_revisions(record_id,actor_id,version,title,body) values(record.id,actor,record.version,record.title,record.body);
  update clinical.records r set title=case when finalize then r.title else trim(entry_title) end,
   body=case when finalize then r.body else entry_body end,
   visibility=case when clinical.record_confidential(r) or restricted then 'author_only' else r.visibility end,
   status=case when finalize then 'finalized' else 'draft' end,version=r.version+1
  where r.id=record.id returning * into record;
  if finalize then update clinical.encounters set status='closed' where id=record.encounter_id;end if;
 end if;
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,approved_by_user_id,origin_channel,execution_method)
 values(actor,'clinical_record',record.id,target,case when finalize then 'clinical_record.finalized' else 'clinical_record.draft_saved' end,'success',case when finalize then actor end,clinical.audit_channel(),clinical.audit_method());
 return jsonb_build_object('id',record.id,'version',record.version);
end $$;

create function public.evolution_correct(target uuid,record_id uuid,expected_version integer,request_id uuid,
 entry_title text,entry_body text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r clinical.records; current clinical.records; prior clinical.record_corrections; next_kind text;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into r from clinical.records where id=record_id and athlete_id=target for update;
 if r.id is null or not clinical.record_edit_allowed(auth.uid(),r) or not exists(select 1 from clinical.athlete_access where athlete_id=target and professional_id=auth.uid() and can_finalize) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
  values(auth.uid(),'clinical_record','clinical_record.corrected','denied',clinical.audit_channel(),clinical.audit_method());return '{"error":"denied"}';
 end if;
 if r.status<>'finalized' or request_id is null or not clinical.draft_content_ok(entry_title,entry_body,null)
  or reason is null or length(trim(reason)) not between 3 and 1000 then return '{"error":"invalid"}';end if;
 select * into prior from clinical.record_corrections c where c.actor_id=auth.uid() and c.request_id=evolution_correct.request_id;
 if prior.id is not null then
  if prior.record_id=r.id and prior.title=trim(entry_title) and prior.body=entry_body and prior.reason=trim(reason) then return jsonb_build_object('id',r.id,'version',prior.version);end if;
  return '{"error":"reused"}';
 end if;
 current:=clinical.evolution_current(r);
 if expected_version is null or expected_version<>current.version then
  insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,origin_channel,execution_method)
  values(auth.uid(),'clinical_record',r.id,target,'clinical_record.correction_conflict','failed',clinical.audit_channel(),clinical.audit_method());return '{"error":"conflict"}';
 end if;
 next_kind:=case when exists(select 1 from clinical.evolution_signature_locks where record_id=r.id) then 'addendum' else 'revision' end;
 insert into clinical.record_corrections(record_id,actor_id,request_id,version,title,body,reason,kind)
 values(r.id,auth.uid(),request_id,current.version+1,trim(entry_title),entry_body,trim(reason),next_kind);
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,approved_by_user_id,origin_channel,execution_method,safe_metadata)
 values(auth.uid(),'clinical_record',r.id,target,case when next_kind='addendum' then 'clinical_record.addendum_created' else 'clinical_record.corrected' end,'success',auth.uid(),clinical.audit_channel(),clinical.audit_method(),jsonb_build_object('version',current.version+1,'kind',next_kind));
 return jsonb_build_object('id',r.id,'version',current.version+1);
end $$;

create function public.evolution_history(target uuid,record_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r clinical.records; versions jsonb;begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into r from clinical.records where id=record_id and athlete_id=target;
 if r.id is null or not clinical.record_content_allowed(auth.uid(),r) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
  values(auth.uid(),'clinical_record','clinical_record.history.read','denied',clinical.audit_channel(),clinical.audit_method());return '{"error":"denied"}';
 end if;
 select coalesce(jsonb_agg(x order by version),'[]') into versions from (
  select r.version,r.title,r.body,r.author_name as actor_name,r.occurred_at as created_at,''::text as reason,'original'::text as kind
  union all
  select v.version,v.title,v.body,p.display_name,v.occurred_at,'','archived_draft'
  from clinical.record_revisions v join public.profiles p on p.id=v.actor_id where v.record_id=r.id
  union all
  select c.version,c.title,c.body,p.display_name,c.created_at,c.reason,c.kind
  from clinical.record_corrections c join public.profiles p on p.id=c.actor_id where c.record_id=r.id
 ) x;
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,origin_channel,execution_method)
 values(auth.uid(),'clinical_record',r.id,target,'clinical_record.history.read','success',clinical.audit_channel(),clinical.audit_method());
 return jsonb_build_object('id',r.id,'versions',versions);
end $$;
-- Effective content is used consistently by authorized search and AI sources.
do $patch$ declare source text; next text;begin
 source:=pg_get_functiondef('public.clinical_history_page(uuid,jsonb)'::regprocedure);
 next:=replace(source,'from clinical.records r','from clinical.records original cross join lateral clinical.evolution_current(original) r');
 if next=source then raise exception 'Missing evolution history source';end if;execute next;
 source:=pg_get_functiondef('clinical.activity_matches(uuid,jsonb)'::regprocedure);
 next:=replace(source,'join clinical.records r on r.athlete_id=a.id','join clinical.records original on original.athlete_id=a.id cross join lateral clinical.evolution_current(original) r');
 if next=source then raise exception 'Missing activity source';end if;execute next;
 source:=pg_get_functiondef('public.attachment_options(uuid)'::regprocedure);
 next:=replace(source,'from clinical.records r','from clinical.records original cross join lateral clinical.evolution_current(original) r');
 if next=source then raise exception 'Missing attachment source';end if;execute next;
end $patch$;
revoke all on function clinical.correction_immutable(),clinical.evolution_current(clinical.records),
 public.evolution_correct(uuid,uuid,integer,uuid,text,text,text),public.evolution_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.evolution_correct(uuid,uuid,integer,uuid,text,text,text),public.evolution_history(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
