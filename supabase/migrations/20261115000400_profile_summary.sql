alter function public.athlete_workspace(uuid,text) rename to athlete_workspace_v2;
revoke all on function public.athlete_workspace_v2(uuid,text) from public,anon,authenticated;
create function public.athlete_workspace(target uuid,view_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; counts jsonb; records jsonb;
begin
 result:=public.athlete_workspace_v2(target,view_name);
 if result is null then return null; end if;
 if (result->>'can_read_records')::boolean then
  select jsonb_build_object('evolutions',count(*),'encounters',count(distinct encounter_id))
  into counts from clinical.records r where r.athlete_id=target
  and ((r.status='finalized' and r.visibility='care_team') or r.author_id=auth.uid());
 end if;
 if view_name='timeline' then
  select coalesce(jsonb_agg(value||jsonb_build_object('is_restricted',r.visibility='author_only','is_author',r.author_id=auth.uid())
    order by (value->>'occurred_at')::timestamptz desc,value->>'id' desc),'[]'::jsonb)
  into records from jsonb_array_elements(result->'records') value join clinical.records r on r.id=(value->>'id')::uuid;
  result:=jsonb_set(result,'{records}',records);
 end if;
 return result||jsonb_build_object('counts',counts);
end $$;
revoke all on function public.athlete_workspace(uuid,text) from public,anon,authenticated;
grant execute on function public.athlete_workspace(uuid,text) to authenticated;
