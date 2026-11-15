create function clinical.search_text(value text) returns text language sql immutable parallel safe set search_path=''
as $$ select lower(extensions.unaccent('extensions.unaccent',regexp_replace(trim(coalesce(value,'')),'\s+',' ','g'))) $$;
create extension if not exists pg_trgm with schema extensions;
create index athlete_search on clinical.athletes using gin
 (clinical.search_text(full_name||' '||coalesce(social_name,'')||' '||id::text||' '||coalesce(external_cbb_id,'')) extensions.gin_trgm_ops);
create function public.athlete_directory(filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; total integer; page_number integer:=greatest(1,least(100000,coalesce((filters->>'page')::integer,1))); actor uuid:=auth.uid();
begin
 if not exists(select 1 from public.profiles where id=actor) then raise insufficient_privilege; end if;
 with matching as (
 select a.id,a.full_name,a.social_name,a.birth_date,a.team,a.category,a.status,a.photo_version,a.external_cbb_id,
 coalesce((select jsonb_agg(jsonb_build_object('category',o.category,'division',o.division,'modality',o.modality,'club',l.club,'season',o.season))
 from clinical.sport_links l join clinical.sport_options o on o.id=l.option_id
 where l.athlete_id=a.id and l.starts_on<=current_date and (l.ends_on is null or l.ends_on>=current_date)), '[]'::jsonb) sports
 from clinical.athletes a join clinical.athlete_access v on v.athlete_id=a.id and v.professional_id=actor
 where clinical.search_text(a.full_name||' '||coalesce(a.social_name,'')||' '||a.id::text||' '||coalesce(a.external_cbb_id,''))
 like '%'||replace(replace(replace(clinical.search_text(left(filters->>'q',160)),'\','\\'),'%','\%'),'_','\_')||'%'
 and (coalesce(filters->>'status','')='' or a.status=filters->>'status')
 and ((coalesce(filters->>'category','')='' and coalesce(filters->>'division','')='' and coalesce(filters->>'modality','')='' and coalesce(filters->>'club','')='')
 or exists(select 1 from clinical.sport_links l join clinical.sport_options o on o.id=l.option_id
 where l.athlete_id=a.id and l.starts_on<=current_date and (l.ends_on is null or l.ends_on>=current_date)
 and (coalesce(filters->>'category','')='' or o.category=filters->>'category')
 and (coalesce(filters->>'division','')='' or o.division=filters->>'division')
 and (coalesce(filters->>'modality','')='' or o.modality=filters->>'modality')
 and (coalesce(filters->>'club','')='' or l.club=filters->>'club')))
 ), paged as (select * from matching order by full_name,id limit 25 offset (page_number-1)*25)
 select jsonb_build_object('athletes',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb),
 'total',(select count(*) from matching),'page',page_number,
 'can_create',exists(select 1 from clinical.athlete_creators where professional_id=actor),
 'options',coalesce((select jsonb_agg(distinct jsonb_build_object('category',o.category,'division',o.division,'modality',o.modality,'club',l.club))
 from clinical.sport_links l join clinical.sport_options o on o.id=l.option_id
 join clinical.athlete_access v on v.athlete_id=l.athlete_id and v.professional_id=actor
 where l.starts_on<=current_date and (l.ends_on is null or l.ends_on>=current_date)),'[]'::jsonb)) into result;
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome) values(actor,'athlete','athlete.list','success');
 return result;
end $$;
revoke all on function public.athlete_directory(jsonb) from public,anon,authenticated;
grant execute on function public.athlete_directory(jsonb) to authenticated;
