-- Working reviews are private, not clinical documents or signing snapshots.
create table clinical.document_reviews (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.profiles(id),
 athlete_id uuid not null references clinical.athletes(id), document_id uuid not null,
 expected_version integer not null check(expected_version>=0), document_type text not null check(document_type in ('prescription','surgical_order','exam_request')),
 content jsonb not null, content_hash text not null, material jsonb not null, recipient jsonb not null,
 template_version text not null default 'cbb-clinical-review-v1', idempotency_key uuid not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
 saved_version integer, signing_attempt_id uuid references clinical.signature_attempts(id),
 unique(professional_id,idempotency_key), unique(id,professional_id),
 check(content_hash=encode(extensions.digest(content::text,'sha256'),'hex'))
);
create table clinical.signature_demo_delivery_intents (
 id uuid primary key default gen_random_uuid(), review_id uuid not null, professional_id uuid not null references public.profiles(id),
 attempt_id uuid not null unique references clinical.signature_attempts(id),
 channel text not null default 'whatsapp' check(channel='whatsapp'),
 provenance text not null default 'demo' check(provenance='demo'),
 state text not null default 'demo_intent_no_send' check(state='demo_intent_no_send'),
 eligible_for_real boolean not null default false check(not eligible_for_real),
 recipient_authorized boolean not null default false check(not recipient_authorized),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(review_id,professional_id) references clinical.document_reviews(id,professional_id)
);
alter table clinical.document_reviews enable row level security;
alter table clinical.signature_demo_delivery_intents enable row level security;
revoke all on clinical.document_reviews,clinical.signature_demo_delivery_intents from public,anon,authenticated;

create function clinical.review_audit(op text,resource uuid,meta jsonb default '{}',result text default 'success') returns void
language sql security definer set search_path='' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(auth.uid(),'document_review',resource,op,result,'traditional_ui','human_ui',meta);
$$;
revoke all on function clinical.review_audit(text,uuid,jsonb,text) from public,anon,authenticated;
create function clinical.review_recipient(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a clinical.athletes; c clinical.athlete_contacts; minor boolean; digits text; recipient_name text; relation text; category text;
begin
 select * into a from clinical.athletes where id=target;
 if not exists(select 1 from clinical.athlete_access where athlete_id=target and professional_id=auth.uid() and can_edit) then
  return jsonb_build_object('name',null,'relation','Contato restrito ao acesso cadastral','category','unavailable','minor',null,'phone_masked',null,'available',false,'authorized',false,'reason','Seu acesso não permite consultar contatos cadastrais. Nenhuma entrega está autorizada.');
 end if;
 select * into c from clinical.athlete_contacts where athlete_id=target;
 minor:=case when a.birth_date is null then null else a.birth_date > ((current_timestamp at time zone 'America/Sao_Paulo')::date-interval '18 years')::date end;
 if minor then recipient_name:=c.guardian_name;relation:=coalesce(c.guardian_relation,'Responsável cadastrado');digits:=regexp_replace(coalesce(c.guardian_contact,''),'[^0-9]','','g');category:='guardian';
 else recipient_name:=coalesce(a.social_name,a.full_name);relation:='Próprio atleta';digits:=regexp_replace(coalesce(c.phone,''),'[^0-9]','','g');category:='athlete'; end if;
 return jsonb_build_object('name',recipient_name,'relation',relation,'category',category,'minor',minor,
 'phone_masked',case when length(digits) between 8 and 15 then '•••• '||right(digits,4) else null end,
 'available',recipient_name is not null and length(digits) between 8 and 15,
 'authorized',false,'reason',case when minor and (recipient_name is null or length(digits) not between 8 and 15) then 'Responsável e contato ausentes. Nenhuma entrega está autorizada.' when minor then 'Atleta menor de idade. Responsável cadastrado, sem autorização clínica verificada.' when a.birth_date is null then 'Idade e autorização de recebimento não verificadas.' when length(digits) not between 8 and 15 then 'Contato ausente. Nenhuma entrega está autorizada.' else 'Contato cadastrado não equivale a autorização para receber documentos clínicos.' end);
end $$;
revoke all on function clinical.review_recipient(uuid) from public,anon,authenticated;

create function public.document_review_command(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); rv clinical.document_reviews; d clinical.documents; a clinical.athletes;
 prof public.profiles; med clinical.medical_authors; canonical jsonb; result jsonb; prepared jsonb; signed_result jsonb;
 target uuid; did uuid; expected integer; kind text; request_key uuid; wanted text; failure text; intended boolean;
 author_label text; author_display text; created timestamptz; next_version integer;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if action='open' then
  target:=(payload->>'athlete_id')::uuid;did:=(payload->>'document_id')::uuid;expected:=(payload->>'version')::integer;kind:=payload->>'kind';request_key:=(payload->>'idempotency_key')::uuid;
  if target is null or did is null or expected is null or expected<0 or request_key is null then return '{"error":"invalid"}'; end if;
  if not clinical.can_author_documents(actor,target) then
   perform clinical.review_audit('document_review.denied',null,'{}','denied');return '{"error":"unavailable"}';
  end if;
  canonical:=clinical.canonical_document(kind,payload->'content');
  if canonical is null then return '{"error":"invalid"}'; end if;
  if not clinical.document_ready(kind,canonical) then return jsonb_build_object('error','incomplete','pending',clinical.document_pending(kind,canonical)); end if;
  select * into d from clinical.documents where id=did for update;
  if d.id is not null and (d.author_id<>actor or d.athlete_id<>target or d.document_type<>kind) then return '{"error":"unavailable"}'; end if;
  if (d.id is null and expected<>0) or (d.id is not null and d.version<>expected) then return '{"error":"stale"}'; end if;
  select * into rv from clinical.document_reviews where professional_id=actor and idempotency_key=request_key;
  if rv.id is not null then
   if rv.document_id<>did or rv.athlete_id<>target or rv.content<>canonical or rv.expected_version<>expected then return '{"error":"conflict"}'; end if;
   if rv.expires_at<=clock_timestamp() then return '{"error":"expired"}'; end if;
  else
   select * into prof from public.profiles where id=actor;
   select * into med from clinical.medical_authors where professional_id=actor and enabled;
   select * into a from clinical.athletes where id=target;
   author_display:=case when d.id is null then prof.display_name else d.author_name end;
   author_label:=case when d.id is null then med.credential_label else d.credential_label end;
   created:=coalesce(d.created_at,clock_timestamp());
   next_version:=case when d.id is null then 1 when d.content=canonical then d.version else d.version+1 end;
   insert into clinical.document_reviews(professional_id,athlete_id,document_id,expected_version,document_type,content,content_hash,idempotency_key,material,recipient)
   values(actor,target,did,expected,kind,canonical,encode(extensions.digest(canonical::text,'sha256'),'hex'),request_key,
    jsonb_build_object('id',did,'athlete_id',target,'athlete_name',a.full_name,'version',next_version,'document_type',kind,'status',case when d.id is null or d.content<>canonical then 'draft' else d.status end,'author_name',author_display,'credential_label',author_label,'content',canonical,'created_at',created,'updated_at',coalesce(d.updated_at,created)),clinical.review_recipient(target)) returning * into rv;
   perform clinical.review_audit('document_review.opened',rv.id,jsonb_build_object('document_id',did,'expected_version',expected,'hash',rv.content_hash));
  end if;
 elsif action in ('get','save','sign') then
  select * into rv from clinical.document_reviews where id=(payload->>'review_id')::uuid and professional_id=actor for update;
  if rv.id is null or not clinical.can_author_documents(actor,rv.athlete_id) then
   perform clinical.review_audit('document_review.denied',null,'{}','denied');return '{"error":"unavailable"}';
  end if;
  select * into d from clinical.documents where id=rv.document_id for update;
  if d.id is not null and (d.author_id<>actor or d.athlete_id<>rv.athlete_id or d.document_type<>rv.document_type) then return '{"error":"unavailable"}'; end if;
  expected:=coalesce(rv.saved_version,rv.expected_version);
  if (d.id is null and expected<>0) or (d.id is not null and d.version<>expected) then return '{"error":"stale"}'; end if;
  if rv.saved_version is not null and (d.id is null or d.content<>rv.content) then return '{"error":"stale"}'; end if;
  if action in ('save','sign') then
   if rv.expires_at<=clock_timestamp() then return '{"error":"expired"}'; end if;
   if rv.template_version<>'cbb-clinical-review-v1' then return '{"error":"stale"}'; end if;
   if rv.content_hash<>encode(extensions.digest(rv.content::text,'sha256'),'hex') then return '{"error":"stale"}'; end if;
   select * into a from clinical.athletes where id=rv.athlete_id;
   select * into prof from public.profiles where id=actor;
   select * into med from clinical.medical_authors where professional_id=actor and enabled;
   author_display:=case when d.id is null then prof.display_name else d.author_name end;
   author_label:=case when d.id is null then med.credential_label else d.credential_label end;
   if author_display is distinct from rv.material->>'author_name' or author_label is distinct from rv.material->>'credential_label'
    or a.full_name is distinct from rv.material->>'athlete_name'
    or (d.id is null and (clock_timestamp() at time zone 'America/Sao_Paulo')::date <> ((rv.material->>'created_at')::timestamptz at time zone 'America/Sao_Paulo')::date) then return '{"error":"stale"}'; end if;
   if action='sign' then
    if payload->'confirmed' is distinct from 'true'::jsonb or payload->>'review_hash' is distinct from rv.content_hash then return '{"error":"confirmation_required"}'; end if;
    intended:=coalesce((payload->>'delivery_requested')::boolean,false);
    if intended and rv.recipient is distinct from clinical.review_recipient(rv.athlete_id) then return '{"error":"stale"}'; end if;
    if rv.signing_attempt_id is not null then
     select jsonb_build_object('identity_id',identity_id,'idempotency_key',idempotency_key,'scenario',scenario) into result from clinical.signature_attempts where id=rv.signing_attempt_id and professional_id=actor;
     if result->>'identity_id' is distinct from payload->>'identity_id' or result->>'idempotency_key' is distinct from payload->>'idempotency_key' or result->>'scenario' is distinct from payload->>'scenario'
      or intended<>exists(select 1 from clinical.signature_demo_delivery_intents where review_id=rv.id) then return '{"error":"conflict"}'; end if;
     signed_result:=public.signing_demo_command('status',jsonb_build_object('attempt_id',rv.signing_attempt_id));
     if signed_result ? 'error' then return signed_result; end if;
    end if;
   elsif rv.signing_attempt_id is not null then return '{"error":"in_progress"}';
   end if;
   if rv.signing_attempt_id is null then
    -- Any failed downstream step rolls back document/revision, snapshot and attempt together.
    begin
     result:=public.document_save(rv.athlete_id,rv.document_id,expected,rv.document_type,rv.content,'save');
     if result ? 'error' then failure:=result->>'error';raise exception 'review_commit_failed'; end if;
     if (result->>'version')::integer<>(rv.material->>'version')::integer then failure:='stale';raise exception 'review_commit_failed'; end if;
     select * into d from clinical.documents where id=rv.document_id;
     if d.author_name is distinct from rv.material->>'author_name' or d.credential_label is distinct from rv.material->>'credential_label'
      or (d.created_at at time zone 'America/Sao_Paulo')::date <> ((rv.material->>'created_at')::timestamptz at time zone 'America/Sao_Paulo')::date then failure:='stale';raise exception 'review_commit_failed'; end if;
     update clinical.document_reviews set saved_version=(result->>'version')::integer where id=rv.id returning * into rv;
     if action='sign' then
      prepared:=public.signing_demo_command('prepare',jsonb_build_object('document_id',rv.document_id,'version',rv.saved_version));
      if prepared ? 'error' then failure:=prepared->>'error';raise exception 'review_commit_failed'; end if;
      if prepared->'snapshot'->'material'->>'athlete_name' is distinct from rv.material->>'athlete_name'
       or prepared->'snapshot'->'material'->'content' is distinct from rv.content
       or prepared->'snapshot'->'material'->>'author_name' is distinct from rv.material->>'author_name'
       or prepared->'snapshot'->'material'->>'credential_label' is distinct from rv.material->>'credential_label' then failure:='stale';raise exception 'review_commit_failed'; end if;
      signed_result:=public.signing_demo_command('confirm',jsonb_build_object('snapshot_id',prepared->'snapshot'->>'id','hash',prepared->'snapshot'->>'content_hash','identity_id',payload->>'identity_id','idempotency_key',payload->>'idempotency_key','scenario',payload->>'scenario','confirmed',true));
      if signed_result ? 'error' then failure:=signed_result->>'error';raise exception 'review_commit_failed'; end if;
      update clinical.document_reviews set signing_attempt_id=(signed_result->'attempt'->>'id')::uuid where id=rv.id returning * into rv;
      if intended then
       insert into clinical.signature_demo_delivery_intents(review_id,professional_id,attempt_id) values(rv.id,actor,rv.signing_attempt_id);
       perform clinical.review_audit('delivery.demo_intent_recorded',rv.signing_attempt_id,jsonb_build_object('simulated',true,'eligible_for_real',false,'review_id',rv.id));
      end if;
     end if;
     perform clinical.review_audit(case when action='sign' then 'document_review.simulation_authorized' else 'document_review.saved_without_signature' end,rv.id,jsonb_build_object('document_id',rv.document_id,'version',rv.saved_version,'simulated',action='sign'));
    exception when others then
     perform clinical.review_audit('document_review.commit_failed',rv.id,jsonb_build_object('reason',coalesce(failure,'unavailable')),'failed');
     return jsonb_build_object('error',coalesce(failure,'unavailable'));
    end;
   end if;
  end if;
 else return '{"error":"invalid"}'; end if;
 return jsonb_build_object('review',jsonb_build_object('id',rv.id,'document_id',rv.document_id,'athlete_id',rv.athlete_id,'expected_version',rv.expected_version,'saved_version',rv.saved_version,'content_hash',rv.content_hash,'material',rv.material,'recipient',clinical.review_recipient(rv.athlete_id),'template_version',rv.template_version,'expires_at',rv.expires_at),
  'attempt',signed_result->'attempt','snapshot',signed_result->'snapshot','delivery',jsonb_build_object('requested',exists(select 1 from clinical.signature_demo_delivery_intents where review_id=rv.id),'state',case when exists(select 1 from clinical.signature_demo_delivery_intents where review_id=rv.id) then 'demo_intent_no_send' else 'not_requested' end,'eligible_for_real',false));
exception when invalid_text_representation or check_violation or not_null_violation then return '{"error":"invalid"}';
end $$;
revoke all on function public.document_review_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.document_review_command(text,jsonb) to authenticated;

create function public.document_demo_delivery(attempt uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare doc clinical.documents;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 select d.* into doc from clinical.documents d join clinical.signature_snapshots s on s.document_id=d.id join clinical.signature_attempts a on a.snapshot_id=s.id where a.id=attempt and a.professional_id=auth.uid() and d.author_id=auth.uid();
 if doc.id is null or not clinical.can_author_documents(auth.uid(),doc.athlete_id) then return '{"error":"unavailable"}'; end if;
 return jsonb_build_object('requested',exists(select 1 from clinical.signature_demo_delivery_intents where attempt_id=attempt),'state',case when exists(select 1 from clinical.signature_demo_delivery_intents where attempt_id=attempt) then 'demo_intent_no_send' else 'not_requested' end,'eligible_for_real',false);
end $$;
revoke all on function public.document_demo_delivery(uuid) from public,anon,authenticated;
grant execute on function public.document_demo_delivery(uuid) to authenticated;
