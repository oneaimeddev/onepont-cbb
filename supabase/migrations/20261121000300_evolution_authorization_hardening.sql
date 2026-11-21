-- Qualify gate columns and hold institutional grants while a correction commits.
do $patch$ declare sig text; source text; next text;begin
 foreach sig in array array['public.clinical_save(uuid,uuid,uuid,integer,text,text,boolean,boolean)',
 'public.evolution_correct(uuid,uuid,integer,uuid,text,text,text)'] loop
  source:=pg_get_functiondef(sig::regprocedure);
  next:=replace(source,'from clinical.evolution_signature_locks where record_id=',
   'from clinical.evolution_signature_locks sl where sl.record_id=');
  if next=source then raise exception 'Signature gate missing in %',sig;end if;
  execute next;
 end loop;
 source:=pg_get_functiondef('public.evolution_correct(uuid,uuid,integer,uuid,text,text,text)'::regprocedure);
 next:=replace(source,'select * into r from clinical.records where id=record_id and athlete_id=target for update;',
  'perform 1 from clinical.athlete_access a where a.athlete_id=target and a.professional_id=auth.uid() for share;'
  ||chr(10)||' perform 1 from clinical.record_permissions p where p.record_id=evolution_correct.record_id and p.professional_id=auth.uid() for share;'
  ||chr(10)||' select * into r from clinical.records where id=record_id and athlete_id=target for update;');
 if next=source then raise exception 'Correction lock path missing';end if;execute next;
end $patch$;
create function clinical.evolution_permission_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (old.can_read and not new.can_read) or (old.can_correct and not new.can_correct) then
  perform clinical.bump_conversation_epoch(old.professional_id);
 end if;return null;
end $$;
create trigger evolution_permission_change after update or delete on clinical.record_permissions for each row execute function clinical.evolution_permission_change();
revoke all on function clinical.evolution_permission_change() from public,anon,authenticated;
notify pgrst,'reload schema';
