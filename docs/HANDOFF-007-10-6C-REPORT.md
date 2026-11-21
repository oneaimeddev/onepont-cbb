# Relatório de homologação — Handoff 007.10.6C

Data: 20/11/2026. Implementação concluída; homologação visual pelo usuário pendente.

## Resultado e Git

Refinamento cromático aplicado em `design/handoff-007-10-6c-cbb-palette`, commit de implementação `a45c85d81e02aad2cd97b3c16d401c9bdf8e3f53`.

A `main` e a tag `baseline/pre-paleta-2026-11-20` permanecem em `126ed085797d113680b3aa1689504acdb342d522`. Cortes A–E do 007.10.6B.3 preservados. Nenhum merge, push, deploy ou migração. Commit documental posterior registra este relatório. Workspace limpo ao finalizar.

## Intervenção

Somente três arquivos de produção alterados, todos CSS:

- `src/app/globals.css`: tokens institucionais canônicos, navy institucional, navegação selecionada, links e botão de busca, foco e cores de interação/carregamento.
- `src/features/chat/intelligence.css`: marca consistente, ações apropriadas em verde, hover/active, seleção e foco. Voz/informação continuam semânticas; a última palavra da saudação passou a usar o verde institucional por solicitação posterior do usuário, inclusive no estilo inline do texto animado e na versão de movimento reduzido.
- `src/features/documents/documents.css`: cores anteriores fixadas exclusivamente na folha documental, por contexto, para impedir alteração silenciosa de sua apresentação.

Sidebar continua clara; fundos existentes mantidos. Tipografia, escala, espaçamentos, larguras de borda, raios, grid, navegação e formulários preservados. Nenhum JSX, contrato, API, autorização, auditoria ou backend alterado. Ações destrutivas e secundárias mantêm sua hierarquia.

## Tokens

| Token | Antes | Depois / função |
|---|---|---|
| `--cbb-navy` | `#102849`; override `#0A1731` | `#161D34`, títulos e identidade |
| `--cbb-green` | `#07803E`; override `#007132` | `#3D7039`, ações primárias apropriadas |
| `--cbb-yellow` | `#F3D115` | `#E0C42D`, detalhes existentes |
| `--green-hover` | `#056732`; override `#005C28` | `#325D2F` |
| `--green-active` | inexistente | `#294D26`, pressionado/carregamento |
| `--brand-soft` | seleção azul fixa | `#EDF3EC`, seleção discreta |
| `--focus` | raiz `#2366B2`, locais azuis divergentes | raiz `#2366B2`, foco semântico centralizado |
| `--cbb-green-vibrant` | inexistente | `#12B106`, reservado, sem referência funcional |
| `--cbb-off-white` | inexistente | `#F8F8F5`, referência; fundos adequados preservados |

Semânticos preservados: sucesso `#E6F4EC/#05652F`, rascunho/alerta `#FDF5D3/#6B5400`, erro `#A32631/#FDEEF0`, desabilitados neutros. O escudo oficial não foi editado. As cores legadas nos tokens locais da folha documental são intencionais para preservar o template.

## Contraste

Limites usados: texto normal 4,5:1; indicador de foco 3:1. Resultados calculados pela luminância relativa sRGB:

| Combinação | Razão |
|---|---|
| Navy / branco | 16.67:1 |
| Primário / branco | 5.87:1 |
| Hover / branco | 7.66:1 |
| Active / branco | 9.62:1 |
| Link / superfície | 5.43:1 |
| Selecionado / fundo suave | 5.21:1 |
| Navy / amarelo | 9.61:1 |
| Foco / branco | 5.81:1 |
| Foco / superfície | 5.37:1 |
| Sucesso / fundo semântico | 6.37:1 |
| Rascunho / fundo semântico | 6.63:1 |
| Branco / amarelo: proibido para texto | 1.74:1 |

As 11 combinações aprovadas passam no limite correspondente. Branco sobre amarelo é 1,74:1, reprovado e não utilizado. O estado loading primário usa o verde mais escuro e texto branco, preservando a opacidade existente. A indicação de seleção mantém atributos/estrutura e o foco mantém contorno; estados clínicos continuam acompanhados de texto.

## Evidências reais

[Comparação visual lado a lado](visual/handoff-007-10-6c/index.html). Nove pares antes/depois: sete telas desktop de 1440 px e duas amostras mobile de 390 px. Dimensões PNG verificadas. Perfil profissional também avaliado por axe/estilos, sem captura redundante.

- Home: [antes](visual/handoff-007-10-6c/before/home-1440.png) · [depois](visual/handoff-007-10-6c/after/home-1440.png).
- Diretório de atletas: [antes](visual/handoff-007-10-6c/before/directory-1440.png) · [depois](visual/handoff-007-10-6c/after/directory-1440.png).
- Perfil do atleta: [antes](visual/handoff-007-10-6c/before/athlete-1440.png) · [depois](visual/handoff-007-10-6c/after/athlete-1440.png).
- Editor de prescrição: [antes](visual/handoff-007-10-6c/before/prescription-editor-1440.png) · [depois](visual/handoff-007-10-6c/after/prescription-editor-1440.png).
- Revisão documental: [antes](visual/handoff-007-10-6c/before/document-review-1440.png) · [depois](visual/handoff-007-10-6c/after/document-review-1440.png).
- Documento finalizado: [antes](visual/handoff-007-10-6c/before/finalized-document-1440.png) · [depois](visual/handoff-007-10-6c/after/finalized-document-1440.png).
- CBB Intelligence: [antes](visual/handoff-007-10-6c/before/intelligence-1440.png) · [depois](visual/handoff-007-10-6c/after/intelligence-1440.png).
- Home mobile: [antes](visual/handoff-007-10-6c/before/home-390.png) · [depois](visual/handoff-007-10-6c/after/home-390.png).
- Perfil mobile: [antes](visual/handoff-007-10-6c/before/athlete-390.png) · [depois](visual/handoff-007-10-6c/after/athlete-390.png).

Capturas headless, sem abrir Chrome visível. Somente fixtures fictícias; cleanup executado. Não houve envio externo ou assinatura válida. Registros das observações e cálculos acompanham as imagens.

## Verificação

| Verificação | Resultado |
|---|---|
| `node scripts/check-cbb-palette.mjs` | 2.549 declarações auditadas; seletores originais, propriedades estruturais e semântica preservados; 11 combinações de contraste aprovadas |
| `npx playwright test --config playwright.palette.config.ts` | 2 testes passaram, 12,9 s |
| Axe nas cenas representativas | 10 observações antes + 10 depois, zero violações nos escopos avaliados |
| Comparação de estilos | Tipografia, margens, padding, display, bordas/raios idênticos para os componentes observados |
| Folha documental | Cores e estilos de todos os descendentes visíveis idênticos à baseline em revisão, finalizado e chat |
| Snapshot finalizado | Bytes canônicos e hash inalterados durante leitura/captura |
| Proposta pendente no chat | Captura/leitura não registra autorização: `presented_at` permanece vazio |
| Estados de interação | Normal, hover, active, foco via Tab, disabled e loading aprovados |
| `npx playwright test tests/document-editor-ux.spec.mjs --project app --workers 1` | 5 testes existentes passaram, 31,0 s |
| `npm run lint` | Aprovado, sem erros ou warnings |
| `npm run typecheck` | Aprovado |
| `npm run build` | Aprovado |
| `git diff --check` | Aprovado |

Novos testes: harness visual/acessibilidade e script de invariantes cromáticos. Reutilizados os cinco testes do editor: 1/3/6 itens, foco, desfazer, integridade, responsividade, histórico, recarga, prévia nos três documentos, pedido cirúrgico extenso, menu por teclado/Escape/autorização e estabilidade da área ao adicionar/alternar itens.

A suíte clínica integral não foi repetida: alteração limitada a cores CSS, conforme política do handoff. A baseline havia passado em 351 testes; isso não equivale a uma execução integral nesta branch. Integrações reais de voz, assinatura e entrega não foram acionadas neste refinamento.

## Problemas, limites e pendências

Foram resolvidos overrides de marca divergentes, cores interativas fixas e fallback de foco não canônico. A herança de marca na folha documental foi isolada para preservar sua apresentação. Ajustes na infraestrutura de captura corrigiram o campo fictício para `team`, o rótulo real “Revisar e assinar” e o viewport inicial para 1440 px; as evidências finais foram refeitas na baseline exata e na implementação final.

Axe automatizado não substitui avaliação humana com tecnologias assistivas. A cobertura é representativa em Chromium headless; não houve matriz Safari/Firefox/dispositivos físicos. As capturas usam novas fixtures por execução: identificadores, horários e saudação dinâmica podem variar. Não são snapshots de igualdade pixel a pixel; a preservação estrutural foi verificada por CSS e estilos computados.

Sem pendência técnica conhecida no escopo. Falta homologação visual do usuário. Não se introduziu a nova paleta em templates documentais ou PDFs de produção; qualquer futura mudança nesses artefatos deve ser versionada separadamente.

## Homologação sugerida

1. Comparar Home, diretório e perfil: navy, links verdes, sidebar clara e filtros em uma linha no desktop.
2. Conferir botões primários, hover, Tab/foco e ações secundárias.
3. Abrir prescrição com vários itens e revisar: organização deve continuar igual.
4. Conferir documento finalizado e estados simulados: apresentação documental preservada.
5. Conferir chat, contexto e proposta pendente; a palavra final da saudação aparece em verde institucional (#3D7039).
6. Conferir as duas amostras mobile e aprovar a paleta antes de integrar.

## Rollback e retomada

A `main` já é a versão anterior à paleta. Com workspace limpo, `git switch main` retorna a ela sem descartar commits. A tag `baseline/pre-paleta-2026-11-20` permanece disponível como referência estável. Não usar reset destrutivo. Para retomar o refinamento: `git switch design/handoff-007-10-6c-cbb-palette`.

Não realizar merge/push/deploy até homologação. Arquivos de progresso e evidências deste handoff permanecem no repositório e em cópia local nativa do Windows.
