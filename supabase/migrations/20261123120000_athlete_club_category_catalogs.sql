-- Categoria atual e clube de origem passam a ser dados estruturados.
-- Todos os atletas da plataforma são convocados pela CBB; fora das convocações atuam no clube
-- de origem. A lista de categorias é completa e fixa; clubes novos entram a cada convocação.
-- 1. O catálogo de categorias recebe todas as categorias de seleção, e os catálogos são
--    completados com os nomes já usados nos vínculos. Cada vínculo aponta para o clube do
--    catálogo (club_id).
-- 2. Gatilhos mantêm catálogo, texto do clube e cadastro do atleta sincronizados em qualquer
--    caminho de gravação (cadastro, novo vínculo, importação).
-- 3. O diretório aceita filtro de gênero, além de categoria, naipe e clube.

insert into clinical.categories (name, name_key)
select name, clinical.catalog_key(name)
from unnest(array['Sub-13', 'Sub-14', 'Sub-15', 'Sub-16', 'Sub-17', 'Sub-18', 'Sub-19', 'Sub-20', 'Sub-21', 'Sub-22', 'Sub-23', 'Profissional']) name
on conflict (name_key) do nothing;

-- Nomes de clube ou categoria vindos de vínculos: catálogo com chave normalizada.
insert into clinical.categories (name, name_key)
select distinct on (clinical.catalog_key(label)) label, clinical.catalog_key(label)
from (select clinical.catalog_label(category, 80) label from clinical.sport_options) source
where label is not null and clinical.catalog_key(label) <> ''
order by clinical.catalog_key(label), label
on conflict (name_key) do nothing;

insert into clinical.organizations (name, name_key, kind)
select distinct on (clinical.catalog_key(label)) label, clinical.catalog_key(label), 'club'
from (select clinical.catalog_label(club, 120) label from clinical.sport_links) source
where label is not null and clinical.catalog_key(label) <> ''
order by clinical.catalog_key(label), label
on conflict (kind, name_key) do nothing;

-- Vínculos existentes passam a apontar para o clube do catálogo, com o nome padronizado.
update clinical.sport_links l
set club_id = o.id, club = o.name
from clinical.organizations o
where l.club_id is null and o.kind = 'club'
  and clinical.catalog_label(l.club, 120) is not null
  and o.name_key = clinical.catalog_key(clinical.catalog_label(l.club, 120));

update clinical.sport_links l set club = o.name
from clinical.organizations o
where o.id = l.club_id and l.club is distinct from o.name;

-- Gravação de vínculo: o clube informado só por texto entra no catálogo; o identificador
-- define o nome exibido; seleção precisa ser do tipo seleção.
create or replace function clinical.sport_link_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare cleaned text; key text; found uuid; found_name text;
begin
  if new.club_id is not null then
    select name into found_name from clinical.organizations where id = new.club_id and kind = 'club';
    if found_name is null then raise exception 'club_id must reference a club' using errcode = '23514'; end if;
    new.club := found_name;
  else
    cleaned := clinical.catalog_label(new.club, 120);
    key := clinical.catalog_key(cleaned);
    if cleaned is null or key = '' then
      new.club := null;
    else
      insert into clinical.organizations (name, name_key, kind) values (cleaned, key, 'club')
      on conflict (kind, name_key) do nothing;
      select id, name into found, found_name from clinical.organizations where kind = 'club' and name_key = key;
      new.club_id := found;
      new.club := found_name;
    end if;
  end if;
  if new.national_team_id is not null
    and not exists (select 1 from clinical.organizations where id = new.national_team_id and kind = 'national_team') then
    raise exception 'national_team_id must reference a national team' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists sport_link_catalog on clinical.sport_links;
create trigger sport_link_catalog before insert or update of club, club_id, national_team_id on clinical.sport_links
for each row execute function clinical.sport_link_catalog();

-- Toda categoria usada em opção esportiva aparece no catálogo de categorias.
create or replace function clinical.sport_option_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare cleaned text := clinical.catalog_label(new.category, 80);
begin
  if cleaned is not null and clinical.catalog_key(cleaned) <> '' then
    insert into clinical.categories (name, name_key) values (cleaned, clinical.catalog_key(cleaned))
    on conflict (name_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists sport_option_category on clinical.sport_options;
create trigger sport_option_category after insert on clinical.sport_options
for each row execute function clinical.sport_option_category();

-- Categoria e clube exibidos no cadastro acompanham o vínculo vigente mais recente.
create or replace function clinical.sync_athlete_sport(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update clinical.athletes a
  set category = current_link.category, team = current_link.club
  from (
    select o.category, l.club
    from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
    where l.athlete_id = target
      and l.starts_on <= (timezone('America/Sao_Paulo', clock_timestamp()))::date
      and (l.ends_on is null or l.ends_on >= (timezone('America/Sao_Paulo', clock_timestamp()))::date)
    order by l.starts_on desc, l.id desc
    limit 1
  ) current_link
  where a.id = target
    and (a.category is distinct from current_link.category or a.team is distinct from current_link.club);
$$;

create or replace function clinical.sport_link_sync_athlete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform clinical.sync_athlete_sport(new.athlete_id);
  return null;
end $$;

drop trigger if exists sport_link_sync_athlete on clinical.sport_links;
create trigger sport_link_sync_athlete after insert or update on clinical.sport_links
for each row execute function clinical.sport_link_sync_athlete();

select clinical.sync_athlete_sport(id) from clinical.athletes
where exists (select 1 from clinical.sport_links l where l.athlete_id = athletes.id);

revoke all on function clinical.sport_link_catalog() from public, anon, authenticated;
revoke all on function clinical.sport_option_category() from public, anon, authenticated;
revoke all on function clinical.sync_athlete_sport(uuid) from public, anon, authenticated;
revoke all on function clinical.sport_link_sync_athlete() from public, anon, authenticated;

-- Gênero de um atleta para busca: identidade informada ou, sem ela, o naipe do vínculo vigente.
create or replace function clinical.athlete_gender_matches(target uuid, informed text, wanted text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(wanted, '') = '' then true
    when informed is not null and informed <> 'nao_informado' then informed = clinical.search_text(wanted)
    else exists (
      select 1 from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
      where l.athlete_id = target and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)
        and clinical.search_text(o.division) = clinical.search_text(wanted))
  end
$$;

revoke all on function clinical.athlete_gender_matches(uuid, text, text) from public, anon, authenticated;

create or replace function public.athlete_directory(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  wanted_gender text := clinical.search_text(left(coalesce(filters->>'gender', ''), 20));
begin
  if not exists(select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  if wanted_gender not in ('', 'feminino', 'masculino', 'nao_binario', 'outro') then wanted_gender := '__none__'; end if;
  with matching as (
    select a.id, a.full_name, a.social_name, a.birth_date, a.team, a.category, a.status, a.photo_version, a.external_cbb_id, a.gender_identity,
      coalesce((select jsonb_agg(jsonb_build_object('category', o.category, 'division', o.division, 'modality', o.modality, 'club', l.club,
          'club_id', l.club_id, 'season', o.season) order by l.starts_on desc)
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
      and clinical.athlete_gender_matches(a.id, a.gender_identity, nullif(wanted_gender, ''))
      and ((coalesce(filters->>'category', '') = '' and coalesce(filters->>'division', '') = '' and coalesce(filters->>'modality', '') = ''
          and coalesce(filters->>'club', '') = '')
        or exists(select 1 from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
          where l.athlete_id = a.id and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)
            and (coalesce(filters->>'category', '') = '' or clinical.search_text(o.category) = clinical.search_text(filters->>'category'))
            and (coalesce(filters->>'division', '') = '' or clinical.search_text(o.division) = clinical.search_text(filters->>'division'))
            and (coalesce(filters->>'modality', '') = '' or clinical.search_text(o.modality) = clinical.search_text(filters->>'modality'))
            and (coalesce(filters->>'club', '') = '' or clinical.search_text(l.club) = clinical.search_text(filters->>'club')
              or clinical.athlete_name_matches(l.club, filters->>'club'))))
  ), paged as (select * from matching order by full_name, id limit page_size offset (page_number - 1) * page_size)
  select jsonb_build_object(
    'athletes', coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name, p.id) from paged p), '[]'::jsonb),
    'total', (select count(*) from matching),
    'page', page_number,
    'page_size', page_size,
    'can_create', exists(select 1 from clinical.athlete_creators where professional_id = actor),
    'options', coalesce((select jsonb_agg(distinct jsonb_build_object('category', o.category, 'division', o.division, 'modality', o.modality,
        'club', l.club))
      from clinical.sport_links l join clinical.sport_options o on o.id = l.option_id
      join clinical.athlete_access v on v.athlete_id = l.athlete_id and v.professional_id = actor
      where l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)), '[]'::jsonb)
  ) into result;
  insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome, origin_channel, execution_method)
  values (actor, 'athlete', 'athlete.list', 'success', clinical.audit_channel(), clinical.audit_method());
  return result;
end $function$;
