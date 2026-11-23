-- 007.10.6D: clinical content and encounter existence are separate permissions.
-- No historical clinical title/body/version is rewritten.
create table clinical.professional_confidentiality (
 professional_id uuid primary key references public.profiles(id) on delete cascade,
 psychology boolean not null default true check(psychology), established_at timestamptz not null default clock_timestamp()
);
create table clinical.record_secrecy_locks (
 record_id uuid primary key references clinical.records(id) on delete cascade,
 reason text not null check(reason='psychology'), established_at timestamptz not null default clock_timestamp()
);
create table clinical.record_permissions (
 record_id uuid not null references clinical.records(id) on delete cascade,
 professional_id uuid not null references public.profiles(id) on delete cascade,
 can_read boolean not null default false, can_correct boolean not null default false,
 granted_by uuid references public.profiles(id), granted_at timestamptz not null default clock_timestamp(),
 primary key(record_id,professional_id), check(not can_correct or can_read)
);
alter table clinical.professional_confidentiality enable row level security;
alter table clinical.record_secrecy_locks enable row level security;
alter table clinical.record_permissions enable row level security;
revoke all on clinical.professional_confidentiality,clinical.record_secrecy_locks,clinical.record_permissions from public,anon,authenticated;

create function clinical.is_psychology(value text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(clinical.search_text(value) ~ '(psicol|psycholog)',false)
$$;
insert into clinical.professional_confidentiality(professional_id)
select id from public.profiles where clinical.is_psychology(profession);
insert into clinical.record_secrecy_locks(record_id,reason)
select r.id,'psychology' from clinical.records r left join clinical.encounters e on e.id=r.encounter_id
left join public.profiles p on p.id=r.author_id
where clinical.is_psychology(r.specialty) or clinical.is_psychology(e.specialty) or clinical.is_psychology(p.profession);

create function clinical.psychology_required(actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from clinical.professional_confidentiality where professional_id=actor)
 or exists(select 1 from public.profiles where id=actor and clinical.is_psychology(profession))
$$;
create function clinical.record_confidential(r clinical.records) returns boolean language sql stable security definer set search_path='' as $$
 select r.visibility='author_only' or clinical.is_psychology(r.specialty)
 or exists(select 1 from clinical.record_secrecy_locks where record_id=r.id)
$$;
create function clinical.record_content_allowed(actor uuid,r clinical.records) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from clinical.athlete_access a where a.professional_id=actor and a.athlete_id=r.athlete_id and a.can_read_records)
 and (r.author_id=actor or exists(select 1 from clinical.record_permissions p where p.record_id=r.id and p.professional_id=actor and p.can_read)
 or (r.status='finalized' and not clinical.record_confidential(r)))
$$;
create function clinical.record_edit_allowed(actor uuid,r clinical.records) returns boolean language sql stable security definer set search_path='' as $$
 select clinical.record_content_allowed(actor,r) and exists(select 1 from clinical.athlete_access a where a.professional_id=actor and a.athlete_id=r.athlete_id and a.can_write)
 and (r.author_id=actor or exists(select 1 from clinical.record_permissions p where p.record_id=r.id and p.professional_id=actor and p.can_correct))
$$;

-- A self-declared profession may make policy stricter, never remove a clinical lock.
create function clinical.profile_confidentiality_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if clinical.is_psychology(new.profession) then
  insert into clinical.professional_confidentiality(professional_id) values(new.id) on conflict do nothing;
 end if;return null;
end $$;
create trigger profile_confidentiality after insert or update of profession on public.profiles for each row execute function clinical.profile_confidentiality_guard();
create function clinical.evolution_domain_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.author_id is distinct from old.author_id or new.athlete_id is distinct from old.athlete_id
  or new.specialty is distinct from old.specialty or new.encounter_id is distinct from old.encounter_id) then
  raise check_violation using message='Evolution identity is immutable';
 end if;
 if clinical.psychology_required(new.author_id) or clinical.is_psychology(new.specialty)
  or (tg_op='UPDATE' and clinical.record_confidential(old)) then new.visibility:='author_only';end if;
 return new;
end $$;
create trigger evolution_domain_guard before insert or update on clinical.records for each row execute function clinical.evolution_domain_guard();
create function clinical.evolution_secrecy_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if clinical.psychology_required(new.author_id) or clinical.is_psychology(new.specialty) then
  insert into clinical.record_secrecy_locks(record_id,reason) values(new.id,'psychology') on conflict do nothing;
 end if;return null;
end $$;
create trigger evolution_secrecy_record after insert on clinical.records for each row execute function clinical.evolution_secrecy_record();

-- Audited metadata-only historical enforcement; invalidate previously derived conversations.
insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,safe_metadata)
select r.author_id,'clinical_record',r.id,r.athlete_id,'clinical_record.psychology_policy_enforced','success','{"source":"migration_007_10_6d","actor_is_record_author_reference":true}'::jsonb
from clinical.records r join clinical.record_secrecy_locks l on l.record_id=r.id;
do $$declare x record;begin
 for x in select distinct a.professional_id from clinical.athlete_access a join clinical.records r on r.athlete_id=a.athlete_id
 join clinical.record_secrecy_locks l on l.record_id=r.id where a.can_read_records loop
  perform clinical.bump_conversation_epoch(x.professional_id);
 end loop;
end $$;

create function clinical.evolution_json(actor uuid,r clinical.records) returns jsonb language sql stable security definer set search_path='' as $$
 select case when clinical.record_content_allowed(actor,r) then
  (to_jsonb(r)-'author_id'-'athlete_id'-'visibility') || jsonb_build_object('is_author',r.author_id=actor,
   'is_restricted',clinical.record_confidential(r),'content_restricted',false,'can_edit',clinical.record_edit_allowed(actor,r),
   'encounter_status',(select status from clinical.encounters where id=r.encounter_id))
 else jsonb_build_object('id',r.id,'occurred_at',r.occurred_at,'author_name',r.author_name,
  'title','Conteúdo restrito','content_restricted',true,'is_restricted',true,'can_edit',false)
 end
$$;
alter function public.athlete_workspace(uuid,text) rename to athlete_workspace_before_6d;
revoke all on function public.athlete_workspace_before_6d(uuid,text) from public,anon,authenticated;
create function public.athlete_workspace(target uuid,view_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; history jsonb; counts jsonb; recent jsonb;
begin
 result:=public.athlete_workspace_before_6d(target,view_name);
 if result is null then return null;end if;
 if (result->>'can_read_records')::boolean then
  select jsonb_build_object('evolutions',count(*),'encounters',count(distinct encounter_id)) into counts from clinical.records where athlete_id=target;
  if view_name='timeline' then
   select coalesce(jsonb_agg(clinical.evolution_json(auth.uid(),r) order by r.occurred_at desc,r.id desc),'[]'::jsonb)
   into history from clinical.records r where athlete_id=target;
  elsif view_name='profile' then
   select coalesce(jsonb_agg(value order by occurred_at desc,id desc),'[]'::jsonb) into recent from (
    select r.id,r.occurred_at, (clinical.evolution_json(auth.uid(),r)-'body'-'encounter_id'-'encounter_status'-'version') as value
    from clinical.records r where athlete_id=target order by r.occurred_at desc,r.id desc limit 3
   ) x;
  end if;
 end if;
 return result||jsonb_build_object('records',history,'counts',counts,'recent_records',recent,'psychology_required',clinical.psychology_required(auth.uid()));
end $$;
grant execute on function public.athlete_workspace(uuid,text) to authenticated;
revoke all on function public.athlete_workspace(uuid,text) from public,anon;

create function public.evolution_read(target uuid,record_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r clinical.records;begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into r from clinical.records where id=record_id and athlete_id=target;
 if r.id is null or not clinical.record_content_allowed(auth.uid(),r) then
  insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
  values(auth.uid(),'clinical_record','clinical_record.content.read','denied',clinical.audit_channel(),clinical.audit_method());
  return '{"error":"denied"}';
 end if;
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,origin_channel,execution_method)
 values(auth.uid(),'clinical_record',r.id,r.athlete_id,'clinical_record.content.read','success',clinical.audit_channel(),clinical.audit_method());
 return clinical.evolution_json(auth.uid(),r);
end $$;
revoke all on function public.evolution_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.evolution_read(uuid,uuid) to authenticated;

-- Existing protected entry points reuse the same predicate, including counts and AI.
-- Fail migration rather than silently leave any known path unguarded.
do $patch$
declare source text; next text; sig text; before text; after text;
begin
 for sig,before,after in select * from (values
 ('public.clinical_history_page(uuid,jsonb)', '((r.status = ''finalized'' and r.visibility = ''care_team'') or r.author_id = actor)', 'clinical.record_content_allowed(actor,r)'),
 ('clinical.activity_matches(uuid,jsonb)', '((r.status=''finalized'' and r.visibility=''care_team'') or r.author_id=$1)', 'clinical.record_content_allowed($1,r)'),
 ('clinical.attachment_reference(uuid,uuid,uuid,uuid)', '(r.author_id=actor or (r.status=''finalized'' and r.visibility=''care_team''))', 'clinical.record_content_allowed(actor,r)'),
 ('public.attachment_options(uuid)', '(r.author_id=auth.uid() or (r.status=''finalized'' and r.visibility=''care_team''))', 'clinical.record_content_allowed(auth.uid(),r)')
 ) x(sig,before,after) loop
  source:=pg_get_functiondef(sig::regprocedure);next:=replace(source,before,after);
  if next=source then raise exception 'Missing authorization predicate in %',sig;end if;execute next;
 end loop;
end $patch$;
-- Bare table access remains forbidden; all content reads pass the explicit gate.
revoke all on clinical.records,clinical.record_revisions from public,anon,authenticated;
revoke all on function clinical.is_psychology(text),clinical.psychology_required(uuid),clinical.record_confidential(clinical.records),
 clinical.record_content_allowed(uuid,clinical.records),clinical.record_edit_allowed(uuid,clinical.records),clinical.profile_confidentiality_guard(),
 clinical.evolution_domain_guard(),clinical.evolution_secrecy_record(),clinical.evolution_json(uuid,clinical.records) from public,anon,authenticated;
notify pgrst,'reload schema';
