-- 007.10.6B.3 / Corte B. Authorization infrastructure only; no clinical executor is enabled.
alter table clinical.conversation_sessions add column operation_epoch bigint not null default 0,add column human_input_sequence bigint not null default 0;
create function clinical.chat_context_epoch() returns trigger language plpgsql set search_path='' as $$begin
 if new.athlete_id is distinct from old.athlete_id or new.status is distinct from old.status then new.operation_epoch:=old.operation_epoch+1;end if;return new;
end $$;
create trigger chat_context_epoch before update of athlete_id,status on clinical.conversation_sessions for each row execute function clinical.chat_context_epoch();
create table clinical.chat_document_workspaces(
 id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.profiles(id),session_id uuid not null references clinical.conversation_sessions(id),
 athlete_id uuid not null references clinical.athletes(id),document_id uuid not null,review_id uuid not null references clinical.document_reviews(id),
 revision integer not null check(revision>0),session_operation_epoch bigint not null,security_epoch bigint not null,
 identity_id uuid references clinical.signing_identities(id),delivery_requested boolean not null default false,recipient_digest text,
 phase text not null default 'reviewed' check(phase in('reviewed','authorization_pending','authorized')),
 last_bind_key uuid not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(session_id,document_id),unique(professional_id,last_bind_key)
);
create table clinical.chat_document_contexts(session_id uuid primary key references clinical.conversation_sessions(id),workspace_id uuid not null references clinical.chat_document_workspaces(id));
create table clinical.chat_operation_challenges(
 id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.profiles(id),session_id uuid not null references clinical.conversation_sessions(id),
 workspace_id uuid not null references clinical.chat_document_workspaces(id),workspace_revision integer not null,review_id uuid not null references clinical.document_reviews(id),
 athlete_id uuid not null references clinical.athletes(id),document_id uuid not null,document_version integer not null,expected_document_version integer not null,
 content_hash text not null,material_hash text not null,identity_id uuid not null references clinical.signing_identities(id),connection_epoch integer not null,
 operation text not null default 'sign_review' check(operation='sign_review'),execution_mode text not null default 'demo' check(execution_mode='demo'),provenance text not null default 'simulated' check(provenance='simulated'),
 delivery_requested boolean not null,recipient_digest text,session_operation_epoch bigint not null,security_epoch bigint not null,
 nonce uuid not null default gen_random_uuid(),summary jsonb not null,summary_hash text not null,idempotency_key uuid not null,
 phase text not null default 'pending' check(phase in('pending','confirmed','cancelled','invalidated')),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,presented_at timestamptz,presented_input_sequence bigint,
 unique(professional_id,idempotency_key)
);
create table clinical.chat_human_inputs(
 id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.profiles(id),session_id uuid not null references clinical.conversation_sessions(id),
 challenge_id uuid not null references clinical.chat_operation_challenges(id),message_key uuid not null,input_sequence bigint not null,
 source_kind text not null default 'user' check(source_kind='user'),input_mode text not null check(input_mode in('text','voice')),
 original_text text not null check(length(original_text) between 1 and 400),original_hash text not null,
 outcome text not null default 'pending' check(outcome in('pending','accepted','rejected')),rejection_reason text,created_at timestamptz not null default clock_timestamp(),
 unique(professional_id,message_key),unique(session_id,input_sequence)
);
create table clinical.chat_operation_authorizations(
 id uuid primary key default gen_random_uuid(),professional_id uuid not null references public.profiles(id),session_id uuid not null references clinical.conversation_sessions(id),
 challenge_id uuid not null unique references clinical.chat_operation_challenges(id),input_id uuid not null unique references clinical.chat_human_inputs(id),
 workspace_id uuid not null references clinical.chat_document_workspaces(id),workspace_revision integer not null,review_id uuid not null references clinical.document_reviews(id),
 operation text not null check(operation='sign_review'),execution_mode text not null check(execution_mode='demo'),provenance text not null check(provenance='simulated'),
 summary_hash text not null,confirmed_at timestamptz not null default clock_timestamp()
);
do $$ declare t text;begin foreach t in array array['chat_document_workspaces','chat_document_contexts','chat_operation_challenges','chat_human_inputs','chat_operation_authorizations'] loop
 execute format('alter table clinical.%I enable row level security',t);execute format('revoke all on clinical.%I from public,anon,authenticated',t);end loop;end $$;
create function clinical.chat_operation_audit(actor uuid,sid uuid,resource uuid,verb text,result text default 'success',meta jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(actor,'chat_operation',resource,verb,result,'ai_chat',case when verb in('chat_operation.confirmed','chat_operation.rejected') then case when meta->>'input_mode'='voice' then 'human_voice' else 'human_message' end else 'human_ui' end,meta||jsonb_build_object('session_id',sid,'execution_mode','demo','provenance','simulated'));
$$;
create function clinical.chat_operation_session(actor uuid,sid uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare s clinical.conversation_sessions;begin
 if actor is null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 perform clinical.conversation_idle_stale(actor);
 select * into s from clinical.conversation_sessions where id=sid and professional_id=actor for update;
 if s.id is null or s.status<>'active' or s.security_epoch is null or s.security_epoch<>clinical.conversation_epoch(actor) then
  perform clinical.chat_operation_audit(actor,null,null,'chat_operation.denied','denied');return false;end if;
 if s.athlete_id is not null then
  perform 1 from clinical.athlete_access where athlete_id=s.athlete_id and professional_id=actor and can_read_records for share;
  if not found then perform clinical.chat_operation_audit(actor,sid,null,'chat_operation.denied','denied');return false;end if;
 end if;return true;
end $$;
create function clinical.chat_workspace_current(w clinical.chat_document_workspaces) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from clinical.conversation_sessions s join clinical.chat_document_contexts c on c.session_id=s.id
 where s.id=w.session_id and s.professional_id=w.professional_id and s.status='active' and s.athlete_id=w.athlete_id
 and s.operation_epoch=w.session_operation_epoch and s.security_epoch=w.security_epoch and s.security_epoch=clinical.conversation_epoch(w.professional_id) and c.workspace_id=w.id)
 and clinical.can_author_documents(w.professional_id,w.athlete_id);
$$;
create function clinical.chat_challenge_dto(c clinical.chat_operation_challenges) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',c.id,'workspaceId',c.workspace_id,'revision',c.workspace_revision,'phase',c.phase,'nonce',c.nonce,'summary',c.summary,'summaryHash',c.summary_hash,'expiresAt',c.expires_at,'presentedAt',c.presented_at,'executionEnabled',false);
$$;
create function clinical.chat_workspace_dto(w clinical.chat_document_workspaces) returns jsonb language plpgsql security definer set search_path='' as $$
declare rv jsonb;c clinical.chat_operation_challenges;a clinical.chat_operation_authorizations;begin
 rv:=public.document_review_command('get',jsonb_build_object('review_id',w.review_id));if rv ? 'error' then return rv;end if;
 select * into c from clinical.chat_operation_challenges where workspace_id=w.id and workspace_revision=w.revision and phase in('pending','confirmed') order by created_at desc limit 1;
 select * into a from clinical.chat_operation_authorizations where challenge_id=c.id and professional_id=w.professional_id;
 return jsonb_build_object('workspace',jsonb_build_object('id',w.id,'sessionId',w.session_id,'athleteId',w.athlete_id,'documentId',w.document_id,'reviewId',w.review_id,'revision',w.revision,'identityId',w.identity_id,'deliveryRequested',w.delivery_requested,'phase',w.phase),
 'review',rv->'review','challenge',case when c.id is null then null else clinical.chat_challenge_dto(c) end,'authorization',case when a.id is null then null else jsonb_build_object('authorizationId',a.id,'effect','authorization_recorded','executionEnabled',false) end,'executionEnabled',false);
end $$;
create function public.chat_document_state(session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w clinical.chat_document_workspaces;begin
 if not clinical.chat_operation_session(auth.uid(),session_id) then return '{"error":"denied"}';end if;
 select ws.* into w from clinical.chat_document_workspaces ws join clinical.chat_document_contexts c on c.workspace_id=ws.id where c.session_id=chat_document_state.session_id and ws.professional_id=auth.uid();
 if w.id is null then return '{"workspace":null,"executionEnabled":false}';end if;
 if not clinical.chat_workspace_current(w) then return '{"error":"stale"}';end if;
 perform clinical.chat_operation_audit(auth.uid(),session_id,w.id,'chat_workspace.read');return clinical.chat_workspace_dto(w);
end $$;
create function public.chat_document_bind(session_id uuid,review_id uuid,expected_revision integer,idempotency_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();rv clinical.document_reviews;w clinical.chat_document_workspaces;s clinical.conversation_sessions;checked jsonb;begin
 if not clinical.chat_operation_session(actor,session_id) then return '{"error":"denied"}';end if;
 if idempotency_key is null or expected_revision is null then return '{"error":"invalid"}';end if;
 select * into rv from clinical.document_reviews where id=review_id and professional_id=actor;
 if rv.id is null then return '{"error":"denied"}';end if;
 select * into s from clinical.conversation_sessions where id=session_id;
 if s.athlete_id is distinct from rv.athlete_id then return '{"error":"context_mismatch"}';end if;
 checked:=public.document_review_command('get',jsonb_build_object('review_id',rv.id));if checked ? 'error' then return checked;end if;
 if clinical.document_lock_reason(rv.document_id) is not null then return '{"error":"locked"}';end if;
 select * into w from clinical.chat_document_workspaces ws where ws.session_id=chat_document_bind.session_id and ws.document_id=rv.document_id for update;
 if w.id is not null and w.last_bind_key=idempotency_key then
  if w.review_id<>rv.id or not clinical.chat_workspace_current(w) then return '{"error":"conflict"}';end if;return clinical.chat_workspace_dto(w);
 end if;
 if coalesce(w.revision,0)<>expected_revision then return '{"error":"conflict"}';end if;
 if w.id is null then
  insert into clinical.chat_document_workspaces(professional_id,session_id,athlete_id,document_id,review_id,revision,session_operation_epoch,security_epoch,last_bind_key)
  values(actor,s.id,rv.athlete_id,rv.document_id,rv.id,1,s.operation_epoch,s.security_epoch,idempotency_key) returning * into w;
 else
  update clinical.chat_document_workspaces set review_id=rv.id,revision=revision+1,session_operation_epoch=s.operation_epoch,security_epoch=s.security_epoch,identity_id=null,delivery_requested=false,recipient_digest=null,phase='reviewed',last_bind_key=idempotency_key,updated_at=clock_timestamp() where id=w.id returning * into w;
 end if;
 insert into clinical.chat_document_contexts values(s.id,w.id) on conflict on constraint chat_document_contexts_pkey do update set workspace_id=excluded.workspace_id;
 update clinical.chat_operation_challenges set phase='invalidated' where clinical.chat_operation_challenges.session_id=s.id and phase='pending';
 perform clinical.chat_operation_audit(actor,s.id,w.id,'chat_workspace.bound','success',jsonb_build_object('review_id',rv.id,'revision',w.revision,'document_id',rv.document_id));return clinical.chat_workspace_dto(w);
exception when unique_violation then return '{"error":"conflict"}';end $$;
create function public.chat_document_select_identity(workspace_id uuid,expected_revision integer,identity_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w clinical.chat_document_workspaces;begin
 select * into w from clinical.chat_document_workspaces where id=workspace_id and professional_id=auth.uid();
 if w.id is null or not clinical.chat_operation_session(auth.uid(),w.session_id) then return '{"error":"denied"}';end if;
 select * into w from clinical.chat_document_workspaces where id=workspace_id for update;
 if not clinical.chat_workspace_current(w) then return '{"error":"stale"}';end if;
 if w.revision is distinct from expected_revision then return '{"error":"conflict"}';end if;
 if identity_id is not null and not exists(select 1 from clinical.signing_identities i join clinical.signature_connections c on c.id=i.connection_id where i.id=identity_id and i.professional_id=auth.uid() and c.state='connected' and i.simulated) then return '{"error":"denied"}';end if;
 if w.identity_id is distinct from identity_id then
 update clinical.chat_document_workspaces set identity_id=chat_document_select_identity.identity_id,revision=revision+1,phase='reviewed',updated_at=clock_timestamp() where id=w.id returning * into w;
 update clinical.chat_operation_challenges set phase='invalidated' where clinical.chat_operation_challenges.workspace_id=w.id and phase='pending';
 perform clinical.chat_operation_audit(auth.uid(),w.session_id,w.id,'chat_workspace.identity_selected','success',jsonb_build_object('revision',w.revision,'identity_id',identity_id));end if;
 return clinical.chat_workspace_dto(w);
end $$;
create function public.chat_document_select_delivery(workspace_id uuid,expected_revision integer,requested boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare w clinical.chat_document_workspaces;p jsonb;digest text;begin
 select * into w from clinical.chat_document_workspaces where id=workspace_id and professional_id=auth.uid();
 if w.id is null or not clinical.chat_operation_session(auth.uid(),w.session_id) then return '{"error":"denied"}';end if;
 select * into w from clinical.chat_document_workspaces where id=workspace_id for update;
 if not clinical.chat_workspace_current(w) then return '{"error":"stale"}';end if;
 if w.revision is distinct from expected_revision then return '{"error":"conflict"}';end if;
 if requested is null then return '{"error":"invalid"}';end if;
 if requested then p:=clinical.delivery_policy(auth.uid(),w.athlete_id);if p->>'eligible' is distinct from 'true' then return '{"error":"recipient_unavailable"}';end if;digest:=p->>'contact_digest';end if;
 if w.delivery_requested is distinct from requested or w.recipient_digest is distinct from digest then
 update clinical.chat_document_workspaces set delivery_requested=requested,recipient_digest=digest,revision=revision+1,phase='reviewed',updated_at=clock_timestamp() where id=w.id returning * into w;
 update clinical.chat_operation_challenges set phase='invalidated' where clinical.chat_operation_challenges.workspace_id=w.id and phase='pending';
 perform clinical.chat_operation_audit(auth.uid(),w.session_id,w.id,'chat_workspace.delivery_selected','success',jsonb_build_object('revision',w.revision,'requested',requested));end if;
 return clinical.chat_workspace_dto(w);
end $$;
-- Freshness of the authorization view; actual execution must run the shared domain checks again.
create function clinical.chat_review_current(w clinical.chat_document_workspaces) returns text language plpgsql security definer set search_path='' as $$
declare rv clinical.document_reviews;d clinical.documents;checked jsonb;display text;credential text;begin
 checked:=public.document_review_command('get',jsonb_build_object('review_id',w.review_id));if checked ? 'error' then return checked->>'error';end if;
 select * into rv from clinical.document_reviews where id=w.review_id and professional_id=w.professional_id;
 if rv.expires_at<=clock_timestamp() then return 'expired';end if;
 if rv.content_hash<>encode(extensions.digest(rv.content::text,'sha256'),'hex') or rv.material->'content'<>rv.content then return 'stale';end if;
 if clinical.document_lock_reason(w.document_id) is not null or rv.signing_attempt_id is not null then return 'locked';end if;
 select * into d from clinical.documents where id=w.document_id;
 if d.id is null then select display_name into display from public.profiles where id=w.professional_id;select credential_label into credential from clinical.medical_authors where professional_id=w.professional_id and enabled;
 else display:=d.author_name;credential:=d.credential_label;end if;
 if display is distinct from rv.material->>'author_name' or credential is distinct from rv.material->>'credential_label' or (select full_name from clinical.athletes where id=w.athlete_id) is distinct from rv.material->>'athlete_name' then return 'stale';end if;
 return null;
end $$;
create function public.chat_operation_prepare(workspace_id uuid,expected_revision integer,idempotency_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();w clinical.chat_document_workspaces;rv clinical.document_reviews;s clinical.conversation_sessions;i clinical.signing_identities;conn clinical.signature_connections;c clinical.chat_operation_challenges;p jsonb;summary jsonb;reason text;begin
 select * into w from clinical.chat_document_workspaces where id=workspace_id and professional_id=actor;
 if w.id is null or not clinical.chat_operation_session(actor,w.session_id) then return '{"error":"denied"}';end if;
 select * into w from clinical.chat_document_workspaces where id=workspace_id for update;
 if not clinical.chat_workspace_current(w) then return '{"error":"stale"}';end if;
 if w.revision is distinct from expected_revision or idempotency_key is null then return '{"error":"conflict"}';end if;
 if not exists(select 1 from clinical.signing_environment where id and demo_enabled) then return '{"error":"mode_unavailable"}';end if;
 reason:=clinical.chat_review_current(w);if reason is not null then return jsonb_build_object('error',reason);end if;
 select * into rv from clinical.document_reviews where id=w.review_id;select * into s from clinical.conversation_sessions where id=w.session_id;
 select ident.* into i from clinical.signing_identities ident join clinical.signature_connections sc on sc.id=ident.connection_id where ident.id=w.identity_id and ident.professional_id=actor and sc.state='connected' and ident.simulated;
 if i.id is null then return '{"error":"identity_required"}';end if;
 select * into conn from clinical.signature_connections where id=i.connection_id;
 if w.delivery_requested then p:=clinical.delivery_policy(actor,w.athlete_id);if p->>'eligible' is distinct from 'true' or p->>'contact_digest' is distinct from w.recipient_digest then return '{"error":"recipient_unavailable"}';end if;end if;
 select * into c from clinical.chat_operation_challenges where professional_id=actor and clinical.chat_operation_challenges.idempotency_key=chat_operation_prepare.idempotency_key;
 if c.id is not null then
  if c.workspace_id<>w.id or c.workspace_revision<>w.revision or c.phase not in('pending','confirmed') then return '{"error":"conflict"}';end if;
  if c.expires_at<=clock_timestamp() then return '{"error":"expired"}';end if;
  return jsonb_build_object('challenge',clinical.chat_challenge_dto(c),'executionEnabled',false);
 end if;
 if exists(select 1 from clinical.chat_operation_authorizations proof join clinical.chat_operation_challenges ch on ch.id=proof.challenge_id where proof.workspace_id=w.id and proof.workspace_revision=w.revision and ch.phase='confirmed' and ch.expires_at>clock_timestamp()) then return '{"error":"already_authorized"}';end if;
 summary:=jsonb_build_object('operation','sign_review','executionMode','demo','provenance','simulated','sessionId',s.id,'athleteId',w.athlete_id,'documentId',w.document_id,'documentType',rv.document_type,'version',(rv.material->>'version')::integer,'reviewId',rv.id,'contentHash',rv.content_hash,'materialHash',encode(extensions.digest(rv.material::text,'sha256'),'hex'),'identity',jsonb_build_object('id',i.id,'label',i.label,'provider',conn.provider_id),'delivery',jsonb_build_object('requested',w.delivery_requested,'recipient',case when w.delivery_requested then p->'recipient' else null end),'effects',jsonb_build_array('finalize_demo_document',case when w.delivery_requested then 'simulate_delivery' else 'no_delivery' end));
 update clinical.chat_operation_challenges set phase='invalidated' where clinical.chat_operation_challenges.workspace_id=w.id and phase='pending';
 insert into clinical.chat_operation_challenges(professional_id,session_id,workspace_id,workspace_revision,review_id,athlete_id,document_id,document_version,expected_document_version,content_hash,material_hash,identity_id,connection_epoch,delivery_requested,recipient_digest,session_operation_epoch,security_epoch,summary,summary_hash,idempotency_key,expires_at)
 values(actor,s.id,w.id,w.revision,rv.id,w.athlete_id,w.document_id,(rv.material->>'version')::integer,coalesce(rv.saved_version,rv.expected_version),rv.content_hash,encode(extensions.digest(rv.material::text,'sha256'),'hex'),i.id,conn.epoch,w.delivery_requested,w.recipient_digest,s.operation_epoch,s.security_epoch,summary,encode(extensions.digest(summary::text,'sha256'),'hex'),idempotency_key,least(rv.expires_at,clock_timestamp()+interval '5 minutes')) returning * into c;
 update clinical.chat_document_workspaces set phase='authorization_pending' where id=w.id;
 perform clinical.chat_operation_audit(actor,s.id,c.id,'chat_operation.prepared','success',jsonb_build_object('workspace_id',w.id,'document_id',w.document_id,'version',c.document_version,'summary_hash',c.summary_hash));
 return jsonb_build_object('challenge',clinical.chat_challenge_dto(c),'executionEnabled',false);
end $$;
create function clinical.chat_challenge_current(c clinical.chat_operation_challenges) returns boolean language plpgsql security definer set search_path='' as $$
declare w clinical.chat_document_workspaces;s clinical.conversation_sessions;p jsonb;begin
 select * into w from clinical.chat_document_workspaces where id=c.workspace_id and professional_id=c.professional_id;
 select * into s from clinical.conversation_sessions where id=c.session_id and professional_id=c.professional_id;
 if w.id is null or not clinical.chat_workspace_current(w) or w.revision<>c.workspace_revision or w.review_id<>c.review_id or s.operation_epoch<>c.session_operation_epoch or s.security_epoch<>c.security_epoch or w.identity_id is distinct from c.identity_id or w.delivery_requested<>c.delivery_requested or w.recipient_digest is distinct from c.recipient_digest then return false;end if;
 if not exists(select 1 from clinical.signing_identities i join clinical.signature_connections conn on conn.id=i.connection_id where i.id=c.identity_id and i.professional_id=c.professional_id and i.simulated and conn.state='connected' and conn.epoch=c.connection_epoch) then return false;end if;
 if c.delivery_requested then p:=clinical.delivery_policy(c.professional_id,c.athlete_id);if p->>'eligible' is distinct from 'true' or p->>'contact_digest' is distinct from c.recipient_digest then return false;end if;end if;
 return true;
end $$;
-- Only a trusted backend boundary can attest presentation or capture an original user utterance.
create function public.chat_operation_present(actor uuid,session_id uuid,challenge_id uuid,nonce uuid,summary_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c clinical.chat_operation_challenges;s clinical.conversation_sessions;begin
 if not clinical.chat_operation_session(actor,session_id) then return '{"error":"denied"}';end if;
 select * into c from clinical.chat_operation_challenges where id=challenge_id and professional_id=actor and clinical.chat_operation_challenges.session_id=chat_operation_present.session_id for update;
 if c.id is null or c.nonce is distinct from nonce or c.summary_hash is distinct from summary_hash then return '{"error":"denied"}';end if;
 if c.phase<>'pending' or c.expires_at<=clock_timestamp() or not clinical.chat_challenge_current(c) then return '{"error":"stale"}';end if;
 if c.presented_at is null then
  select * into s from clinical.conversation_sessions where id=session_id;
  update clinical.chat_operation_challenges set presented_at=clock_timestamp(),presented_input_sequence=s.human_input_sequence where id=c.id returning * into c;
  perform clinical.chat_operation_audit(actor,session_id,c.id,'chat_operation.presented','success',jsonb_build_object('summary_hash',c.summary_hash));
 end if;
 return jsonb_build_object('ok',true,'challenge',clinical.chat_challenge_dto(c),'executionEnabled',false);
end $$;
create function public.chat_capture_human_input(actor uuid,session_id uuid,challenge_id uuid,message_key uuid,original_text text,input_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i clinical.chat_human_inputs;seq bigint;digest text;begin
 if not clinical.chat_operation_session(actor,session_id) then return '{"error":"denied"}';end if;
 if message_key is null or length(btrim(original_text)) not between 1 and 400 or original_text is null or input_mode not in('text','voice') or input_mode is null then return '{"error":"invalid"}';end if;
 if not exists(select 1 from clinical.chat_operation_challenges c where c.id=challenge_id and c.professional_id=actor and c.session_id=chat_capture_human_input.session_id) then return '{"error":"denied"}';end if;
 digest:=encode(extensions.digest(original_text,'sha256'),'hex');
 select * into i from clinical.chat_human_inputs where professional_id=actor and clinical.chat_human_inputs.message_key=chat_capture_human_input.message_key;
 if i.id is not null then
  if i.session_id<>session_id or i.challenge_id<>challenge_id or i.original_hash<>digest or i.input_mode<>input_mode then return '{"error":"conflict"}';end if;
  return jsonb_build_object('inputId',i.id);
 end if;
 update clinical.conversation_sessions set human_input_sequence=human_input_sequence+1,last_activity_at=clock_timestamp() where id=session_id returning human_input_sequence into seq;
 insert into clinical.chat_human_inputs(professional_id,session_id,challenge_id,message_key,input_sequence,input_mode,original_text,original_hash)
 values(actor,session_id,challenge_id,message_key,seq,input_mode,original_text,digest) returning * into i;
 return jsonb_build_object('inputId',i.id);
end $$;
create function public.chat_operation_confirm(session_id uuid,challenge_id uuid,nonce uuid,input_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();c clinical.chat_operation_challenges;i clinical.chat_human_inputs;w clinical.chat_document_workspaces;rv clinical.document_reviews;a clinical.chat_operation_authorizations;reason text;clean text;pending integer;begin
 if not clinical.chat_operation_session(actor,session_id) then return '{"error":"denied"}';end if;
 select * into c from clinical.chat_operation_challenges where id=challenge_id and professional_id=actor and clinical.chat_operation_challenges.session_id=chat_operation_confirm.session_id for update;
 select * into i from clinical.chat_human_inputs where id=input_id and professional_id=actor and clinical.chat_human_inputs.session_id=chat_operation_confirm.session_id for update;
 if c.id is null or i.id is null or c.nonce is distinct from nonce or i.challenge_id<>c.id then return '{"error":"denied"}';end if;
 if i.outcome='rejected' then return jsonb_build_object('error',coalesce(i.rejection_reason,'rejected'));end if;
 if c.expires_at<=clock_timestamp() then reason:='expired';
 elsif not exists(select 1 from clinical.signing_environment where id and demo_enabled) then reason:='mode_unavailable';
 elsif not clinical.chat_challenge_current(c) then reason:='stale';end if;
 select * into w from clinical.chat_document_workspaces where id=c.workspace_id;
 if reason is null then reason:=clinical.chat_review_current(w);end if;
 select * into rv from clinical.document_reviews where id=c.review_id;
 if reason is null and (rv.content_hash<>c.content_hash or encode(extensions.digest(rv.material::text,'sha256'),'hex')<>c.material_hash or coalesce(rv.saved_version,rv.expected_version)<>c.expected_document_version or (rv.material->>'version')::integer<>c.document_version) then reason:='stale';end if;
 if reason is null and i.outcome='accepted' then
  select proof.* into a from clinical.chat_operation_authorizations proof where proof.challenge_id=c.id and proof.input_id=i.id and proof.professional_id=actor;
  if a.id is not null then return jsonb_build_object('authorizationId',a.id,'effect','authorization_recorded','executionEnabled',false);end if;
 end if;
 if reason is null and c.phase<>'pending' then reason:='used';end if;
 if reason is null and (c.presented_at is null or i.input_sequence<=c.presented_input_sequence) then reason:='not_presented';end if;
 if reason is null and i.input_mode<>'text' then reason:='voice_confirmation_unavailable';end if;
 if reason is null then
  select count(*) into pending from clinical.chat_operation_challenges ch where ch.session_id=chat_operation_confirm.session_id and ch.professional_id=actor and ch.phase='pending' and ch.presented_at is not null and ch.expires_at>clock_timestamp();
  if pending<>1 then reason:='ambiguous';end if;
 end if;
 clean:=regexp_replace(lower(btrim(regexp_replace(i.original_text,'[[:space:]]+',' ','g'))),'[.!]+$','');
 if reason is null and not(clean in('sim','confirmo','confirmo esta versão e a assinatura','confirmo essa versão e a assinatura') or not c.delivery_requested and clean='confirmo essa versão e a assinatura sem envio' or c.delivery_requested and clean in('confirmo essa versão, a assinatura e o envio para o destinatário apresentado','confirmo esta versão, a assinatura e o envio para o destinatário apresentado')) then reason:='explicit_confirmation_required';end if;
 if reason is not null then
  if i.outcome='pending' then update clinical.chat_human_inputs set outcome='rejected',rejection_reason=reason where id=i.id;perform clinical.chat_operation_audit(actor,session_id,c.id,'chat_operation.rejected','denied',jsonb_build_object('reason',reason,'input_id',i.id,'input_mode',i.input_mode));end if;
  return jsonb_build_object('error',reason);
 end if;
 insert into clinical.chat_operation_authorizations(professional_id,session_id,challenge_id,input_id,workspace_id,workspace_revision,review_id,operation,execution_mode,provenance,summary_hash)
 values(actor,session_id,c.id,i.id,w.id,w.revision,rv.id,c.operation,c.execution_mode,c.provenance,c.summary_hash) returning * into a;
 update clinical.chat_human_inputs set outcome='accepted' where id=i.id;
 update clinical.chat_operation_challenges set phase='confirmed' where id=c.id;
 update clinical.chat_document_workspaces set phase='authorized' where id=w.id;
 perform clinical.chat_operation_audit(actor,session_id,c.id,'chat_operation.confirmed','success',jsonb_build_object('authorization_id',a.id,'input_id',i.id,'workspace_id',w.id,'review_id',rv.id,'summary_hash',c.summary_hash));
 return jsonb_build_object('authorizationId',a.id,'effect','authorization_recorded','executionEnabled',false);
end $$;
create function public.chat_operation_cancel(session_id uuid,challenge_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c clinical.chat_operation_challenges;begin
 if not clinical.chat_operation_session(auth.uid(),session_id) then return '{"error":"denied"}';end if;
 select * into c from clinical.chat_operation_challenges where id=challenge_id and professional_id=auth.uid() and clinical.chat_operation_challenges.session_id=chat_operation_cancel.session_id for update;
 if c.id is null then return '{"error":"denied"}';end if;
 if c.phase='cancelled' then return '{"ok":true}';end if;
 if c.phase<>'pending' then return '{"error":"conflict"}';end if;
 update clinical.chat_operation_challenges set phase='cancelled' where id=c.id;
 perform clinical.chat_operation_audit(auth.uid(),session_id,c.id,'chat_operation.cancelled');return '{"ok":true}';
end $$;
create function clinical.guard_chat_operation_evidence() returns trigger language plpgsql set search_path='' as $$begin
 if tg_table_name='chat_operation_authorizations' then raise exception using errcode='55000',message='authorization_evidence_immutable';end if;
 if tg_table_name='chat_human_inputs' then
  if (to_jsonb(new)-'outcome'-'rejection_reason')<>(to_jsonb(old)-'outcome'-'rejection_reason') or old.outcome<>'pending' then raise exception using errcode='55000',message='human_input_immutable';end if;
 else
  if (to_jsonb(new)-'phase'-'presented_at'-'presented_input_sequence')<>(to_jsonb(old)-'phase'-'presented_at'-'presented_input_sequence') then raise exception using errcode='55000',message='challenge_binding_immutable';end if;
 end if;return new;
end $$;
create trigger chat_human_input_immutable before update on clinical.chat_human_inputs for each row execute function clinical.guard_chat_operation_evidence();
create trigger chat_challenge_binding_immutable before update on clinical.chat_operation_challenges for each row execute function clinical.guard_chat_operation_evidence();
create trigger chat_authorization_immutable before update on clinical.chat_operation_authorizations for each row execute function clinical.guard_chat_operation_evidence();
do $$ declare f record;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clinical' and p.proname=any(array['chat_context_epoch','chat_operation_audit','chat_operation_session','chat_workspace_current','chat_challenge_dto','chat_workspace_dto','chat_review_current','chat_challenge_current','guard_chat_operation_evidence']) loop execute format('revoke all on function %s from public,anon,authenticated',f.oid::regprocedure);end loop;
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['chat_document_state','chat_document_bind','chat_document_select_identity','chat_document_select_delivery','chat_operation_prepare','chat_operation_confirm','chat_operation_cancel']) loop execute format('revoke all on function %s from public,anon,authenticated',f.oid::regprocedure);execute format('grant execute on function %s to authenticated',f.oid::regprocedure);end loop;
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['chat_capture_human_input','chat_operation_present']) loop execute format('revoke all on function %s from public,anon,authenticated',f.oid::regprocedure);execute format('grant execute on function %s to service_role',f.oid::regprocedure);end loop;
end $$;
