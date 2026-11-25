-- Administrador (perfil com can_manage_access) com acesso clínico completo, para testar e
-- operar todas as funcionalidades (decisão do responsável, ver ADR 0029). Continua sujeito às
-- mesmas regras de sigilo e à auditoria; as ações ficam registradas com a autoria dele.

-- 1. Acesso completo a todos os atletas já cadastrados.
insert into clinical.athlete_access (athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize, granted_by, granted_at)
select t.id, p.id, true, true, true, true, p.id, clock_timestamp()
from clinical.athletes t cross join public.profiles p
where p.can_manage_access
on conflict (athlete_id, professional_id) do update
set can_read_records = true, can_edit = true, can_write = true, can_finalize = true;

-- 2. Pode cadastrar atletas e escrever/finalizar nos que cadastrar.
insert into clinical.athlete_creators (professional_id, can_write_created, can_finalize_created)
select id, true, true from public.profiles where can_manage_access
on conflict (professional_id) do update set can_write_created = true, can_finalize_created = true;

-- 3. Documentos médicos (prescrição, exames, pedido cirúrgico, atestado, encaminhamento).
insert into clinical.medical_authors (professional_id, credential_label, enabled, granted_by)
select id, null, true, id from public.profiles where can_manage_access
on conflict (professional_id) do update set enabled = true;

-- 4. Atletas cadastrados daqui em diante também ficam acessíveis ao administrador.
create or replace function clinical.grant_admin_athlete_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into clinical.athlete_access (athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize, granted_by, granted_at)
  select new.id, p.id, true, true, true, true, p.id, clock_timestamp()
  from public.profiles p where p.can_manage_access
  on conflict (athlete_id, professional_id) do update
  set can_read_records = true, can_edit = true, can_write = true, can_finalize = true;
  return new;
end;
$$;
revoke all on function clinical.grant_admin_athlete_access() from public, anon, authenticated;
drop trigger if exists athlete_admin_access on clinical.athletes;
create trigger athlete_admin_access after insert on clinical.athletes
for each row execute function clinical.grant_admin_athlete_access();

-- 5. Gravação de consulta: o administrador usa o modelo de relatório de Medicina.
create or replace function clinical.consultation_specialty(actor uuid) returns text
language sql stable set search_path = '' as $$
  select case
    when trim(profession) = 'Medicina Esportiva' then 'Medicina'
    when trim(profession) = 'Fisioterapia Esportiva' then 'Fisioterapia'
    when trim(profession) = 'Nutrição Esportiva' then 'Nutrição'
    when trim(profession) = 'Psicologia Esportiva' then 'Psicologia'
    when trim(profession) in ('Medicina', 'Enfermagem', 'Fisioterapia', 'Nutrição', 'Psicologia') then trim(profession)
    when can_manage_access then 'Medicina'
  end from public.profiles where id = actor;
$$;
revoke all on function clinical.consultation_specialty(uuid) from public, anon, authenticated;
