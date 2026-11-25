-- Gravação de consulta liberada para todos os atletas com acesso de escrita, não só os
-- fictícios de demonstração (decisão do responsável, ver ADR 0028). As demais checagens
-- continuam: especialidade do profissional, acesso de leitura e escrita ao atleta e autoria.
do $unlock$
declare
  fn regprocedure;
  body text;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'consultation_capture', 'consultation_work', 'consultation_submit',
      'consultation_retry_silent', 'consultation_discard', 'chat_consultation_navigation')
  loop
    body := pg_get_functiondef(fn);
    if position('t.source = ''demo''' in body) = 0 then continue; end if;
    execute replace(body, ' and t.source = ''demo''', '');
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%consultation%'
      and position('t.source = ''demo''' in pg_get_functiondef(p.oid)) > 0
  ) then raise exception 'consultation functions still restricted to demo athletes'; end if;
end
$unlock$;
