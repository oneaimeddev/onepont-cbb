# ADR 0029 — Administrador com acesso clínico completo

Data: 2026-11-25

## Contexto
O perfil de administrador (OnePront, `can_manage_access`) foi criado para administração e
auditoria, sem leitura clínica: tinha vínculo com os atletas, mas com todas as permissões
clínicas desligadas. Para testar e operar a plataforma, o responsável pediu que o administrador
tenha acesso livre a todas as funcionalidades.

## Decisão
- Perfis com `can_manage_access` recebem leitura, escrita, edição e finalização em todos os
  atletas; um gatilho estende o acesso aos atletas cadastrados depois.
- Podem cadastrar atletas e preparar documentos médicos (autor médico habilitado).
- Na gravação de consulta, usam o modelo de relatório de Medicina.
- Antes de iniciar uma gravação no chat, a permissão de registro é verificada, para o
  profissional não gravar uma consulta que não poderá salvar.

## Consequências
A separação entre administração e leitura clínica deixa de existir para esse perfil. Sigilo
(psicologia), aprovação humana e auditoria continuam valendo, e as ações ficam registradas com a
autoria do administrador. Para restaurar a separação, basta desligar as permissões do
administrador em `clinical.athlete_access`, `clinical.athlete_creators` e `clinical.medical_authors`
e remover o gatilho `athlete_admin_access`.
