-- Reusable categories and organizations. Sport history stays on sport_links.
-- Personal identifiers and guardian contacts live outside the shared athlete payload.

create function clinical.catalog_key(value text) returns text
language sql stable set search_path = '' as $$
  select regexp_replace(lower(extensions.unaccent(trim(coalesce(value, '')))), '[[:space:]]+', ' ', 'g')
$$;

create table clinical.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  name_key text not null unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default clock_timestamp()
);

create table clinical.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  name_key text not null,
  kind text not null check (kind in ('club', 'national_team')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (kind, name_key)
);

alter table clinical.athletes
  add column gender_identity text check (
    gender_identity is null or gender_identity in ('feminino', 'masculino', 'nao_binario', 'outro', 'nao_informado')
  ),
  add column document_id text check (document_id is null or length(trim(document_id)) between 1 and 40);

create table clinical.athlete_contacts (
  athlete_id uuid primary key references clinical.athletes (id) on delete cascade,
  phone text check (phone is null or length(phone) between 8 and 20),
  email text check (email is null or length(email) between 6 and 160),
  guardian_name text check (guardian_name is null or length(trim(guardian_name)) between 1 and 160),
  guardian_relation text check (guardian_relation is null or length(trim(guardian_relation)) between 1 and 40),
  guardian_contact text check (guardian_contact is null or length(guardian_contact) between 8 and 160),
  emergency_contact text check (emergency_contact is null or length(emergency_contact) between 8 and 160)
);

alter table clinical.sport_links
  add column club_id uuid references clinical.organizations (id),
  add column national_team_id uuid references clinical.organizations (id),
  add column position_name text check (position_name is null or length(trim(position_name)) between 1 and 40),
  add column shirt_number text check (shirt_number is null or shirt_number ~ '^[0-9]{1,3}$');

insert into clinical.categories (name, name_key)
select distinct on (clinical.catalog_key(category)) trim(category), clinical.catalog_key(category)
from (
  select category from clinical.sport_options
  union
  select category from clinical.athletes where category is not null
) source
where length(trim(category)) between 1 and 80 and clinical.catalog_key(category) <> ''
order by clinical.catalog_key(category), trim(category);

insert into clinical.organizations (name, name_key, kind)
select distinct on (clinical.catalog_key(club)) trim(club), clinical.catalog_key(club), 'club'
from (
  select club from clinical.sport_links where club is not null
  union
  select team as club from clinical.athletes where team is not null
) source
where length(trim(club)) between 1 and 120 and clinical.catalog_key(club) <> ''
order by clinical.catalog_key(club), trim(club);

update clinical.sport_links link
set club_id = organization.id
from clinical.organizations organization
where organization.kind = 'club'
  and organization.name_key = clinical.catalog_key(link.club)
  and link.club_id is null;

alter table clinical.categories enable row level security;
alter table clinical.organizations enable row level security;
alter table clinical.athlete_contacts enable row level security;
revoke all on clinical.categories, clinical.organizations, clinical.athlete_contacts from public, anon, authenticated;
revoke all on function clinical.catalog_key(text) from public, anon, authenticated;

create function clinical.catalog_label(value text, max_length integer) returns text
language plpgsql stable set search_path = '' as $$
declare cleaned text := regexp_replace(trim(coalesce(value, '')), '[[:space:]]+', ' ', 'g');
begin
  if cleaned = '' or length(cleaned) > max_length then return null; end if;
  if cleaned !~ '^[[:alnum:][:space:].''’/&-]{1,120}$' then return null; end if;
  return cleaned;
end $$;

revoke all on function clinical.catalog_label(text, integer) from public, anon, authenticated;

create function public.catalog_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from clinical.categories), '[]'::jsonb),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from clinical.organizations where kind = 'club'), '[]'::jsonb),
    'national_teams', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from clinical.organizations where kind = 'national_team'), '[]'::jsonb),
    'divisions', coalesce((select jsonb_agg(distinct division order by division) from clinical.sport_options), '[]'::jsonb),
    'modalities', coalesce((select jsonb_agg(distinct modality order by modality) from clinical.sport_options), '[]'::jsonb)
  );
end $$;

create function public.catalog_create_category(label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); cleaned text; key text; existing uuid; existing_name text; created uuid;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if not exists (select 1 from clinical.athlete_creators where professional_id = actor) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
    values (actor, 'catalog', 'catalog.category.create', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  cleaned := clinical.catalog_label(label, 80);
  key := clinical.catalog_key(cleaned);
  if cleaned is null or key = '' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select id, name into existing, existing_name from clinical.categories where name_key = key;
  if existing is not null then
    return jsonb_build_object('ok', false, 'error', 'duplicate', 'id', existing, 'name', existing_name);
  end if;
  insert into clinical.categories (name, name_key, created_by) values (cleaned, key, actor) returning id into created;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'catalog', created, 'catalog.category.create', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('ok', true, 'id', created, 'name', cleaned);
end $$;

create function public.catalog_create_organization(label text, org_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); cleaned text; key text; existing uuid; existing_name text; created uuid;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if org_kind not in ('club', 'national_team') then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if not exists (select 1 from clinical.athlete_creators where professional_id = actor) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
    values (actor, 'catalog', 'catalog.organization.create', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  cleaned := clinical.catalog_label(label, 120);
  key := clinical.catalog_key(cleaned);
  if cleaned is null or key = '' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select id, name into existing, existing_name from clinical.organizations where kind = org_kind and name_key = key;
  if existing is not null then
    return jsonb_build_object('ok', false, 'error', 'duplicate', 'id', existing, 'name', existing_name);
  end if;
  insert into clinical.organizations (name, name_key, kind, created_by) values (cleaned, key, org_kind, actor) returning id into created;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'catalog', created, 'catalog.organization.create', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('ok', true, 'id', created, 'name', cleaned);
end $$;

create function clinical.open_sport_link(target uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare category_name text; chosen_division text; chosen_modality text; position_name text; shirt text;
  club uuid; national_team uuid; club_name text; chosen_season integer; option_id uuid; today date;
begin
  category_name := (select name from clinical.categories where id = nullif(payload->>'category_id', '')::uuid);
  chosen_division := nullif(trim(coalesce(payload->>'division', '')), '');
  chosen_modality := nullif(trim(coalesce(payload->>'modality', '')), '');
  position_name := nullif(trim(coalesce(payload->>'position', '')), '');
  shirt := nullif(trim(coalesce(payload->>'shirt', '')), '');
  club := nullif(payload->>'club_id', '')::uuid;
  national_team := nullif(payload->>'national_team_id', '')::uuid;
  if category_name is null or chosen_division is null or chosen_modality is null then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'category_id');
  end if;
  if length(chosen_division) > 80 or length(chosen_modality) > 40 or (position_name is not null and length(position_name) > 40) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'modality');
  end if;
  if shirt is not null and shirt !~ '^[0-9]{1,3}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'shirt');
  end if;
  if chosen_division not in ('Feminino', 'Masculino') and not exists (select 1 from clinical.sport_options where sport_options.division = chosen_division) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'division');
  end if;
  if chosen_modality not in ('5x5', '3x3') and not exists (select 1 from clinical.sport_options where sport_options.modality = chosen_modality) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'modality');
  end if;
  if club is not null and not exists (select 1 from clinical.organizations where id = club and kind = 'club') then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'club_id');
  end if;
  if national_team is not null and not exists (select 1 from clinical.organizations where id = national_team and kind = 'national_team') then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'national_team_id');
  end if;
  select name into club_name from clinical.organizations where id = club;
  today := (timezone('America/Sao_Paulo', clock_timestamp()))::date;
  chosen_season := extract(year from today)::integer;
  insert into clinical.sport_options (category, modality, division, season)
  values (category_name, chosen_modality, chosen_division, chosen_season)
  on conflict (category, modality, division, season) do nothing;
  select sport_options.id into option_id from clinical.sport_options
  where sport_options.category = category_name and sport_options.modality = chosen_modality
    and sport_options.division = chosen_division and sport_options.season = chosen_season;
  update clinical.sport_links set ends_on = today where athlete_id = target and ends_on is null;
  insert into clinical.sport_links (athlete_id, option_id, club, club_id, national_team_id, position_name, shirt_number, starts_on)
  values (target, option_id, club_name, club, national_team, position_name, shirt, today);
  update clinical.athletes set category = category_name, team = coalesce(club_name, athletes.team) where id = target;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'duplicate', 'field', 'category_id');
end $$;

revoke all on function clinical.open_sport_link(uuid, jsonb) from public, anon, authenticated;

create function public.sport_link_open(target uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if not exists (select 1 from clinical.athlete_access where athlete_id = target and professional_id = actor and can_edit) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
    values (actor, 'athlete', 'sport_link.open', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  result := clinical.open_sport_link(target, payload);
  if result->>'ok' = 'true' then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
    values (actor, 'athlete', target, target, 'sport_link.open', 'success', clinical.audit_channel(), clinical.audit_method());
  end if;
  return result;
end $$;

create function public.athlete_register(creation_id uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); athlete uuid; name text; social text; birth date; gender text; document text;
  phone text; email text; guardian_name text; guardian_relation text; guardian_contact text; emergency text;
  link jsonb; sports boolean;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if not exists (select 1 from clinical.athlete_creators where professional_id = actor) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
    values (actor, 'athlete', 'athlete.create', 'denied', clinical.audit_channel(), clinical.audit_method());
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  if creation_id is null then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'name'); end if;
  select a.id into athlete from clinical.athletes a where a.created_by = actor and a.creation_key = creation_id;
  if athlete is not null then return jsonb_build_object('ok', true, 'id', athlete); end if;

  name := nullif(trim(coalesce(payload->>'name', '')), '');
  social := nullif(trim(coalesce(payload->>'social', '')), '');
  if name is null or length(name) > 160 or (social is not null and length(social) > 160) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'name');
  end if;
  if nullif(payload->>'birth', '') is not null then
    begin
      birth := (payload->>'birth')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'birth');
    end;
    if birth < date '1900-01-01' or birth > (timezone('America/Sao_Paulo', clock_timestamp()))::date then
      return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'birth');
    end if;
  end if;
  gender := nullif(payload->>'gender_identity', '');
  if gender is not null and gender not in ('feminino', 'masculino', 'nao_binario', 'outro', 'nao_informado') then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'gender_identity');
  end if;
  document := nullif(regexp_replace(trim(coalesce(payload->>'document', '')), '[[:space:]]+', '', 'g'), '');
  if document is not null and document !~ '^[0-9]{11}$' and document !~ '^[A-Za-z0-9./-]{1,40}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'document');
  end if;
  phone := nullif(trim(coalesce(payload->>'phone', '')), '');
  email := nullif(lower(trim(coalesce(payload->>'email', ''))), '');
  guardian_name := nullif(trim(coalesce(payload->>'guardian_name', '')), '');
  guardian_relation := nullif(trim(coalesce(payload->>'guardian_relation', '')), '');
  guardian_contact := nullif(trim(coalesce(payload->>'guardian_contact', '')), '');
  emergency := nullif(trim(coalesce(payload->>'emergency_contact', '')), '');
  if phone is not null and phone !~ '^[0-9 +().-]{8,20}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'phone');
  end if;
  if email is not null and email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'email');
  end if;
  if guardian_name is not null and length(guardian_name) > 160 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'guardian_name');
  end if;
  if guardian_relation is not null and length(guardian_relation) > 40 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'guardian_relation');
  end if;
  if guardian_contact is not null and (length(guardian_contact) < 8 or length(guardian_contact) > 160) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'guardian_contact');
  end if;
  if emergency is not null and (length(emergency) < 8 or length(emergency) > 160) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'emergency_contact');
  end if;

  insert into clinical.athletes (full_name, social_name, birth_date, gender_identity, document_id, created_by, creation_key)
  values (name, social, birth, gender, document, actor, creation_id)
  returning id into athlete;

  if phone is not null or email is not null or guardian_name is not null or guardian_relation is not null
     or guardian_contact is not null or emergency is not null then
    insert into clinical.athlete_contacts (athlete_id, phone, email, guardian_name, guardian_relation, guardian_contact, emergency_contact)
    values (athlete, phone, email, guardian_name, guardian_relation, guardian_contact, emergency);
  end if;

  sports := nullif(payload->>'category_id', '') is not null or nullif(trim(coalesce(payload->>'division', '')), '') is not null
    or nullif(trim(coalesce(payload->>'modality', '')), '') is not null or nullif(payload->>'club_id', '') is not null
    or nullif(payload->>'national_team_id', '') is not null or nullif(trim(coalesce(payload->>'position', '')), '') is not null
    or nullif(trim(coalesce(payload->>'shirt', '')), '') is not null;
  if sports then
    link := clinical.open_sport_link(athlete, payload);
    if link->>'ok' <> 'true' then
      raise exception 'invalid sport link' using errcode = '22023';
    end if;
  end if;

  insert into clinical.athlete_access (athlete_id, professional_id) values (athlete, actor);
  update clinical.athlete_access access set can_edit = true, can_write = creator.can_write_created,
    can_read_records = creator.can_write_created, can_finalize = creator.can_finalize_created
  from clinical.athlete_creators creator
  where access.athlete_id = athlete and access.professional_id = actor and creator.professional_id = actor;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'athlete', athlete, athlete, 'athlete.create', 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('ok', true, 'id', athlete);
exception when invalid_parameter_value or sqlstate '22023' then
  if athlete is not null then delete from clinical.athletes where id = athlete; end if;
  return coalesce(link, jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'category_id'));
end $$;

create function public.athlete_registration(target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if not exists (select 1 from clinical.athlete_access where athlete_id = target and professional_id = actor and can_edit) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
    values (actor, 'athlete', 'athlete.registration.read', 'denied', clinical.audit_channel(), clinical.audit_method());
    return null;
  end if;
  return (
    select jsonb_build_object(
      'gender_identity', athlete.gender_identity,
      'document_id', athlete.document_id,
      'phone', contact.phone,
      'email', contact.email,
      'guardian_name', contact.guardian_name,
      'guardian_relation', contact.guardian_relation,
      'guardian_contact', contact.guardian_contact,
      'emergency_contact', contact.emergency_contact
    )
    from clinical.athletes athlete
    left join clinical.athlete_contacts contact on contact.athlete_id = athlete.id
    where athlete.id = target
  );
end $$;

create or replace function public.athlete_workspace_v2(target uuid, view_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; permissions jsonb; links jsonb;
begin
  result := public.athlete_workspace_v1(target, view_name);
  if result is null then return null; end if;
  result := jsonb_set(result, '{athlete}', (result->'athlete') - 'photo' - 'qa_batch' - 'document_id' - 'gender_identity');
  select jsonb_build_object('can_edit', can_edit, 'can_write', can_write, 'can_finalize', can_finalize)
  into permissions from clinical.athlete_access where athlete_id = target and professional_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', link.id, 'category', option.category, 'modality', option.modality, 'division', option.division,
    'season', option.season, 'club', link.club, 'club_id', link.club_id, 'national_team', organization.name,
    'position', link.position_name, 'shirt_number', link.shirt_number, 'starts_on', link.starts_on, 'ends_on', link.ends_on
  ) order by link.starts_on desc, link.id desc), '[]'::jsonb) into links
  from clinical.sport_links link
  join clinical.sport_options option on option.id = link.option_id
  left join clinical.organizations organization on organization.id = link.national_team_id
  where link.athlete_id = target;
  return result || permissions || jsonb_build_object('sports', links);
end $$;

revoke all on function
  public.catalog_list(),
  public.catalog_create_category(text),
  public.catalog_create_organization(text, text),
  public.sport_link_open(uuid, jsonb),
  public.athlete_register(uuid, jsonb),
  public.athlete_registration(uuid)
from public, anon, authenticated;

grant execute on function
  public.catalog_list(),
  public.catalog_create_category(text),
  public.catalog_create_organization(text, text),
  public.sport_link_open(uuid, jsonb),
  public.athlete_register(uuid, jsonb),
  public.athlete_registration(uuid)
to authenticated;
