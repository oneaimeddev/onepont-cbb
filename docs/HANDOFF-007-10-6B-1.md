# Handoff 007.10.6B.1 — Revisar, assinar e demonstrar a intenção de entrega

20/11/2026. Branch dedicada `feat/handoff-007-10-6b-1-document-review`, criada a partir de `d29dd55` (007.10.6B completo). Workspace inicialmente limpo. A main `162b9a9` permanece preservada. Sem merge, push ou deploy.

## Nova jornada

**Preencher → Revisar → Simular assinatura.** A opção de WhatsApp demonstra somente uma intenção, sem transporte.

| Antes | Agora |
|---|---|
| Salvar rascunho manualmente antes da revisão | **Revisar e assinar** usa o conteúdo atual, inclusive alterações ainda não salvas |
| Abrir uma etapa separada de assinatura | Revisão documental central, com escolha de identidade na mesma tela |
| Clicar em Preparar versão demonstrativa | Preparação automática, no backend, somente ao confirmar a simulação |
| Autorizar uma versão previamente preparada | Revisão privada vinculada ao conteúdo e à versão; confirmação humana antes da orquestração |
| Resultado de assinatura sem opção de entrega | Intenção demonstrativa opcional; resultado explícito de que nenhum WhatsApp foi enviado |

Os três editores apresentam **Revisar e assinar** como ação principal e **Salvar rascunho** como secundária. A consulta opcional da versão salva permanece como utilitário, sem integrar a sequência obrigatória. A antiga ação de apresentação para revisão foi substituída nessa interface; o contrato clínico existente de `document_save` e os estados persistidos não foram alterados.

A revisão oferece os três caminhos principais: **Voltar e editar**, **Salvar sem assinar** e **Simular assinatura**. O formulário fica montado e oculto durante a revisão; voltar conserva valores, itens e seleção do editor, devolvendo o foco ao acionador. A escolha explícita de identidade é mantida nesse retorno, mas o consentimento é sempre renovado. A preferência apenas identifica uma opção; não seleciona nem autoriza automaticamente.

## Representação documental

`DocumentPreview` concentra os blocos clínicos de prescrição, pedido cirúrgico e exames. A variante de revisão acrescenta escudo CBB, identificação institucional, tipo, atleta, data, profissional, identificação cadastrada e uma área textual de assinatura ainda inexistente. Apresentações, doses, unidades, vias, posologias, orientações, exames, justificativas e procedimentos vêm exclusivamente do conteúdo canônico revisado.

Não há assinatura visual, QR, selo de validade, certificado verificado ou dado clínico completado pela aplicação. Campos ainda pendentes continuam identificados conforme a política existente. A identificação médica legada não é tratada como verificação de conselho.

O template `cbb-clinical-review-v1` é compartilhado na revisão e no resultado, e mantém os mesmos blocos clínicos da consulta da versão salva. Ele é o ponto de reutilização para uma futura renderização de artefato. **Não existe PDF final de produção nesta entrega e não se afirma equivalência visual com um PDF assinado.** O motor continua congelando JSON UTF-8 canônico e SHA-256 conforme o 007.10.6B.

## Persistência e orquestração

A migration aditiva `20261120000300_document_review_delivery_demo.sql` acrescenta somente o suporte necessário à nova jornada:

| Recurso | Responsabilidade |
|---|---|
| `clinical.document_reviews` | Cópia de trabalho privada, tipo/conteúdo canônico, hash, profissional, atleta, UUID estável de documento, versão esperada, material revisado, destinatário demonstrativo, validade e correlação de idempotência |
| `clinical.signature_demo_delivery_intents` | Intenção isolada de demonstração por tentativa, com `provenance=demo`, `state=demo_intent_no_send`, `recipient_authorized=false` e `eligible_for_real=false` impostos por CHECK |
| `public.document_review_command` | Abrir/consultar revisão; salvar sem assinar; persistir, preparar e confirmar a simulação de maneira transacional |
| `public.document_demo_delivery` | Consulta autorizada da intenção demonstrativa de uma tentativa própria |
| `POST /api/documents/review` | Sessão, perfil, mesma origem, limite de JSON e gate de ambiente para a ação de simulação |

Abrir uma revisão **não insere um documento clínico, revisão clínica, snapshot de assinatura ou tentativa**. A cópia de trabalho é privada, pode expirar em 30 minutos e não é um registro clínico definitivo. O UUID do futuro documento permanece o mesmo durante o fluxo. Um retry da mesma abertura reutiliza sua chave; voltar intencionalmente ao editor e revisar de novo cria uma revisão atualizada e exige novo consentimento.

**Salvar rascunho** usa a mesma RPC `document_save`, com intenção `save`, e trata falhas no próprio formulário. **Salvar sem assinar** persiste o conteúdo revisado pelo mesmo contrato, apresenta confirmação e oferece o documento salvo como destino. Nenhuma dessas ações cria tentativa de assinatura. Conteúdo editado durante uma gravação assíncrona não é descartado; a versão enviada é reconhecida e o formulário mantém as alterações posteriores.

**Simular assinatura** exige identidade escolhida e confirmação vinculada à revisão. Em uma transação:

1. Revalida sessão, autoria médica operacional e vínculo com o atleta.
2. Bloqueia o profissional e o documento, confere versão, hash, template e identificação revisada.
3. Persiste pelo `document_save` existente, preservando autoria, UUID e política de revisões.
4. Chama `signing_demo_command('prepare')` para o snapshot imutável e hash existentes.
5. Chama `signing_demo_command('confirm')` para uma tentativa idempotente com a identidade escolhida.
6. Registra, quando solicitada, a intenção exclusivamente demonstrativa de entrega.
7. Correlaciona auditoria e devolve resultado retomável pela URL existente da assinatura.

Se qualquer etapa posterior à persistência falhar, o bloco transacional desfaz conjuntamente documento/revisão clínica, snapshot e tentativa dessa execução. A falha recebe evento sanitizado fora desse sub-bloco. A interface mantém o conteúdo revisado para correção/repetição. Uma resposta perdida depois do commit é recuperada pela mesma chave, sem nova versão, snapshot ou tentativa.

```mermaid
sequenceDiagram
  participant M as Profissional
  participant E as Editor
  participant R as Revisão privada
  participant C as RPC clínica existente
  participant S as Motor 007.10.6B
  M->>E: Preencher
  E->>R: Revisar conteúdo atual e versão
  R-->>M: Documento + identidade + opção demo de entrega
  M->>R: Confirmar simulação
  R->>C: Salvar de forma idempotente
  R->>S: Preparar e confirmar automaticamente
  S-->>R: Tentativa e resultado simulado
  R-->>M: Documento não assinado; nenhum WhatsApp enviado
```

## Segurança e preservações

As tabelas novas têm RLS habilitada e nenhum grant direto de leitura/escrita para usuários autenticados ou anônimos. O ator é derivado de `auth.uid()`. Revisões alheias, documentos sem autorização e identidades de outro profissional são rejeitados. Uma falha por identidade alheia não deixa documento ou snapshot parcial.

O lock e as proteções de concorrência do motor original continuam ativos, inclusive entre preparações distintas da mesma versão. Alteração de conteúdo, versão, identificação profissional revisada, atleta ou destinatário relevante exige nova revisão. Revisão vencida e troca de identidade não reaproveitam a confirmação antiga. Datas de apresentação usam America/Sao_Paulo; os hashes do motor preservam a normalização existente em UTC.

O gate de servidor do 007.10.6B continua bloqueando a simulação em ambiente operacional, e o gate independente do banco continua sendo obrigatório. Revisar e salvar sem assinar funcionam mesmo sem identidade ou com o simulador indisponível. A interface não fabrica certificados nesse caso.

As migrations anteriores, o `document_save`, o modelo dos atletas, os privilégios clínicos, a autoria histórica e as revisões já existentes permanecem intactos. O resultado simulado continua com `cryptographically_signed=false`, `certificate_verified=false`, sem artefato assinado e sem promoção do status clínico para assinado.

Não houve mudança no Gemini, voz, busca clínica, CSV ou anexos. Nenhuma ferramenta de assinatura foi registrada no agente. Os P0 de ciclo de vida de conversas identificados no 007.10.4A permanecem fora deste escopo; a única entrada de assinatura continua sendo a jornada tradicional do documento, com sua autorização própria.

## Destinatário e intenção de WhatsApp

A opção **Enviar ao atleta por WhatsApp após assinar (demonstração)** inicia desligada. Ao selecioná-la, são apresentados nome, relação, categoria e somente telefone mascarado. A escolha invalida a confirmação anterior para exigir consentimento atual.

Os contatos cadastrais exigem a permissão `can_edit` já usada pelo cadastro existente. Sem ela, o backend devolve destinatário indisponível, sem nome de responsável, telefone ou indicação de existência de contato. Se essa permissão for revogada após a abertura, uma nova consulta também redige os metadados do destinatário; uma intenção ligada a dados antigos não é confirmada.

Para menor de idade, o candidato demonstrativo é o responsável cadastrado; não há fallback silencioso para o telefone do atleta. Ausência de responsável/contato e idade desconhecida ficam explícitas. Um telefone cadastrado nunca é considerado consentimento para documentos clínicos: **todos os candidatos permanecem não autorizados para entrega real**. A autorização institucional de responsáveis e o tratamento específico de conteúdo sensível continuam necessários para uma integração futura.

Após sucesso simulado com a opção ligada: **Envio não realizado — integração indisponível**. Nos demais resultados, fica explícita a intenção sem envio. Se a opção permanecer desligada, o resultado informa **Envio não solicitado**.

A intenção demo não é uma fila, não contém destinatário autorizado ou referência de artefato validado e não pode ser convertida para elegível por alteração de um booleano: os CHECKs a impedem. Não há worker, transporte, endpoint Z-API, callback ou chamada de rede de WhatsApp. Um estado de entrega não modifica o resultado de assinatura.

O contrato `DocumentDeliveryExtension` foi refinado para prever documento, versão, artefato de produção validado, remetente, referência de destinatário autorizado, consentimento explícito, canal, idempotência, estado, auditoria e recuperação de falha. Sua implementação futura terá de revalidar essas referências no servidor; flags do cliente não são autoridade. O fornecedor futuro permanece Z-API, sem dependência ou integração nesta entrega. A escolha entre link protegido e anexo exige política própria futura.

## Auditoria

Eventos novos identificam abertura de revisão, salvamento sem assinatura, autorização demonstrativa, falha de commit e intenção demonstrativa. São usados UUIDs, versão, hash e indicadores de simulação/elegibilidade. Nenhum texto clínico, telefone, nome de destinatário, token ou senha é copiado para metadados técnicos. O conteúdo da revisão fica na tabela privada, separado dos eventos de auditoria. Os eventos preexistentes não foram modificados.

## Arquivos principais

- `src/features/documents/editors.tsx`: ações primária/secundária, revisão do conteúdo atual e persistência com recuperação.
- `src/features/documents/editor-controls.tsx`: contexto local de revisão, manutenção do formulário e guarda de saída até confirmação de persistência.
- `src/features/documents/review-panel.tsx`: revisão central, identidade, consentimento, intenção demo e resultado.
- `src/features/documents/review-client.ts` e `review-types.ts`: contrato interno e erros recuperáveis.
- `src/features/documents/preview.tsx` e `documents.css`: template compartilhado e composição responsiva.
- `src/features/signing/journey.tsx` e rota de assinatura: retomada e compatibilidade com os snapshots/tentativas existentes, sem botão manual de preparação.
- `src/features/signing/contracts.ts`: extensão futura de entrega, sem transporte.
- `src/features/signing/request.ts`: limite de stream parametrizável; a API de revisão aceita até 100 KB, mantendo os limites canônicos clínicos e o padrão anterior de 16 KB para demais chamadas.
- `src/features/signing/signing.css`: correção pontual de overflow do botão de conexão no perfil em 320 px.
- `src/app/api/documents/review/route.ts`: fronteira autenticada das operações.
- Migration `20261120000300_document_review_delivery_demo.sql`: recursos aditivos e orquestração segura.
- `tests/document-review.spec.mjs`: cenários novos; testes existentes de documentos e assinatura atualizados apenas nas entradas de UX e na limpeza de suas fixtures.

## Evidências reais

Playwright JavaScript e Chromium headless, sem janela visível. Pessoas, documentos e telefones são fictícios. A suíte remove suas próprias fixtures e não modifica contas ou dados de apresentação existentes.

| Evidência | Desktop | Mobile |
|---|---|---|
| Editor de prescrição | [1440](visual/handoff-007-10-6b-1/editor-prescription-1440.png) | Revisão abaixo |
| Editor de cirurgia | [1440](visual/handoff-007-10-6b-1/editor-surgical_order-1440.png) | Revisão abaixo |
| Editor de exames | [1440](visual/handoff-007-10-6b-1/editor-exam_request-1440.png) | Revisão abaixo |
| Revisão da prescrição | [1440](visual/handoff-007-10-6b-1/revisao-prescription-1440.png) | [390](visual/handoff-007-10-6b-1/revisao-prescription-390.png) · [320](visual/handoff-007-10-6b-1/revisao-prescription-320.png) |
| Revisão cirúrgica | [1440](visual/handoff-007-10-6b-1/revisao-surgical_order-1440.png) | [390](visual/handoff-007-10-6b-1/revisao-surgical_order-390.png) · [320](visual/handoff-007-10-6b-1/revisao-surgical_order-320.png) |
| Revisão de exames | [1440](visual/handoff-007-10-6b-1/revisao-exam_request-1440.png) | [390](visual/handoff-007-10-6b-1/revisao-exam_request-390.png) · [320](visual/handoff-007-10-6b-1/revisao-exam_request-320.png) |
| Identidade e envio demo | [1440](visual/handoff-007-10-6b-1/identidade-envio-demonstrativo-1440.png) | [Responsável](visual/handoff-007-10-6b-1/destinatario-menor-390.png) |
| Resultado sem envio | [1440](visual/handoff-007-10-6b-1/resultado-envio-indisponivel-1440.png) | [390](visual/handoff-007-10-6b-1/resultado-envio-indisponivel-390.png) · [320](visual/handoff-007-10-6b-1/resultado-envio-indisponivel-320.png) |
| Salvar sem assinar | — | [Prescrição](visual/handoff-007-10-6b-1/salvo-sem-assinar-prescription-390.png) · [Cirurgia](visual/handoff-007-10-6b-1/salvo-sem-assinar-surgical_order-390.png) · [Exames](visual/handoff-007-10-6b-1/salvo-sem-assinar-exam_request-390.png) |
| Erros | [Persistência](visual/handoff-007-10-6b-1/erro-persistencia-1440.png) | [Validação](visual/handoff-007-10-6b-1/erro-validacao-390.png) · [Resposta perdida](visual/handoff-007-10-6b-1/erro-resposta-perdida-390.png) |
| Destinatário ausente | — | [Adulto](visual/handoff-007-10-6b-1/destinatario-ausente-390.png) · [Menor sem responsável](visual/handoff-007-10-6b-1/destinatario-menor-sem-responsavel-390.png) |

## Verificação e aceite

- Suíte automatizada integral: **114/114 aprovados** na rodada final.
- Aceite direcionado final: **24/24 aprovados**, sendo 22 cenários da jornada e dois de perfil/conta. A rodada direcionada anterior dos editores e motor aprovou 40/40 casos.
- `npm run lint`, `npm run typecheck` e `npm run build`: aprovados.
- Nove verificações axe A/AA/2.1 nas revisões de prescrição, cirurgia e exames em 1440/390/320: nenhuma violação automática verificada. As verificações de conta/perfil também passaram nas três larguras.
- Entrada na revisão e retorno ao acionador por teclado conferidos; nenhuma rolagem horizontal nas revisões ou perfil nas larguras avaliadas.
- Comparação de conteúdo, nome do atleta e identificação profissional entre revisão e snapshot aprovada. A representação usa o mesmo nome completo do motor e apresenta a data do documento, sem alegar horário de criação clínica antes da persistência.
- Resposta perdida após commit recuperada sem duplicar documento, versão clínica, snapshot, tentativa ou intenção. Identidade alheia e bloqueio do adaptador desfazem integralmente os passos intermediários.
- Ausência de tráfego externo da interface durante a simulação verificada com bloqueio/interceptação de egress. Não há código de transporte Z-API no módulo.
- O modo operacional permite revisar e salvar, mas rejeita simulação. A intenção demo permanece inelegível mesmo sob tentativa de alterar seus campos no banco; isso não altera o resultado de assinatura.
- Durante a primeira rodada integral foi identificado overflow do botão de conexão no perfil em 320 px com simulador habilitado. Corrigida exclusivamente a quebra de linha dos botões dessa seção, sem redesign do perfil; o caso e toda a suíte passaram após a correção.

[Validação estruturada](visual/handoff-007-10-6b-1/validacao.json) · [RLS e constraints reais](visual/handoff-007-10-6b-1/modelo-controles.json).


| Requisitos do handoff | Evidência de cobertura |
|---|---|
| 1–10: criação, revisão, retorno e persistência | Três tipos sem documento clínico antes de salvar; volta/alteração/retomada; validação; falha de rede; versão concorrente e histórico |
| 11–25: identidade e assinatura | Preferência sem seleção automática; troca invalida consentimento; orquestração sem preparação manual; sucesso/negativa/expiração/falha/cancelamento; duplicidade; profissional/identidade alheios; impossibilidade de assinatura real |
| 26–34: entrega | Opção desligada/ligada; contato ausente, restrito e revogado; menores com/sem responsável; ausência de egress na interface; intenção inelegível; falha/indisponibilidade sem alteração de assinatura |
| 35–44: regressão e apresentação | Suíte integral, editores de múltiplos itens, revisões existentes, Intelligence, permissões, auditoria e voz; nove avaliações de acessibilidade nas três revisões em 1440/390/320; foco de entrada e retorno e ausência de overflow |

## Migração, Git e limites

Apenas a nova migration foi aplicada à instância local, em transação e com registro de versão; não houve reset ou seed. A lacuna histórica do controle de migrations `20261115000900`, já documentada no 007.10.6B, não foi reaplicada nem reparada neste escopo. Nenhuma migration anterior foi alterada.

As cópias de trabalho expiram para autorização, mas não receberam política automática de purga. Não foi presumida uma política de retenção ou exclusão de conteúdo clínico. O backend mantém metadados privados e controles de acesso; uma política de retenção para esse recurso deverá ser aprovada antes de produção.

Continuam fora: assinatura criptográfica real, PDF de produção, verificação institucional de conselhos, transporte WhatsApp, autorização real de destinatário e resolução dos P0 de conversas. Foram preservados os pontos de extensão, sem representar esses recursos como implementados.

Branch e commit finais registrados na entrega. Homologação necessária antes de merge, push ou publicação.
