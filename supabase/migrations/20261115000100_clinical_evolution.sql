create extension if not exists unaccent with schema extensions;
alter table clinical.athlete_access
 add column can_edit boolean not null default false,
 add column can_write boolean not null default false,
 add column can_finalize boolean not null default false;
alter table clinical.athletes add column photo bytea,
 add column photo_version uuid,
 add column qa_batch text;
create table clinical.sport_options (
 id uuid primary key default gen_random_uuid(),
 category text not null, modality text not null, division text not null,
 season integer not null, unique(category, modality, division, season)
);
create table clinical.sport_links (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references clinical.athletes(id) on delete cascade,
 option_id uuid not null references clinical.sport_options(id),
 club text, starts_on date not null, ends_on date,
 check (ends_on is null or ends_on >= starts_on),
 unique(athlete_id, option_id, starts_on)
);
create index on clinical.sport_links (athlete_id, option_id);
create table clinical.encounters (
 id uuid primary key,
 athlete_id uuid not null references clinical.athletes(id),
 author_id uuid not null references public.profiles(id),
 specialty text not null,
 occurred_at timestamptz not null default now(),
 status text not null default 'open' check(status in ('open','closed'))
);
alter table clinical.records add column encounter_id uuid references clinical.encounters(id),
 add column version integer not null default 1;
create table clinical.record_revisions (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references clinical.records(id),
 actor_id uuid not null,
 version integer not null,
 title text not null, body text not null,
 occurred_at timestamptz not null default now(),
 unique(record_id, version)
);
alter table clinical.sport_options enable row level security;
alter table clinical.sport_links enable row level security;
alter table clinical.encounters enable row level security;
alter table clinical.record_revisions enable row level security;

create function clinical.protect_record() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='finalized' then raise exception 'Finalized record is immutable'; end if;
 return new;
end $$;
create trigger protect_record before update on clinical.records for each row execute function clinical.protect_record();

create function public.athlete_photo(target uuid, action text default 'read', content text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); allowed boolean; result jsonb; data bytea;
begin
 select case when action='read' then true else v.can_edit end into allowed
 from clinical.athlete_access v where v.athlete_id=target and v.professional_id=actor;
 if actor is null then raise insufficient_privilege; end if;
 if action not in ('read','replace','remove') then raise invalid_parameter_value; end if;
 if not coalesce(allowed,false) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome)
  values(actor,'athlete','photo.'||action,'denied');
  return null;
 end if;
 if action='replace' then
  data:=decode(content,'base64');
  if octet_length(data)>5242880 or substring(data from 1 for 4)<>decode('52494646','hex') or substring(data from 9 for 4)<>decode('57454250','hex') then
   raise invalid_parameter_value;
  end if;
  update clinical.athletes set photo=data,photo_version=gen_random_uuid() where id=target;
 elsif action='remove' then
  update clinical.athletes set photo=null,photo_version=null where id=target;
 end if;
 select jsonb_build_object('content',case when action='read' then encode(photo,'base64') end) into result from clinical.athletes where id=target;
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome)
 values(actor,'athlete',target,target,'photo.'||action,'success');
 return result;
end $$;

-- The original DTO must never expose binary photos through profile reads.
alter function public.athlete_workspace(uuid,text) rename to athlete_workspace_v1;
revoke all on function public.athlete_workspace_v1(uuid,text) from public,anon,authenticated;
create function public.athlete_workspace(target uuid,view_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; permissions jsonb; links jsonb;
begin
 result:=public.athlete_workspace_v1(target,view_name);
 if result is null then return null; end if;
 result:=jsonb_set(result,'{athlete}',(result->'athlete')-'photo'-'qa_batch');
 select jsonb_build_object('can_edit',can_edit,'can_write',can_write,'can_finalize',can_finalize)
 into permissions from clinical.athlete_access where athlete_id=target and professional_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'category',s.category,'modality',s.modality,
 'division',s.division,'season',s.season,'club',l.club,'starts_on',l.starts_on,'ends_on',l.ends_on)
 order by l.starts_on desc),'[]'::jsonb) into links
 from clinical.sport_links l join clinical.sport_options s on s.id=l.option_id where l.athlete_id=target;
 return result||permissions||jsonb_build_object('sports',links);
end $$;

create function public.athlete_edit(target uuid,name text,social text,birth date,club text,sport_category text,registration_status text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if not exists(select 1 from clinical.athlete_access where athlete_id=target and professional_id=auth.uid() and can_edit) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome) values(auth.uid(),'athlete','athlete.edit','denied');
  return false;
 end if;
 update clinical.athletes set full_name=trim(name),social_name=nullif(trim(social),''),birth_date=birth,
 team=nullif(trim(club),''),category=nullif(trim(sport_category),''),status=registration_status where id=target;
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome)
 values(auth.uid(),'athlete',target,target,'athlete.edit','success');
 return true;
end $$;

create function public.clinical_save(target uuid,request_id uuid,record_id uuid,expected_version integer,
 entry_title text,entry_body text,restricted boolean,finalize boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  if record is null then return jsonb_build_object('error','denied'); end if;
  if record.status='finalized' and finalize and record.version=expected_version+1 then
   return jsonb_build_object('id',record.id,'version',record.version);
  end if;
  if record.status<>'draft' or record.version<>expected_version then return jsonb_build_object('error','conflict'); end if;
  if not finalize and (length(trim(entry_title)) not between 1 and 160 or length(trim(entry_body)) not between 1 and 20000) then raise invalid_parameter_value; end if;
  insert into clinical.record_revisions(record_id,actor_id,version,title,body)
  values(record.id,actor,record.version,record.title,record.body);
  update clinical.records r set
   title=case when finalize then r.title else trim(entry_title) end,
   body=case when finalize then r.body else entry_body end,
   visibility=case when finalize then r.visibility when restricted then 'author_only' else 'care_team' end,
   status=case when finalize then 'finalized' else 'draft' end,
   version=r.version+1 where r.id=record.id returning * into record;
  if finalize then update clinical.encounters set status='closed' where id=record.encounter_id; end if;
 end if;
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,approved_by_user_id)
 values(actor,'clinical_record',record.id,target,case when finalize then 'clinical_record.finalized' else 'clinical_record.draft_saved' end,'success',case when finalize then actor end);
 return jsonb_build_object('id',record.id,'version',record.version);
end $$;
revoke all on function public.athlete_photo(uuid,text,text),public.athlete_workspace(uuid,text),
 public.athlete_edit(uuid,text,text,date,text,text,text),public.clinical_save(uuid,uuid,uuid,integer,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.athlete_photo(uuid,text,text),public.athlete_workspace(uuid,text),
 public.athlete_edit(uuid,text,text,date,text,text,text),public.clinical_save(uuid,uuid,uuid,integer,text,text,boolean,boolean) to authenticated;
