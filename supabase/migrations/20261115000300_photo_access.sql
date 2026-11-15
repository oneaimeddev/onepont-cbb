alter function public.athlete_photo(uuid,text,text) rename to athlete_photo_internal;
revoke all on function public.athlete_photo_internal(uuid,text,text) from public,anon,authenticated;
create function public.athlete_photo(target uuid) returns jsonb language sql security definer set search_path=''
as $$ select public.athlete_photo_internal(target,'read',null) $$;
revoke all on function public.athlete_photo(uuid) from public,anon,authenticated;
grant execute on function public.athlete_photo(uuid) to authenticated;
create function public.athlete_photo_store(target uuid, actor uuid, content text, remove boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'service_role' or actor is null then raise insufficient_privilege; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 return public.athlete_photo_internal(target,case when remove then 'remove' else 'replace' end,content);
end $$;
revoke all on function public.athlete_photo_store(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.athlete_photo_store(uuid,uuid,text,boolean) to service_role;
