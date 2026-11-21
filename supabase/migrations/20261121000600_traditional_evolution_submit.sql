-- Traditional form orchestration only. Reuse clinical_save; do not change its contract or chat confirmation.
-- Existing audit receipts provide idempotency without another clinical entity or any clinical content/hash in logs.
create unique index if not exists clinical_record_traditional_receipt on clinical.audit_events(actor_user_id,(safe_metadata->>'submission_id'))
 where operation='clinical_record.traditional_submitted';
create or replace function public.evolution_submit(target uuid,request_id uuid,record_id uuid,expected_version integer,
 entry_title text,entry_body text,restricted boolean,intent text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); access clinical.athlete_access; r clinical.records; receipt clinical.audit_events;
 saved jsonb; result_version integer; receipt_title text; receipt_body text; failure text:='unavailable'; effective_visibility text;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise insufficient_privilege;end if;
 perform pg_catalog.set_config('cbb.origin_channel','traditional_ui',true);
 perform pg_catalog.set_config('cbb.execution_method','human_ui',true);
 if request_id is null or restricted is null or intent is null or intent not in ('draft','finalize')
  or expected_version is null or expected_version<0 or not clinical.draft_content_ok(entry_title,entry_body,null) then return '{"error":"invalid"}';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request_id::text,0));
 select * into access from clinical.athlete_access a where a.athlete_id=target and a.professional_id=actor for share;
 if access.athlete_id is null or not access.can_read_records or not access.can_write or (intent='finalize' and not access.can_finalize) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome) values(actor,'clinical_record','clinical_record.traditional_submit','denied');return '{"error":"denied"}';
 end if;
 select * into receipt from clinical.audit_events e where e.actor_user_id=actor and e.operation='clinical_record.traditional_submitted'
  and e.safe_metadata->>'submission_id'=evolution_submit.request_id::text;
 if receipt.request_id is not null then
  if receipt.athlete_id is distinct from target or receipt.safe_metadata->>'intent' is distinct from intent
   or (receipt.safe_metadata->>'source_record_id')::uuid is distinct from record_id
   or (receipt.safe_metadata->>'expected_version')::integer is distinct from expected_version then return '{"error":"reused"}';end if;
  select * into r from clinical.records where id=receipt.resource_id and athlete_id=target for update;
  if r.id is null or not clinical.record_edit_allowed(actor,r) then return '{"error":"denied"}';end if;
  result_version:=(receipt.safe_metadata->>'version')::integer;
  if r.version=result_version then receipt_title:=r.title;receipt_body:=r.body;
  else select v.title,v.body into receipt_title,receipt_body from clinical.record_revisions v where v.record_id=r.id and v.version=result_version;end if;
  if receipt_title is distinct from trim(entry_title) or receipt_body is distinct from entry_body
   or (restricted and r.visibility<>'author_only') then return '{"error":"reused"}';end if;
  return jsonb_build_object('id',r.id,'version',result_version,'status',case when intent='finalize' then 'finalized' else 'draft' end,'replayed',true);
 end if;
 if record_id is not null then
  perform 1 from clinical.record_permissions p where p.record_id=evolution_submit.record_id and p.professional_id=actor for share;
  select * into r from clinical.records where id=record_id and athlete_id=target for update;
  if r.id is null or not clinical.record_edit_allowed(actor,r) then
   insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome) values(actor,'clinical_record','clinical_record.traditional_submit','denied');return '{"error":"denied"}';end if;
  if r.status<>'draft' or r.version<>expected_version then return '{"error":"conflict"}';end if;
 else
  if expected_version<>0 then return '{"error":"invalid"}';end if;
  if exists(select 1 from clinical.encounters where id=request_id) then return '{"error":"reused"}';end if;
 end if;
 -- A subtransaction rolls back the draft, revisions, encounter and their audits on any failure.
 begin
  effective_visibility:=case when restricted or clinical.record_confidential(r) or clinical.psychology_required(r.author_id) then 'author_only' else 'care_team' end;
  if r.id is null or intent='draft' or r.title is distinct from trim(entry_title) or r.body is distinct from entry_body or r.visibility is distinct from effective_visibility then
   saved:=public.clinical_save(target,request_id,record_id,expected_version,entry_title,entry_body,restricted,false);
   if saved is null or saved ? 'error' then failure:=coalesce(saved->>'error','unavailable');raise exception using errcode='P0001',message='Submit failed';end if;
   select * into r from clinical.records where id=(saved->>'id')::uuid;
   if r.status<>'draft' or r.title is distinct from trim(entry_title) or r.body is distinct from entry_body then failure:='reused';raise exception using errcode='P0001',message='Submit mismatch';end if;
  end if;
  if intent='finalize' then
   saved:=public.clinical_save(target,request_id,r.id,r.version,entry_title,entry_body,restricted,true);
   if saved is null or saved ? 'error' then failure:=coalesce(saved->>'error','unavailable');raise exception using errcode='P0001',message='Finalize failed';end if;
   select * into r from clinical.records where id=(saved->>'id')::uuid;
   if r.status<>'finalized' then failure:='unavailable';raise exception using errcode='P0001',message='Finalize not confirmed';end if;
  end if;
  insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,approved_by_user_id,safe_metadata)
  values(actor,'clinical_record',r.id,target,'clinical_record.traditional_submitted','success',case when intent='finalize' then actor end,
   jsonb_build_object('submission_id',request_id,'source_record_id',record_id,'expected_version',expected_version,'intent',intent,'version',r.version));
  return jsonb_build_object('id',r.id,'version',r.version,'status',r.status,'replayed',false);
 exception when others then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome) values(actor,'clinical_record','clinical_record.traditional_submit','failed');
  return jsonb_build_object('error',case when failure in ('denied','conflict','invalid','reused','signed') then failure else 'unavailable' end);
 end;
end $$;
revoke all on function public.evolution_submit(uuid,uuid,uuid,integer,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.evolution_submit(uuid,uuid,uuid,integer,text,text,boolean,text) to authenticated;
notify pgrst,'reload schema';
