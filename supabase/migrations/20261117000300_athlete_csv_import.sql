alter table clinical.audit_events add column safe_metadata jsonb not null default '{}';

-- The existing immutable normalizer supports indexed duplicate lookup at operational scale.
create index athlete_import_name_match on clinical.athletes(clinical.search_text(full_name));
create index athlete_import_document_match on clinical.athletes(lower(regexp_replace(document_id,'[[:space:]]+','','g')));

-- Import ledger contains digests and outcomes, never the raw CSV or contact payload.
create table clinical.athlete_imports (
 id uuid primary key, actor_id uuid not null references public.profiles(id),
 file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
 total integer not null check (total between 1 and 5000),
 state text not null default 'review' check (state in ('review','confirmed','completed')),
 created_at timestamptz not null default clock_timestamp()
);
create table clinical.athlete_import_rows (
 import_id uuid not null references clinical.athlete_imports(id) on delete cascade,
 line integer not null, payload_hash text not null, identity_hash text not null, name_hash text not null,
 state text not null check (state in ('ready','duplicate','invalid','repeat','created','ignored','rejected')),
 review_state text not null check (review_state in ('ready','duplicate','invalid','repeat')),
 field text, athlete_id uuid references clinical.athletes(id) on delete set null,
 primary key(import_id,line)
);
create index on clinical.athlete_import_rows(payload_hash) where state = 'created';
create index on clinical.athlete_import_rows(import_id,identity_hash);
alter table clinical.athlete_imports enable row level security;
alter table clinical.athlete_import_rows enable row level security;
revoke all on clinical.athlete_imports, clinical.athlete_import_rows from public, anon, authenticated;

create function clinical.import_audit(target uuid, action text, result text) returns void
language sql set search_path = '' as $$
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,operation,outcome,approved_by_user_id,safe_metadata)
 values(auth.uid(),'athlete_import',target,'athlete.import.' || action,result,
  case when action='confirmed' then auth.uid() end,
  jsonb_build_object('total',(select total from clinical.athlete_imports where id=target),
   'created',(select count(*) from clinical.athlete_import_rows where import_id=target and state='created'),
   'ignored',(select count(*) from clinical.athlete_import_rows where import_id=target and state='ignored'),
   'rejected',(select count(*) from clinical.athlete_import_rows where import_id=target and state='rejected')))
$$;
revoke all on function clinical.import_audit(uuid,text,text) from public,anon,authenticated;

create function public.athlete_import_job(target uuid, operation text, digest text default null, row_count integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job clinical.athlete_imports; result jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise insufficient_privilege; end if;
 if not exists(select 1 from clinical.athlete_creators where professional_id=auth.uid()) then
  perform clinical.import_audit(target,'access','denied'); return jsonb_build_object('error','denied');
 end if;
 if operation is null or target is null then raise invalid_parameter_value; end if;
 if operation='start' then
  insert into clinical.athlete_imports(id,actor_id,file_hash,total) values(target,auth.uid(),digest,row_count)
  on conflict(id) do nothing;
 end if;
 select * into job from clinical.athlete_imports where id=target and actor_id=auth.uid() for update;
 if job.id is null then return jsonb_build_object('error','unavailable'); end if;
 if operation='start' then
  if job.file_hash<>digest or job.total<>row_count then return jsonb_build_object('error','mismatch'); end if;
  if not exists(select 1 from clinical.audit_events e where e.resource_id=target and e.operation='athlete.import.started') then
   perform clinical.import_audit(target,'started','success');
  end if;
 elsif operation='confirm' and job.state='review' then
  if (select count(*) from clinical.athlete_import_rows where import_id=target)<>job.total then
   return jsonb_build_object('error','incomplete_review');
  end if;
  update clinical.athlete_imports set state='confirmed' where id=target;
  perform clinical.import_audit(target,'confirmed','success');
 elsif operation not in ('status','confirm') then raise invalid_parameter_value;
 end if;
 select jsonb_build_object('id',i.id,'state',i.state,'total',i.total,
  'processed',count(*) filter(where r.state in ('created','ignored','rejected')),
  'created',count(*) filter(where r.state='created'),'ignored',count(*) filter(where r.state='ignored'),
  'rejected',count(*) filter(where r.state='rejected'),'duplicates',count(*) filter(where r.review_state='duplicate'),
  'rows',coalesce(jsonb_agg(jsonb_build_object('line',r.line,'state',r.state,'review_state',r.review_state,'field',r.field,
   'id',case when exists(select 1 from clinical.athlete_access a where a.athlete_id=r.athlete_id and a.professional_id=auth.uid()) then r.athlete_id end)
    order by r.line) filter(where r.line is not null),'[]'::jsonb)) into result
 from clinical.athlete_imports i left join clinical.athlete_import_rows r on r.import_id=i.id
 where i.id=target group by i.id;
 return result;
end $$;

create function public.athlete_import_batch(target uuid, items jsonb, execute_rows boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job clinical.athlete_imports; item jsonb; payload jsonb; result jsonb; output jsonb:='[]';
 line_no integer; fingerprint text; identity_key text; category uuid; club uuid; status text; classification text; field_name text;
 existing clinical.athlete_import_rows; length_rule record; name_digest text; matches jsonb; candidate uuid; dry_id uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise insufficient_privilege; end if;
 if not exists(select 1 from clinical.athlete_creators where professional_id=auth.uid()) then
  perform clinical.import_audit(target,'access','denied'); return jsonb_build_object('error','denied');
 end if;
 if execute_rows is null or items is null or target is null then raise invalid_parameter_value; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 25 or octet_length(items::text)>262144 then raise invalid_parameter_value; end if;
 select * into job from clinical.athlete_imports where id=target and actor_id=auth.uid() for update;
 if job.id is null then return jsonb_build_object('error','unavailable'); end if;
 if (execute_rows and job.state='review') or (not execute_rows and job.state<>'review') then
  return jsonb_build_object('error','state');
 end if;
 for item in select value from jsonb_array_elements(items) loop
  line_no := (item->>'line')::integer;
  if line_no not between 2 and job.total+1 then raise invalid_parameter_value; end if;
  -- Allow-list payload fields; CSV values can never choose actor or access rights.
  select coalesce(jsonb_object_agg(key,trim(value #>> '{}')),'{}') into payload
  from jsonb_each(item->'payload') where key=any(array['name','social','birth','gender_identity','document','phone','email',
   'guardian_name','guardian_relation','guardian_contact','emergency_contact','category','club','division','modality','position','shirt']);
  fingerprint := encode(extensions.digest(payload::text,'sha256'),'hex');
  identity_key := encode(extensions.digest(case when coalesce(payload->>'document','')<>'' then
    'doc:' || regexp_replace(lower(payload->>'document'),'[[:space:]]+','','g') else
    'name:' || clinical.catalog_key(payload->>'name') || ':' || coalesce(payload->>'birth','') end,'sha256'),'hex');
  name_digest := encode(extensions.digest(clinical.catalog_key(payload->>'name'),'sha256'),'hex');
  select * into existing from clinical.athlete_import_rows where import_id=target and line=line_no;
  if execute_rows then
   if existing.line is null or existing.payload_hash<>fingerprint then return jsonb_build_object('error','review_mismatch'); end if;
   if existing.state in ('created','ignored','rejected') then
    output:=output || jsonb_build_array(jsonb_build_object('line',line_no,'state',existing.state,'review_state',existing.review_state,'field',existing.field)); continue;
   end if;
  end if;
  status:='ready'; field_name:=null; matches:='[]'; candidate:=null;
  if execute_rows then perform pg_advisory_xact_lock(hashtextextended(identity_key,0)); end if;
  select id into category from clinical.categories where name_key=clinical.catalog_key(payload->>'category');
  select id into club from clinical.organizations where kind='club' and name_key=clinical.catalog_key(payload->>'club');
  if coalesce(payload->>'category','')<>'' and category is null then status:='invalid'; field_name:='category';
  elsif coalesce(payload->>'club','')<>'' and club is null then status:='invalid'; field_name:='club'; end if;
  if coalesce(payload->>'birth','')<>'' and (payload->>'birth') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then status:='invalid'; field_name:='birth'; end if;
  for length_rule in select * from jsonb_each_text('{"name":160,"social":160,"document":40,"phone":20,"email":160,"guardian_name":160,"guardian_relation":40,"guardian_contact":160,"emergency_contact":160,"position":40,"shirt":3,"division":80,"modality":40,"category":80,"club":120}'::jsonb) loop
   if length(payload->>length_rule.key)>length_rule.value::integer then
    status:='invalid'; field_name:=length_rule.key; exit;
   end if;
  end loop;
  payload := (payload-'category'-'club') || jsonb_build_object('category_id',coalesce(category::text,''),'club_id',coalesce(club::text,''));
  -- Reuse the complete individual registration validator. The subtransaction is always rolled back.
  if status='ready' then
   begin
    result:=public.athlete_register(gen_random_uuid(),payload);
    raise exception using errcode='Z0001';
   exception
    when sqlstate 'Z0001' then null;
    when others then result:=jsonb_build_object('ok',false,'field','name');
   end;
   if result->>'ok'<>'true' then status:='invalid'; field_name:=coalesce(result->>'field','name'); end if;
  end if;
  if status='ready' then
   if exists(select 1 from clinical.athlete_import_rows r join clinical.athlete_imports i on i.id=r.import_id
    where i.actor_id=auth.uid() and r.payload_hash=fingerprint and r.state='created') then status:='repeat';
   elsif exists(select 1 from clinical.athlete_import_rows where import_id=target and line<line_no and payload_hash=fingerprint) then status:='repeat';
   elsif exists(select 1 from clinical.athlete_import_rows where import_id=target and line<line_no and (identity_hash=identity_key or name_hash=name_digest)) then status:='duplicate';
   else
    -- Never return identity, count or IDs of inaccessible matches.
    if exists(select 1 from clinical.athletes a where
     (coalesce(payload->>'document','')<>'' and lower(regexp_replace(a.document_id,'[[:space:]]+','','g'))=lower(regexp_replace(payload->>'document','[[:space:]]+','','g')))
     or clinical.search_text(a.full_name)=clinical.search_text(payload->>'name')) then
     status:='duplicate';
     select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name)),'[]') into matches from (
      select a.id,a.full_name from clinical.athletes a join clinical.athlete_access x on x.athlete_id=a.id and x.professional_id=auth.uid()
      where clinical.search_text(a.full_name)=clinical.search_text(payload->>'name') or
       (coalesce(payload->>'document','')<>'' and x.can_edit and lower(regexp_replace(a.document_id,'[[:space:]]+','','g'))=lower(regexp_replace(payload->>'document','[[:space:]]+','','g')))
      order by a.id limit 5
     ) visible;
    end if;
   end if;
  end if;
  classification:=status;
  if execute_rows then
   if item->>'decision'='ignore' or status='repeat' or (status='duplicate' and item->>'decision' is distinct from 'create') then status:='ignored';
   elsif status='invalid' or existing.state='invalid' then status:='rejected'; field_name:=coalesce(field_name,existing.field);
   else
    begin
     dry_id:=md5(target::text || ':' || line_no::text)::uuid;
     result:=public.athlete_register(dry_id,payload);
     if result->>'ok'='true' then status:='created'; candidate:=(result->>'id')::uuid;
      insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome,safe_metadata)
      values(auth.uid(),'athlete_import',target,candidate,'athlete.import.row.created','success',jsonb_build_object('line',line_no));
     else status:='rejected'; field_name:=coalesce(result->>'field','name'); end if;
    exception when others then status:='rejected'; field_name:='name'; candidate:=null;
    end;
   end if;
   if status='rejected' then perform clinical.import_audit(target,'row.failed','failed'); end if;
  end if;
  insert into clinical.athlete_import_rows(import_id,line,payload_hash,identity_hash,name_hash,state,review_state,field,athlete_id)
  values(target,line_no,fingerprint,identity_key,name_digest,status,classification,field_name,candidate)
  on conflict(import_id,line) do update set payload_hash=excluded.payload_hash,identity_hash=excluded.identity_hash,name_hash=excluded.name_hash,
   state=excluded.state,review_state=excluded.review_state,field=excluded.field,athlete_id=excluded.athlete_id;
  output:=output || jsonb_build_array(jsonb_build_object('line',line_no,'state',status,'review_state',classification,'field',field_name,'matches',matches,'id',candidate));
 end loop;
 if execute_rows and (select count(*) from clinical.athlete_import_rows where import_id=target and state in ('created','ignored','rejected'))=job.total and job.state<>'completed' then
  update clinical.athlete_imports set state='completed' where id=target;
  perform clinical.import_audit(target,'completed','success');
 end if;
 return jsonb_build_object('rows',output);
end $$;
revoke all on function public.athlete_import_job(uuid,text,text,integer),public.athlete_import_batch(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.athlete_import_job(uuid,text,text,integer),public.athlete_import_batch(uuid,jsonb,boolean) to authenticated;
