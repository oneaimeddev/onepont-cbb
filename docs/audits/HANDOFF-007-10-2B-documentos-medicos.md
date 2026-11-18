# HANDOFF 007.10.2B — Refinamento dos documentos médicos

Implementação frontend para homologação, sem merge. Referência: [auditoria 007.10.2A](HANDOFF-007-10-2A-documentos-medicos.md).

## Origem e preservação

A branch `feat/handoff-007-10-2b-medical-documents` foi criada em `b52aab4`, descendente direto da baseline `fix/baseline-before-007-10-2` (`4a581d7`), incluindo o relatório e capturas da auditoria. O workspace estava limpo. Os commits de preservação longitudinal `20c698b` e do seed `f6608bc` continuam na ancestralidade. Nenhuma branch antiga foi utilizada como ponto de implementação.

Não foram alterados modelos clínicos, limites, payloads, persistência, RPCs, migrações, autorização, auditoria, ferramentas do agente, voz, confirmação, assinatura ou emissão. Os documentos continuam nos estados já existentes de rascunho/revisão interna. Nenhum salvamento automático foi introduzido.

## Alterações por achado

| Auditoria | Implementado |
|---|---|
| P1-01: descarte silencioso | Comparação do conteúdo atual com a versão inicial nos três editores. Inclui campos, inclusão, remoção e desfazer. Links na mesma aba pedem confirmação para descartar; cancelar mantém a edição. Recarga/fechamento utilizam `beforeunload`. Histórico utiliza a Navigation API para eventos interceptáveis e canceláveis. |
| P1-01: prévia | Aviso de que a prévia representa a última versão salva. Quando há edição pendente, a confirmação explica que sair descarta alterações e oferece continuar editando para salvar primeiro. Nenhuma gravação é disparada para abrir prévia. |
| P1-02: foco | Adicionar mantém o mecanismo original de UUID e foca/mostra o nome novo. Remover foca o próximo item, o anterior ou a ação de adicionar. Desfazer foca o item restaurado. Mensagem curta em região `aria-live="polite"`, sem anunciar cada tecla digitada. |
| P1-03: remoção | Recuperação local das remoções em ordem inversa. Cada entrada retém somente o item removido e a posição: todos os campos e UUID são restaurados. Também funciona para o último item. A lista de recuperação termina ao salvar/reabrir, sem histórico genérico de edição. |
| P1-04: textos extensos | Frequência agora é textarea com a mesma string e limite de 160 caracteres. Os demais limites permanecem. Textareas crescem conforme conteúdo/largura; o mínimo acompanha a altura do texto, inclusive ao tentar reduzir manualmente o campo. Não precisam de rolagem interna no tamanho calculado. |
| P1-05: disponibilidade das ações | Em desktop amplo, ações em coluna lateral sticky separada do formulário; não há sobreposição sobre campos ou validação. Em telas menores, alturas reduzidas ou interação por toque, as ações ficam no fluxo depois do formulário. |
| P1-06: ordem dos exames | Data/prioridade → Exames solicitados → itens → contexto clínico, hipótese, justificativa e orientações. Todos os bindings e campos permanecem. |
| P2-01: identificação dos itens | Legenda com número e nome, preservando grafia. Dose e unidade juntas; via e frequência em linhas claras. Sem acordeões ou ocultação de informação clínica. |
| P2-02: hierarquia | Conteúdo dos controles com peso regular, labels semibold e títulos operacionais de 17px/600. Cirurgia organizada em seções editoriais discretas. Identidade, Geist, tokens e coluna de leitura preservados. |
| P2-03: criação | “+ Novo documento” abre Prescrição, Pedido cirúrgico e Solicitação de exames, com os destinos e a condição de autorização existentes. Botão nativo, Tab, Escape, retorno de foco e fechamento ao selecionar/sair do menu. |

A coluna de ações é sticky apenas a partir de 1280px, com altura mínima de 700px, ponteiro preciso e suporte a hover. Isso evita uma barra inferior sobre o formulário e mantém o fallback estático nas condições de menor espaço. A coluna de leitura não foi alargada indiscriminadamente.

Os avisos de saída são confirmações nativas, seguindo o padrão já utilizado pelo cadastro do projeto. A mensagem identifica a ação; cancelar continua a edição. Os textos e botões do aviso nativo de recarga/fechamento pertencem ao navegador.

Desfazer pode devolver o conteúdo exatamente à versão salva; nesse caso a marca de alterações pendentes é removida. Remover é uma operação de estado local: nada é excluído do documento salvo até o envio explícito.

## Arquivos

- `src/features/documents/editors.tsx`: composição dos três editores, estado pendente e uso dos controles comuns.
- `src/features/documents/editor-controls.tsx`: proteção de navegação específica dos documentos, textarea expansível, foco e recuperação de itens removidos.
- `src/features/documents/documents.css`: hierarquia, leitura, dose/unidade, textos e ações responsivas.
- `src/features/documents/create-menu.tsx` e `create-menu.css`: escolha do tipo de documento.
- `src/features/documents/preview.tsx`: identificação da última versão salva.
- `src/app/(workspace)/atletas/[id]/page.tsx`: substituição das três ações pelo menu, dentro da condição de acesso original.
- `tests/document-editor-ux.spec.mjs`: testes novos de integridade, navegação, foco, acessibilidade e responsividade.
- `tests/documents.spec.mjs` e `tests/exam-request.spec.mjs`: abertura do menu antes das ações de criação; demais verificações clínicas preservadas.
- Este relatório e as evidências em `docs/visual/handoff-007-10-2b/`.

O reuso se limita a comportamentos repetidos de edição. Os formulários e seus campos clínicos continuam específicos; não foi criado um formulário universal ou schema de persistência.

## Capturas antes/depois

Dados exclusivamente fictícios. “Antes” é a aplicação na baseline inspecionada pelo 007.10.2A. “Depois” é a aplicação real compilada desta implementação. As capturas completas ficam altas quando todo o texto passa a ser visível; as capturas iniciais permitem conferir a composição sem reduzir a imagem inteira.

| Cenário | Antes | Depois |
|---|---|---|
| Prescrição com seis medicamentos — desktop | [Inicial](../visual/handoff-007-10-2a/prescricao-6-1440-inicial.png) · [Completa](../visual/handoff-007-10-2a/prescricao-6-1440.png) | [Inicial](../visual/handoff-007-10-2b/prescricao-6-1440-inicial.png) · [Completa](../visual/handoff-007-10-2b/prescricao-6-1440.png) |
| Prescrição com seis medicamentos — 390px | [Antes](../visual/handoff-007-10-2a/prescricao-6-390.png) | [Depois](../visual/handoff-007-10-2b/prescricao-6-390.png) |
| Prescrição com seis medicamentos — 320px | — | [Depois](../visual/handoff-007-10-2b/prescricao-6-320.png) |
| Solicitação com seis exames — desktop | [Inicial](../visual/handoff-007-10-2a/exames-6-1440-inicial.png) · [Completa](../visual/handoff-007-10-2a/exames-6-1440.png) | [Inicial](../visual/handoff-007-10-2b/exames-6-1440-inicial.png) · [Completa](../visual/handoff-007-10-2b/exames-6-1440.png) |
| Solicitação com seis exames — 390px | [Antes](../visual/handoff-007-10-2a/exames-6-390.png) | [Depois](../visual/handoff-007-10-2b/exames-6-390.png) |
| Solicitação com seis exames — 320px | — | [Depois](../visual/handoff-007-10-2b/exames-6-320.png) |
| Pedido cirúrgico — desktop | [Antes](../visual/handoff-007-10-2a/cirurgia-1-1440.png) | [Depois](../visual/handoff-007-10-2b/cirurgia-1440.png) |
| Pedido cirúrgico — 390px | [Antes](../visual/handoff-007-10-2a/cirurgia-1-390.png) | [Depois](../visual/handoff-007-10-2b/cirurgia-390.png) |
| Pedido cirúrgico — 320px | — | [Depois](../visual/handoff-007-10-2b/cirurgia-320.png) |
| Criação no perfil — desktop | [Três ações](../visual/handoff-007-10-2a/acoes-1440.png) | [Novo menu](../visual/handoff-007-10-2b/menu-1440.png) |
| Criação no perfil — mobile | [Antes](../visual/handoff-007-10-2a/acoes-390.png) | [390px](../visual/handoff-007-10-2b/menu-390.png) · [320px](../visual/handoff-007-10-2b/menu-320.png) |

Também foram capturados os cenários de um e três medicamentos/exames em 1440, 390 e 320px. Arquivos `prescricao-{1,3}-{largura}.png` e `exames-{1,3}-{largura}.png` no diretório de evidências.

## Verificação funcional e de acessibilidade

O teste novo compara o conteúdo estruturado completo, não apenas os nomes. Verifica UUID, posição, campos adjacentes, inclusão, remoção, recuperação simples/múltipla, último item, salvamento explícito e reabertura pela interface/RPC. Antes de salvar, confirma que a remoção local ainda não mudou o documento persistido.

A proteção foi verificada nos três editores: cancelar saída mantém o preenchimento; aceitar descarta; prévia limpa mostra a versão salva; prévia com edição pendente exige decisão consciente e mostra o conteúdo salvo anterior. A recarga cancelada e o histórico cancelado foram exercitados no Chromium. A identificação “RASCUNHO — NÃO ASSINADO / NÃO EMITIDO” continua presente.

O teste do menu usa Enter, Tab e Escape, verifica retorno do foco e cobre os três tamanhos. Um profissional sem habilitação médica não vê a criação e continua bloqueado ao acessar diretamente cada rota. As verificações existentes de documentos privados, autorias, confirmação, auditoria e Intelligence permanecem na suíte integral.

A verificação de layout mede ausência de overflow horizontal, altura suficiente das textareas e separação geométrica entre formulário e ações. As verificações de foco incluem novo item, adjacente e ação de adicionar quando a lista fica vazia.

A varredura axe-core já disponível nas dependências do projeto cobre o conteúdo principal dos editores, com regras WCAG 2 A/AA e 2.1 AA nos três tamanhos. [Resultados e verificações que exigem revisão manual](../visual/handoff-007-10-2b/acessibilidade.json). Isso complementa o teste de teclado; não é certificação WCAG nem substitui ensaio com leitor de tela.

## Resultados finais

| Verificação | Resultado |
|---|---|
| `npm run lint` | Aprovado, exit 0 |
| `npm run typecheck` | Aprovado, exit 0 |
| `npm run build` | Aprovado, exit 0 |
| `npm test -- --workers=1` | **68 aprovados**, zero falhas/ignorados; 5,2 minutos |
| Testes novos | Quatro aprovados: integridade/foco/responsividade; navegação/prévia; cirurgia extensa; menu/autorização |
| Axe-core 4.14.0 | **21 varreduras, zero violações e zero resultados incompletos** nas regras/escopo avaliados |
| Capturas novas | 33 PNGs reais; 1440, 390 e 320px |
| Arquivos de domínio protegidos | Idênticos a `4a581d7` |

Na execução paralela preliminar, o teste preexistente `catalog.spec.mjs:125` apresentou ausência do clube esperado no histórico. Passou na execução isolada (com os testes novos) e na suíte sequencial final, sem alteração do teste de catálogo ou da implementação esportiva. A causa da intermitência não foi comprovada; não se declara estabilidade da execução paralela a partir desta rodada. A validação integral acima corresponde à execução sequencial concluída.

Os dados fictícios específicos dos testes novos foram removidos; a consulta final encontrou zero contas com o prefixo exclusivo `ux-doc-`. As capturas/relatórios históricos que a suíte regenerou foram restaurados a partir do Git; somente as novas evidências deste handoff entram na entrega. Isso preserva os artefatos anteriores, inclusive o 007.10.2A.

[Registro resumido da validação](../visual/handoff-007-10-2b/validacao.json).

## Capitalização — pendência específica preservada

Não foi aplicada transformação de caixa, modificação do agente ou regravação de documentos. A integridade dos dados dos cenários inclui `HbA1c`, `β-hCG`, `mL`, `mg/mL`, `RM` e `LCA`.

**Permanece pendente reproduzir o caso concreto originalmente atribuído ao agente**, comparando entrada do profissional, proposta estruturada, JSON persistido e apresentação. O fato de o frontend preservar strings não resolve nem identifica por si só a causa desse caso. Nenhuma correção genérica de capitalização foi declarada.

## Limitações para homologação

- Mobile foi avaliado por viewport em Chromium; falta validação com teclado virtual e leitor de tela em dispositivos reais, incluindo Safari/iOS. O fallback das ações é estático em telas pequenas/toque para reduzir risco de sobreposição.
- Histórico protegido depende de eventos canceláveis/interceptáveis da Navigation API. Em navegadores sem esse suporte, links internos continuam protegidos e a proteção nativa cobre recarga/saída conforme disponibilidade; não se promete bloqueio de todo gesto de histórico nesses navegadores. Referência: [Navigation/navigate](https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event) e [NavigateEvent/intercept](https://developer.mozilla.org/en-US/docs/Web/API/NavigateEvent/intercept).
- `beforeunload` depende da política do navegador, de interação prévia e pode não ocorrer ao encerrar o aplicativo/processo no mobile.
- Textos extensos deixam a página maior porque ficam visíveis; não há compactação por ocultação ou acordeão obrigatório. Na faixa intermediária de largura, as ações permanecem no final do formulário.
- Recuperação de remoções existe na sessão local de edição, sem persistência após salvar/reabrir. Não é um sistema de histórico clínico ou de desfazer todas as edições.
- As confirmações nativas de saída podem ter redação e botões diferentes conforme navegador/idioma.

Sem merge ou publicação. A branch de implementação permanece separada para homologação.
