# Correção — Novo documento e edição de múltiplos itens

Implementação sobre `269b8f6`, na branch `fix/document-menu-and-item-navigation`. Sem merge. O estado inicial estava limpo.

## Problemas e correções

**Menu deslocado:** o contêiner do botão esticava até o final da coluna do cabeçalho. O dropdown usava a borda direita desse contêiner, ficando distante do botão. O contêiner agora acompanha o botão e o menu se ancora à esquerda dele. No mobile, continua no fluxo, com largura disponível. O teste compara as coordenadas reais do botão/menu em 1440, 390 e 320px; Escape, Tab, seleção e autorização permanecem cobertos.

**Formulários empilhados:** o modo inicial agora mostra um medicamento ou exame por vez. Uma lista compacta “Medicamento/Exame em edição” identifica os itens por número e nome. “Adicionar” fica junto dessa navegação, em vez de deslocar o usuário até outro formulário no fim de uma lista longa.

Adicionar seleciona o novo UUID e foca seu nome na mesma área de edição. Alternar não apaga o preenchimento. Remover seleciona o adjacente; desfazer restaura campos, identificador e posição e seleciona o item recuperado. As operações continuam locais até salvar explicitamente.

“Conferir todos” abre a lista completa, permitindo revisar todos os campos de todos os itens. “Editar por item” retorna ao modo individual. Não há acordeão obrigatório, nova página por item ou alteração da persistência. Trocar de item/modo não cria alterações clínicas pendentes por si só.

A rolagem automática não percorre mais formulários empilhados no modo individual. O foco usa `preventScroll`; só há ajuste mínimo se o campo estiver fora da área visível. A compensação automática de âncora de rolagem foi desativada no escopo de edição. No modo de conferência completa, o deslocamento até um item permanece possível e intencional.

O teste de estabilidade mede o formulário nas coordenadas do documento e verifica adições consecutivas sem salto de rolagem. A medição começa depois de o botão estar disponível para clique, evitando confundir o ajuste do próprio Playwright diante do cabeçalho sticky com uma mudança provocada pelo editor. Em mobile, revelar inicialmente o nome fora da tela continua permitido para preservar foco visível.

## Preservação

Nenhuma mudança em campos, limites, payloads, UUIDs persistidos, salvamento, confirmação, RPCs, banco, autorização, auditoria ou agente. O pedido cirúrgico mantém sua composição anterior. A proteção de saída, prévia da versão salva e recuperação local continuam ativas. As capturas dos handoffs anteriores foram preservadas.

## Capturas

| Cenário | Antes | Depois |
|---|---|---|
| Menu desktop | [Menu anterior](../visual/handoff-007-10-2b/menu-1440.png) | [Menu ancorado](../visual/fix-document-navigation/menu-1440.png) |
| Menu mobile | [Anterior](../visual/handoff-007-10-2b/menu-390.png) | [390px](../visual/fix-document-navigation/menu-390.png) · [320px](../visual/fix-document-navigation/menu-320.png) |
| Medicamentos | [Formulários empilhados](../visual/handoff-007-10-2b/prescricao-6-1440.png) | [Edição individual desktop](../visual/fix-document-navigation/editar-prescription-1440.png) · [390px](../visual/fix-document-navigation/editar-prescription-390.png) · [320px](../visual/fix-document-navigation/editar-prescription-320.png) |
| Exames | [Formulários empilhados](../visual/handoff-007-10-2b/exames-6-1440.png) | [Edição individual desktop](../visual/fix-document-navigation/editar-exam_request-1440.png) · [390px](../visual/fix-document-navigation/editar-exam_request-390.png) · [320px](../visual/fix-document-navigation/editar-exam_request-320.png) |

Dados fictícios. O cenário individual inicia com seis itens e adiciona dois por tamanho de tela, exercitando oito, dez e doze itens, com apenas um formulário aberto. As outras capturas `prescricao-*` e `exames-*` do diretório desta correção mostram a opção de conferência completa com um, três e seis itens.

## Arquivos

- `src/features/documents/create-menu.css`: ancoragem ao botão.
- `src/features/documents/editor-controls.tsx`: seleção por UUID, foco e navegação de itens; textarea evita medir elementos ocultos e recalcula ao ficarem visíveis.
- `src/features/documents/editors.tsx`: aplicação da navegação em medicamentos/exames; cirurgia preservada.
- `src/features/documents/documents.css`: seletor e visibilidade dos itens.
- `tests/document-editor-ux.spec.mjs`: regressão da ancoragem e fluxo individual, além dos testes de integridade/conferência completa existentes.
- `tests/documents.spec.mjs` e `tests/exam-request.spec.mjs`: seleção explícita de “Conferir todos” nos cenários que editam vários formulários ao mesmo tempo.

## Validação

- `npm run lint`: aprovado, exit 0.
- `npm run typecheck`: aprovado, exit 0.
- `npm run build`: aprovado, exit 0.
- `npm test -- --workers=1`: **69 testes aprovados**, sem falhas ou ignorados; 5,5 minutos.
- Teste novo: edição individual de medicamentos/exames em 1440, 390 e 320px, mantendo o formulário na mesma posição; inclusão consecutiva sem salto de rolagem, foco visível, alternância, remoção/desfazer e reabertura, chegando a doze itens.
- Regressão do menu: alinhamento real entre botão e dropdown nas três larguras, além de teclado, Escape e autorização.
- Axe: 21 varreduras, zero violações nas regras avaliadas. As varreduras abrangem o conteúdo principal dos editores na conferência completa; não são certificação WCAG.
- 39 capturas reais, incluindo os dois modos, menu e cenários anteriores de um/três/seis itens.

Os artefatos históricos regenerados pela suíte foram restaurados no Git, preservando as evidências anteriores. Os dados temporários dos testes novos foram removidos ao encerrar os testes.

[Resultados de acessibilidade](../visual/fix-document-navigation/acessibilidade.json) · [Registro de validação](../visual/fix-document-navigation/validacao.json).

As limitações de dispositivo real e de suporte à proteção de histórico documentadas no 007.10.2B permanecem. A pendência de reproduzir a capitalização produzida pelo agente também permanece; esta correção não altera grafias clínicas.
