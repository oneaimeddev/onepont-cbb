\set ON_ERROR_STOP on
begin;
select p.id as professional_id from public.profiles p
join auth.users u on u.id = p.id
where u.email = :'email' and u.email like '%@example.com'
\gset

insert into clinical.athlete_creators values (:'professional_id') on conflict do nothing;
insert into clinical.athletes(id, full_name, birth_date, team, category, source) values
  ('ccb00000-0000-4000-8000-000000000001', 'Atleta DEMO Aurora', '2001-08-12', 'Equipe fictícia Aurora', 'Adulto', 'demo'),
  ('ccb00000-0000-4000-8000-000000000002', 'Atleta DEMO Horizonte', null, null, null, 'demo')
on conflict (id) do nothing;

insert into clinical.athlete_access values
  ('ccb00000-0000-4000-8000-000000000001', :'professional_id', true),
  ('ccb00000-0000-4000-8000-000000000002', :'professional_id', true)
on conflict (athlete_id, professional_id) do update set can_read_records = true;

insert into clinical.records(id, athlete_id, author_name, specialty, title, body, occurred_at, status, visibility) values
  ('ccb00000-0000-4000-8000-000000000003', 'ccb00000-0000-4000-8000-000000000001',
   'Profissional sintético de fisioterapia', 'Fisioterapia', 'Reavaliação de acompanhamento · DEMO',
   'Registro sintético para demonstrar a leitura longitudinal.', '2026-11-13 14:30:00+00', 'finalized', 'care_team'),
  ('ccb00000-0000-4000-8000-000000000004', 'ccb00000-0000-4000-8000-000000000001',
   'Profissional sintético de medicina', 'Medicina esportiva', 'Atendimento inicial · DEMO',
   'Registro sintético para demonstrar a autoria e a ordem de eventos.', '2026-11-10 13:00:00+00', 'finalized', 'care_team')
on conflict (id) do nothing;
commit;
