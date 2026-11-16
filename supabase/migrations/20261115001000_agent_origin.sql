-- Agent calls record ai_chat / agent_tool from a transaction-local setting.
-- The setting is written only by the agent functions below, never from a parameter.

create function clinical.audit_channel() returns text
language sql stable set search_path = '' as $$
  select case pg_catalog.current_setting('cbb.origin_channel', true)
    when 'ai_chat' then 'ai_chat' else 'traditional_ui' end
$$;

create function clinical.audit_method() returns text
language sql stable set search_path = '' as $$
  select case pg_catalog.current_setting('cbb.execution_method', true)
    when 'agent_tool' then 'agent_tool' else 'human_ui' end
$$;

revoke all on function clinical.audit_channel(), clinical.audit_method() from public, anon, authenticated;

create or replace function public.athlete_directory(filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; page_number integer := greatest(1, least(100000, coalesce((filters->>'page')::integer, 1))); actor uuid := auth.uid();
begin
  if not exists(select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  with matching as (
    select a.id, a.full_name, a.social_name, a.birth_date, a.team, a.category, a.status, a.photo_version, a.external_cbb_id,
      coalesce((select jsonb_agg(jsonb_build_object('category', o.category, 'division', o.division, 'modality', o.modality, 'club', l.club, 'season', o.season))
        from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
        where l.athlete_id = a.id and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)), '[]'::jsonb) sports
    from clinical.athletes a join clinical.athlete_access v on v.athlete_id = a.id and v.professional_id = actor
    where clinical.search_text(a.full_name || ' ' || coalesce(a.social_name, '') || ' ' || a.id::text || ' ' || coalesce(a.external_cbb_id, ''))
      like '%' || replace(replace(replace(clinical.search_text(left(filters->>'q', 160)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      and (coalesce(filters->>'status', '') = '' or a.status = filters->>'status')
      and ((coalesce(filters->>'category', '') = '' and coalesce(filters->>'division', '') = '' and coalesce(filters->>'modality', '') = '' and coalesce(filters->>'club', '') = '')
        or exists(select 1 from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
          where l.athlete_id = a.id and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)
            and (coalesce(filters->>'category', '') = '' or o.category = filters->>'category')
            and (coalesce(filters->>'division', '') = '' or o.division = filters->>'division')
            and (coalesce(filters->>'modality', '') = '' or o.modality = filters->>'modality')
            and (coalesce(filters->>'club', '') = '' or l.club = filters->>'club')))
  ), paged as (select * from matching order by full_name, id limit 25 offset (page_number - 1) * 25)
  select jsonb_build_object(
    'athletes', coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb),
    'total', (select count(*) from matching),
    'page', page_number,
    'can_create', exists(select 1 from clinical.athlete_creators where professional_id = actor),
    'options', coalesce((select jsonb_agg(distinct jsonb_build_object('category', o.category, 'division', o.division, 'modality', o.modality, 'club', l.club))
      from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
      join clinical.athlete_access v on v.athlete_id = l.athlete_id and v.professional_id = actor
      where l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)), '[]'::jsonb)
  ) into result;
  insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
  values (actor, 'athlete', 'athlete.list', 'success', clinical.audit_channel(), clinical.audit_method());
  return result;
end $$;

create or replace function public.athlete_workspace_v1(target uuid, view_name text)
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
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
    values (actor, 'athlete', operation_name, 'denied', clinical.audit_channel(), clinical.audit_method());
    return null;
  end if;

  if view_name = 'timeline' then
    select coalesce(jsonb_agg(to_jsonb(r) - 'athlete_id' - 'author_id' - 'visibility'
      order by r.occurred_at desc, r.id desc), '[]'::jsonb)
    into history from clinical.records r
    where r.athlete_id = target
      and ((r.status = 'finalized' and r.visibility = 'care_team') or r.author_id = actor);
  end if;

  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
  values (actor, 'athlete', target, target, operation_name, 'success', clinical.audit_channel(), clinical.audit_method());
  return jsonb_build_object('athlete', athlete, 'can_read_records', read_records, 'records', history);
end $$;

create or replace function public.athlete_workspace(target uuid, view_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; counts jsonb; records jsonb; recent jsonb;
begin
  result := public.athlete_workspace_v2(target, view_name);
  if result is null then return null; end if;
  if (result->>'can_read_records')::boolean then
    select jsonb_build_object('evolutions', count(*), 'encounters', count(distinct encounter_id))
    into counts from clinical.records r where r.athlete_id = target
      and ((r.status = 'finalized' and r.visibility = 'care_team') or r.author_id = auth.uid());
    if view_name = 'profile' then
      select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc, r.id desc), '[]'::jsonb) into recent from (
        select id, title, specialty, author_name, status, occurred_at from clinical.records
        where athlete_id = target and ((status = 'finalized' and visibility = 'care_team') or author_id = auth.uid())
        order by occurred_at desc, id desc limit 3
      ) r;
      insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome, origin_channel, execution_method)
      values (auth.uid(), 'athlete', target, target, 'clinical_record.summary.read', 'success', clinical.audit_channel(), clinical.audit_method());
    end if;
  end if;
  if view_name = 'timeline' then
    select coalesce(jsonb_agg(value || jsonb_build_object('is_restricted', r.visibility = 'author_only',
      'is_author', r.author_id = auth.uid(), 'encounter_status', e.status)
      order by (value->>'occurred_at')::timestamptz desc, value->>'id' desc), '[]'::jsonb)
    into records from jsonb_array_elements(result->'records') value
    join clinical.records r on r.id = (value->>'id')::uuid
    left join clinical.encounters e on e.id = r.encounter_id;
    result := jsonb_set(result, '{records}', records);
  end if;
  return result || jsonb_build_object('counts', counts, 'recent_records', recent);
end $$;

create function public.agent_athlete_directory(filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'agent_tool', true);
  return public.athlete_directory(filters);
end $$;

create function public.agent_athlete_workspace(target uuid, view_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.set_config('cbb.origin_channel', 'ai_chat', true);
  perform pg_catalog.set_config('cbb.execution_method', 'agent_tool', true);
  return public.athlete_workspace(target, view_name);
end $$;

revoke all on function public.agent_athlete_directory(jsonb), public.agent_athlete_workspace(uuid, text) from public, anon, authenticated;
grant execute on function public.agent_athlete_directory(jsonb), public.agent_athlete_workspace(uuid, text) to authenticated;
