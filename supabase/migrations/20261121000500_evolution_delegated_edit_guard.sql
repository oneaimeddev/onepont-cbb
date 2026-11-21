-- Delegated draft edits hold the same explicit grant lock as published corrections.
do $patch$ declare source text;next text;begin
 source:=pg_get_functiondef('public.clinical_save(uuid,uuid,uuid,integer,text,text,boolean,boolean)'::regprocedure);
 next:=replace(source,'select * into record from clinical.records where id=record_id and athlete_id=target for update;',
 'perform 1 from clinical.record_permissions p where p.record_id=clinical_save.record_id and p.professional_id=actor for share;'
 ||chr(10)||' select * into record from clinical.records where id=record_id and athlete_id=target for update;');
 if next=source then raise exception 'Delegated draft edit path missing';end if;execute next;
end $patch$;
notify pgrst,'reload schema';
