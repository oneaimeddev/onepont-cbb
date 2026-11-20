-- Additive demonstration domain. No updates to clinical documents or grants.
create table clinical.professional_details (
 professional_id uuid primary key references public.profiles(id),
 full_name text not null default '' check(length(full_name)<=200),
 contact_email text not null default '' check(length(contact_email)<=254),
 phone text not null default '' check(length(phone)<=40),
 specialties text not null default '' check(length(specialties)<=1000),
 photo_path text,
 updated_at timestamptz not null default now()
);
create table clinical.professional_registrations (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.profiles(id),
 council text not null check(length(council) between 1 and 40), registration_number text not null check(length(registration_number) between 1 and 80),
 jurisdiction text not null check(length(jurisdiction) between 1 and 80),
 verification text not null default 'declared' check(verification in ('declared','verified','rejected','expired','suspended')),
 unique(professional_id,council,registration_number,jurisdiction)
);
create table clinical.signing_environment (id boolean primary key default true check(id), demo_enabled boolean not null default false);
insert into clinical.signing_environment values(true,false);
create table clinical.signature_providers (
 id text primary key, label text not null, simulated boolean not null,
 capabilities jsonb not null
);
insert into clinical.signature_providers values ('demo','Simulador CBB',true,'{"identities":true,"authorization":true,"polling":true,"cancel":true,"callbacks":false,"cryptographicValidation":false}');
create table clinical.signature_connections (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.profiles(id),
 provider_id text not null references clinical.signature_providers(id), state text not null check(state in ('connected','disconnected')),
 epoch integer not null default 1, unique(professional_id,provider_id), unique(id,professional_id)
);
create table clinical.signing_identities (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.profiles(id),
 connection_id uuid not null, label text not null, simulated boolean not null default true check(simulated),
 certificate_verified boolean not null default false check(not certificate_verified),
 foreign key(connection_id,professional_id) references clinical.signature_connections(id,professional_id),
 unique(id,professional_id), unique(connection_id,label)
);
create table clinical.signature_preferences (
 professional_id uuid primary key references public.profiles(id), identity_id uuid not null,
 foreign key(identity_id,professional_id) references clinical.signing_identities(id,professional_id)
);
create table clinical.signature_snapshots (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.profiles(id),
 document_id uuid not null references clinical.documents(id), version integer not null,
 canonical_bytes text not null, content_hash text not null,
 renderer text not null default 'cbb-json-utf8-v1', created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
 unique(id,professional_id), check(content_hash=encode(extensions.digest(canonical_bytes,'sha256'),'hex'))
);
create table clinical.signature_attempts (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.profiles(id),
 snapshot_id uuid not null, identity_id uuid not null,
 idempotency_key uuid not null, scenario text not null check(scenario in ('success','denied','expired','failed','delayed')),
 state text not null check(state in ('authorizing','processing','simulated_success','denied','expired','failed','cancelled','stale')),
 auth_epoch integer not null, confirmed_at timestamptz not null default clock_timestamp(),
 ready_at timestamptz not null, updated_at timestamptz not null default clock_timestamp(),
 simulated boolean not null default true check(simulated),
 cryptographically_signed boolean not null default false check(not cryptographically_signed),
 certificate_verified boolean not null default false check(not certificate_verified),
 foreign key(snapshot_id,professional_id) references clinical.signature_snapshots(id,professional_id),
 foreign key(identity_id,professional_id) references clinical.signing_identities(id,professional_id),
 unique(professional_id,idempotency_key)
);
create unique index signature_one_inflight on clinical.signature_attempts(snapshot_id) where state in ('authorizing','processing');
create table clinical.signature_transitions (
 id bigint generated always as identity primary key, attempt_id uuid references clinical.signature_attempts(id),
 professional_id uuid not null references public.profiles(id), snapshot_id uuid references clinical.signature_snapshots(id),
 identity_id uuid references clinical.signing_identities(id), state text not null,
 simulated boolean not null default true check(simulated), origin text not null default 'traditional_ui',
 occurred_at timestamptz not null default clock_timestamp()
);
-- Historical objects are private and immutable. No client table grants.
do $$ declare t text; begin
 foreach t in array array['professional_details','professional_registrations','signing_environment','signature_providers','signature_connections','signing_identities','signature_preferences','signature_snapshots','signature_attempts','signature_transitions'] loop
 execute format('alter table clinical.%I enable row level security',t);
 execute format('revoke all on clinical.%I from public,anon,authenticated',t);
 end loop;
end $$;
create function clinical.signing_audit(op text, resource uuid, meta jsonb default '{}') returns void
language sql security definer set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(auth.uid(),'signature_demo',resource,op,'success','traditional_ui','human_ui',meta || jsonb_build_object('simulated',op like 'signature.%'));
$$;
revoke all on function clinical.signing_audit(text,uuid,jsonb) from public,anon,authenticated;
create function public.configure_signing_demo(enabled boolean) returns void language sql security definer set search_path='' as $$
 update clinical.signing_environment set demo_enabled=enabled where id;
$$;
revoke all on function public.configure_signing_demo(boolean) from public,anon,authenticated;
grant execute on function public.configure_signing_demo(boolean) to service_role;

create function public.professional_profile_command(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p public.profiles; d clinical.professional_details; rid uuid;
begin
 if actor is null then raise insufficient_privilege; end if;
 select * into p from public.profiles where id=actor;
 if p.id is null then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if action='save' then
  if payload - array['full_name','display_name','profession','contact_email','phone','specialties'] <> '{}'::jsonb
   or jsonb_typeof(payload)<>'object' then return '{"error":"invalid"}'; end if;
  if exists(select 1 from jsonb_each(payload) where jsonb_typeof(value)<>'string') then return '{"error":"invalid"}'; end if;
  if length(trim(coalesce(payload->>'display_name',''))) not between 1 and 120
   or length(trim(coalesce(payload->>'profession',''))) not between 1 and 100 then return '{"error":"invalid"}'; end if;
  insert into clinical.professional_details(professional_id,full_name,contact_email,phone,specialties)
  values(actor,trim(coalesce(payload->>'full_name','')),trim(coalesce(payload->>'contact_email','')),trim(coalesce(payload->>'phone','')),trim(coalesce(payload->>'specialties','')))
  on conflict(professional_id) do update set full_name=excluded.full_name,contact_email=excluded.contact_email,phone=excluded.phone,specialties=excluded.specialties,updated_at=clock_timestamp();
  update public.profiles set display_name=trim(payload->>'display_name'),profession=trim(payload->>'profession') where id=actor;
  perform clinical.signing_audit('professional.profile_updated',actor,'{"declared":true}');
 elsif action='registration_add' then
  if jsonb_typeof(payload)<>'object' or payload - array['council','registration_number','jurisdiction'] <> '{}'::jsonb then return '{"error":"invalid"}'; end if;
  if exists(select 1 from jsonb_each(payload) where jsonb_typeof(value)<>'string') then return '{"error":"invalid"}'; end if;
  insert into clinical.professional_registrations(professional_id,council,registration_number,jurisdiction)
  values(actor,upper(trim(payload->>'council')),trim(payload->>'registration_number'),upper(trim(payload->>'jurisdiction'))) returning id into rid;
  perform clinical.signing_audit('professional.registration_declared',rid,'{"verified":false}');
 elsif action='registration_remove' then
  delete from clinical.professional_registrations where id=(payload->>'id')::uuid and professional_id=actor and verification='declared' returning id into rid;
  if rid is null then return '{"error":"unavailable"}'; end if;
  perform clinical.signing_audit('professional.registration_removed',rid);
 elsif action<>'get' then return '{"error":"invalid"}'; end if;
 select * into p from public.profiles where id=actor;
 select * into d from clinical.professional_details where professional_id=actor;
 return jsonb_build_object('profile',jsonb_build_object('display_name',p.display_name,'profession',p.profession,'full_name',coalesce(d.full_name,''),'contact_email',coalesce(d.contact_email,''),'phone',coalesce(d.phone,''),'specialties',coalesce(d.specialties,'')),
 'registrations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'council',council,'registration_number',registration_number,'jurisdiction',jurisdiction,'verification',verification) order by council,registration_number) from clinical.professional_registrations where professional_id=actor),'[]'));
exception when check_violation or not_null_violation or unique_violation or invalid_text_representation then return '{"error":"invalid"}';
end $$;
revoke all on function public.professional_profile_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.professional_profile_command(text,jsonb) to authenticated;

create function clinical.signing_material(d clinical.documents) returns text
language sql stable security definer set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('document_id',d.id,'version',d.version,'document_type',d.document_type,'status',d.status,'content',d.content,'author_id',d.author_id,'author_name',d.author_name,'credential_label',d.credential_label,'athlete_id',d.athlete_id,'athlete_name',a.full_name,'created_at',d.created_at,'updated_at',d.updated_at)::text
 from clinical.athletes a where a.id=d.athlete_id;
$$;
revoke all on function clinical.signing_material(clinical.documents) from public,anon,authenticated;
create function clinical.signing_reject(reason text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,safe_metadata)
 values(auth.uid(),'signature_demo','signature.rejected','denied',jsonb_build_object('simulated',true,'reason',reason));
 return jsonb_build_object('error',reason);
end $$;
revoke all on function clinical.signing_reject(text) from public,anon,authenticated;

create function public.signing_demo_command(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); conn clinical.signature_connections; ident clinical.signing_identities;
 snap clinical.signature_snapshots; att clinical.signature_attempts; doc clinical.documents;
 selected uuid; request_key uuid; material text; next_state text; prev_state text;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise insufficient_privilege; end if;
 if not exists(select 1 from clinical.signing_environment where id and demo_enabled) then return clinical.signing_reject('unavailable'); end if;
 -- Serializes per professional, including preference and retries across tabs.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if not exists(select 1 from clinical.signing_environment where id and demo_enabled) then return clinical.signing_reject('unavailable'); end if;
 if action='connect' then
  insert into clinical.signature_connections(professional_id,provider_id,state) values(actor,'demo','connected')
  on conflict(professional_id,provider_id) do update set state='connected',epoch=clinical.signature_connections.epoch+1 returning * into conn;
  insert into clinical.signing_identities(professional_id,connection_id,label) values(actor,conn.id,'Identidade DEMO A'),(actor,conn.id,'Identidade DEMO B') on conflict do nothing;
  perform clinical.signing_audit('signature.demo_connected',conn.id);
 elsif action='disconnect' then
  update clinical.signature_connections set state='disconnected',epoch=epoch+1 where professional_id=actor and provider_id='demo' returning * into conn;
  perform clinical.signing_audit('signature.demo_disconnected',conn.id);
 elsif action='prefer' then
  select i.* into ident from clinical.signing_identities i join clinical.signature_connections c on c.id=i.connection_id
  where i.id=(payload->>'identity_id')::uuid and i.professional_id=actor and c.state='connected';
  if ident.id is null then return clinical.signing_reject('unavailable'); end if;
  insert into clinical.signature_preferences values(actor,ident.id) on conflict(professional_id) do update set identity_id=excluded.identity_id;
  perform clinical.signing_audit('signature.preference_changed',ident.id);
 elsif action='history' then
  select * into doc from clinical.documents where id=(payload->>'document_id')::uuid and author_id=actor;
  if doc.id is null or not clinical.can_author_documents(actor,doc.athlete_id) then return clinical.signing_reject('unavailable'); end if;
  return jsonb_build_object('attempts',coalesce((select jsonb_agg(row_to_json(h)) from (
    select a.id,a.state,a.confirmed_at,s.id as snapshot_id,s.version,i.label
    from clinical.signature_attempts a join clinical.signature_snapshots s on s.id=a.snapshot_id join clinical.signing_identities i on i.id=a.identity_id
    where a.professional_id=actor and s.document_id=doc.id order by a.confirmed_at desc limit 10
  ) h),'[]'));
 elsif action='prepare' then
  select * into doc from clinical.documents where id=(payload->>'document_id')::uuid and author_id=actor for update;
  if doc.id is null or not clinical.can_author_documents(actor,doc.athlete_id) then return clinical.signing_reject('unavailable'); end if;
  if payload->>'version' is null or doc.version<>(payload->>'version')::integer then return clinical.signing_reject('stale'); end if;
  if not clinical.document_ready(doc.document_type,doc.content) then return clinical.signing_reject('incomplete'); end if;
  material:=clinical.signing_material(doc);
  insert into clinical.signature_snapshots(professional_id,document_id,version,canonical_bytes,content_hash)
  values(actor,doc.id,doc.version,material,encode(extensions.digest(material,'sha256'),'hex')) returning * into snap;
  perform clinical.signing_audit('signature.prepared',snap.id,jsonb_build_object('document_id',doc.id,'version',doc.version,'hash',snap.content_hash));
 elsif action in ('snapshot','confirm','status','cancel') then
  if action in ('status','cancel') then
   select * into att from clinical.signature_attempts where id=(payload->>'attempt_id')::uuid and professional_id=actor;
   if att.id is null then return clinical.signing_reject('unavailable'); end if;
   select * into snap from clinical.signature_snapshots where id=att.snapshot_id and professional_id=actor;
  else
   select * into snap from clinical.signature_snapshots where id=(payload->>'snapshot_id')::uuid and professional_id=actor;
  end if;
  if snap.id is null then return clinical.signing_reject('unavailable'); end if;
  select * into doc from clinical.documents where id=snap.document_id and author_id=actor for update;
  if doc.id is null or not clinical.can_author_documents(actor,doc.athlete_id) then return clinical.signing_reject('unavailable'); end if;
  if doc.version<>snap.version or clinical.signing_material(doc)<>snap.canonical_bytes or snap.content_hash<>encode(extensions.digest(snap.canonical_bytes,'sha256'),'hex') then
   if att.id is not null and att.state in ('authorizing','processing') then
    update clinical.signature_attempts set state='stale',updated_at=clock_timestamp() where id=att.id;
    insert into clinical.signature_transitions(attempt_id,professional_id,snapshot_id,identity_id,state) values(att.id,actor,snap.id,att.identity_id,'stale');
    perform clinical.signing_audit('signature.stale',att.id,jsonb_build_object('document_id',doc.id,'version',snap.version));
   end if;
   return clinical.signing_reject('stale');
  end if;
  if action='confirm' then
   if payload->'confirmed' is distinct from 'true'::jsonb or payload->>'hash' is distinct from snap.content_hash then return clinical.signing_reject('confirmation_required'); end if;
   selected:=(payload->>'identity_id')::uuid; request_key:=(payload->>'idempotency_key')::uuid;
   if request_key is null or payload->>'scenario' not in ('success','denied','expired','failed','delayed') then return clinical.signing_reject('invalid'); end if;
   select * into att from clinical.signature_attempts where professional_id=actor and idempotency_key=request_key;
   if att.id is not null then
    if att.snapshot_id<>snap.id or att.identity_id<>selected or att.scenario is distinct from payload->>'scenario' then return clinical.signing_reject('conflict'); end if;
   else
    if snap.expires_at<=clock_timestamp() then return clinical.signing_reject('expired'); end if;
    select i.* into ident from clinical.signing_identities i join clinical.signature_connections c on c.id=i.connection_id
    where i.id=selected and i.professional_id=actor and c.state='connected' and i.simulated and not i.certificate_verified;
    if ident.id is null then return clinical.signing_reject('unavailable'); end if;
    select * into conn from clinical.signature_connections where id=ident.connection_id;
    if exists(select 1 from clinical.signature_attempts a join clinical.signature_snapshots s on s.id=a.snapshot_id where a.professional_id=actor and s.document_id=snap.document_id and s.version=snap.version and a.state in ('authorizing','processing')) then return clinical.signing_reject('in_progress'); end if;
    insert into clinical.signature_attempts(professional_id,snapshot_id,identity_id,idempotency_key,scenario,state,auth_epoch,ready_at)
    values(actor,snap.id,selected,request_key,payload->>'scenario','authorizing',conn.epoch,clock_timestamp()+case when payload->>'scenario'='delayed' then interval '8 seconds' else interval '0 seconds' end) returning * into att;
    insert into clinical.signature_transitions(attempt_id,professional_id,snapshot_id,identity_id,state) values(att.id,actor,snap.id,ident.id,att.state);
    perform clinical.signing_audit('signature.confirmed',att.id,jsonb_build_object('document_id',doc.id,'version',snap.version,'identity_id',ident.id,'snapshot_id',snap.id));
   end if;
  elsif action in ('status','cancel') then
   prev_state:=att.state;
   select c.* into conn from clinical.signature_connections c join clinical.signing_identities i on i.connection_id=c.id where i.id=att.identity_id;
   if att.state in ('authorizing','processing') then
    next_state:=case
     when action='cancel' then 'cancelled'
     when snap.expires_at<=clock_timestamp() then 'expired'
     when conn.state<>'connected' or conn.epoch<>att.auth_epoch then 'cancelled'
     when clock_timestamp()<att.ready_at then 'processing'
     when att.scenario in ('success','delayed') then 'simulated_success'
     else att.scenario end;
    update clinical.signature_attempts set state=next_state,updated_at=clock_timestamp() where id=att.id returning * into att;
    if prev_state<>att.state then
     insert into clinical.signature_transitions(attempt_id,professional_id,snapshot_id,identity_id,state) values(att.id,actor,snap.id,att.identity_id,att.state);
     perform clinical.signing_audit('signature.'||att.state,att.id,jsonb_build_object('document_id',doc.id,'version',snap.version,'identity_id',att.identity_id,'snapshot_id',snap.id));
    end if;
   end if;
  end if;
 elsif action<>'list' then return clinical.signing_reject('invalid'); end if;
 if snap.id is not null then
  return jsonb_build_object('snapshot',jsonb_build_object('id',snap.id,'document_id',snap.document_id,'version',snap.version,'content_hash',snap.content_hash,'created_at',snap.created_at,'expires_at',snap.expires_at,'material',snap.canonical_bytes::jsonb),
   'attempt',case when att.id is null then null else jsonb_build_object('id',att.id,'state',att.state,'identity_id',att.identity_id,'simulated',true,'cryptographically_signed',false,'certificate_verified',false,'confirmed_at',att.confirmed_at) end);
 end if;
 return jsonb_build_object('provider','Simulador CBB','simulated',true,'connected',exists(select 1 from clinical.signature_connections where professional_id=actor and state='connected'),
 'preferred', (select identity_id from clinical.signature_preferences where professional_id=actor),
 'identities',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'label',i.label,'provider','Simulador CBB','simulated',true,'certificate_verified',false) order by i.label) from clinical.signing_identities i join clinical.signature_connections c on c.id=i.connection_id where i.professional_id=actor and c.state='connected'),'[]'));
exception when invalid_text_representation or check_violation or not_null_violation then return clinical.signing_reject('invalid');
end $$;
revoke all on function public.signing_demo_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.signing_demo_command(text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('professional-photos','professional-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy professional_photo_read on storage.objects for select to authenticated using(bucket_id='professional-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy professional_photo_insert on storage.objects for insert to authenticated with check(bucket_id='professional-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy professional_photo_update on storage.objects for update to authenticated using(bucket_id='professional-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='professional-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create function public.professional_photo_record() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise insufficient_privilege; end if;
 perform clinical.signing_audit('professional.photo_updated',auth.uid(),'{"declared":true}');
end $$;
revoke all on function public.professional_photo_record() from public,anon,authenticated;
grant execute on function public.professional_photo_record() to authenticated;
create function clinical.signature_snapshot_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Snapshot is immutable'; end $$;
create trigger signature_snapshot_immutable before update on clinical.signature_snapshots for each row execute function clinical.signature_snapshot_immutable();
