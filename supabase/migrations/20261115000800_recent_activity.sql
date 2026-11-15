create or replace function public.athlete_workspace(target uuid,view_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; counts jsonb; records jsonb; recent jsonb;
begin
 result:=public.athlete_workspace_v2(target,view_name);
 if result is null then return null; end if;
 if (result->>'can_read_records')::boolean then
  select jsonb_build_object('evolutions',count(*),'encounters',count(distinct encounter_id))
  into counts from clinical.records r where r.athlete_id=target
  and ((r.status='finalized' and r.visibility='care_team') or r.author_id=auth.uid());
  if view_name='profile' then
   select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc,r.id desc),'[]'::jsonb) into recent from (
    select id,title,specialty,author_name,status,occurred_at from clinical.records
    where athlete_id=target and ((status='finalized' and visibility='care_team') or author_id=auth.uid())
    order by occurred_at desc,id desc limit 3
   ) r;
   insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome)
   values(auth.uid(),'athlete',target,target,'clinical_record.summary.read','success');
  end if;
 end if;
 if view_name='timeline' then
  select coalesce(jsonb_agg(value||jsonb_build_object('is_restricted',r.visibility='author_only',
    'is_author',r.author_id=auth.uid(),'encounter_status',e.status)
    order by (value->>'occurred_at')::timestamptz desc,value->>'id' desc),'[]'::jsonb)
  into records from jsonb_array_elements(result->'records') value
  join clinical.records r on r.id=(value->>'id')::uuid
  left join clinical.encounters e on e.id=r.encounter_id;
  result:=jsonb_set(result,'{records}',records);
 end if;
 return result||jsonb_build_object('counts',counts,'recent_records',recent);
end $$;
