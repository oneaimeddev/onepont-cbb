-- Shared operational lifecycle. Historical clinical status and canonical snapshots are preserved.
create table clinical.document_signature_operations (
 id uuid primary key default gen_random_uuid(), legacy_attempt_id uuid unique references clinical.signature_attempts(id),
 document_id uuid not null references clinical.documents(id), version integer not null,
 snapshot_id uuid not null references clinical.signature_snapshots(id), professional_id uuid not null references public.profiles(id),
 identity_id uuid not null references clinical.signing_identities(id), provider text not null,
 execution_mode text not null check(execution_mode in ('demo','production')), provenance text not null check(provenance in ('simulated','verified')),
 state text not null check(state in ('authorizing','processing','succeeded','denied','expired','failed','cancelled','stale')),
 artifact_id uuid references clinical.signature_artifacts(id), verified_evidence_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((execution_mode='demo' and provenance='simulated' and artifact_id is null and verified_evidence_id is null) or(execution_mode='production' and provenance='verified'))
);
-- Empty until a trusted real connector/validator exists; no client writer or boolean-signature endpoint.
create table clinical.document_verified_signature_evidence (
 id uuid primary key default gen_random_uuid(), operation_id uuid not null unique references clinical.document_signature_operations(id),
 artifact_id uuid not null references clinical.signature_artifacts(id), snapshot_id uuid not null references clinical.signature_snapshots(id),
 content_hash text not null, identity_id uuid not null, validator_reference text not null,
 integrity_verified boolean not null check(integrity_verified), identity_verified boolean not null check(identity_verified),
 signature_verified boolean not null check(signature_verified), verified_at timestamptz not null,
 provenance text not null default 'verified' check(provenance='verified')
);
alter table clinical.document_signature_operations add foreign key(verified_evidence_id) references clinical.document_verified_signature_evidence(id);
create table clinical.document_finalizations (
 id uuid primary key default gen_random_uuid(), document_id uuid not null unique references clinical.documents(id), version integer not null,
 signature_operation_id uuid not null unique references clinical.document_signature_operations(id), snapshot_id uuid not null references clinical.signature_snapshots(id),
 content_hash text not null, state text not null default 'finalized' check(state='finalized'),
 professional_id uuid not null references public.profiles(id), finalized_at timestamptz not null default clock_timestamp(),
 execution_mode text not null check(execution_mode in ('demo','production')), provenance text not null,
 check((execution_mode='demo' and provenance='simulated')or(execution_mode='production' and provenance='verified'))
);
create table clinical.document_derivations (
 document_id uuid primary key references clinical.documents(id), source_document_id uuid not null references clinical.documents(id),
 source_finalization_id uuid not null references clinical.document_finalizations(id),source_version integer not null,source_hash text not null,
 professional_id uuid not null references public.profiles(id),idempotency_key uuid not null,created_at timestamptz not null default clock_timestamp(),
 unique(professional_id,idempotency_key),check(document_id<>source_document_id)
);
create table clinical.document_delivery_environment(id boolean primary key default true check(id),fixture_policy_enabled boolean not null default false);
insert into clinical.document_delivery_environment values(true,false);
create table clinical.document_delivery_choices (
 review_id uuid primary key references clinical.document_reviews(id), professional_id uuid not null references public.profiles(id),
 scenario text not null check(scenario in ('success','temporary_failure','permanent_failure','timeout','delayed','duplicate')),
 created_at timestamptz not null default clock_timestamp()
);
create table clinical.document_delivery_authorizations (
 id uuid primary key default gen_random_uuid(),athlete_id uuid not null references clinical.athletes(id),professional_id uuid not null references public.profiles(id),
 recipient_kind text not null check(recipient_kind in ('athlete','guardian')),contact_digest text not null,recipient_masked jsonb not null,
 execution_mode text not null,provenance text not null,policy_key text not null,institutional_evidence_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 check((execution_mode='demo' and provenance='simulated' and policy_key='fixture-demo-v1' and institutional_evidence_id is null)or(execution_mode='production' and provenance='verified' and institutional_evidence_id is not null))
);
create table clinical.document_delivery_requests (
 id uuid primary key default gen_random_uuid(),document_id uuid not null references clinical.documents(id),version integer not null,
 signature_operation_id uuid not null references clinical.document_signature_operations(id),finalization_id uuid references clinical.document_finalizations(id),
 snapshot_id uuid not null references clinical.signature_snapshots(id),artifact_id uuid references clinical.signature_artifacts(id),
 professional_id uuid not null references public.profiles(id),authorization_id uuid references clinical.document_delivery_authorizations(id),
 consent_review_id uuid not null references clinical.document_reviews(id),source_intent_id uuid unique references clinical.signature_demo_delivery_intents(id),
 resend_of_id uuid references clinical.document_delivery_requests(id),channel text not null default 'whatsapp' check(channel='whatsapp'),adapter text not null,
 execution_mode text not null check(execution_mode in ('demo','production')),provenance text not null,
 state text not null check(state in ('waiting_signature','blocked','queued','processing','accepted_by_provider','delivered','failed','cancelled','uncertain')),
 scenario text not null check(scenario in ('success','temporary_failure','permanent_failure','timeout','delayed','duplicate')),
 failure_kind text,cancel_requested boolean not null default false,idempotency_key uuid not null,current_attempt_id uuid,attempts_count integer not null default 0,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(professional_id,idempotency_key),
 check((execution_mode='demo' and provenance='simulated' and adapter='simulated' and artifact_id is null)or(execution_mode='production' and provenance='verified' and adapter<>'simulated' and artifact_id is not null))
);
create table clinical.document_delivery_attempts (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references clinical.document_delivery_requests(id),number integer not null,
 state text not null,execution_mode text not null,provenance text not null,adapter text not null,correlation text not null,
 observations integer not null default 0,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(request_id,number),check((execution_mode='demo' and provenance='simulated' and adapter='simulated')or(execution_mode='production' and provenance='verified' and adapter<>'simulated'))
);
alter table clinical.document_delivery_requests add foreign key(current_attempt_id) references clinical.document_delivery_attempts(id) deferrable initially deferred;
create table clinical.document_delivery_jobs (
 request_id uuid primary key references clinical.document_delivery_requests(id),available_at timestamptz not null default clock_timestamp(),
 state text not null default 'ready' check(state in ('ready','leased','done')),lease_token uuid,lease_expires_at timestamptz,
 updated_at timestamptz not null default clock_timestamp()
);
create table clinical.document_delivery_transitions (
 id bigint generated always as identity primary key,request_id uuid not null references clinical.document_delivery_requests(id),attempt_id uuid references clinical.document_delivery_attempts(id),
 state text not null,execution_mode text not null,provenance text not null,occurred_at timestamptz not null default clock_timestamp()
);
create table clinical.document_delivery_results (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references clinical.document_delivery_requests(id),attempt_id uuid not null references clinical.document_delivery_attempts(id),
 event_id text not null,state text not null,failure_kind text,execution_mode text not null,provenance text not null,
 disposition text not null check(disposition in ('applied','ignored_stale_attempt','ignored_terminal')),
 received_at timestamptz not null default clock_timestamp(),unique(attempt_id,event_id)
);
create table clinical.document_delivery_actions (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references clinical.document_delivery_requests(id),professional_id uuid not null references public.profiles(id),
 idempotency_key uuid not null,action text not null,justification text not null check(length(justification) between 8 and 500),
 created_at timestamptz not null default clock_timestamp(),unique(professional_id,idempotency_key)
);
do $$ declare t text;begin foreach t in array array['document_signature_operations','document_verified_signature_evidence','document_finalizations','document_derivations','document_delivery_environment','document_delivery_choices','document_delivery_authorizations','document_delivery_requests','document_delivery_attempts','document_delivery_jobs','document_delivery_transitions','document_delivery_results','document_delivery_actions'] loop
 execute format('alter table clinical.%I enable row level security',t);execute format('revoke all on clinical.%I from public,anon,authenticated',t);end loop;end $$;
create function public.configure_document_delivery_demo(enabled boolean) returns void language sql security definer set search_path='' as $$update clinical.document_delivery_environment set fixture_policy_enabled=enabled where id;$$;
revoke all on function public.configure_document_delivery_demo(boolean) from public,anon,authenticated;grant execute on function public.configure_document_delivery_demo(boolean) to service_role;
create function clinical.workflow_audit(actor uuid,op text,resource uuid,mode text,meta jsonb default '{}',result text default 'success') returns void language sql security definer set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(actor,'document_workflow',resource,op,result,'traditional_ui','system',meta||jsonb_build_object('execution_mode',mode,'provenance',case when mode='demo' then 'simulated' when mode='production' then 'verified' else 'unknown' end));
$$;
create function clinical.document_lock_reason(target uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from clinical.document_finalizations where document_id=target) then 'finalized'
 when exists(select 1 from clinical.document_signature_operations where document_id=target and state in ('authorizing','processing')) then 'in_progress' else null end;
$$;
create function clinical.guard_document_workflow() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;reason text;begin
 if tg_table_name='documents' then target:=old.id;else target:=old.document_id;end if;
 reason:=clinical.document_lock_reason(target);
 if reason is not null then raise exception using errcode='55000',message='document_'||reason;end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger documents_workflow_guard before update or delete on clinical.documents for each row execute function clinical.guard_document_workflow();
create trigger revisions_workflow_guard before update or delete on clinical.document_revisions for each row execute function clinical.guard_document_workflow();
create function clinical.guard_document_revision_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin if clinical.document_lock_reason(new.document_id) is not null then raise exception using errcode='55000',message='document_locked';end if;return new;end $$;
create trigger revisions_workflow_insert_guard before insert on clinical.document_revisions for each row execute function clinical.guard_document_revision_insert();
create function clinical.guard_finalization_update() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Finalization is immutable';end $$;
create trigger finalization_immutable before update on clinical.document_finalizations for each row execute function clinical.guard_finalization_update();

create function clinical.finalize_document_operation(operation uuid) returns void language plpgsql security definer set search_path='' as $$
declare op clinical.document_signature_operations;d clinical.documents;s clinical.signature_snapshots;f clinical.document_finalizations;
begin
 select * into op from clinical.document_signature_operations where id=operation for update;
 if op.id is null or op.state<>'succeeded' then return;end if;
 select * into d from clinical.documents where id=op.document_id for update;
 select * into s from clinical.signature_snapshots where id=op.snapshot_id;
 if d.author_id<>op.professional_id or not exists(select 1 from clinical.signing_identities where id=op.identity_id and professional_id=op.professional_id) or d.version<>op.version or s.version<>d.version or s.document_id<>d.id or s.professional_id<>op.professional_id
  or s.content_hash<>encode(extensions.digest(s.canonical_bytes,'sha256'),'hex') or clinical.signing_material(d)<>s.canonical_bytes then raise exception 'Ineligible finalization';end if;
 if op.execution_mode='demo' then
  if op.provenance<>'simulated' or not exists(select 1 from clinical.signing_environment where id and demo_enabled)
   or not exists(select 1 from clinical.signature_attempts where id=op.legacy_attempt_id and state='simulated_success' and simulated and not cryptographically_signed and not certificate_verified)
   then raise exception 'Ineligible simulation';end if;
 else
  if not exists(select 1 from clinical.document_verified_signature_evidence e join clinical.signature_artifacts a on a.id=e.artifact_id where e.id=op.verified_evidence_id and e.operation_id=op.id and e.artifact_id=op.artifact_id and e.snapshot_id=s.id and e.content_hash=s.content_hash and e.identity_id=op.identity_id and e.integrity_verified and e.identity_verified and e.signature_verified and a.validated and a.provenance='production') then raise exception 'Verified evidence required';end if;
 end if;
 insert into clinical.document_finalizations(document_id,version,signature_operation_id,snapshot_id,content_hash,professional_id,execution_mode,provenance)
 values(d.id,d.version,op.id,s.id,s.content_hash,op.professional_id,op.execution_mode,op.provenance) on conflict(document_id) do nothing returning * into f;
 if f.id is not null then
  perform clinical.workflow_audit(op.professional_id,'document.finalized',d.id,op.execution_mode,jsonb_build_object('version',d.version,'snapshot_id',s.id,'operation_id',op.id,'hash',s.content_hash));
 end if;
end $$;
create function clinical.bridge_signature_operation() returns trigger language plpgsql security definer set search_path='' as $$
declare op clinical.document_signature_operations;s clinical.signature_snapshots;begin
 if tg_op='INSERT' then
  select * into s from clinical.signature_snapshots where id=new.snapshot_id;
  insert into clinical.document_signature_operations(legacy_attempt_id,document_id,version,snapshot_id,professional_id,identity_id,provider,execution_mode,provenance,state)
  values(new.id,s.document_id,s.version,s.id,new.professional_id,new.identity_id,'simulated','demo','simulated','authorizing') returning * into op;
 else select * into op from clinical.document_signature_operations where legacy_attempt_id=new.id;end if;
 -- No backfill: an old attempt updated after deployment is still a historical attempt.
 if op.id is null then return new;end if;
 update clinical.document_signature_operations set state=case when new.state='simulated_success' then 'succeeded' else new.state end,updated_at=clock_timestamp() where id=op.id returning * into op;
 if op.state='succeeded' then perform clinical.finalize_document_operation(op.id);end if;
 return new;
end $$;
create trigger signature_operation_bridge after insert or update of state on clinical.signature_attempts for each row execute function clinical.bridge_signature_operation();

-- Preserve the original save contract and add an early, useful rejection. Triggers guard every other writer.
alter function public.document_save(uuid,uuid,integer,text,jsonb,text) rename to document_save_before_workflow;
revoke all on function public.document_save_before_workflow(uuid,uuid,integer,text,jsonb,text) from public,anon,authenticated;
create function public.document_save(target uuid,document_id uuid,expected_version integer,kind text,payload jsonb,intent text) returns jsonb language plpgsql security definer set search_path='' as $$
declare reason text;begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 if not exists(select 1 from clinical.documents where id=document_id and author_id=auth.uid() and athlete_id=target) then
  return public.document_save_before_workflow(target,document_id,expected_version,kind,payload,intent);
 end if;
 perform 1 from clinical.documents where id=document_id for update;
 reason:=clinical.document_lock_reason(document_id);
 if reason is not null then
  perform clinical.workflow_audit(auth.uid(),'document.edit_rejected',document_id,'demo',jsonb_build_object('reason',reason),'denied');return jsonb_build_object('error',reason);
 end if;
 return public.document_save_before_workflow(target,document_id,expected_version,kind,payload,intent);
end $$;
revoke all on function public.document_save(uuid,uuid,integer,text,jsonb,text) from public,anon,authenticated;grant execute on function public.document_save(uuid,uuid,integer,text,jsonb,text) to authenticated;

create function clinical.delivery_policy(actor uuid,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a clinical.athletes;c clinical.athlete_contacts;recipient jsonb;digest text;begin
 if not clinical.can_author_documents(actor,target) or not exists(select 1 from clinical.athlete_access where athlete_id=target and professional_id=actor and can_edit) then return '{"eligible":false,"reason":"recipient_access"}';end if;
 select * into a from clinical.athletes where id=target;select * into c from clinical.athlete_contacts where athlete_id=target;
 if not exists(select 1 from clinical.signing_environment where id and demo_enabled) or not exists(select 1 from clinical.document_delivery_environment where id and fixture_policy_enabled)
  or a.source<>'demo' or a.birth_date is null then return '{"eligible":false,"reason":"no_demo_authorization"}';end if;
 -- Explicit fictitious-fixture policy, never a production authorization or mere checkbox consent.
 if a.birth_date>((current_timestamp at time zone 'America/Sao_Paulo')::date-interval '18 years')::date then
  if c.guardian_name is null or length(regexp_replace(coalesce(c.guardian_contact,''),'[^0-9]','','g')) not between 8 and 15 then return '{"eligible":false,"reason":"guardian_required"}';end if;
  recipient:=jsonb_build_object('name',c.guardian_name,'relation',c.guardian_relation,'category','guardian','phone_masked','•••• '||right(regexp_replace(c.guardian_contact,'[^0-9]','','g'),4));
  digest:=encode(extensions.digest(jsonb_build_array(a.id,a.birth_date,c.guardian_name,c.guardian_relation,c.guardian_contact)::text,'sha256'),'hex');
 else
  if length(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')) not between 8 and 15 then return '{"eligible":false,"reason":"contact_required"}';end if;
  recipient:=jsonb_build_object('name',coalesce(a.social_name,a.full_name),'relation','Próprio atleta','category','athlete','phone_masked','•••• '||right(regexp_replace(c.phone,'[^0-9]','','g'),4));
  digest:=encode(extensions.digest(jsonb_build_array(a.id,a.birth_date,a.full_name,a.social_name,c.phone)::text,'sha256'),'hex');
 end if;
 return jsonb_build_object('eligible',true,'execution_mode','demo','provenance','simulated','policy','fixture-demo-v1','contact_digest',digest,'recipient',recipient);
end $$;
create function clinical.delivery_transition(request uuid,new_state text,attempt uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r clinical.document_delivery_requests;begin
 update clinical.document_delivery_requests set state=new_state,updated_at=clock_timestamp() where id=request returning * into r;
 insert into clinical.document_delivery_transitions(request_id,attempt_id,state,execution_mode,provenance) values(r.id,attempt,new_state,r.execution_mode,r.provenance);
 perform clinical.workflow_audit(r.professional_id,'delivery.'||new_state,r.id,r.execution_mode,jsonb_build_object('document_id',r.document_id,'version',r.version,'attempt_id',attempt,'provenance',r.provenance));
end $$;
create function clinical.delivery_authorization_valid(request clinical.document_delivery_requests) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a clinical.document_delivery_authorizations;p jsonb;begin
 if not clinical.can_author_documents(request.professional_id,(select athlete_id from clinical.documents where id=request.document_id)) then return false;end if;
 select * into a from clinical.document_delivery_authorizations where id=request.authorization_id and professional_id=request.professional_id;
 if a.id is null or a.execution_mode<>request.execution_mode or a.provenance<>request.provenance then return false;end if;
 if request.execution_mode='demo' then
  p:=clinical.delivery_policy(request.professional_id,a.athlete_id);
  return coalesce((p->>'eligible')::boolean,false) and p->>'contact_digest'=a.contact_digest;
 end if;
 -- A real dispatch requires a trusted, current institutional policy; no policy is configured here.
 return false;
end $$;
create function clinical.enqueue_delivery_intent() returns trigger language plpgsql security definer set search_path='' as $$
declare op clinical.document_signature_operations;rv clinical.document_reviews;p jsonb;aid uuid;rid uuid;scenario text;f clinical.document_finalizations;begin
 select * into op from clinical.document_signature_operations where legacy_attempt_id=new.attempt_id;
 if op.id is null then return new;end if; -- historical intents are never promoted
 select * into rv from clinical.document_reviews where id=new.review_id and professional_id=op.professional_id;
 if rv.id is null or rv.signing_attempt_id<>new.attempt_id then raise exception 'Invalid delivery consent';end if;
 select c.scenario into scenario from clinical.document_delivery_choices c where c.review_id=rv.id;
 scenario:=coalesce(scenario,'success');
 p:=clinical.delivery_policy(op.professional_id,rv.athlete_id);
 if coalesce((p->>'eligible')::boolean,false) then
  insert into clinical.document_delivery_authorizations(athlete_id,professional_id,recipient_kind,contact_digest,recipient_masked,execution_mode,provenance,policy_key)
  values(rv.athlete_id,op.professional_id,p->'recipient'->>'category',p->>'contact_digest',p->'recipient','demo','simulated','fixture-demo-v1') returning id into aid;
 end if;
 select * into f from clinical.document_finalizations where signature_operation_id=op.id;
 insert into clinical.document_delivery_requests(document_id,version,signature_operation_id,finalization_id,snapshot_id,professional_id,authorization_id,consent_review_id,source_intent_id,adapter,execution_mode,provenance,state,scenario,idempotency_key)
 values(op.document_id,op.version,op.id,f.id,op.snapshot_id,op.professional_id,aid,rv.id,new.id,'simulated','demo','simulated','waiting_signature',scenario,new.id)
 on conflict(source_intent_id) do nothing returning id into rid;
 if rid is not null then
  perform clinical.delivery_transition(rid,'waiting_signature');
  if op.state='succeeded' then
   if aid is not null then perform clinical.delivery_transition(rid,'queued');insert into clinical.document_delivery_jobs(request_id) values(rid);
   else perform clinical.delivery_transition(rid,'blocked');end if;
  end if;
 end if;
 return new;
end $$;
create trigger delivery_intent_enqueue after insert on clinical.signature_demo_delivery_intents for each row execute function clinical.enqueue_delivery_intent();
create function clinical.finalization_release_deliveries() returns trigger language plpgsql security definer set search_path='' as $$
declare r clinical.document_delivery_requests;begin
 for r in select * from clinical.document_delivery_requests where signature_operation_id=new.signature_operation_id and state='waiting_signature' for update loop
  update clinical.document_delivery_requests set finalization_id=new.id where id=r.id;
  if clinical.delivery_authorization_valid(r) then
   perform clinical.delivery_transition(r.id,'queued');insert into clinical.document_delivery_jobs(request_id) values(r.id) on conflict do nothing;
  else perform clinical.delivery_transition(r.id,'blocked');end if;
 end loop;return new;
end $$;
create trigger finalization_releases_delivery after insert on clinical.document_finalizations for each row execute function clinical.finalization_release_deliveries();
create function clinical.signature_failure_stops_delivery() returns trigger language plpgsql security definer set search_path='' as $$
declare r clinical.document_delivery_requests;begin
 if new.state in ('denied','expired','failed','cancelled','stale') then
  for r in select * from clinical.document_delivery_requests where signature_operation_id=new.id and state='waiting_signature' loop
   update clinical.document_delivery_requests set failure_kind='signature_'||new.state where id=r.id;perform clinical.delivery_transition(r.id,'cancelled');
  end loop;
 end if;return new;
end $$;
create trigger signature_failure_delivery after update of state on clinical.document_signature_operations for each row execute function clinical.signature_failure_stops_delivery();

-- Review contract remains stable. Choices only affect the adapter test scenario, never mode or authorization.
alter function public.document_review_command(text,jsonb) rename to document_review_before_workflow;
revoke all on function public.document_review_before_workflow(text,jsonb) from public,anon,authenticated;
create function public.document_review_command(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();rv clinical.document_reviews;target uuid;reason text;result jsonb;scenario text;old_scenario text;begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if action='open' then target:=(payload->>'document_id')::uuid;
 else select * into rv from clinical.document_reviews where id=(payload->>'review_id')::uuid and professional_id=actor;target:=rv.document_id;end if;
 if target is not null and exists(select 1 from clinical.documents where id=target and author_id=actor) then
  perform 1 from clinical.documents where id=target for update;reason:=clinical.document_lock_reason(target);
  if action<>'get' and reason is not null and not(action='sign' and rv.signing_attempt_id is not null) then
   perform clinical.workflow_audit(actor,'document.review_rejected',target,'demo',jsonb_build_object('reason',reason),'denied');return jsonb_build_object('error',reason);
  end if;
 end if;
 begin
  if action='sign' and rv.id is not null then
   scenario:=coalesce(payload->>'delivery_scenario','success');
   if scenario not in ('success','temporary_failure','permanent_failure','timeout','delayed','duplicate') then return '{"error":"invalid"}';end if;
   select c.scenario into old_scenario from clinical.document_delivery_choices c where c.review_id=rv.id;
   if old_scenario is not null and old_scenario<>scenario and rv.signing_attempt_id is not null then return '{"error":"conflict"}';end if;
   insert into clinical.document_delivery_choices values(rv.id,actor,scenario,clock_timestamp()) on conflict(review_id) do update set scenario=excluded.scenario;
  end if;
  result:=public.document_review_before_workflow(action,payload);
  if result ? 'error' then raise exception 'review_rejected';end if;
 exception when raise_exception then perform clinical.workflow_audit(actor,'document.review_rejected',target,'demo',jsonb_build_object('reason',coalesce(result->>'error','unavailable')),'denied');return coalesce(result,'{"error":"unavailable"}'::jsonb);end;
 return result;
exception when invalid_text_representation then return '{"error":"invalid"}';end $$;
revoke all on function public.document_review_command(text,jsonb) from public,anon,authenticated;grant execute on function public.document_review_command(text,jsonb) to authenticated;

-- Frozen, authorized reads for completed operations. No re-signing or patient-metadata rewrite.
alter function public.signing_demo_command(text,jsonb) rename to signing_demo_before_workflow;
revoke all on function public.signing_demo_before_workflow(text,jsonb) from public,anon,authenticated;
create function public.signing_demo_command(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a clinical.signature_attempts;s clinical.signature_snapshots;d clinical.documents;reason text;begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise insufficient_privilege;end if;
 if not exists(select 1 from clinical.signing_environment where id and demo_enabled) then return '{"error":"unavailable"}';end if;
 if action in ('status','cancel') then
  select * into a from clinical.signature_attempts where id=(payload->>'attempt_id')::uuid and professional_id=auth.uid();
  if a.id is not null and exists(select 1 from clinical.document_finalizations f join clinical.document_signature_operations o on o.id=f.signature_operation_id where o.legacy_attempt_id=a.id) then
   select * into s from clinical.signature_snapshots where id=a.snapshot_id;
   select * into d from clinical.documents where id=s.document_id and author_id=auth.uid();
   if d.id is null or not clinical.can_author_documents(auth.uid(),d.athlete_id) then return '{"error":"unavailable"}';end if;
   return jsonb_build_object('snapshot',jsonb_build_object('id',s.id,'document_id',s.document_id,'version',s.version,'content_hash',s.content_hash,'created_at',s.created_at,'expires_at',s.expires_at,'material',s.canonical_bytes::jsonb),
    'attempt',jsonb_build_object('id',a.id,'state',a.state,'identity_id',a.identity_id,'simulated',true,'cryptographically_signed',false,'certificate_verified',false,'confirmed_at',a.confirmed_at));
  end if;
 elsif action in ('prepare','confirm') then
  if action='prepare' then select * into d from clinical.documents where id=(payload->>'document_id')::uuid and author_id=auth.uid();
  else select * into s from clinical.signature_snapshots where id=(payload->>'snapshot_id')::uuid and professional_id=auth.uid();select * into d from clinical.documents where id=s.document_id and author_id=auth.uid();end if;
  if d.id is not null and exists(select 1 from clinical.document_finalizations where document_id=d.id) then return '{"error":"finalized"}';end if;
 end if;
 return public.signing_demo_before_workflow(action,payload);
exception when invalid_text_representation then return '{"error":"invalid"}';end $$;
revoke all on function public.signing_demo_command(text,jsonb) from public,anon,authenticated;grant execute on function public.signing_demo_command(text,jsonb) to authenticated;

create function public.claim_document_delivery_job(target uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j clinical.document_delivery_jobs;r clinical.document_delivery_requests;a clinical.document_delivery_attempts;token uuid;f clinical.document_finalizations;begin
 if not exists(select 1 from clinical.signing_environment where id and demo_enabled) or not exists(select 1 from clinical.document_delivery_environment where id and fixture_policy_enabled) then return '{"job":null}';end if;
 select jobs.* into j from clinical.document_delivery_jobs jobs join clinical.document_delivery_requests req on req.id=jobs.request_id
 where (target is null or req.document_id=target) and req.execution_mode='demo' and req.provenance='simulated'
 and jobs.state<>'done' and jobs.available_at<=clock_timestamp() and (jobs.lease_expires_at is null or jobs.lease_expires_at<=clock_timestamp())
 order by jobs.available_at,req.created_at for update of jobs skip locked limit 1;
 if j.request_id is null then return '{"job":null}';end if;
 select * into r from clinical.document_delivery_requests where id=j.request_id for update;
 select * into f from clinical.document_finalizations where id=r.finalization_id and document_id=r.document_id and version=r.version and execution_mode=r.execution_mode and provenance=r.provenance;
 if r.state in ('delivered','failed','cancelled','blocked') then update clinical.document_delivery_jobs set state='done' where request_id=r.id;return '{"job":null}';end if;
 if f.id is null or not clinical.delivery_authorization_valid(r) then
  update clinical.document_delivery_requests set failure_kind='authorization_revoked' where id=r.id;perform clinical.delivery_transition(r.id,'blocked',r.current_attempt_id);
  update clinical.document_delivery_jobs set state='done',lease_token=null,lease_expires_at=null where request_id=r.id;return '{"job":null}';
 end if;
 token:=gen_random_uuid();
 if r.current_attempt_id is null then
  insert into clinical.document_delivery_attempts(request_id,number,state,execution_mode,provenance,adapter,correlation)
  values(r.id,r.attempts_count+1,'processing',r.execution_mode,r.provenance,r.adapter,'simulated:'||r.id||':'||(r.attempts_count+1)) returning * into a;
  update clinical.document_delivery_requests set current_attempt_id=a.id,attempts_count=attempts_count+1 where id=r.id;
  perform clinical.delivery_transition(r.id,'processing',a.id);
 else select * into a from clinical.document_delivery_attempts where id=r.current_attempt_id;end if;
 update clinical.document_delivery_jobs set state='leased',lease_token=token,lease_expires_at=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() where request_id=r.id;
 return jsonb_build_object('job',jsonb_build_object('requestId',r.id,'attemptId',a.id,'attemptNumber',a.number,'observations',a.observations,'leaseToken',token,'executionMode',r.execution_mode,'provenance',r.provenance,'adapter',r.adapter,'scenario',r.scenario,'state',r.state,'dispatchKind',case when r.current_attempt_id is null then 'submit' else 'reconcile' end,'cancelRequested',r.cancel_requested,'correlation',a.correlation,'artifact',jsonb_build_object('snapshotId',r.snapshot_id,'hash',f.content_hash,'provenance',f.provenance,'executionMode',f.execution_mode)));
end $$;
create function public.complete_document_delivery_job(request_id uuid,attempt_id uuid,lease_token uuid,observation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r clinical.document_delivery_requests;j clinical.document_delivery_jobs;a clinical.document_delivery_attempts;event text;next_state text;failure text;receipt uuid;begin
 select * into j from clinical.document_delivery_jobs where clinical.document_delivery_jobs.request_id=complete_document_delivery_job.request_id for update;
 select * into r from clinical.document_delivery_requests where id=request_id for update;
 select * into a from clinical.document_delivery_attempts where id=attempt_id and clinical.document_delivery_attempts.request_id=r.id;
 if r.id is null or a.id is null then return '{"error":"unavailable"}';end if;
 if r.execution_mode<>'demo' or r.provenance<>'simulated' or observation->>'executionMode'<>'demo' or observation->>'provenance'<>'simulated'
  or not exists(select 1 from clinical.signing_environment where id and demo_enabled) then return '{"error":"mode_mismatch"}';end if;
 event:=observation->>'eventId';next_state:=observation->>'state';failure:=nullif(observation->>'failureKind','');
 if event is null or length(event)>180 or next_state not in ('processing','accepted_by_provider','delivered','failed','cancelled','uncertain') or failure is not null and failure not in ('retryable','permanent','timeout') then return '{"error":"invalid"}';end if;
 if exists(select 1 from clinical.document_delivery_results where clinical.document_delivery_results.attempt_id=a.id and event_id=event) then return '{"ok":true,"duplicate":true}';end if;
 if r.current_attempt_id<>a.id then
  insert into clinical.document_delivery_results(request_id,attempt_id,event_id,state,failure_kind,execution_mode,provenance,disposition) values(r.id,a.id,event,next_state,failure,'demo','simulated','ignored_stale_attempt');return '{"ok":true,"ignored":true}';
 end if;
 if j.lease_token is distinct from lease_token or j.lease_expires_at<=clock_timestamp() then return '{"error":"lease_expired"}';end if;
 if r.state in ('delivered','cancelled','failed','blocked') then
  insert into clinical.document_delivery_results(request_id,attempt_id,event_id,state,execution_mode,provenance,disposition) values(r.id,a.id,event,next_state,'demo','simulated','ignored_terminal');return '{"ok":true,"ignored":true}';
 end if;
 if not clinical.delivery_authorization_valid(r) then
  update clinical.document_delivery_requests set failure_kind='authorization_revoked' where id=r.id;perform clinical.delivery_transition(r.id,'blocked',a.id);
  update clinical.document_delivery_jobs set state='done',lease_token=null,lease_expires_at=null where clinical.document_delivery_jobs.request_id=r.id;return '{"error":"authorization_revoked"}';
 end if;
 -- Accepted is an observation, never delivery proof; no regression to an older phase.
 if r.state='accepted_by_provider' and next_state='processing' then next_state:='accepted_by_provider';end if;
 insert into clinical.document_delivery_results(request_id,attempt_id,event_id,state,failure_kind,execution_mode,provenance,disposition)
 values(r.id,a.id,event,next_state,failure,'demo','simulated','applied') returning id into receipt;
 update clinical.document_delivery_attempts set state=next_state,observations=observations+1,updated_at=clock_timestamp() where id=a.id;
 update clinical.document_delivery_requests set failure_kind=failure where id=r.id;
 perform clinical.delivery_transition(r.id,next_state,a.id);
 update clinical.document_delivery_jobs set state=case when next_state in ('delivered','failed','cancelled') then 'done' else 'ready' end,
  lease_token=null,lease_expires_at=null,available_at=clock_timestamp()+make_interval(secs=>least(10,greatest(0.2,coalesce((observation->>'pollAfterSeconds')::numeric,0.5)::double precision))),updated_at=clock_timestamp()
 where clinical.document_delivery_jobs.request_id=r.id;
 return jsonb_build_object('ok',true,'state',next_state,'receipt',receipt);
exception when invalid_text_representation then return '{"error":"invalid"}';end $$;
revoke all on function public.claim_document_delivery_job(uuid),public.complete_document_delivery_job(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_document_delivery_job(uuid),public.complete_document_delivery_job(uuid,uuid,uuid,jsonb) to service_role;

create function clinical.workflow_metadata(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();d clinical.documents;f clinical.document_finalizations;op clinical.document_signature_operations;origin clinical.document_derivations;deliveries jsonb;begin
 select * into d from clinical.documents where id=target and author_id=actor;
 if d.id is null or not clinical.can_author_documents(actor,d.athlete_id) then return null;end if;
 select * into f from clinical.document_finalizations where document_id=d.id;
 if f.id is not null then select * into op from clinical.document_signature_operations where id=f.signature_operation_id;
 else select * into op from clinical.document_signature_operations where document_id=d.id order by created_at desc limit 1;end if;
 select * into origin from clinical.document_derivations where document_id=d.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'state',r.state,'failureKind',r.failure_kind,'executionMode',r.execution_mode,'provenance',r.provenance,'attempts',r.attempts_count,'createdAt',r.created_at,'updatedAt',r.updated_at,'recipient',case when exists(select 1 from clinical.athlete_access where athlete_id=d.athlete_id and professional_id=actor and can_edit) then a.recipient_masked else null end) order by r.created_at desc),'[]') into deliveries
 from clinical.document_delivery_requests r left join clinical.document_delivery_authorizations a on a.id=r.authorization_id where r.document_id=d.id and r.professional_id=actor;
 return jsonb_build_object('lifecycle',case when f.id is not null then 'finalized' else d.status end,'locked',clinical.document_lock_reason(d.id) is not null,
 'finalization',case when f.id is null then null else jsonb_build_object('id',f.id,'at',f.finalized_at,'version',f.version,'executionMode',f.execution_mode,'provenance',f.provenance,'snapshotId',f.snapshot_id,'hash',f.content_hash) end,
 'signature',case when op.id is null then null else jsonb_build_object('id',op.id,'attemptId',op.legacy_attempt_id,'state',op.state,'identityId',op.identity_id,'identityLabel',(select label from clinical.signing_identities where id=op.identity_id),'adapter',op.provider,'executionMode',op.execution_mode,'provenance',op.provenance,'cryptographicallyVerified',f.id is not null and exists(select 1 from clinical.document_verified_signature_evidence e join clinical.signature_artifacts a on a.id=e.artifact_id join clinical.signature_snapshots s on s.id=e.snapshot_id where e.id=op.verified_evidence_id and e.operation_id=op.id and e.artifact_id=op.artifact_id and e.snapshot_id=op.snapshot_id and e.content_hash=s.content_hash and e.identity_id=op.identity_id and e.integrity_verified and e.identity_verified and e.signature_verified and a.validated and a.provenance='production'),'at',op.updated_at) end,
 'deliveries',deliveries,'derivedFrom',case when origin.document_id is null then null else jsonb_build_object('documentId',origin.source_document_id,'version',origin.source_version) end);
end $$;
create function public.document_workflow_get(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare meta jsonb;d clinical.documents;history jsonb;s clinical.signature_snapshots;begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 meta:=clinical.workflow_metadata(target);if meta is null then perform clinical.workflow_audit(auth.uid(),'document.workflow_denied',null,'unknown','{}','denied');return '{"error":"unavailable"}';end if;
 select * into d from clinical.documents where id=target;
 if meta->'finalization' is not null and meta->'finalization'<>'null'::jsonb then select * into s from clinical.signature_snapshots where id=(meta->'finalization'->>'snapshotId')::uuid;
 elsif meta->'signature' is not null and meta->'signature'<>'null'::jsonb then select snap.* into s from clinical.signature_snapshots snap join clinical.document_signature_operations op on op.snapshot_id=snap.id where op.id=(meta->'signature'->>'id')::uuid;end if;
 select coalesce(jsonb_agg(x order by x->>'at'),'[]') into history from (
  select jsonb_build_object('kind','review','state','reviewed','at',e.occurred_at,'provenance','simulated') x from clinical.audit_events e join clinical.document_reviews rv on rv.id=e.resource_id where rv.document_id=target and rv.professional_id=auth.uid() and e.operation='document_review.opened'
  union all select jsonb_build_object('kind','signature','state',t.state,'at',t.occurred_at,'provenance','simulated') x from clinical.signature_transitions t join clinical.document_signature_operations o on o.legacy_attempt_id=t.attempt_id where o.document_id=target and o.professional_id=auth.uid()
  union all select jsonb_build_object('kind','finalization','state','finalized','at',f.finalized_at,'provenance',f.provenance) from clinical.document_finalizations f where f.document_id=target
  union all select jsonb_build_object('kind','delivery','state',t.state,'at',t.occurred_at,'provenance',t.provenance,'requestId',t.request_id,'attemptNumber',(select number from clinical.document_delivery_attempts where id=t.attempt_id)) from clinical.document_delivery_transitions t join clinical.document_delivery_requests r on r.id=t.request_id where r.document_id=target and r.professional_id=auth.uid()
 ) events;
 perform clinical.workflow_audit(auth.uid(),'document.workflow_read',target,coalesce(meta->'signature'->>'executionMode','demo'));
 return jsonb_build_object('workflow',meta,'material',case when s.id is null then null else s.canonical_bytes::jsonb end,'history',history);
end $$;
revoke all on function public.document_workflow_get(uuid) from public,anon,authenticated;grant execute on function public.document_workflow_get(uuid) to authenticated;

create function public.document_workflow_action(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();d clinical.documents;f clinical.document_finalizations;r clinical.document_delivery_requests;old clinical.document_delivery_requests;
 p jsonb;aid uuid;key uuid;reason text;derived clinical.document_derivations;new_id uuid;result jsonb;rid uuid;begin
 if actor is null then raise insufficient_privilege;end if;
 if payload ?| array['execution_mode','provenance','phone','recipient','recipient_id','signed','delivered','authorization_id','artifact_id'] then return '{"error":"invalid"}';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if action='derive' then
  select * into d from clinical.documents where id=(payload->>'document_id')::uuid and author_id=actor for update;
  if d.id is null or not clinical.can_author_documents(actor,d.athlete_id) then perform clinical.workflow_audit(actor,'document.workflow_action_denied',null,'unknown','{}','denied');return '{"error":"unavailable"}';end if;
  select * into f from clinical.document_finalizations where document_id=d.id;
  if f.id is null then return '{"error":"not_finalized"}';end if;
  key:=(payload->>'idempotency_key')::uuid;if key is null then return '{"error":"invalid"}';end if;
  select * into derived from clinical.document_derivations where professional_id=actor and idempotency_key=key;
  if derived.document_id is not null then if derived.source_document_id<>d.id then return '{"error":"conflict"}';end if;return jsonb_build_object('documentId',derived.document_id);end if;
  new_id:=gen_random_uuid();
  result:=public.document_save(d.athlete_id,new_id,0,d.document_type,(select canonical_bytes::jsonb->'content' from clinical.signature_snapshots where id=f.snapshot_id),'save');
  if result ? 'error' then return result;end if;
  insert into clinical.document_derivations values(new_id,d.id,f.id,f.version,f.content_hash,actor,key,clock_timestamp());
  perform clinical.workflow_audit(actor,'document.derived',new_id,f.execution_mode,jsonb_build_object('source_document_id',d.id,'source_version',f.version));return jsonb_build_object('documentId',new_id);
 end if;
 select * into r from clinical.document_delivery_requests where id=(payload->>'request_id')::uuid and professional_id=actor for update;
 if r.id is null then perform clinical.workflow_audit(actor,'document.workflow_action_denied',null,'unknown','{}','denied');return '{"error":"unavailable"}';end if;
 select * into d from clinical.documents where id=r.document_id and author_id=actor;
 if d.id is null or not clinical.can_author_documents(actor,d.athlete_id) then perform clinical.workflow_audit(actor,'document.workflow_action_denied',null,'unknown','{}','denied');return '{"error":"unavailable"}';end if;
 if not exists(select 1 from clinical.signing_environment where id and demo_enabled) then perform clinical.workflow_audit(actor,'document.workflow_action_denied',null,'unknown','{}','denied');return '{"error":"unavailable"}';end if;
 if action='cancel' then
  if r.state not in ('queued','processing','accepted_by_provider','uncertain','waiting_signature') then return '{"error":"conflict"}';end if;
  if r.current_attempt_id is null then perform clinical.delivery_transition(r.id,'cancelled');update clinical.document_delivery_jobs set state='done' where request_id=r.id;
  else update clinical.document_delivery_requests set cancel_requested=true where id=r.id;update clinical.document_delivery_jobs set available_at=clock_timestamp() where request_id=r.id;end if;
  perform clinical.workflow_audit(actor,'delivery.cancel_requested',r.id,r.execution_mode);return '{"ok":true}';
 elsif action in ('retry','resend') then
  key:=(payload->>'idempotency_key')::uuid;reason:=btrim(coalesce(payload->>'justification',''));
  if key is null or length(reason) not between 8 and 500 or payload->'confirmed' is distinct from 'true'::jsonb then return '{"error":"confirmation_required"}';end if;
  if exists(select 1 from clinical.document_delivery_actions where professional_id=actor and idempotency_key=key and request_id=r.id and clinical.document_delivery_actions.action=document_workflow_action.action) then return '{"ok":true,"duplicate":true}';end if;
  if not clinical.delivery_authorization_valid(r) then return '{"error":"recipient_unavailable"}';end if;
  if action='retry' then
   if r.state<>'failed' or r.failure_kind<>'retryable' then return '{"error":"conflict"}';end if;
   update clinical.document_delivery_requests set current_attempt_id=null,cancel_requested=false,failure_kind=null where id=r.id;
   perform clinical.delivery_transition(r.id,'queued');
   insert into clinical.document_delivery_jobs(request_id) values(r.id) on conflict(request_id) do update set state='ready',available_at=clock_timestamp(),lease_token=null,lease_expires_at=null;
  else
   if r.state<>'delivered' then return '{"error":"conflict"}';end if;
   insert into clinical.document_delivery_requests(document_id,version,signature_operation_id,finalization_id,snapshot_id,artifact_id,professional_id,authorization_id,consent_review_id,resend_of_id,adapter,execution_mode,provenance,state,scenario,idempotency_key)
   values(r.document_id,r.version,r.signature_operation_id,r.finalization_id,r.snapshot_id,r.artifact_id,actor,r.authorization_id,r.consent_review_id,r.id,r.adapter,r.execution_mode,r.provenance,'queued','success',key) returning id into rid;
   perform clinical.delivery_transition(rid,'queued');insert into clinical.document_delivery_jobs(request_id) values(rid);
  end if;
  insert into clinical.document_delivery_actions(request_id,professional_id,idempotency_key,action,justification) values(r.id,actor,key,action,reason);
  perform clinical.workflow_audit(actor,'delivery.'||action,r.id,r.execution_mode,jsonb_build_object('action_key',key,'new_request_id',rid));return jsonb_build_object('ok',true,'requestId',coalesce(rid,r.id));
 end if;return '{"error":"invalid"}';
exception when invalid_text_representation or unique_violation then return '{"error":"conflict"}';end $$;
revoke all on function public.document_workflow_action(text,jsonb) from public,anon,authenticated;grant execute on function public.document_workflow_action(text,jsonb) to authenticated;

-- Authorized list/open DTO enrichment; no wider joins or document scope.
alter function public.document_open(uuid,uuid) rename to document_open_before_workflow;
revoke all on function public.document_open_before_workflow(uuid,uuid) from public,anon,authenticated;
create function public.document_open(target uuid,document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin result:=public.document_open_before_workflow(target,document_id);if result ? 'error' then return result;end if;return result||jsonb_build_object('workflow',clinical.workflow_metadata(document_id));end $$;
revoke all on function public.document_open(uuid,uuid) from public,anon,authenticated;grant execute on function public.document_open(uuid,uuid) to authenticated;
alter function public.document_list(uuid) rename to document_list_before_workflow;
revoke all on function public.document_list_before_workflow(uuid) from public,anon,authenticated;
create function public.document_list(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;docs jsonb;begin result:=public.document_list_before_workflow(target);if result ? 'error' then return result;end if;
 select coalesce(jsonb_agg(item||jsonb_build_object('author_name',d.author_name,'workflow',clinical.workflow_metadata(d.id)) order by d.updated_at desc),'[]') into docs
 from jsonb_array_elements(result->'documents') item join clinical.documents d on d.id=(item->>'id')::uuid where d.author_id=auth.uid() and d.athlete_id=target;
 return jsonb_build_object('documents',docs);end $$;
revoke all on function public.document_list(uuid) from public,anon,authenticated;grant execute on function public.document_list(uuid) to authenticated;

-- Protect private helpers and triggers as well as their tables.
do $$ declare f record;begin for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clinical' and p.proname=any(array['workflow_audit','document_lock_reason','guard_document_workflow','guard_document_revision_insert','guard_finalization_update','finalize_document_operation','bridge_signature_operation','delivery_policy','delivery_transition','delivery_authorization_valid','enqueue_delivery_intent','finalization_release_deliveries','signature_failure_stops_delivery','workflow_metadata']) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.oid::regprocedure);end loop;end $$;

create function public.document_delivery_eligibility(review_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rv clinical.document_reviews;begin
 select * into rv from clinical.document_reviews where id=review_id and professional_id=auth.uid();
 if rv.id is null or not clinical.can_author_documents(auth.uid(),rv.athlete_id) then return '{"eligible":false}';end if;
 return clinical.delivery_policy(auth.uid(),rv.athlete_id)-'contact_digest'-'recipient';
end $$;
revoke all on function public.document_delivery_eligibility(uuid) from public,anon,authenticated;grant execute on function public.document_delivery_eligibility(uuid) to authenticated;
create function clinical.guard_completed_signature_operation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from clinical.document_finalizations where signature_operation_id=old.id) and (to_jsonb(new)-'updated_at')<>(to_jsonb(old)-'updated_at') then raise exception using errcode='55000',message='finalized_signature_immutable';end if;
 return new;
end $$;
revoke all on function clinical.guard_completed_signature_operation() from public,anon,authenticated;
create trigger finalized_signature_immutable before update on clinical.document_signature_operations for each row execute function clinical.guard_completed_signature_operation();

-- Provenance is append-only even for privileged future workers: a simulation cannot be relabelled.
create function clinical.guard_workflow_provenance() returns trigger language plpgsql set search_path='' as $$
begin if new.execution_mode<>old.execution_mode or new.provenance<>old.provenance then raise exception using errcode='55000',message='workflow_provenance_immutable';end if;return new;end $$;
revoke all on function clinical.guard_workflow_provenance() from public,anon,authenticated;
do $$ declare t text;begin foreach t in array array['document_signature_operations','document_finalizations','document_delivery_authorizations','document_delivery_requests','document_delivery_attempts','document_delivery_transitions','document_delivery_results'] loop
 execute format('create trigger workflow_provenance_immutable before update on clinical.%I for each row execute function clinical.guard_workflow_provenance()',t);end loop;end $$;
