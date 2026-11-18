# Fechamento técnico — baseline antes do 007.10.2

Data: 18/11/2026. Escopo: fixture temporal, procedência do trabalho pendente e organização local do Git. Nenhuma refatoração, mudança visual ou alteração da implementação clínica foi feita neste fechamento.

## 1. Causa e correção

O teste `tests/longitudinal-history.spec.mjs`, originalmente na linha 217, esperava uma prescrição e um pedido cirúrgico no intervalo **17/05/2026 a 17/11/2026**. Os documentos eram criados pela RPC existente `document_save`, com `created_at` baseado no relógio real do banco. A fixture fixava a criação somente da solicitação de exames. Executado em 18/11 ou depois, o teste excluía corretamente os outros dois documentos do período, mas continuava esperando encontrá-los.

A única mudança funcional deste fechamento é na fixture: a atualização de timestamps agora inclui **exame, prescrição e pedido cirúrgico**, todos identificados pelos UUIDs aleatórios criados pelo próprio teste.

- Criação: `2026-11-01 12:00:00+00`.
- Atualização: `2026-11-02 12:00:00+00`.
- Data clínica do exame: permanece `2026-07-15`.
- Intervalo consultado, datas das evoluções, exclusão de registros antigos/privados, autoria, auditoria e paginação: inalterados.

Isso preserva a distinção original entre data clínica do exame e data de criação dos demais documentos. Não amplia o intervalo para incluir o dia da execução, não congela o relógio do banco e não altera SQL/RPC de produção. Todas as asserções originais foram mantidas.

O teste foi reproduzido com a fixture anterior e falhou na inclusão da prescrição. Após a correção, passou integralmente.

## 2. Origem das alterações preexistentes

Antes do fechamento havia cinco arquivos rastreados modificados e doze arquivos não rastreados, totalizando **17 arquivos**. Nenhum estava preparado no índice para commit.

### Análise longitudinal — Handoff 007.5.2

Os indícios concordantes são:

- Branch local `feat/longitudinal-history`, criada em **17/11/2026 às 19:20:45, America/Sao_Paulo**, a partir de `bb8ce5e`, ainda sem commit próprio daquele trabalho.
- Módulos `history-analysis.ts`, `history-run.ts`, `longitudinal-card.tsx`, rota `/api/inteligencia/historico`, migração `20261117000200_longitudinal_history.sql` e testes longitudinal/voz.
- ADR `0019-longitudinal-history.md`, descrevendo precisamente essas leituras autorizadas.
- Capturas na pasta `docs/visual/handoff-007-5-2`.
- Modificações correspondentes em `agent.ts`, `intelligence-home.tsx`, `intelligence.css` e `transcript.ts`: ferramenta de leitura, apresentação do cartão e persistência de referências da análise.
- Datas locais dos arquivos de teste/análise em 17/11, por volta de 19:37–19:38, anteriores aos handoffs seguintes.

O histórico Git não continha commits próprios para esses módulos. Os arquivos não versionados não permitem provar a autoria ou o chat exato de origem; as datas de arquivo são indícios auxiliares, não prova de autoria. A atribuição ao trabalho 007.5.2 decorre do conjunto de nomes, conteúdo, ADR, capturas e reflog.

### Utilitário de demonstração

`README.md` e `scripts/seed-demo-chart.mjs` formavam uma segunda unidade: documentação e utilitário de preenchimento de prontuários fictícios no Supabase local. O script tinha data local de 17/11 por volta de 19:45. Ele é relacionado à preparação da demonstração, mas não é a implementação da análise longitudinal. Não foi executado neste fechamento.

## 3. Preservação e organização

As alterações anteriores não foram descartadas, reescritas, misturadas ao commit da fixture ou incorporadas retroativamente à branch de polimento.

| Unidade | Branch local | Commit de salvaguarda |
|---|---|---|
| Conteúdo longitudinal preexistente, 15 arquivos | `wip/handoff-007-5-2-preserved` | `20c698b` |
| Seed e trecho correspondente do README, 2 arquivos | `wip/demo-chart-seed-preserved` | `f6608bc` |
| Correção temporal e este registro | `fix/baseline-before-007-10-2` | Commit de fechamento informado na entrega |

A primeira salvaguarda parte do polimento `05a2c38`. A segunda deriva da primeira. A branch de fechamento deriva dessas salvaguardas para validar exatamente a implementação que já estava em uso no workspace. Foi verificada a igualdade **byte a byte dos 17 arquivos** antes de corrigir a fixture. O [manifesto SHA-256 anterior](pre-007-10-2-original-workspace-sha256.json) permite conferir essa preservação; os hashes referem-se ao conteúdo antes da correção do teste.

Os commits `wip` são preservação rastreável do material existente, **não homologação clínica adicional** nem nova implementação deste fechamento. A mudança da fixture aparece em commit posterior próprio. As demais branches não foram movidas; em particular:

- `feat/handoff-007-10-1-home-chat-polish`: permanece em `05a2c38`.
- `feat/longitudinal-history`: permanece em `bb8ce5e`, preservando a referência histórica original.
- `main`, `develop` e referências remotas: inalteradas. Não houve fetch, push, publicação ou merge.

As capturas regeneradas automaticamente pelos testes foram restauradas ao conteúdo anterior. A comparação final confirmou **16 dos 17 arquivos preexistentes idênticos** ao manifesto, incluindo código clínico, migração, agente, interface, README, seed e capturas. A única diferença é a fixture temporal corrigida.

## 4. Verificações

Comandos executados no Supabase local e na aplicação do projeto:

```sh
npx playwright test tests/longitudinal-history.spec.mjs --project=app --workers=1
npm run lint
npm run typecheck
npm run build
npx playwright test --workers=1
```

- Teste longitudinal corrigido: **1/1 passou**.
- Lint: passou sem avisos.
- Typecheck: passou.
- Build de produção: passou.
- Suíte automatizada completa após a correção: **64/64 testes passaram**, sem falhas ou testes ignorados, em uma única execução serial de **4,4 minutos**. Nenhum caso foi suprimido e nenhuma verificação clínica foi substituída para satisfazer o teste.

A execução serial preserva as condições já adotadas no projeto, evitando interferência entre testes de carga e asserções que consultam a janela recente de auditoria. Os testes usam exclusivamente dados fictícios e suas rotinas existentes de limpeza.

## 5. Estado final

O fechamento mantém a implementação clínica exatamente como estava no workspace, agora preservada em branches locais identificadas, e torna determinística a única fixture alterada. A baseline validada inclui esse trabalho anterior; não se deve confundir o estado da branch de polimento isolada com o estado completo anteriormente não commitado.

Não foi iniciado o 007.10.2. Não houve mudança visual, refatoração, alteração de regra clínica ou merge. Após o commit de fechamento, o workspace fica limpo na branch `fix/baseline-before-007-10-2`. O hash desse commit é informado na entrega. `main` permanece em `bb8ce5e`, `develop` em `498d710` e a branch de polimento em `05a2c38`.
