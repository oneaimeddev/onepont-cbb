create schema clinical;
revoke all on schema clinical from public, anon, authenticated;

create table clinical.athletes (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  social_name text check (length(social_name) <= 160),
  birth_date date check (birth_date between date '1900-01-01' and current_date),
  team text check (length(team) <= 120),
  category text check (length(category) <= 120),
  status text not null default 'active' check (status in ('active', 'inactive')),
  source text not null default 'manual' check (source in ('manual', 'demo')),
  external_cbb_id text unique,
  created_by uuid references public.profiles(id) on delete set null,
  creation_key uuid,
  unique (created_by, creation_key)
);

create table clinical.athlete_creators (
  professional_id uuid primary key references public.profiles(id) on delete cascade
);

create table clinical.athlete_access (
  athlete_id uuid references clinical.athletes(id) on delete cascade,
  professional_id uuid references public.profiles(id) on delete cascade,
  can_read_records boolean not null default false,
  primary key (athlete_id, professional_id)
);
create index on clinical.athlete_access (professional_id, athlete_id);

create table clinical.records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references clinical.athletes(id),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  specialty text not null,
  title text not null,
  body text not null,
  occurred_at timestamptz not null,
  status text not null check (status in ('draft', 'finalized')),
  visibility text not null check (visibility in ('care_team', 'author_only'))
);
create index on clinical.records (athlete_id, occurred_at desc, id desc);

create table clinical.audit_events (
  request_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  resource_type text not null,
  resource_id uuid,
  athlete_id uuid,
  operation text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  origin_channel text not null default 'traditional_ui',
  execution_method text not null default 'human_ui',
  outcome text not null check (outcome in ('success', 'denied', 'failed')),
  approved_by_user_id uuid
);
create index on clinical.audit_events (occurred_at desc, request_id desc);

alter table clinical.athletes enable row level security;
alter table clinical.athlete_creators enable row level security;
alter table clinical.athlete_access enable row level security;
alter table clinical.records enable row level security;
alter table clinical.audit_events enable row level security;

create function public.athlete_catalog(search text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = actor) then
    raise insufficient_privilege;
  end if;

  insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome)
  values (actor, 'athlete', 'athlete.list', 'success');

  return jsonb_build_object(
    'can_create', exists (select 1 from clinical.athlete_creators where professional_id = actor),
    'athletes', coalesce((
      select jsonb_agg(to_jsonb(result) order by result.full_name, result.id)
      from (
        select a.id, a.full_name, a.social_name, a.team, a.category, a.status
        from clinical.athletes a
        join clinical.athlete_access v on v.athlete_id = a.id and v.professional_id = actor
        where strpos(lower(concat_ws(' ', a.full_name, a.social_name, a.id::text)),
          lower(left(trim(coalesce(search, '')), 160))) > 0
        order by a.full_name, a.id
        limit 51
      ) result
    ), '[]'::jsonb)
  );
end
$$;

create function public.athlete_create(
  creation_id uuid, name text, social text, birth date, club text, sport_category text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare athlete uuid;
begin
  if not exists (select 1 from public.profiles where id = actor) then
    raise insufficient_privilege;
  end if;
  if not exists (select 1 from clinical.athlete_creators where professional_id = actor) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome)
    values (actor, 'athlete', 'athlete.create', 'denied');
    return null;
  end if;
  if creation_id is null then raise invalid_parameter_value; end if;

  insert into clinical.athletes(full_name, social_name, birth_date, team, category, created_by, creation_key)
  values (trim(name), nullif(trim(social), ''), birth, nullif(trim(club), ''), nullif(trim(sport_category), ''), actor, creation_id)
  on conflict (created_by, creation_key) do nothing
  returning id into athlete;

  if athlete is null then
    select a.id into athlete from clinical.athletes a
    where a.created_by = actor and a.creation_key = creation_id;
    return athlete;
  end if;

  insert into clinical.athlete_access(athlete_id, professional_id) values (athlete, actor);
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome)
  values (actor, 'athlete', athlete, athlete, 'athlete.create', 'success');
  return athlete;
end
$$;

create function public.athlete_workspace(target uuid, view_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare athlete jsonb;
declare read_records boolean;
declare operation_name text;
declare history jsonb;
begin
  if not exists (select 1 from public.profiles where id = actor) then
    raise insufficient_privilege;
  end if;
  if view_name is null or view_name not in ('profile', 'timeline', 'chat') then
    raise invalid_parameter_value;
  end if;
  operation_name := case view_name when 'timeline' then 'clinical_record.timeline.read'
    when 'chat' then 'athlete.context.open' else 'athlete.view' end;

  select to_jsonb(a) - 'creation_key' - 'created_by', v.can_read_records
    into athlete, read_records
    from clinical.athletes a
    join clinical.athlete_access v on v.athlete_id = a.id and v.professional_id = actor
    where a.id = target;

  if athlete is null or (view_name = 'timeline' and not read_records) then
    -- O alvo pode ter sido adivinhado. Não confirmar sua existência no evento.
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome)
    values (actor, 'athlete', operation_name, 'denied');
    return null;
  end if;

  if view_name = 'timeline' then
    select coalesce(jsonb_agg(to_jsonb(r) - 'athlete_id' - 'author_id' - 'visibility'
      order by r.occurred_at desc, r.id desc), '[]'::jsonb)
    into history from clinical.records r
    where r.athlete_id = target
      and ((r.status = 'finalized' and r.visibility = 'care_team') or r.author_id = actor);
  end if;

  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome)
  values (actor, 'athlete', target, target, operation_name, 'success');
  return jsonb_build_object('athlete', athlete, 'can_read_records', read_records, 'records', history);
end
$$;

create function public.athlete_audit()
returns setof clinical.audit_events language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and can_read_audit) then
    raise insufficient_privilege;
  end if;
  return query select * from clinical.audit_events e
    order by e.occurred_at desc, e.request_id desc limit 100;
  insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome)
  values (auth.uid(), 'audit', 'audit.list', 'success');
end
$$;

revoke execute on function public.athlete_catalog(text),
  public.athlete_create(uuid, text, text, date, text, text),
  public.athlete_workspace(uuid, text), public.athlete_audit() from public, anon, authenticated;

grant execute on function public.athlete_catalog(text),
  public.athlete_create(uuid, text, text, date, text, text),
  public.athlete_workspace(uuid, text), public.athlete_audit() to authenticated;
