-- Multidisciplinary links and a sticky author-only record.
-- Profession text is display data. It is not an authorization source.

alter table public.profiles
  add column can_manage_access boolean not null default false;

alter table clinical.athlete_access
  add column granted_by uuid references public.profiles(id),
  add column granted_at timestamptz;

create function public.athlete_access_manage(target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise insufficient_privilege; end if;
  if not exists (select 1 from public.profiles where id = actor and can_manage_access) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome)
    values (actor, 'athlete_access', 'athlete_access.list', 'denied');
    return null;
  end if;
  if not exists (select 1 from clinical.athletes where id = target) then
    insert into clinical.audit_events(actor_user_id, resource_type, athlete_id, operation, outcome)
    values (actor, 'athlete_access', target, 'athlete_access.list', 'denied');
    return null;
  end if;
  return jsonb_build_object(
    'athlete', (select jsonb_build_object('id', id, 'full_name', full_name, 'social_name', social_name)
      from clinical.athletes where id = target),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'professional_id', access.professional_id,
        'display_name', profile.display_name,
        'profession', profile.profession,
        'can_read_records', access.can_read_records,
        'can_edit', access.can_edit,
        'can_write', access.can_write,
        'can_finalize', access.can_finalize,
        'granted_by_name', grantor.display_name,
        'granted_at', access.granted_at
      ) order by profile.display_name)
      from clinical.athlete_access access
      join public.profiles profile on profile.id = access.professional_id
      left join public.profiles grantor on grantor.id = access.granted_by
      where access.athlete_id = target
    ), '[]'::jsonb)
  );
end $$;

create function public.professional_search(term text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); needle text;
begin
  if actor is null then raise insufficient_privilege; end if;
  if not exists (select 1 from public.profiles where id = actor and can_manage_access) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome)
    values (actor, 'athlete_access', 'athlete_access.search', 'denied');
    return null;
  end if;
  if term is null or length(trim(term)) < 2 then return '[]'::jsonb; end if;
  needle := replace(replace(replace(clinical.search_text(left(term, 80)), '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name, 'profession', profession) order by display_name)
    from (
      select id, display_name, profession from public.profiles
      where id <> actor and clinical.search_text(display_name) like '%' || needle || '%' escape '\'
      order by display_name limit 15
    ) matches
  ), '[]'::jsonb);
end $$;

create function public.athlete_access_grant(target uuid, professional uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); inserted uuid;
begin
  if actor is null or target is null or professional is null then raise insufficient_privilege; end if;
  if not exists (select 1 from public.profiles where id = actor and can_manage_access) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome)
    values (actor, 'athlete_access', 'athlete_access.grant', 'denied');
    return jsonb_build_object('error', 'denied');
  end if;
  if professional = actor
    or not exists (select 1 from clinical.athletes where id = target)
    or not exists (select 1 from public.profiles where id = professional) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome)
    values (actor, 'athlete_access', professional, target, 'athlete_access.grant', 'denied');
    return jsonb_build_object('error', case when professional = actor then 'self' else 'denied' end);
  end if;
  insert into clinical.athlete_access(
    athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize, granted_by, granted_at
  ) values (target, professional, true, false, true, true, actor, clock_timestamp())
  on conflict (athlete_id, professional_id) do nothing
  returning professional_id into inserted;
  if inserted is null then return jsonb_build_object('status', 'exists'); end if;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome)
  values (actor, 'athlete_access', professional, target, 'athlete_access.grant', 'success');
  return jsonb_build_object('status', 'granted');
end $$;

create function public.athlete_access_revoke(target uuid, professional uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); removed uuid;
begin
  if actor is null or target is null or professional is null then raise insufficient_privilege; end if;
  if not exists (select 1 from public.profiles where id = actor and can_manage_access) then
    insert into clinical.audit_events(actor_user_id, resource_type, operation, outcome)
    values (actor, 'athlete_access', 'athlete_access.revoke', 'denied');
    return jsonb_build_object('error', 'denied');
  end if;
  if not exists (select 1 from clinical.athletes where id = target) then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome)
    values (actor, 'athlete_access', professional, target, 'athlete_access.revoke', 'denied');
    return jsonb_build_object('error', 'denied');
  end if;
  delete from clinical.athlete_access
  where athlete_id = target and professional_id = professional
  returning professional_id into removed;
  if removed is null then
    insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome)
    values (actor, 'athlete_access', professional, target, 'athlete_access.revoke', 'denied');
    return jsonb_build_object('error', 'missing');
  end if;
  insert into clinical.audit_events(actor_user_id, resource_type, resource_id, athlete_id, operation, outcome)
  values (actor, 'athlete_access', professional, target, 'athlete_access.revoke', 'success');
  return jsonb_build_object('status', 'revoked');
end $$;

revoke execute on function
  public.athlete_access_manage(uuid), public.professional_search(text),
  public.athlete_access_grant(uuid, uuid), public.athlete_access_revoke(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.athlete_access_manage(uuid), public.professional_search(text),
  public.athlete_access_grant(uuid, uuid), public.athlete_access_revoke(uuid, uuid)
to authenticated;

create or replace function public.clinical_save(target uuid, request_id uuid, record_id uuid, expected_version integer, entry_title text, entry_body text, restricted boolean, finalize boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); access clinical.athlete_access; record clinical.records; prof public.profiles; enc uuid;
begin
 if actor is null then raise insufficient_privilege; end if;
 select * into access from clinical.athlete_access where athlete_id=target and professional_id=actor for share;
 if access is null or not access.can_read_records or not access.can_write or (finalize and not access.can_finalize) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome)
  values(actor,'clinical_record','clinical_record.save','denied');
  return jsonb_build_object('error','denied');
 end if;
 select * into prof from public.profiles where id=actor;
 if record_id is null then
  if finalize or request_id is null then raise invalid_parameter_value; end if;
  if exists(select 1 from clinical.encounters where id=request_id and athlete_id=target and author_id=actor) then
   select * into record from clinical.records where encounter_id=request_id;
   return jsonb_build_object('id',record.id,'version',record.version);
  end if;
  if length(trim(entry_title)) not between 1 and 160 or length(trim(entry_body)) not between 1 and 20000 then raise invalid_parameter_value; end if;
  insert into clinical.encounters(id,athlete_id,author_id,specialty) values(request_id,target,actor,prof.profession);
  insert into clinical.records(athlete_id,author_id,author_name,specialty,title,body,occurred_at,status,visibility,encounter_id)
  values(target,actor,prof.display_name,prof.profession,trim(entry_title),entry_body,now(),'draft',
   case when restricted then 'author_only' else 'care_team' end,request_id) returning * into record;
 else
  select * into record from clinical.records where id=record_id and athlete_id=target and author_id=actor for update;
  if record is null then
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome)
 values(actor,'clinical_record','clinical_record.save','denied');
 return jsonb_build_object('error','denied'); end if;
  if record.status='finalized' and finalize and record.version=expected_version+1 then
   return jsonb_build_object('id',record.id,'version',record.version);
  end if;
  if record.status<>'draft' or expected_version is null or record.version<>expected_version then
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome)
 values(actor,'clinical_record',record.id,target,'clinical_record.save','failed');
 return jsonb_build_object('error','conflict'); end if;
  if not finalize and (length(trim(entry_title)) not between 1 and 160 or length(trim(entry_body)) not between 1 and 20000) then raise invalid_parameter_value; end if;
  insert into clinical.record_revisions(record_id,actor_id,version,title,body)
  values(record.id,actor,record.version,record.title,record.body);
  update clinical.records r set
   title=case when finalize then r.title else trim(entry_title) end,
   body=case when finalize then r.body else entry_body end,
   visibility=case
    when r.visibility='author_only' then 'author_only'
    when finalize then r.visibility
    when restricted then 'author_only'
    else 'care_team' end,
   status=case when finalize then 'finalized' else 'draft' end,
   version=r.version+1 where r.id=record.id returning * into record;
  if finalize then update clinical.encounters set status='closed' where id=record.encounter_id; end if;
 end if;
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,approved_by_user_id)
 values(actor,'clinical_record',record.id,target,case when finalize then 'clinical_record.finalized' else 'clinical_record.draft_saved' end,'success',case when finalize then actor end);
 return jsonb_build_object('id',record.id,'version',record.version);
end $$;
