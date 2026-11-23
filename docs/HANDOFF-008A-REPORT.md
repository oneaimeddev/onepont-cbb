# Handoff 008A — Consolidação técnica

## Baseline e inventário

- Branch: `chore/handoff-008a-consolidated-baseline`.
- HEAD recebido: `c654477`, com seis commits de evoluções acima de `main` (`5f86dac`). Todas as outras branches locais já eram ancestrais desse HEAD; nenhum cherry-pick/merge era necessário.
- O workspace continha o 007.10.7A completo, ainda sem commit. Foi preservado integralmente em `a97b9f1`, base desta consolidação.
- Baseline candidata reúne atletas, prontuário, documentos, assinatura demonstrativa, motor de entrega, Intelligence, paleta CBB, sigilo/correções/finalização direta e conversa simulada/PDF. `main` foi preservada.

## Matriz final

| Área | Integrada? | Pendência | Criticidade |
|---|---|---|---|
| Atletas | Sim | Sem incompatibilidade comprovada | — |
| Evoluções | Sim | Sigilo, correções e finalização direta presentes na branch candidata | — |
| Documentos | Sim | Revisão/finalização preservadas | — |
| Motor de entrega | Sim | Persistência, idempotência e recuperação verificadas | — |
| CBB Intelligence | Sim | Contratos nativos e confirmação humana preservados | — |
| WhatsApp simulado/PDF | Sim | 007.10.7A registrado em commit; sem transporte externo | — |
| Autorização e auditoria | Sim | Homologar origem da massa local e vínculos dos perfis DEMO antes de usá-la no Beta | P1 |
| Migrações | Sim | Histórico local conciliado; outros ambientes devem verificar seu próprio histórico | — |

## Correções mínimas

1. Registro do 007.10.7A, sem sobrescrever seu conteúdo.
2. Reparo **somente do histórico local** de `20261115000900`: `npx supabase migration repair 20261115000900 --status applied`. Realizado após reprodução isolada e comparação dos objetos. Sem reaplicar DDL, reset, seed ou alteração de registros clínicos.
3. `tests/helpers/workflow-fixtures.mjs`: fixtures tradicionais desabilitam temporariamente o destinatário virtual e restauram a configuração anterior na limpeza. A falha foi reproduzida no teste de revalidação de telefone com o simulador local ligado; a política virtual não depende de telefone, portanto o teste tradicional precisava isolar sua configuração.
4. `tests/delivery-simulation.spec.mjs`: teste anônimo usa a URL do servidor corrente, eliminando dependência fixa da porta 3104.
5. `playwright.baseline.config.ts`: seleção reproduzível de 18 testes entre áreas integradas.
6. `scripts/verify-migration-baseline.py`: verifica versões, reproduz migrações num banco temporário local sem dados e compara funções/ACLs, tabelas/RLS, colunas, constraints, índices, triggers e políticas. O banco temporário é removido em `finally`.

Nenhuma regra de negócio, UX, arquitetura ou contrato de produto foi modificado no 008A. Nenhuma nova migração foi necessária.

## Migrações e validação

- **49 arquivos, 49 versões locais**, sem duplicidade, lacuna ou versão extra após o reparo.
- Reprodução ordenada das **49 migrações aprovada** em banco vazio com infraestrutura Auth/Storage do Supabase, somente schema, sem copiar dados. Comparação final: **zero divergências**, desconsiderando espaços no final das linhas das definições de funções.
- Diferenças históricas nos registros `20261115000600`, `00700` e `00800`: apenas o ponto e vírgula final omitido pelo armazenamento antigo. Históricos e arquivos preservados.
- `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check`: aprovados.
- `npx playwright test --config playwright.baseline.config.ts`: **18 testes aprovados**. Cobertura: concessão/revogação, usuário sem vínculo, sigilo de Psicologia, correção/histórico, finalização direta médica/psicológica e rollback; confirmação/revalidação/auditoria do Intelligence; entrega/PDF/conversa e autorização, retentativas, imutabilidade, falha recuperável, modo real/demo, desktop/mobile e acessibilidade.
- Segredos: 29 arquivos JS de `.next/static` inspecionados, nenhum continha os dois segredos privados configurados. Fontes de credenciais permanecem em módulos server-only ou handlers de API; nenhuma credencial foi incluída no relatório.
- Demonstração: adaptador sem I/O de provedor, estados com procedência simulada, avisos de assinatura não válida e PDF sem validade para dispensação verificados nos contratos e testes.

## Bloqueios e estado final

- **P1 — massa do Beta:** o banco local tem três atletas `source=manual` e quatro vínculos entre esses registros e perfis com rótulo DEMO. Dois atletas têm marca fictícia no nome; um não tem. Não foi possível certificar a origem desse registro. Isso não prova que sejam dados reais, mas impede certificar a massa como exclusivamente fictícia. Nenhum conteúdo clínico desses registros foi usado nos testes e nenhum vínculo foi removido por suposição. Homologar/substituir essa massa antes de usar perfis demonstrativos ampliados no Beta; isolamento de uma instalação com dados reais requer a etapa 008C.
- Perfis não têm uma categoria formal DEMO de autorização; o rótulo não substitui vínculos/permissões. Os geradores demonstrativos examinados são restritos ao Supabase local. Não foi introduzida uma nova política de acesso neste handoff.
- A assinatura/PDF permanecem demonstrativos; nenhum conector externo foi habilitado. Não é uma auditoria completa de segurança.
- Os testes temporários foram limpos, a configuração demonstrativa anterior foi restaurada e as contagens existentes foram preservadas: 179 atletas, 349 evoluções, 756 documentos e 12 perfis.
- Alterações consolidadas em commit na branch candidata; sem merge em `main`, push, deploy ou acesso a banco de produção.
