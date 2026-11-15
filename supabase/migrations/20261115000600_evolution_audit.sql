do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.clinical_save(uuid,uuid,uuid,integer,text,text,boolean,boolean)'::regprocedure) into definition;
 definition:=replace(definition,
 'if record is null then return jsonb_build_object(''error'',''denied''); end if;',
 'if record is null then
 insert into clinical.audit_events(actor_user_id,resource_type,operation,outcome)
 values(actor,''clinical_record'',''clinical_record.save'',''denied'');
 return jsonb_build_object(''error'',''denied''); end if;');
 definition:=replace(definition,
 'if record.status<>''draft'' or record.version<>expected_version then return jsonb_build_object(''error'',''conflict''); end if;',
 'if record.status<>''draft'' or expected_version is null or record.version<>expected_version then
 insert into clinical.audit_events(actor_user_id,resource_type,resource_id,athlete_id,operation,outcome)
 values(actor,''clinical_record'',record.id,target,''clinical_record.save'',''failed'');
 return jsonb_build_object(''error'',''conflict''); end if;');
 execute definition;
end $migration$;
