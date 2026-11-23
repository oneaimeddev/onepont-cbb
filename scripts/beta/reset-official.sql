-- Prepara a produção para a entrega oficial: apaga todo o conteúdo de teste e mantém os
-- usuários da plataforma e as configurações.
--
-- Mantém: contas e perfis (exceto as duas contas automáticas de teste de voz), permissões de
-- cadastro de atletas, autoria médica, dados profissionais, assinatura (ambiente, provedores,
-- identidades e conexões), ambiente de entrega, épocas de segurança da conversa e a lista
-- oficial de categorias.
-- Apaga: atletas, vínculos, contatos, evoluções, documentos, anexos, consultas, conversas do
-- chat, propostas, entregas, assinaturas de documentos, clubes fictícios, importações e a
-- auditoria.
--
-- Rodar no SQL Editor do projeto de produção. Tudo acontece numa transação: em caso de erro,
-- nada é apagado. Os arquivos de Storage (anexos e áudios) são removidos pelo painel.
begin;

do $$
declare
  keep text[] := array[
    'athlete_creators', 'medical_authors', 'professional_details', 'professional_registrations',
    'professional_confidentiality', 'signing_identities', 'signature_connections',
    'signature_preferences', 'signature_providers', 'signing_environment',
    'document_delivery_environment', 'conversation_security_epochs', 'categories'];
  tables text;
begin
  select string_agg(format('clinical.%I', tablename), ', ' order by tablename) into tables
  from pg_tables where schemaname = 'clinical' and tablename <> all(keep);
  -- Sem CASCADE: se alguma tabela mantida dependesse de uma apagada, o comando falharia.
  execute 'truncate table ' || tables || ' restart identity';
end $$;

delete from auth.users where email like 'qa-publicacao-%@cbb-demo.test';

commit;

-- Conferência
select 'usuários' item, count(*) total from auth.users
union all select 'perfis', count(*) from public.profiles
union all select 'categorias', count(*) from clinical.categories
union all select 'atletas', count(*) from clinical.athletes
union all select 'evoluções', count(*) from clinical.records
union all select 'documentos', count(*) from clinical.documents
union all select 'anexos', count(*) from clinical.attachments
union all select 'conversas', count(*) from clinical.conversation_sessions
union all select 'auditoria', count(*) from clinical.audit_events
union all select 'clubes', count(*) from clinical.organizations;
