create or replace function public.chat_consultation_navigation(target uuid, review boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  specialty_name text := clinical.consultation_specialty(actor);
  result jsonb;
begin
  if specialty_name is null or not exists (
    select 1 from clinical.athlete_access a
    join clinical.athletes t on t.id = a.athlete_id and t.source = 'demo'
    where a.athlete_id = target and a.professional_id = actor and a.can_read_records and a.can_write
  ) then return null; end if;
  if not review then return '{"available":true}'; end if;
  select jsonb_build_object('captureId', c.id, 'recordId', c.evolution_id) into result
  from clinical.consultation_sessions c
  where c.athlete_id = target and c.professional_id = actor and c.specialty = specialty_name
    and c.capture_state = 'complete' and c.processing_state = 'ready'
  order by c.created_at desc, c.id desc limit 1;
  return result;
end;
$$;
revoke all on function public.chat_consultation_navigation(uuid, boolean) from public, anon, authenticated;
grant execute on function public.chat_consultation_navigation(uuid, boolean) to authenticated;

create or replace function clinical.conversation_navigation(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  athlete_key text := value->>'id';
  athlete_name text := left(trim(coalesce(value->>'name', '')), 160);
  href text := value->>'href';
  base text := '/atletas/' || athlete_key;
  id_pattern constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if jsonb_typeof(value) is distinct from 'object' or athlete_key is null
    or athlete_key !~* ('^' || id_pattern || '$') or athlete_name = '' or href is null then return null; end if;
  if href not in (base, base || '?aba=cadastro', base || '/evolucao?modo=voz')
    and href !~* ('^' || base || '/evolucao[?](modo=voz&consulta=|registro=)' || id_pattern || '$')
  then return null; end if;
  return jsonb_build_object('id', athlete_key, 'href', href, 'name', athlete_name);
end
$$;
