-- A retried creation must not restore permissions revoked after the first save.
create or replace function public.athlete_create(creation_id uuid,name text,social text,birth date,club text,sport_category text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; already_created boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||creation_id::text,0));
 select exists(select 1 from clinical.athletes where created_by=auth.uid() and creation_key=creation_id) into already_created;
 target:=public.athlete_create_v1(creation_id,name,social,birth,club,sport_category);
 if target is not null and not already_created then
  update clinical.athlete_access a set can_edit=true,can_write=c.can_write_created,
    can_read_records=c.can_write_created,can_finalize=c.can_finalize_created
  from clinical.athlete_creators c where a.athlete_id=target and a.professional_id=auth.uid()
   and c.professional_id=auth.uid();
 end if;
 return target;
end $$;
