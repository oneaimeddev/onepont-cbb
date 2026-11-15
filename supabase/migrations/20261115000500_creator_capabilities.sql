alter table clinical.athlete_creators add column can_write_created boolean not null default false,
 add column can_finalize_created boolean not null default false;
alter function public.athlete_create(uuid,text,text,date,text,text) rename to athlete_create_v1;
revoke all on function public.athlete_create_v1(uuid,text,text,date,text,text) from public,anon,authenticated;
create function public.athlete_create(creation_id uuid,name text,social text,birth date,club text,sport_category text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=public.athlete_create_v1(creation_id,name,social,birth,club,sport_category);
 if target is not null then
  update clinical.athlete_access a set can_edit=true,can_write=c.can_write_created,
    can_read_records=c.can_write_created,can_finalize=c.can_finalize_created
  from clinical.athlete_creators c where a.athlete_id=target and a.professional_id=auth.uid()
   and c.professional_id=auth.uid();
 end if;
 return target;
end $$;
revoke all on function public.athlete_create(uuid,text,text,date,text,text) from public,anon,authenticated;
grant execute on function public.athlete_create(uuid,text,text,date,text,text) to authenticated;
