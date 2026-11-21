# Handoff 008B — Beta fechado

## Ambiente

- Aplicação: https://prontuario-cbb-beta.vercel.app
- Projeto Vercel exclusivo: `one-ai-dev/prontuario-cbb-beta`.
- Supabase exclusivo: `oneaimeddev's Project`, ref `noqixverpzgvfrcybrrt`.
- Branch: `chore/handoff-008b-closed-beta`, derivada da baseline `cd52b51`.
- Código da aplicação publicado: `8796455`. O fechamento acrescenta ferramentas de verificação, metadados do lockfile e o registro da correção SQL aplicada no remoto; não altera o código da aplicação depois desse deploy.

## Massa e acesso

Seed novo `beta-008b-v1`, sem copiar dados locais: **180 atletas fictícios**, sendo 120 menores com responsáveis fictícios e 90 atletas de cada gênero masculino/feminino; categorias de base/profissional. **289 evoluções** (288 do seed e uma validação idempotente), **91 documentos**, **seis entregas simuladas** concluídas com PDFs reais. Inclui rascunhos, finalizados, conteúdo restrito, Psicologia histórica, correção de evolução e documento derivado corrigido.

Duas execuções consecutivas do seed produziram exatamente as mesmas contagens (180/288/91/6), antes da evolução adicional de smoke test. IDs determinísticos e marca própria; sem limpeza destrutiva. O projeto estava vazio antes do seed. Dados alheios ao lote são recusados.

| Login | Perfil e permissões efetivas |
|---|---|
| bruno.nicolaci@cbb-demo.test | Bruno Nicolaci Costa; Preparação Física; prontuário compartilhado e próprias evoluções |
| carlos.andreoli@cbb-demo.test | Carlos Vicente Andreoli; Medicina; evoluções, cadastro e documentos médicos demonstrativos |
| rafael.plein@cbb-demo.test | Rafael Francis Plein; Fisioterapia; prontuário compartilhado e próprias evoluções |
| bruno.secco@cbb-demo.test | Bruno de Lima Secco; Fisioterapia; prontuário compartilhado e próprias evoluções |
| denise.pereira@cbb-demo.test | Denise Pereira; Nutrição; prontuário compartilhado e próprias evoluções |
| paulo.daniel@cbb-demo.test | Paulo Henrique Pereira Daniel da Silva; Apoio Técnico; acesso operacional sem leitura/escrita clínica |
| onepront@cbb-demo.test | OnePront; administração explícita de vínculos e auditoria; sem leitura/escrita clínica ou capacidade médica |

Os sete usuários foram criados administrativamente com e-mail confirmado e autenticaram com sucesso. Nenhum número de conselho foi inventado. Perfil administrativo não recebeu bypass de RLS. Psicologia permanece restrita, inclusive para o médico e o administrador.

## Senhas e operação segura

- Seis avaliadores: senha aprovada digitada pelo responsável em terminal WSL com entrada oculta. Não gravada no repositório, relatórios ou logs.
- OnePront: senha aleatória de 256 bits diferente, disponível somente ao responsável em `/home/tomaz/.config/prontuario-cbb/beta-admin.json`, permissão `600`, diretório `700`. Consultar localmente no WSL; não enviar em chat.
- Cadastro público desabilitado. Não há fluxo de recuperação por e-mail fictício. Reset administrativo de uma das sete contas, no WSL autenticado:

```bash
read -rsp 'Nova senha: ' beta_password; printf '\n'
printf '%s' "$beta_password" | node scripts/beta/reset-password.mjs 'login@cbb-demo.test'
unset beta_password
```

- Reexecutar o seed: `bash scripts/beta/seed.sh`. Exige a senha aprovada por entrada oculta; contas existentes não têm senha substituída pelo seed. Credenciais temporárias de sessão usadas nos smoke tests foram removidas ao terminar.

## Alterações e validação

- Configuração Next.js explícita para Vercel e Node 22; arquivos de testes, evidências e scripts administrativos excluídos do upload.
- Variáveis do Supabase remoto e Gemini configuradas; segredos somente no backend. Demonstração hospedada exige `controlled-demo` e correspondência exata entre URL e project ref dedicado. Produção/preview sem essa vinculação continuam bloqueados. Nenhum conector de WhatsApp real configurado.
- **Correção necessária de sigilo:** o seed revelou que registros restritos históricos sem autor podiam gerar SQL `NULL` na autorização. Nova migração `20261121000800_record_content_null_guard.sql` torna esse resultado `false`. Aplicada somente ao remoto Beta após dry-run que listou exclusivamente essa migração. As 49 antigas não foram reaplicadas nem reparadas; o remoto agora tem **50 versões**. O teste local usa transação com rollback, sem aplicar a migração no banco local.
- Testes direcionados: **2 aprovados**, cobrindo vinculação do ambiente e negação de conteúdo histórico sem autor, com preservação de concessão explícita. Lint, typecheck e build aprovados; build Vercel Next.js concluído.
- **18 smoke checks remotos aprovados**, mais revisão de prescrição na interface: HTTPS, anonimato, sete logins/perfis, permissões no backend, sigilo de Psicologia, finalização direta, acesso administrativo sem conteúdo clínico, listagem/prontuário, PDF/conversa, auditoria, cadastro fechado e Gemini (`gemini-3.5-flash-lite`) respondendo pelo produto. Scripts públicos do login foram verificados sem encontrar os segredos privados configurados.
- PDFs exibem **PRÉVIA NÃO ASSINADA — SEM VALIDADE PARA DISPENSAÇÃO**. Estados e mensagens são explicitamente simulados. Assinatura válida e envio externo de WhatsApp não foram habilitados.

## Limites

Administração de vínculos e auditoria usam a UI existente; criação/reset de usuários usam as rotinas administrativas locais, sem nova arquitetura de autenticação. Não há login de Psicologia entre os sete avaliadores; seus registros sintéticos históricos servem para verificar sigilo. O seed de documentos privilegia prescrições; demais tipos existentes podem ser explorados pela criação habitual. Este ambiente não autoriza atendimento real nem dados reais.

Sem push ou merge em `main`. Nenhum outro projeto Supabase ou Vercel foi alterado; o banco local foi preservado, além das fixtures fictícias temporárias e testes transacionais revertidos.
