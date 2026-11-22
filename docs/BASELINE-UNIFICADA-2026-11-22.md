# Unificação Vercel, GitHub e máquina local — 22/11/2026

## Diferença encontrada

- Deploy ativo consultado: `dpl_Fn1M3fXRNAGAWVEih5wr2eYWdJUU`, código `656a6a6`, branch GitHub `claude/practical-clarke-434jzc`.
- Essa branch partiu de `5f86dac` e acrescentou a correção do menu de conta no Safari e seu teste.
- A máquina estava em `9ed8003` (008B), com a `main` local em `cd52b51` e a `main` GitHub em `5f86dac`.
- Portanto, o deploy não tinha os commits locais de sigilo/correções/finalização direta de evoluções, conversa simulada/PDF e preparação do Beta. Não se tratava de apagar essas funcionalidades para igualar a cópia antiga.

## Consolidação

- Branch de integração: `chore/unify-vercel-local-2026-11-22`.
- Merge real, sem conflitos, de `656a6a6` sobre `9ed8003`; ambos os históricos preservados.
- Diferença funcional em relação ao 008B: somente a correção importada de `src/components/account-menu.tsx` e o teste em `tests/profile-entry.spec.mjs`.
- Aplicada no Supabase **local** somente a migração pendente `20261121000800_record_content_null_guard.sql`, já existente no Beta remoto. Sem reset, replay de migrações antigas, seed ou cópia de dados entre ambientes.

## Verificação

- Lint, typecheck e build aprovados.
- 21 testes direcionados aprovados: 18 da baseline integrada, o cenário de toque do Safari e dois testes de isolamento/sigilo do Beta.
- Configuração de produção da Vercel ligada à `main` de `oneaimeddev/onepont-cbb`; a versão unificada preserva `vercel.json` Next.js e o Node 22 declarados no 008B.
- Banco local e repositório com 50 migrações, incluindo a correção de autorização para registros históricos sem autor. Dados e credenciais dos ambientes permanecem separados.

A sincronização de Git não sincroniza dados, senhas nem arquivos `.env.local` entre a máquina e o Beta. As credenciais continuam fora do repositório.
