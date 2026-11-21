-- Explicit opt-in; preserve the existing recipient policy when disabled.
alter table clinical.document_delivery_environment add column virtual_recipient_enabled boolean not null default false;
alter table clinical.document_delivery_requests
 add column demo_message text,
 add column demo_pdf_base64 text,
 add column demo_pdf_hash text,
 add column demo_message_at timestamptz,
 add constraint demo_attachment_only check (demo_pdf_base64 is null or
  (execution_mode='demo' and provenance='simulated' and adapter='simulated'
   and demo_message is not null and demo_pdf_hash is not null and demo_message_at is not null));

create function public.configure_virtual_delivery_demo(enabled boolean) returns void
language sql security definer set search_path='' as $$
 update clinical.document_delivery_environment set virtual_recipient_enabled=enabled where id;
$$;
revoke all on function public.configure_virtual_delivery_demo(boolean) from public,anon,authenticated;
grant execute on function public.configure_virtual_delivery_demo(boolean) to service_role;

alter function clinical.delivery_policy(uuid,uuid) rename to delivery_policy_before_virtual;
create function clinical.delivery_policy(actor uuid,target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from clinical.document_delivery_environment where id and virtual_recipient_enabled and fixture_policy_enabled)
  and exists(select 1 from clinical.signing_environment where id and demo_enabled)
  and exists(select 1 from clinical.athletes where id=target and source='demo')
  and clinical.can_author_documents(actor,target)
  and exists(select 1 from clinical.athlete_access where athlete_id=target and professional_id=actor and can_edit) then
  return jsonb_build_object('eligible',true,'execution_mode','demo','provenance','simulated','policy','virtual-demo-v1',
   'contact_digest',encode(extensions.digest('virtual-demo-v1:'||target::text,'sha256'),'hex'),
   'recipient',jsonb_build_object('name','Responsável de demonstração','relation','Destinatário virtual','category','guardian','phone_masked','Sem telefone · simulação'));
 end if;
 return clinical.delivery_policy_before_virtual(actor,target);
end $$;
revoke all on function clinical.delivery_policy(uuid,uuid),clinical.delivery_policy_before_virtual(uuid,uuid) from public,anon,authenticated;

alter function clinical.review_recipient(uuid) rename to review_recipient_before_virtual;
create function clinical.review_recipient(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p jsonb;
begin
 p:=clinical.delivery_policy(auth.uid(),target);
 if p->>'policy'='virtual-demo-v1' then
  return (p->'recipient')||jsonb_build_object('minor',null,'available',true,'authorized',false,
   'reason','Destinatário virtual exclusivo da demonstração. Nenhum WhatsApp será enviado.');
 end if;
 return clinical.review_recipient_before_virtual(target);
end $$;
revoke all on function clinical.review_recipient(uuid),clinical.review_recipient_before_virtual(uuid) from public,anon,authenticated;

-- Guard bytes and association even against accidental privileged updates.
create function clinical.guard_demo_delivery_attachment() returns trigger
language plpgsql set search_path='' as $$ begin
 if old.demo_pdf_base64 is not null and
  (new.demo_pdf_base64,new.demo_pdf_hash,new.demo_message,new.demo_message_at,new.snapshot_id,new.document_id,new.version,new.execution_mode,new.provenance,new.adapter)
  is distinct from
  (old.demo_pdf_base64,old.demo_pdf_hash,old.demo_message,old.demo_message_at,old.snapshot_id,old.document_id,old.version,old.execution_mode,old.provenance,old.adapter)
 then raise exception 'Demo attachment is immutable';end if;
 return new;
end $$;
create trigger demo_delivery_attachment_immutable before update on clinical.document_delivery_requests
 for each row execute function clinical.guard_demo_delivery_attachment();

-- Worker only, while holding the existing engine lease. Nothing is exposed to anon/authenticated.
create function public.demo_delivery_attachment(request_id uuid,lease_token uuid,pdf_base64 text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r clinical.document_delivery_requests;s clinical.signature_snapshots;bytes bytea;
begin
 select * into r from clinical.document_delivery_requests where id=request_id for update;
 if r.id is null or r.execution_mode<>'demo' or r.provenance<>'simulated' or r.adapter<>'simulated'
  or not clinical.delivery_authorization_valid(r)
  or not exists(select 1 from clinical.document_delivery_jobs j where j.request_id=r.id and j.lease_token=demo_delivery_attachment.lease_token and j.lease_expires_at>clock_timestamp())
 then return '{"error":"unavailable"}';end if;
 select snap.* into s from clinical.signature_snapshots snap join clinical.document_finalizations f on f.snapshot_id=snap.id
  where f.id=r.finalization_id and f.document_id=r.document_id and f.version=r.version and snap.id=r.snapshot_id
   and f.execution_mode='demo' and f.provenance='simulated' and f.content_hash=snap.content_hash;
 if s.id is null then return '{"error":"unavailable"}';end if;
 if s.canonical_bytes::jsonb->>'document_type'<>'prescription' then return '{"required":false}';end if;
 if r.demo_pdf_base64 is not null then return '{"required":true,"stored":true}';end if;
 if pdf_base64 is null then return jsonb_build_object('required',true,'stored',false,'material',s.canonical_bytes::jsonb);end if;
 if length(pdf_base64)>4000000 then return '{"error":"invalid_pdf"}';end if;
 bytes:=decode(pdf_base64,'base64');
 if substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8') then return '{"error":"invalid_pdf"}';end if;
 update clinical.document_delivery_requests set demo_pdf_base64=pdf_base64,
  demo_pdf_hash=encode(extensions.digest(bytes,'sha256'),'hex'),
  demo_message='Olá! A prescrição demonstrativa está anexada. PRÉVIA NÃO ASSINADA — SEM VALIDADE PARA DISPENSAÇÃO.',
  demo_message_at=clock_timestamp() where id=r.id;
 perform clinical.workflow_audit(r.professional_id,'delivery.demo_attachment_created',r.id,'demo',jsonb_build_object('document_id',r.document_id,'version',r.version,'snapshot_id',s.id));
 return '{"required":true,"stored":true}';
end $$;
revoke all on function public.demo_delivery_attachment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.demo_delivery_attachment(uuid,uuid,text) to service_role;

-- Read-only view of engine persistence; no reconciliation or state writes here.
create function public.demo_delivery_conversation(target uuid,attachment uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d clinical.documents;messages jsonb;
begin
 select * into d from clinical.documents where id=target;
 if auth.uid() is null or d.id is null or not clinical.can_author_documents(auth.uid(),d.athlete_id)
  or not exists(select 1 from clinical.athlete_access where athlete_id=d.athlete_id and professional_id=auth.uid() and can_edit)
  or not exists(select 1 from clinical.athletes where id=d.athlete_id and source='demo')
  or not exists(select 1 from clinical.signing_environment where id and demo_enabled)
  or not exists(select 1 from clinical.document_delivery_environment where id and fixture_policy_enabled)
 then
  perform clinical.workflow_audit(auth.uid(),'delivery.demo_read_denied',null,'demo','{}','denied');
  return '{"error":"unavailable"}';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'documentId',r.document_id,'version',r.version,
  'snapshotId',r.snapshot_id,'state',r.state,'provenance',r.provenance,'recipient',a.recipient_masked,
  'text',r.demo_message,'at',r.demo_message_at,'updatedAt',r.updated_at,'pdfHash',r.demo_pdf_hash,
  'pdf',case when attachment=r.id then r.demo_pdf_base64 else null end) order by r.created_at),'[]') into messages
 from clinical.document_delivery_requests r join clinical.document_delivery_authorizations a on a.id=r.authorization_id
 where r.document_id=d.id and r.professional_id=auth.uid() and r.execution_mode='demo' and r.provenance='simulated'
  and r.adapter='simulated' and r.demo_pdf_base64 is not null and (attachment is null or attachment=r.id);
 if messages='[]'::jsonb then return '{"error":"unavailable"}';end if;
 perform clinical.workflow_audit(auth.uid(),case when attachment is null then 'delivery.demo_conversation_read' else 'delivery.demo_pdf_read' end,d.id,'demo');
 return jsonb_build_object('athleteId',d.athlete_id,'messages',messages);
end $$;
revoke all on function public.demo_delivery_conversation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.demo_delivery_conversation(uuid,uuid) to authenticated;

-- Add attachment availability to the existing authorized workflow summary.
alter function clinical.workflow_metadata(uuid) rename to workflow_metadata_before_demo_pdf;
create function clinical.workflow_metadata(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;items jsonb;
begin
 result:=clinical.workflow_metadata_before_demo_pdf(target);
 if result is null then return null;end if;
 select coalesce(jsonb_agg(item||jsonb_build_object('hasDemoAttachment',exists(
  select 1 from clinical.document_delivery_requests r where r.id=(item->>'id')::uuid
   and r.professional_id=auth.uid() and r.demo_pdf_base64 is not null
   and r.execution_mode='demo' and r.provenance='simulated' and r.adapter='simulated'))),'[]') into items
 from jsonb_array_elements(result->'deliveries') item;
 return jsonb_set(result,'{deliveries}',items);
end $$;
revoke all on function clinical.workflow_metadata(uuid),clinical.workflow_metadata_before_demo_pdf(uuid) from public,anon,authenticated;
