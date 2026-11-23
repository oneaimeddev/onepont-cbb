-- Medical certificates (atestados) and referrals (encaminhamentos) as clinical documents.
--
-- Certificate content follows CFM Resolutions 1.658/2002 and 1.851/2008: patient, date of the
-- consultation, purpose and either the leave period, the attendance time or the sports fitness
-- assessment. The ICD-10 code is accepted only with the patient's explicit authorization.
-- Referral content follows the usual referral letter: destination specialty or service,
-- reason, clinical summary, diagnostic hypothesis, exams, treatments and the request.
--
-- Existing kinds keep their functions untouched: the four content functions are wrapped, and
-- every function that lists the document kinds is regenerated with the two new kinds added.

alter table clinical.documents drop constraint documents_document_type_check;
alter table clinical.documents add constraint documents_document_type_check
  check (document_type in ('prescription', 'surgical_order', 'exam_request', 'certificate', 'referral'));
alter table clinical.document_proposals drop constraint document_proposals_document_type_check;
alter table clinical.document_proposals add constraint document_proposals_document_type_check
  check (document_type in ('prescription', 'surgical_order', 'exam_request', 'certificate', 'referral'));
alter table clinical.document_reviews drop constraint document_reviews_document_type_check;
alter table clinical.document_reviews add constraint document_reviews_document_type_check
  check (document_type in ('prescription', 'surgical_order', 'exam_request', 'certificate', 'referral'));

create function clinical.canonical_certificate(payload jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  certificate_type text := clinical.clip_text(payload -> 'certificate_type', 20);
  occurred_at text := clinical.clip_text(payload -> 'occurred_at', 10);
  start_time text := clinical.clip_text(payload -> 'start_time', 5);
  end_time text := clinical.clip_text(payload -> 'end_time', 5);
  leave_days text := clinical.clip_text(payload -> 'leave_days', 3);
  leave_start text := clinical.clip_text(payload -> 'leave_start', 10);
  activities text := clinical.clip_text(payload -> 'activities', 500);
  fitness text := clinical.clip_text(payload -> 'fitness', 30);
  restrictions text := clinical.clip_text(payload -> 'restrictions', 1000);
  cid text := clinical.clip_text(payload -> 'cid', 20);
  notes text := clinical.clip_text(payload -> 'notes', 2000);
  authorized jsonb := payload -> 'cid_authorized';
begin
  if certificate_type is null or occurred_at is null or start_time is null or end_time is null or leave_days is null
    or leave_start is null or activities is null or fitness is null or restrictions is null or cid is null or notes is null then
    return null;
  end if;
  if certificate_type not in ('', 'leave', 'attendance', 'fitness') then return null; end if;
  if fitness not in ('', 'fit', 'fit_with_restrictions', 'unfit') then return null; end if;
  if occurred_at <> '' and occurred_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  if leave_start <> '' and leave_start !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  if start_time <> '' and start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return null; end if;
  if end_time <> '' and end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return null; end if;
  if leave_days <> '' and (leave_days !~ '^[0-9]{1,3}$' or leave_days::integer not between 1 and 365) then return null; end if;
  if authorized is null or authorized = 'null'::jsonb then authorized := 'false'::jsonb; end if;
  if jsonb_typeof(authorized) <> 'boolean' then return null; end if;
  return jsonb_build_object(
    'certificate_type', certificate_type, 'occurred_at', occurred_at, 'start_time', start_time, 'end_time', end_time,
    'leave_days', leave_days, 'leave_start', leave_start, 'activities', activities, 'fitness', fitness,
    'restrictions', restrictions, 'cid', cid, 'cid_authorized', authorized, 'notes', notes
  );
end $$;

create function clinical.canonical_referral(payload jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  specialty text := clinical.clip_text(payload -> 'specialty', 160);
  professional text := clinical.clip_text(payload -> 'professional', 160);
  reason text := clinical.clip_text(payload -> 'reason', 2000);
  clinical_summary text := clinical.clip_text(payload -> 'clinical_summary', 2000);
  diagnosis text := clinical.clip_text(payload -> 'diagnosis', 500);
  cid text := clinical.clip_text(payload -> 'cid', 20);
  exams text := clinical.clip_text(payload -> 'exams', 2000);
  treatment text := clinical.clip_text(payload -> 'treatment', 2000);
  request text := clinical.clip_text(payload -> 'request', 1000);
  priority text := clinical.clip_text(payload -> 'priority', 20);
begin
  if specialty is null or professional is null or reason is null or clinical_summary is null or diagnosis is null
    or cid is null or exams is null or treatment is null or request is null or priority is null then
    return null;
  end if;
  if priority not in ('', 'elective', 'priority', 'urgent') then return null; end if;
  return jsonb_build_object(
    'specialty', specialty, 'professional', professional, 'reason', reason, 'clinical_summary', clinical_summary,
    'diagnosis', diagnosis, 'cid', cid, 'exams', exams, 'treatment', treatment, 'request', request, 'priority', priority
  );
end $$;

alter function clinical.canonical_document(text, jsonb) rename to canonical_document_c2;
create function clinical.canonical_document(kind text, payload jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(payload) is distinct from 'object' then return null; end if;
  if kind = 'certificate' then return clinical.canonical_certificate(payload); end if;
  if kind = 'referral' then return clinical.canonical_referral(payload); end if;
  return clinical.canonical_document_c2(kind, payload);
end $$;

alter function clinical.document_pending(text, jsonb) rename to document_pending_c2;
create function clinical.document_pending(kind text, payload jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  pending text[] := '{}';
  certificate_type text := payload ->> 'certificate_type';
begin
  if kind = 'certificate' then
    if certificate_type = '' then pending := array_append(pending, 'certificate_type'); end if;
    if payload ->> 'occurred_at' = '' then pending := array_append(pending, 'occurred_at'); end if;
    if certificate_type = 'leave' then
      if payload ->> 'leave_days' = '' then pending := array_append(pending, 'leave_days'); end if;
      if payload ->> 'leave_start' = '' then pending := array_append(pending, 'leave_start'); end if;
      if payload ->> 'activities' = '' then pending := array_append(pending, 'activities'); end if;
    elsif certificate_type = 'attendance' then
      if payload ->> 'start_time' = '' then pending := array_append(pending, 'start_time'); end if;
      if payload ->> 'end_time' = '' then pending := array_append(pending, 'end_time'); end if;
    elsif certificate_type = 'fitness' then
      if payload ->> 'fitness' = '' then pending := array_append(pending, 'fitness'); end if;
      if payload ->> 'activities' = '' then pending := array_append(pending, 'activities'); end if;
      if payload ->> 'fitness' = 'fit_with_restrictions' and payload ->> 'restrictions' = '' then
        pending := array_append(pending, 'restrictions');
      end if;
    end if;
    if payload ->> 'cid' <> '' and payload -> 'cid_authorized' is distinct from 'true'::jsonb then
      pending := array_append(pending, 'cid_authorized');
    end if;
    return pending;
  end if;
  if kind = 'referral' then
    if payload ->> 'specialty' = '' then pending := array_append(pending, 'specialty'); end if;
    if payload ->> 'reason' = '' then pending := array_append(pending, 'reason'); end if;
    if payload ->> 'clinical_summary' = '' then pending := array_append(pending, 'clinical_summary'); end if;
    if payload ->> 'diagnosis' = '' then pending := array_append(pending, 'diagnosis'); end if;
    if payload ->> 'request' = '' then pending := array_append(pending, 'request'); end if;
    if payload ->> 'priority' = '' then pending := array_append(pending, 'priority'); end if;
    return pending;
  end if;
  return clinical.document_pending_c2(kind, payload);
end $$;

alter function clinical.document_ready(text, jsonb) rename to document_ready_c2;
create function clinical.document_ready(kind text, payload jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if kind = 'certificate' then
    return payload ->> 'occurred_at' <> ''
      and (payload ->> 'cid' = '' or payload -> 'cid_authorized' = 'true'::jsonb)
      and case payload ->> 'certificate_type'
        when 'leave' then payload ->> 'leave_days' <> ''
        when 'attendance' then payload ->> 'start_time' <> ''
        when 'fitness' then payload ->> 'fitness' <> ''
        else false
      end;
  end if;
  if kind = 'referral' then
    return payload ->> 'specialty' <> '' and payload ->> 'reason' <> '';
  end if;
  return clinical.document_ready_c2(kind, payload);
end $$;

alter function clinical.document_label(text, jsonb) rename to document_label_c2;
create function clinical.document_label(kind text, content jsonb) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if kind = 'certificate' then
    return case content ->> 'certificate_type'
      when 'leave' then case when coalesce(content ->> 'leave_days', '') <> ''
        then 'Afastamento por ' || (content ->> 'leave_days') || case when content ->> 'leave_days' = '1' then ' dia' else ' dias' end
        else 'Atestado de afastamento' end
      when 'attendance' then 'Atestado de comparecimento'
      when 'fitness' then 'Atestado de aptidão esportiva'
      else ''
    end;
  end if;
  if kind = 'referral' then
    return case when coalesce(content ->> 'specialty', '') <> '' then 'Encaminhamento para ' || (content ->> 'specialty') else '' end;
  end if;
  return clinical.document_label_c2(kind, content);
end $$;

alter function clinical.document_utterance_kind(text) rename to document_utterance_kind_c2;
create function clinical.document_utterance_kind(utterance text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  plain text := pg_catalog.translate(pg_catalog.lower(coalesce(utterance, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  base text := clinical.document_utterance_kind_c2(utterance);
  named_certificate boolean := plain ~ 'atestado';
  named_referral boolean := plain ~ 'encaminha';
begin
  if (named_certificate and named_referral) or ((named_certificate or named_referral) and base <> 'any') then return 'both'; end if;
  if named_certificate then return 'certificate'; end if;
  if named_referral then return 'referral'; end if;
  return base;
end $$;

-- Readable title of a proposal card for every kind.
create function clinical.document_title(kind text, content jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(clinical.document_label(kind, content), ''), case kind
    when 'prescription' then 'Prescrição'
    when 'exam_request' then 'Solicitação de exames'
    when 'surgical_order' then 'Pedido cirúrgico'
    when 'certificate' then 'Atestado'
    when 'referral' then 'Encaminhamento'
    else 'Documento'
  end)
$$;

revoke all on function clinical.canonical_certificate(jsonb) from public;
revoke all on function clinical.canonical_referral(jsonb) from public;
revoke all on function clinical.canonical_document(text, jsonb) from public;
revoke all on function clinical.document_pending(text, jsonb) from public;
revoke all on function clinical.document_ready(text, jsonb) from public;
revoke all on function clinical.document_label(text, jsonb) from public;
revoke all on function clinical.document_utterance_kind(text) from public;
revoke all on function clinical.document_title(text, jsonb) from public;

-- Every other function that lists the document kinds accepts the two new ones. Each function is
-- regenerated from its current definition, so permissions, owners and bodies are preserved.
do $$
declare
  fn record;
  src text;
  updated text;
begin
  for fn in
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'clinical') and p.prokind = 'f'
      and p.proname not like '%\_c2' escape '\'
      and p.prosrc ~ '''prescription'',\s*''surgical_order'',\s*''exam_request'''
  loop
    src := pg_catalog.pg_get_functiondef(fn.oid);
    updated := pg_catalog.regexp_replace(
      src,
      '''prescription'',(\s*)''surgical_order'',(\s*)''exam_request''',
      '''prescription'',\1''surgical_order'',\2''exam_request'',\2''certificate'',\2''referral''',
      'g'
    );
    if updated <> src then execute updated; end if;
  end loop;

  -- The clinical search accepts up to seven kinds now that two document kinds were added.
  src := pg_catalog.pg_get_functiondef('public.search_clinical_activity(jsonb, text, text)'::regprocedure);
  updated := pg_catalog.replace(src, 'jsonb_array_length(chosen_kinds) not between 1 and 5', 'jsonb_array_length(chosen_kinds) not between 1 and 7');
  if updated = src then raise exception 'search_clinical_activity kind limit not found'; end if;
  execute updated;
  src := pg_catalog.pg_get_functiondef('clinical.conversation_clinical_search(jsonb)'::regprocedure);
  updated := pg_catalog.replace(src, 'jsonb_array_length(f->''kinds'') not between 1 and 5', 'jsonb_array_length(f->''kinds'') not between 1 and 7');
  if updated = src then raise exception 'conversation_clinical_search kind limit not found'; end if;
  execute updated;

  src := pg_catalog.pg_get_functiondef('clinical.chat_proposal_dto(clinical.document_proposals)'::regprocedure);
  updated := pg_catalog.replace(src,
    'case when p.document_type=''surgical_order'' then coalesce(nullif(p.content->>''procedure'',''''),''Pedido cirúrgico'') else coalesce(nullif(p.content->''items''->0->>''name'',''''),case when p.document_type=''prescription'' then ''Prescrição'' else ''Solicitação de exames'' end) end',
    'case when p.document_type in (''certificate'',''referral'') then clinical.document_title(p.document_type,p.content) when p.document_type=''surgical_order'' then coalesce(nullif(p.content->>''procedure'',''''),''Pedido cirúrgico'') else coalesce(nullif(p.content->''items''->0->>''name'',''''),case when p.document_type=''prescription'' then ''Prescrição'' else ''Solicitação de exames'' end) end');
  if updated = src then raise exception 'chat_proposal_dto title expression not found'; end if;
  execute updated;
end $$;
