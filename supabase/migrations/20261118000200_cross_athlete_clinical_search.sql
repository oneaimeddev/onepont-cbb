-- Fixed, authorized queries. No table names, operators or SQL arrive from the caller.
create function clinical.activity_iso_date(value text) returns date
language plpgsql immutable set search_path='' as $$
begin
 if coalesce(value,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
 return make_date(substring(value,1,4)::integer,substring(value,6,2)::integer,substring(value,9,2)::integer);
exception when datetime_field_overflow then return null;
end $$;
revoke all on function clinical.activity_iso_date(text) from public,anon,authenticated;

create index clinical_activity_record_day on clinical.records(((occurred_at at time zone 'America/Sao_Paulo')::date),athlete_id,id);
create index clinical_activity_document_day on clinical.documents(author_id,document_type,
 (case when document_type='exam_request' then coalesce(clinical.activity_iso_date(content->>'occurred_at'),(created_at at time zone 'America/Sao_Paulo')::date) else (created_at at time zone 'America/Sao_Paulo')::date end),athlete_id);
create index clinical_activity_attachment_day on clinical.attachments(uploaded_by,category,
 (coalesce(document_date,(created_at at time zone 'America/Sao_Paulo')::date)),athlete_id) where status='ready';

create function clinical.activity_matches(actor uuid,filters jsonb)
returns table(athlete_id uuid,name text,category text,club text,division text,modality text,
 record_id uuid,kind text,title text,occurred_on date,date_basis text,created_on date,document_on date,status text,specialty text)
language sql stable security definer set search_path='' as $$
 with authorized as materialized (
  select a.id,coalesce(a.social_name,a.full_name) as name,coalesce(s.category,a.category) as category,
   coalesce(s.club,a.team) as club,s.division,s.modality
  from clinical.athlete_access access join clinical.athletes a on a.id=access.athlete_id
  left join lateral (
   select o.category,l.club,o.division,o.modality,l.id from clinical.sport_links l join clinical.sport_options o on o.id=l.option_id
   where l.athlete_id=a.id and l.starts_on<=(statement_timestamp() at time zone 'America/Sao_Paulo')::date
    and (l.ends_on is null or l.ends_on>=(statement_timestamp() at time zone 'America/Sao_Paulo')::date)
    and (coalesce(filters->>'category','')='' or clinical.search_text(o.category)=clinical.search_text(filters->>'category'))
    and (coalesce(filters->>'club','')='' or clinical.search_text(l.club)=clinical.search_text(filters->>'club'))
    and (coalesce(filters->>'division','')='' or clinical.search_text(o.division)=clinical.search_text(filters->>'division'))
    and (coalesce(filters->>'modality','')='' or clinical.search_text(o.modality)=clinical.search_text(filters->>'modality'))
   order by l.starts_on desc,l.id desc limit 1
  ) s on true
  where access.professional_id=$1 and access.can_read_records
   and (coalesce(filters->>'athlete_id','')='' or a.id::text=filters->>'athlete_id')
   and ((coalesce(filters->>'category','')='' and coalesce(filters->>'club','')='' and coalesce(filters->>'division','')='' and coalesce(filters->>'modality','')='') or s.id is not null)
 ), matches as (
  select a.*,r.id as record_id,'evolution'::text as kind,r.title,
   (r.occurred_at at time zone 'America/Sao_Paulo')::date as occurred_on,'clinical'::text as date_basis,
   null::date as created_on,null::date as document_on,r.status,r.specialty
  from authorized a join clinical.records r on r.athlete_id=a.id
  where filters->'kinds' ? 'evolution'
   and ((r.status='finalized' and r.visibility='care_team') or r.author_id=$1)
   and (r.occurred_at at time zone 'America/Sao_Paulo')::date between (filters->>'from')::date and (filters->>'to')::date
   and (coalesce(filters->>'specialty','')='' or clinical.search_text(r.specialty)=clinical.search_text(filters->>'specialty'))
  union all
  select a.*,d.id,d.document_type,clinical.document_label(d.document_type,d.content),
   case when d.document_type='exam_request' then coalesce(clinical.activity_iso_date(d.content->>'occurred_at'),(d.created_at at time zone 'America/Sao_Paulo')::date) else (d.created_at at time zone 'America/Sao_Paulo')::date end,
   case when d.document_type='exam_request' and clinical.activity_iso_date(d.content->>'occurred_at') is not null then 'clinical' else 'created' end,
   (d.created_at at time zone 'America/Sao_Paulo')::date,
   case when d.document_type='exam_request' then clinical.activity_iso_date(d.content->>'occurred_at') end,d.status,''::text
  from authorized a join clinical.documents d on d.athlete_id=a.id
  where filters->'kinds' ? d.document_type and d.author_id=$1 and clinical.can_author_documents($1,a.id)
   and coalesce(filters->>'specialty','')=''
   and (case when d.document_type='exam_request' then coalesce(clinical.activity_iso_date(d.content->>'occurred_at'),(d.created_at at time zone 'America/Sao_Paulo')::date) else (d.created_at at time zone 'America/Sao_Paulo')::date end) between (filters->>'from')::date and (filters->>'to')::date
  union all
  select a.*,f.id,'attachment_result',f.title,coalesce(f.document_date,(f.created_at at time zone 'America/Sao_Paulo')::date),
   case when f.document_date is not null then 'document' else 'upload' end,(f.created_at at time zone 'America/Sao_Paulo')::date,f.document_date,f.status,''::text
  from authorized a join clinical.attachments f on f.athlete_id=a.id
  where filters->'kinds' ? 'attachment_result' and f.uploaded_by=$1 and f.status='ready' and f.category in ('laboratory','imaging_report')
   and clinical.attachment_reference($1,a.id,f.record_id,f.document_id) and coalesce(filters->>'specialty','')=''
   and coalesce(f.document_date,(f.created_at at time zone 'America/Sao_Paulo')::date) between (filters->>'from')::date and (filters->>'to')::date
 ) select * from matches where coalesce(filters->>'status','')='' or matches.status=filters->>'status'
$$;
revoke all on function clinical.activity_matches(uuid,jsonb) from public,anon,authenticated;

create function public.search_clinical_activity(filters jsonb default '{}',mode text default 'text',origin text default 'human') returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare actor uuid:=auth.uid(); today date:=(statement_timestamp() at time zone 'America/Sao_Paulo')::date;
 from_day date;to_day date;period text:=coalesce(filters->>'period','all'); n integer;
 chosen jsonb;result jsonb;page_no integer;source_page integer;
 field text;chosen_kinds jsonb;channel text:=case when mode='voice' then 'ai_voice' else 'ai_chat' end;
 method text:=case when origin='agent' then 'agent_tool' when mode='voice' then 'human_voice' else 'human_message' end;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise insufficient_privilege;end if;
 if mode not in ('text','voice') or origin not in ('human','agent') or mode is null or origin is null then raise invalid_parameter_value;end if;
 if filters is null or jsonb_typeof(filters)<>'object' or octet_length(filters::text)>8192 then raise invalid_parameter_value;end if;
 for field in select jsonb_object_keys(filters) loop
  if field not in ('kinds','period','days','months','from','to','category','club','division','modality','specialty','status','sort','page','athlete_id','source_page') then raise invalid_parameter_value;end if;
 end loop;
 foreach field in array array['page','source_page','days','months'] loop
  if filters ? field and (jsonb_typeof(filters->field) is distinct from 'number' or (filters->>field) !~ '^[0-9]+$') then raise invalid_parameter_value;end if;
 end loop;
 page_no:=coalesce((filters->>'page')::integer,1);source_page:=coalesce((filters->>'source_page')::integer,1);
 if page_no not between 1 and 20000 or source_page not between 1 and 20000 then raise invalid_parameter_value;end if;
 if coalesce(filters->>'sort','newest') not in ('newest','oldest','name') or coalesce(filters->>'status','') not in ('','draft','ready_for_review','finalized','ready') then raise invalid_parameter_value;end if;
 foreach field in array array['category','club','division','modality','specialty','status','sort'] loop
  if filters ? field and (jsonb_typeof(filters->field)<>'string' or length(filters->>field)>120) then raise invalid_parameter_value;end if;
 end loop;
 if filters ? 'athlete_id' and (filters->>'athlete_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise invalid_parameter_value;end if;
 chosen_kinds:=coalesce(filters->'kinds','["evolution","prescription","surgical_order","exam_request","attachment_result"]'::jsonb);
 if jsonb_typeof(chosen_kinds)<>'array' or jsonb_array_length(chosen_kinds) not between 1 and 5 then raise invalid_parameter_value;end if;
 if exists(select 1 from jsonb_array_elements(chosen_kinds) k where jsonb_typeof(k)<>'string' or (k#>>'{}') not in ('evolution','prescription','surgical_order','exam_request','attachment_result')) then raise invalid_parameter_value;end if;
 if coalesce(filters->>'specialty','')<>'' and (jsonb_array_length(chosen_kinds)<>1 or not chosen_kinds ? 'evolution') then
  return jsonb_build_object('error','specialty','message','O filtro de especialidade está disponível apenas para evoluções.');
 end if;
 to_day:=today;
 case period
  when 'all' then from_day:=date '1900-01-01';
  when 'today' then from_day:=today;
  when 'yesterday' then from_day:=today-1;to_day:=today-1;
  when 'last_days' then n:=(filters->>'days')::integer;if n is null or n not between 1 and 365 then raise invalid_parameter_value;end if;from_day:=today-(n-1);
  when 'this_month' then from_day:=date_trunc('month',today)::date;
  when 'last_months' then n:=(filters->>'months')::integer;if n is null or n not between 1 and 60 then raise invalid_parameter_value;end if;from_day:=(today-make_interval(months=>n))::date;
  when 'range' then from_day:=clinical.activity_iso_date(filters->>'from');to_day:=clinical.activity_iso_date(filters->>'to');
  else raise invalid_parameter_value;
 end case;
 if from_day is null or to_day is null or from_day>to_day or from_day<date '1900-01-01' or to_day>date '2100-12-31' then raise invalid_parameter_value;end if;
 chosen:=(filters-array['period','days','months','page','source_page','athlete_id']) || jsonb_build_object('kinds',chosen_kinds,'period','range','from',from_day,'to',to_day,'sort',coalesce(filters->>'sort','newest'));
 with m as materialized (select * from clinical.activity_matches(actor,chosen||case when filters ? 'athlete_id' then jsonb_build_object('athlete_id',filters->>'athlete_id') else '{}' end)),
 grouped as (
  select athlete_id,name,category,club,division,modality,count(*) as matched_records,max(occurred_on) as newest,min(occurred_on) as oldest
  from m group by athlete_id,name,category,club,division,modality
 ), paged as (
  select * from grouped order by case when chosen->>'sort'='name' then lower(name) end,
   case when chosen->>'sort'='oldest' then oldest end asc,case when chosen->>'sort'='newest' then newest end desc,athlete_id
  limit 5 offset (page_no-1)*5
 ) select jsonb_build_object('filters',chosen,'today',today,'timezone','America/Sao_Paulo','total',(select count(*) from grouped),
  'matched_records',(select count(*) from m),'page',page_no,'page_size',5,'source_page',source_page,
  'items',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object(
   'kinds',(select jsonb_object_agg(k.kind,k.kind_total) from (select kind,count(*) as kind_total from m where m.athlete_id=p.athlete_id group by kind) k),
   'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.occurred_on desc,s.kind,s.id desc) from (
    select record_id as id,kind,title,occurred_on,date_basis,created_on,document_on,status,specialty from m where m.athlete_id=p.athlete_id
    order by occurred_on desc,kind,record_id desc limit case when filters ? 'athlete_id' then 5 else 3 end offset case when filters ? 'athlete_id' then (source_page-1)*5 else 0 end
   ) s),'[]')) order by case when chosen->>'sort'='name' then lower(p.name) end,
   case when chosen->>'sort'='oldest' then p.oldest end asc,case when chosen->>'sort'='newest' then p.newest end desc,p.athlete_id) from paged p),'[]')
 ) into result;
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method,safe_metadata)
 values(actor,'clinical_search','clinical_activity.search','success',channel,method,jsonb_build_object('kinds',chosen_kinds,'from',from_day,'to',to_day,'page',page_no,'source_page',source_page,'total',result->'total'));
 return result;
exception when invalid_parameter_value or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome,origin_channel,execution_method)
 values(auth.uid(),'clinical_search','clinical_activity.search','failed',channel,method);
 return jsonb_build_object('error','invalid');
end $$;
revoke all on function public.search_clinical_activity(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.search_clinical_activity(jsonb,text,text) to authenticated;

-- Persist a query reference, not patient names, clinical titles, counts or document content.
alter table clinical.conversation_messages add column clinical_search jsonb;
create function clinical.conversation_clinical_search(value jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare f jsonb;field text;page_no integer;
begin
 if value is null or jsonb_typeof(value)<>'object' or octet_length(value::text)>8192 then return null;end if;
 f:=value->'filters';page_no:=(value->>'page')::integer;
 if jsonb_typeof(f) is distinct from 'object' or page_no is null or page_no not between 1 and 20000 then return null;end if;
 for field in select jsonb_object_keys(f) loop
  if field not in ('kinds','period','days','months','from','to','category','club','division','modality','specialty','status','sort') then return null;end if;
  if field not in ('kinds','days','months') and (jsonb_typeof(f->field)<>'string' or length(f->>field)>120) then return null;end if;
 end loop;
 if jsonb_typeof(f->'kinds') is distinct from 'array' or jsonb_array_length(f->'kinds') not between 1 and 5 then return null;end if;
 if exists(select 1 from jsonb_array_elements(f->'kinds') k where jsonb_typeof(k)<>'string' or (k#>>'{}') not in ('evolution','prescription','surgical_order','exam_request','attachment_result')) then return null;end if;
 if f->>'period'<>'range' or clinical.activity_iso_date(f->>'from') is null or clinical.activity_iso_date(f->>'to') is null then return null;end if;
 return jsonb_build_object('filters',f,'page',page_no);
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;
revoke all on function clinical.conversation_clinical_search(jsonb) from public,anon,authenticated;
do $$
declare source text;modified text;
begin
 source:=pg_get_functiondef('public.conversation_save(uuid,uuid,jsonb)'::regprocedure);
 modified:=replace(source,'readings jsonb;','readings jsonb;'||chr(10)||'  clinical_search jsonb;');
 if modified=source then raise exception 'conversation readings declaration unavailable';end if;source:=modified;
 modified:=replace(source,'readings := clinical.conversation_readings(element->''readings'');','readings := clinical.conversation_readings(element->''readings'');'||chr(10)||'    clinical_search := clinical.conversation_clinical_search(element->''clinicalSearch'');');
 if modified=source then raise exception 'conversation readings assignment unavailable';end if;source:=modified;
 modified:=replace(source,'|| case when readings is null then ''{}''::jsonb else jsonb_build_object(''readings'', readings) end','|| case when readings is null then ''{}''::jsonb else jsonb_build_object(''readings'', readings) end'||chr(10)||'      || case when clinical_search is null then ''{}''::jsonb else jsonb_build_object(''clinicalSearch'', clinical_search) end');
 if modified=source then raise exception 'conversation readings payload unavailable';end if;source:=modified;
 modified:=replace(source,'document, readings','document, readings, clinical_search');
 if modified=source then raise exception 'conversation readings columns unavailable';end if;source:=modified;
 modified:=replace(source,'entry->''document'', entry->''readings''','entry->''document'', entry->''readings'', entry->''clinicalSearch''');
 if modified=source then raise exception 'conversation readings values unavailable';end if;execute modified;
 source:=pg_get_functiondef('clinical.conversation_payload(clinical.conversation_sessions)'::regprocedure);
 modified:=replace(source,'''readings'', message.readings','''readings'', message.readings,'||chr(10)||'    ''clinicalSearch'', clinical.conversation_clinical_search(message.clinical_search)');
 if modified=source then raise exception 'conversation readings response unavailable';end if;execute modified;
end $$;
