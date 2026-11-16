-- Clinical document drafts. The medical capability is an operational flag.
-- It does not validate a professional license, and profiles.profession is not consulted.

create table clinical.medical_authors (
  professional_id uuid primary key references public.profiles (id) on delete cascade,
  credential_label text check (credential_label is null or length(trim(credential_label)) between 1 and 80),
  enabled boolean not null default true,
  granted_by uuid,
  granted_at timestamptz not null default clock_timestamp()
);

create table clinical.documents (
  id uuid primary key,
  athlete_id uuid not null references clinical.athletes (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_name text not null,
  credential_label text,
  document_type text not null check (document_type in ('prescription', 'surgical_order')),
  status text not null check (status in ('draft', 'ready_for_review')),
  content jsonb not null,
  version integer not null check (version >= 1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index documents_author_athlete_idx on clinical.documents (author_id, athlete_id, updated_at desc);

create table clinical.document_revisions (
  document_id uuid not null references clinical.documents (id) on delete cascade,
  version integer not null check (version >= 1),
  actor_id uuid not null,
  status text not null,
  content jsonb not null,
  changed_at timestamptz not null default clock_timestamp(),
  primary key (document_id, version)
);

alter table clinical.medical_authors enable row level security;
alter table clinical.documents enable row level security;
alter table clinical.document_revisions enable row level security;
revoke all on clinical.medical_authors, clinical.documents, clinical.document_revisions from public, anon, authenticated;

create function clinical.clip_text(value jsonb, max_length integer) returns text
language plpgsql immutable set search_path = '' as $$
declare raw text;
begin
  if value is null or value = 'null'::jsonb then return ''; end if;
  if jsonb_typeof(value) <> 'string' then return null; end if;
  raw := value #>> '{}';
  if length(raw) > max_length then return null; end if;
  return btrim(raw);
end $$;

create function clinical.canonical_document(kind text, payload jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  built jsonb := '[]'::jsonb;
  seen text[] := '{}';
  item_id text;
  fields text[] := array['name', 'presentation', 'dose', 'dose_unit', 'route', 'schedule', 'duration', 'quantity', 'instructions'];
  field text;
  clipped text;
  notes text;
  procedure_name text;
  region text;
  laterality text;
  indication text;
  diagnosis text;
  justification text;
  priority text;
  additional text;
  materials text;
  item_object jsonb;
begin
  if kind not in ('prescription', 'surgical_order') or jsonb_typeof(payload) <> 'object' then return null; end if;
  if kind = 'prescription' then
    if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') > 12 then return null; end if;
    notes := clinical.clip_text(payload -> 'notes', 2000);
    if notes is null then return null; end if;
    for item in select value from jsonb_array_elements(payload -> 'items') loop
      if jsonb_typeof(item) <> 'object' then return null; end if;
      item_id := lower(coalesce(item ->> 'id', ''));
      if item_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or item_id = any(seen) then return null; end if;
      seen := seen || item_id;
      item_object := jsonb_build_object('id', item_id);
      foreach field in array fields loop
        clipped := clinical.clip_text(item -> field, case when field = 'instructions' then 500 else 160 end);
        if clipped is null then return null; end if;
        item_object := item_object || jsonb_build_object(field, clipped);
      end loop;
      built := built || jsonb_build_array(item_object);
    end loop;
    return jsonb_build_object('notes', notes, 'items', built);
  end if;

  procedure_name := clinical.clip_text(payload -> 'procedure', 200);
  region := clinical.clip_text(payload -> 'region', 120);
  laterality := clinical.clip_text(payload -> 'laterality', 20);
  indication := clinical.clip_text(payload -> 'indication', 2000);
  diagnosis := clinical.clip_text(payload -> 'diagnosis', 500);
  justification := clinical.clip_text(payload -> 'justification', 2000);
  priority := clinical.clip_text(payload -> 'priority', 20);
  additional := clinical.clip_text(payload -> 'additional', 2000);
  materials := clinical.clip_text(payload -> 'materials', 1000);
  if procedure_name is null or region is null or laterality is null or indication is null
    or diagnosis is null or justification is null or priority is null or additional is null or materials is null then
    return null;
  end if;
  if laterality not in ('', 'left', 'right', 'bilateral', 'not_applicable') then return null; end if;
  if priority not in ('', 'elective', 'priority', 'urgent') then return null; end if;
  return jsonb_build_object(
    'procedure', procedure_name, 'region', region, 'laterality', laterality,
    'indication', indication, 'diagnosis', diagnosis, 'justification', justification,
    'priority', priority, 'additional', additional, 'materials', materials
  );
end $$;

create function clinical.document_pending(kind text, payload jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  pending text[] := '{}';
  item jsonb;
  ordinal integer := 0;
  named integer := 0;
begin
  if kind = 'prescription' then
    if payload ->> 'notes' = '' then pending := array_append(pending, 'notes'); end if;
    for item in select value from jsonb_array_elements(payload -> 'items') loop
      ordinal := ordinal + 1;
      if item ->> 'name' <> '' then named := named + 1; end if;
      if item ->> 'name' = '' then pending := array_append(pending, 'item.' || ordinal || '.name'); end if;
      if item ->> 'presentation' = '' then pending := array_append(pending, 'item.' || ordinal || '.presentation'); end if;
      if item ->> 'dose' = '' then pending := array_append(pending, 'item.' || ordinal || '.dose'); end if;
      if item ->> 'dose_unit' = '' then pending := array_append(pending, 'item.' || ordinal || '.dose_unit'); end if;
      if item ->> 'route' = '' then pending := array_append(pending, 'item.' || ordinal || '.route'); end if;
      if item ->> 'schedule' = '' then pending := array_append(pending, 'item.' || ordinal || '.schedule'); end if;
      if item ->> 'duration' = '' then pending := array_append(pending, 'item.' || ordinal || '.duration'); end if;
      if item ->> 'quantity' = '' then pending := array_append(pending, 'item.' || ordinal || '.quantity'); end if;
      if item ->> 'instructions' = '' then pending := array_append(pending, 'item.' || ordinal || '.instructions'); end if;
    end loop;
    if named = 0 then pending := array_append(pending, 'medication'); end if;
    return pending;
  end if;
  if payload ->> 'procedure' = '' then pending := array_append(pending, 'procedure'); end if;
  if payload ->> 'region' = '' then pending := array_append(pending, 'region'); end if;
  if payload ->> 'laterality' = '' then pending := array_append(pending, 'laterality'); end if;
  if payload ->> 'indication' = '' then pending := array_append(pending, 'indication'); end if;
  if payload ->> 'diagnosis' = '' then pending := array_append(pending, 'diagnosis'); end if;
  if payload ->> 'justification' = '' then pending := array_append(pending, 'justification'); end if;
  if payload ->> 'priority' = '' then pending := array_append(pending, 'priority'); end if;
  if payload ->> 'additional' = '' then pending := array_append(pending, 'additional'); end if;
  if payload ->> 'materials' = '' then pending := array_append(pending, 'materials'); end if;
  return pending;
end $$;

create function clinical.document_ready(kind text, payload jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case kind
    when 'prescription' then exists (
      select 1 from jsonb_array_elements(payload -> 'items') item where item ->> 'name' <> ''
    )
    else payload ->> 'procedure' <> '' and payload ->> 'justification' <> ''
  end
$$;

create function clinical.can_author_documents(actor uuid, target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from clinical.medical_authors
    where professional_id = actor and enabled
  ) and exists (
    select 1 from clinical.athlete_access
    where professional_id = actor and athlete_id = target and can_read_records
  )
$$;

revoke all on function clinical.clip_text(jsonb, integer), clinical.canonical_document(text, jsonb),
  clinical.document_pending(text, jsonb), clinical.document_ready(text, jsonb),
  clinical.can_author_documents(uuid, uuid) from public, anon, authenticated;

create function public.medical_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); author clinical.medical_authors;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then
    raise insufficient_privilege;
  end if;
  select * into author from clinical.medical_authors where professional_id = actor and enabled;
  return jsonb_build_object(
    'enabled', author.professional_id is not null,
    'credential_label', author.credential_label
  );
end $$;

create function public.medical_author_grant(professional uuid, label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); cleaned text := nullif(btrim(coalesce(label, '')), '');
begin
  if actor is null then raise insufficient_privilege; end if;
  if actor = professional or not exists (select 1 from public.profiles where id = actor and can_manage_access)
    or not exists (select 1 from public.profiles where id = professional) or (cleaned is not null and length(cleaned) > 80) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'medical_author', professional, 'medical_author.grant', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;
  insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by)
  values (professional, cleaned, true, actor)
  on conflict (professional_id) do update set
    enabled = true,
    credential_label = coalesce(excluded.credential_label, clinical.medical_authors.credential_label),
    granted_by = actor,
    granted_at = clock_timestamp();
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'medical_author', professional, 'medical_author.grant', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('enabled', true);
end $$;

create function public.medical_author_revoke(professional uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise insufficient_privilege; end if;
  if not exists (select 1 from public.profiles where id = actor and can_manage_access)
    or not exists (select 1 from public.profiles where id = professional) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'medical_author', professional, 'medical_author.revoke', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;
  update clinical.medical_authors set enabled = false, granted_by = actor, granted_at = clock_timestamp()
  where professional_id = professional;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'medical_author', professional, 'medical_author.revoke', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('enabled', false);
end $$;

create function public.document_list(target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise insufficient_privilege; end if;
  if not clinical.can_author_documents(actor, target) then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', target, 'document.list', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;
  insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'clinical_document', target, 'document.list', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('documents', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'document_type', d.document_type, 'status', d.status,
      'version', d.version, 'created_at', d.created_at, 'updated_at', d.updated_at
    ) order by d.updated_at desc)
    from clinical.documents d
    where d.athlete_id = target and d.author_id = actor
  ), '[]'::jsonb));
end $$;

create function public.document_open(target uuid, document_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing clinical.documents;
begin
  if actor is null then raise insufficient_privilege; end if;
  if not clinical.can_author_documents(actor, target) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', document_id, target, 'document.read', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;
  select * into existing from clinical.documents where id = document_id and athlete_id = target and author_id = actor;
  if existing.id is null then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', document_id, target, 'document.read', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'clinical_document', existing.id, target, 'document.read', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object(
    'id', existing.id, 'athlete_id', existing.athlete_id, 'document_type', existing.document_type,
    'status', existing.status, 'version', existing.version, 'content', existing.content,
    'author_name', existing.author_name, 'credential_label', existing.credential_label,
    'created_at', existing.created_at, 'updated_at', existing.updated_at,
    'pending', to_jsonb(clinical.document_pending(existing.document_type, existing.content))
  );
end $$;

create function public.document_save(target uuid, document_id uuid, expected_version integer, kind text, payload jsonb, intent text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  existing clinical.documents;
  canonical jsonb;
  next_status text;
  operation text;
  review text;
  prof public.profiles;
  author clinical.medical_authors;
begin
  if actor is null then raise insufficient_privilege; end if;
  if document_id is null or expected_version is null or expected_version < 0 or intent not in ('save', 'review') then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', target, 'document.save', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'invalid');
  end if;
  if not clinical.can_author_documents(actor, target) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', document_id, target, 'document.save', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;
  canonical := clinical.canonical_document(kind, payload);
  if canonical is null then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', document_id, target, 'document.save', 'failed', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'invalid');
  end if;

  select * into existing from clinical.documents where id = document_id for update;
  if existing.id is not null and (existing.author_id <> actor or existing.athlete_id <> target or existing.document_type <> kind) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', document_id, target, 'document.save', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('error', 'denied');
  end if;

  next_status := case
    when intent = 'review' and clinical.document_ready(kind, canonical) then 'ready_for_review'
    when intent = 'save' and existing.id is not null and existing.content = canonical then existing.status
    else 'draft'
  end;
  review := case
    when intent <> 'review' then null
    when next_status = 'ready_for_review' then 'accepted'
    else 'blocked'
  end;

  if existing.id is not null and existing.version = expected_version and existing.content = canonical and existing.status = next_status then
    return jsonb_build_object(
      'id', existing.id, 'version', existing.version, 'status', existing.status, 'review', review,
      'pending', to_jsonb(clinical.document_pending(kind, existing.content))
    );
  end if;
  if existing.id is not null and existing.version = expected_version + 1 and existing.content = canonical and existing.status = next_status then
    return jsonb_build_object(
      'id', existing.id, 'version', existing.version, 'status', existing.status, 'review', review,
      'pending', to_jsonb(clinical.document_pending(kind, existing.content))
    );
  end if;
  if existing.id is not null and existing.version <> expected_version then
    return jsonb_build_object('error', 'conflict');
  end if;
  if existing.id is null and expected_version <> 0 then
    return jsonb_build_object('error', 'conflict');
  end if;

  if existing.id is null then
    select * into prof from public.profiles where id = actor;
    select * into author from clinical.medical_authors where professional_id = actor and enabled;
    insert into clinical.documents(
      id, athlete_id, author_id, author_name, credential_label, document_type, status, content, version
    ) values (
      document_id, target, actor, prof.display_name, author.credential_label, kind, next_status, canonical, 1
    ) returning * into existing;
    operation := 'document.draft_created';
  else
    insert into clinical.document_revisions(document_id, version, actor_id, status, content)
    values (existing.id, existing.version, actor, existing.status, existing.content);
    update clinical.documents set
      content = canonical,
      status = next_status,
      version = version + 1,
      updated_at = clock_timestamp()
    where id = existing.id
    returning * into existing;
    operation := case when next_status = 'ready_for_review' then 'document.ready_for_review' else 'document.draft_saved' end;
  end if;

  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'clinical_document', existing.id, target, operation, 'success', clinical.audit_channel(), clinical.audit_method());
  if operation = 'document.draft_created' and next_status = 'ready_for_review' then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'clinical_document', existing.id, target, 'document.ready_for_review', 'success', clinical.audit_channel(), clinical.audit_method());
  end if;
  return jsonb_build_object(
    'id', existing.id, 'version', existing.version, 'status', existing.status, 'review', review,
    'pending', to_jsonb(clinical.document_pending(kind, existing.content))
  );
exception when unique_violation then
  return jsonb_build_object('error', 'conflict');
end $$;

revoke all on function public.medical_profile(), public.medical_author_grant(uuid, text), public.medical_author_revoke(uuid),
  public.document_list(uuid), public.document_open(uuid, uuid),
  public.document_save(uuid, uuid, integer, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.medical_profile(), public.medical_author_grant(uuid, text), public.medical_author_revoke(uuid),
  public.document_list(uuid), public.document_open(uuid, uuid),
  public.document_save(uuid, uuid, integer, text, jsonb, text) to authenticated;
