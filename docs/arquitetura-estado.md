# Estado da arquitetura — 15/11/2026

A descrição-alvo continua em `ARQUITETURA-0.1.md`. Este arquivo separa o que o código faz hoje do que ainda é plano. A fronteira clínica está nas RPCs PostgreSQL, conforme a ADR-010.

## Implementado

- Autenticação Supabase, perfil individual e negação quando o perfil não existe.
- Catálogo paginado, cadastro idempotente, foto WebP privada e edição cadastral conforme o vínculo.
- Evolução versionada, finalização com confirmação e imutabilidade do registro finalizado.
- Auditoria transacional das operações clínicas, com resultado `success`, `denied` ou `failed`.
- Home experimental CBB Intelligence em `/`. O envio permanece desligado. A operação diária continua nas rotas tradicionais.
- Concessão e revogação de acompanhamento em `clinical.athlete_access`, restritas a `can_manage_access`.
- Registro `author_only` que não pode ser reaberto para a equipe.

## Parcial

- Vários profissionais podem acompanhar o mesmo atleta. O pacote concedido é único: leitura, evolução e finalização. Não há matriz de permissões.
- O sigilo ao autor funciona depois que o registro nasce restrito. Não há classificação confiável de psicologia: `profiles.profession` e `records.specialty` são texto livre.
- O histórico esportivo existe no cadastro, sem convocação nem seleção operacional.
- A auditoria mostra as últimas 100 operações de quem tem `can_read_audit`. Não há conversa, aprovação separada nem canal preenchido pelo cliente.
- O administrador abre o vínculo pelo identificador do atleta. O catálogo clínico continua limitado a quem já tem acesso.

## Planejado

- Agente CBB Intelligence, ferramentas e provedor de modelo.
- Política de psicologia validada pela CBB, incluindo compartilhamento excepcional.
- Exames, anexos clínicos, documentos, responsáveis e atendimento a menores com dados reais.
- Assinatura digital e integração com sistemas externos da CBB.

## Lacuna explícita de sigilo

Enquanto não existir uma especialidade atribuída por uma fonte que o profissional não possa editar, o sistema não afirma uma política completa de sigilo psicológico. A proteção atual impede alargar um registro já restrito. Uma evolução nova ainda pode nascer compartilhada com a equipe se o autor desmarcar a restrição.
