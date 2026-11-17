-- Name search also accepts tokens in order, so a missing middle name still matches.
-- The previous substring match remains, and only authorized athletes are visible.

create function clinical.athlete_name_matches(value text, query text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  folded text;
  needle text;
  words text[];
  tokens text[];
  token text;
  index integer := 1;
  found boolean;
begin
  needle := pg_catalog.regexp_replace(clinical.search_text(query), '[^a-z0-9 ]', ' ', 'g');
  needle := pg_catalog.btrim(pg_catalog.regexp_replace(needle, '\s+', ' ', 'g'));
  if needle = '' then return true; end if;
  tokens := pg_catalog.regexp_split_to_array(needle, ' ');
  folded := pg_catalog.regexp_replace(clinical.search_text(value), '[^a-z0-9 ]', ' ', 'g');
  folded := pg_catalog.btrim(pg_catalog.regexp_replace(folded, '\s+', ' ', 'g'));
  words := pg_catalog.regexp_split_to_array(folded, ' ');
  foreach token in array tokens loop
    if char_length(token) < 2 or token = any (array['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'atleta', 'atletas']) then
      continue;
    end if;
    token := pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(token, '\', '\\'), '%', '\%'), '_', '\_');
    found := false;
    while index <= coalesce(pg_catalog.cardinality(words), 0) loop
      if words[index] like token || '%' escape '\' then
        found := true;
        index := index + 1;
        exit;
      end if;
      index := index + 1;
    end loop;
    if not found then return false; end if;
  end loop;
  return exists (
    select 1 from pg_catalog.unnest(tokens) item
    where char_length(item) >= 2 and item <> all (array['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'atleta', 'atletas'])
  );
end $$;

create or replace function public.athlete_directory(filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
  page_number integer := greatest(1, least(100000, coalesce((filters->>'page')::integer, 1)));
  page_size integer := case
    when coalesce(filters->>'page_size', '') ~ '^[0-9]{1,2}$'
      then greatest(1, least(25, (filters->>'page_size')::integer))
    else 25
  end;
  actor uuid := auth.uid();
  needle text := clinical.search_text(left(coalesce(filters->>'q', ''), 160));
begin
  if not exists(select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  with matching as (
    select a.id, a.full_name, a.social_name, a.birth_date, a.team, a.category, a.status, a.photo_version, a.external_cbb_id,
      coalesce((select jsonb_agg(jsonb_build_object('category', o.category, 'division', o.division, 'modality', o.modality, 'club', l.club, 'season', o.season))
        from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
        where l.athlete_id = a.id and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)), '[]'::jsonb) sports
    from clinical.athletes a join clinical.athlete_access v on v.athlete_id = a.id and v.professional_id = actor
    where (
        needle = ''
        or clinical.athlete_name_matches(a.full_name || ' ' || coalesce(a.social_name, ''), filters->>'q')
        or clinical.search_text(a.full_name || ' ' || coalesce(a.social_name, '') || ' ' || a.id::text || ' ' || coalesce(a.external_cbb_id, ''))
          like '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
      and (coalesce(filters->>'status', '') = '' or a.status = filters->>'status')
      and ((coalesce(filters->>'category', '') = '' and coalesce(filters->>'division', '') = '' and coalesce(filters->>'modality', '') = '' and coalesce(filters->>'club', '') = '')
        or exists(select 1 from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
          where l.athlete_id = a.id and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)
            and (coalesce(filters->>'category', '') = '' or clinical.search_text(o.category) = clinical.search_text(filters->>'category'))
            and (coalesce(filters->>'division', '') = '' or clinical.search_text(o.division) = clinical.search_text(filters->>'division'))
            and (coalesce(filters->>'modality', '') = '' or clinical.search_text(o.modality) = clinical.search_text(filters->>'modality'))
            and (coalesce(filters->>'club', '') = '' or clinical.athlete_name_matches(l.club, filters->>'club'))))
  ), paged as (select * from matching order by full_name, id limit page_size offset (page_number - 1) * page_size)
  select jsonb_build_object(
    'athletes', coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name, p.id) from paged p), '[]'::jsonb),
    'total', (select count(*) from matching),
    'page', page_number,
    'page_size', page_size,
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

create function public.agent_presented_athletes(ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor) then
    raise insufficient_privilege;
  end if;
  with requested as (
    select item.id, item.ordinality
    from pg_catalog.unnest(coalesce(ids, '{}'::uuid[])) with ordinality as item(id, ordinality)
    where item.ordinality <= 40
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', a.id,
    'full_name', a.full_name,
    'social_name', a.social_name,
    'team', a.team,
    'category', a.category,
    'ordinal', requested.ordinality,
    'sports', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'category', o.category, 'division', o.division, 'modality', o.modality, 'club', l.club, 'season', o.season
    ))
      from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
      where l.athlete_id = a.id and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)), '[]'::jsonb)
  ) order by requested.ordinality), '[]'::jsonb)
  into result
  from requested
  join clinical.athletes a on a.id = requested.id
  join clinical.athlete_access v on v.athlete_id = a.id and v.professional_id = actor;
  return result;
end $$;

revoke all on function clinical.athlete_name_matches(text, text) from public, anon, authenticated;
revoke all on function public.agent_presented_athletes(uuid[]) from public, anon, authenticated;
grant execute on function public.agent_presented_athletes(uuid[]) to authenticated;
