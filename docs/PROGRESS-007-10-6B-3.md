# Progresso — 007.10.6B.3

Atualizado em 20/11/2026. Baseline: main/origin/main `51c1426`, workspace inicialmente limpo. Branch: `feat/handoff-007-10-6b-3-intelligence-journey`.

Especificação completa: [specs/HANDOFF-007-10-6B-3.md](specs/HANDOFF-007-10-6B-3.md). O adendo de execução com orçamento limitado (~19% informado pelo usuário) tem prioridade: concluir e testar um corte antes de abrir o próximo; commits verificáveis; nenhuma capacidade clínica parcial exposta; nenhum reset/descarte; manter retomada documentada; sem suíte integral a cada corte; preservar validações críticas.

## Estado dos cortes

| Corte | Estado | Entrega |
|---|---|---|
| A — Segurança conversacional | Concluído e validado neste checkpoint | Quatro P0 corrigidos; resultados abaixo |
| B — Infraestrutura de capacidades | Concluído e validado | Catálogo, estado persistente e autorização segura; execução clínica desabilitada |
| C — Criação/alterações | Em andamento; apenas base interna validada | Patch por UUID/CAS preparado, sem exposição ou aplicação permanente da migration |
| D — Assinatura/entrega | Não iniciado | Confirmação contextual, integração compartilhada e retentativas |
| E — UX/homologação | Não iniciado | Preview, voz, histórico, mobile, paridade e regressão final |

**O handoff completo ainda não está concluído nem homologado.** O checkpoint atual preserva A/B concluídos e registra a base interna de C. C ainda não foi entregue funcionalmente ao usuário. A nova jornada de assinatura/entrega pelo chat não está habilitada. O fluxo tradicional do B.2 foi preservado.

## Corte A — implementação

### P0-1 — Retomada de sessão encerrada

`conversation_resume` só aceita sessões próprias, autorizadas e `active`/`idle`. `closed` e `archived` não voltam a ativas. Tentativa recusada não encerra a outra sessão ativa. `conversation_history_read` permite consulta própria, autorizada e somente leitura, sem transição de estado. A integração visual desse histórico somente leitura permanece para os cortes seguintes; o botão antigo de retomada de uma conversa encerrada recebe recusa segura.

### P0-2 — Confirmações após encerramento/arquivamento

Guards no banco verificam a sessão vinculada à proposta, estado ativo, profissional e permissões atuais. Locks de sessão e leitura compartilhada do vínculo de acesso permanecem até o fim da transação. Aplicados aos caminhos de aprovação, commit, confirmação de card/texto/voz e armazenamento de documentos, incluindo as três categorias documentais e evoluções. Uma confirmação com identificador de sessão/proposta anterior não pode atingir outra proposta na sessão nova.

Os contratos manuais históricos sem proposta conversacional continuam passando pelas suas validações clínicas originais, sem criar uma API clínica duplicada. Implementações renomeadas são privadas, com execução revogada para clientes. As qualificações de argumentos PL/pgSQL foram ajustadas aos nomes privados, preservando a semântica original.

### P0-3 — Associação da proposta

`clinical_draft_proposal_attach` qualifica explicitamente os parâmetros e valida ator, atleta, encontro e registro. Repetição idempotente funciona; vínculo alheio ou incorreto é recusado. O commit registra o vínculo com a proposta na mesma transação do salvamento. A server action não ignora mais o resultado de uma associação posterior: a chamada redundante foi removida, pois o vínculo já é transacional.

### P0-4 — Revogação e histórico

Nova versão de autorização por profissional (`conversation_security_epochs`), capturada ao criar sessão. Perda de acesso de leitura, perda de acesso cadastral/contato, revogação da autoria médica e restrição de visibilidade/autoria de registro invalidam o histórico anterior. A leitura é recusada integralmente, incluindo texto livre, nomes, cards, prévias, análises e referências. Regrant não reativa automaticamente esse histórico.

A invalidação é conservadora e pode atingir outras conversas do profissional: textos livres antigos não possuem atribuição clínica confiável por trecho. **Histórico legado não vazio, sem versão de autorização, permanece armazenado mas não é reapresentado.** Não há apagamento nem tentativa de inferir segurança por palavras. Sessões legadas vazias podem receber a versão corrente. Deve-se iniciar outra conversa para trabalhar após invalidação.

No endpoint principal, o histórico enviado pelo cliente deixa de ser autoridade para contexto do modelo: mensagens anteriores vêm da persistência autorizada; só a entrada atual do usuário vem da requisição. Uma sessão invalidada bloqueia a chamada ao modelo e a criação de token de voz. Os endpoints de leitura de recursos continuam usando as permissões clínicas existentes.

A proteção vale para novas consultas/requisições; não promete apagar conteúdo já recebido pelo navegador ou pelo profissional antes da revogação.

### Feedback de erro

A recusa de abrir uma sessão agora tem prioridade sobre a mensagem genérica de provedor indisponível no composer. Sem mudança visual/redesign. Esse ajuste torna a proteção compreensível mesmo quando o assistente está desabilitado.

## Migração e preservação

`supabase/migrations/20261120000500_conversation_security_p0.sql` aplicada transacionalmente apenas ao Supabase local e registrada. Hash do SQL registrado conferido com o arquivo. Nenhum reset, reaplicação geral ou alteração das migrations anteriores. A lacuna histórica de migrations previamente documentada continua intacta.

RLS e revogação de grants protegem a tabela nova e os auxiliares. Verificação no banco: **0 funções de implementação `_before_b3` executáveis por `authenticated`**. Não foram concedidas permissões clínicas por alteração de perfil. Nenhum conector ou chamada real de assinatura/WhatsApp foi adicionado.

## Validação do corte A

**Novos:** 15 testes backend parametrizados e 1 de API. Cobrem os quatro P0, três tipos de documento, texto/voz/card, evolução, isolamento entre profissionais, associação transacional/idempotência, sessão nova versus confirmação antiga, revogação/regrant, contatos, autoria médica, restrição assistencial e preservação do legado sem replay. A API verifica bloqueio antes do modelo/token de voz e ausência do texto protegido na resposta. Dados exclusivamente fictícios, removidos ao fim das fixtures.

**Reutilizados:** regressões de evolução, confirmação falada, documentos pelo agente, exames pelo agente, Intelligence e os 23 testes do motor tradicional de finalização/entrega. As asserções tradicionais foram mantidas, exceto a expectativa antiga de reabrir sessão encerrada, substituída por recusa e consulta somente leitura.

Resultados:

- Primeiro lote de segurança: 13/13 aprovados após corrigir as qualificações das funções privadas.
- Lote direcionado de integração: 42/43 aprovados; a falha era a expectativa antiga de retomada de sessão encerrada.
- Revalidação final de API/Intelligence, após ajuste do contrato e feedback de erro: 2/2 aprovados.
- Restrição assistencial e isolamento dos helpers privados: 1/1 aprovado.
- Auditoria das recusas de retomada (`closed`/`archived`): 2/2 aprovados na revalidação final.
- **44 cenários direcionados têm validação positiva entre lote e retestes.** Não se afirma uma execução única de 44/44; os comandos e falhas estão discriminados acima.
- `npm run lint`, `npm run typecheck`, `npm run build`: aprovados no código final de produção deste corte. `git diff --check` conferido no fechamento.
- Suíte integral: **não executada**, pois B–E estão pendentes. Será feita no fim da branch estável, conforme a política de recursos.
- Capturas: não produzidas neste corte de segurança; evidências reais da jornada ficam para E. Validação de API em Chromium headless, sem janela de navegador.

Comandos principais:

```sh
npm run test:conversation-security
npx playwright test tests/conversation-security.spec.mjs tests/conversation-security-api.spec.mjs tests/spoken-draft.spec.mjs tests/document-agent.spec.mjs tests/exam-agent.spec.mjs tests/clinical-draft.spec.mjs tests/intelligence.spec.mjs tests/workflow-backend.spec.mjs --project=app --workers=1 --reporter=line
npx playwright test tests/intelligence.spec.mjs tests/conversation-security-api.spec.mjs --project=app --workers=1 --reporter=line
npx playwright test --config playwright.security.config.ts --grep "restrição assistencial"
```

## Corte B — infraestrutura concluída

Contrato técnico: [CHAT-OPERATIONS-CONTRACT.md](CHAT-OPERATIONS-CONTRACT.md).

- Catálogo de 21 capacidades explícitas, com schemas Zod estritos, permissões, confirmação, auditoria, serviços e resultados. Nenhuma ferramenta nova exposta ao modelo. Operações reservadas não são anunciadas como executáveis.
- Workspaces persistentes referenciam a revisão compartilhada (`document_review_command`), sem copiar o modelo clínico. Contexto ativo, revisão CAS, identidade explícita e intenção de entrega sobrevivem a recarga.
- Desafios imutáveis vinculam ator, sessão, epochs, atleta, documento, versão/hash/composição, revisão, identidade/conexão, modo, política/destinatário, expiração e chave de idempotência.
- Apresentação exige nonce e hash exatos, atestados por fronteira de backend. Entrada humana vem da requisição HTTP autenticada; produtor de prova e apresentação são exclusivos de `service_role`. O modelo e o cliente não podem inventar ator, origem ou confirmação por booleano.
- Contador monotônico exige entrada posterior à apresentação. “Sim” só funciona para exatamente um desafio apresentado pendente e compatível. Pergunta, condicional, negação e conteúdo atribuído ao assistente não autorizam. Entrada rejeitada não revive depois.
- Revalidação de estado da sessão, inatividade, epochs, acesso, revisão, identidade/conexão, destinatário/política, gate e expiração. Alteração/contexto ida-e-volta não reaproveita autorização. Concorrência usa lock e CAS.
- Recibo de autorização imutável, recuperável e idempotente, com auditoria `ai_chat`/`human_message`, sem duplicar confirmação de sucesso. Metadados técnicos não copiam texto, documento, nonce ou telefone integral.
- Gateway técnico `/api/inteligencia/operacoes`: autenticação/perfil, mesma origem, schemas estritos, limite de 16 KiB e gate de ambiente. Sem ligação à UI ou ao conjunto de ferramentas do modelo nesta etapa.
- **Autorizar não executa:** as respostas de estado, desafio e confirmação informam `executionEnabled: false`. Não salva documento clínico, cria snapshot de assinatura, assina, finaliza ou envia. O corte D deverá criar execução idempotente e repetir as validações na transação do domínio; recibo não é resultado de assinatura nem dispensa revalidação.
- Confirmação por voz continua indisponível no gateway e no consumidor. A habilitação depende dos cortes D/E e de provas da intenção; nenhuma alegação de suporte funcional por voz foi feita.

Migração aditiva `20261120000600_chat_operation_authorizations.sql`, aplicada e registrada somente no Supabase local, preservando as anteriores e a lacuna histórica. RLS e grants restritos; vínculos sem cascatas destrutivas. A limpeza compartilhada de fixtures passou a remover apenas evidências operacionais dos profissionais fictícios, antes das referências clínicas.

### Testes do corte B

- Primeira validação backend: 21/21 aprovados.
- Validação final: **62/62 aprovados numa única execução**, composta por 22 testes backend do protocolo/catálogo, 2 de API autenticada, 15 de segurança do corte A e 23 do motor tradicional B.2.
- Inclui três documentos; estado recuperável; origem humana; ausência de execução clínica; apresentação e sequência; perguntas/condicionais; voz bloqueada; versões antigas; estado/contexto; expiração; concorrência; idempotência; ausência de destinatário; responsável do menor; contatos alterados; revogação; desconexão; gates; payload com ator/modo/booleanos forjados; schema/comando desconhecido; provas imutáveis; origem de auditoria; testes de regressão de finalização e entrega.
- `npm run lint`, `npm run build`, `npm run typecheck`: aprovados. Uma tentativa inicial de lint em paralelo coincidiu com a remoção de `test-results` pelo Playwright; reexecutado sequencialmente com sucesso, sem alterar regras para ocultar erros.
- `git diff --check` e correspondência entre SQL registrado/arquivo conferidos no fechamento.
- Suíte integral não executada: C–E estão pendentes e não houve razão para repetir módulos não relacionados. Capturas de nova UX ficam para E; os testes de API usaram Chromium headless sem janela visível.

```sh
npm run test:chat-operations
npx playwright test tests/chat-operations.spec.mjs tests/chat-operations-api.spec.mjs tests/conversation-security.spec.mjs tests/workflow-backend.spec.mjs --project=app --workers=1 --reporter=line
```

## Corte C — checkpoint interno, integração ainda pendente

Commit `05f9857` — `feat: stage private versioned document edits without chat exposure`.

- A proposta clínica existente é a autoridade editável; não há outra cópia editável de conteúdo, outro motor clínico ou substituição do registro/salvamento legado.
- Preparados helpers **privados em `clinical`** para leitura autorizada e alterações esparsas (`set_field`, `append_field`, `add_item`, `remove_item`, `reorder_items`). Referências de itens usam UUID. Campos não mencionados e grafia são preservados; limites/enums usam o canonicalizador existente. Append verifica o tamanho combinado, evitando truncamento silencioso.
- Lock do profissional/sessão, contexto do atleta, acesso atual, CAS da proposta, ledger de idempotência e evento de auditoria sem corpo clínico. Proposta salva exige versão clínica correspondente; alteração externa impede trabalhar sobre a referência antiga.
- Patch invalida desafios pendentes já associados ao mesmo identificador lógico. **Isso ainda não constitui o vínculo completo de revisão/autorização:** rebinding de revisão, fonte/versão no workspace e revalidação de recibos confirmados dependem da integração seguinte e são necessários antes de exposição.
- Sem wrappers públicos, grants para `anon`/`authenticated`/`service_role`, ferramenta do modelo, gateway, botão ou integração de produção. Nada novo de C está anunciado como disponível. Não houve mudança em assinatura, entrega, revisão ou salvamento da aplicação atual.
- Migration `20261120000700_conversational_document_edits.sql` está **preparada no Git, não aplicada nem registrada permanentemente no banco local**. Os testes executam a migration e as operações dentro de transações com `ROLLBACK`; as fixtures usam somente atletas/profissionais fictícios. O runner também aceita o schema já instalado futuramente.

### Validação deste checkpoint C

- **25 testes novos** de backend: três documentos, UUID/ordem, campos preservados, grafia, CAS, repetição idempotente, auditoria única, falha atômica, formatos/limites inválidos, usuário alheio, sessão encerrada/arquivada, troca de atleta, revogação, ambiguidade, grants privados e versão alterada pela interface tradicional.
- Reutilizados **22 testes do protocolo B + 15 testes P0 de A** (37 regressões diretamente relacionadas).
- Lote de 62: **61/62 aprovados**. A única falha era uma asserção do teste novo esperando `ok` no retorno de `document_save`; esse contrato retorna `id`/`version`. A fixture foi aprimorada para salvar e depois alterar pelo serviço tradicional real antes de verificar a recusa da proposta antiga.
- Reteste final direcionado: **2/2 aprovados** (alteração externa e grants, estes ampliados para verificar também INSERT na tabela privada). Há evidência positiva para os 62 cenários únicos entre lote e reteste; não se afirma uma execução final única 62/62.
- `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check`: aprovados após as alterações. Sem browser visível, nova captura ou chamada paga à IA neste checkpoint de backend.
- Suíte integral não executada: C/D/E ainda pendentes; política do adendo reserva essa execução ao fim da branch estável. Não se repetiram os módulos tradicionais B.2 porque nenhum caminho de produção foi ligado ou modificado neste checkpoint.
- **Não validados ainda:** interpretação natural integrada, criação/revisão/preview no chat, reconstrução após recarga, concorrência real da jornada integrada, invalidação completa de workspaces/recibos, assinatura/finalização/entrega pelo chat e voz. Estes continuam requisitos de C–E, sem alegação de prontidão.

```sh
npx playwright test --config playwright.document-edits.config.ts
npx playwright test --config playwright.document-edits.config.ts --grep "saved document changed|new functions are not exposed"
```

## Commits e estado

`a0502a4` — `fix: guard conversational lifecycle and revoked clinical history` (corte A funcional, migration, testes e especificação). Atualização de progresso A: `b8555a4`.

`5e697f9` — `feat: persist conversational workspaces and human authorization challenges` (corte B funcional, migração, gateway, catálogo, contratos e testes). Atualização de progresso em commit documental subsequente.

Sem merge, push ou deploy. `main` e `origin/main` preservadas em `51c1426`. As migrations `20261120000500` e `20261120000600` já estão aplicadas localmente: não reaplicar os arquivos manualmente sobre objetos existentes.

## Retomada — próximo passo exato

1. Ler este arquivo, `CHAT-OPERATIONS-CONTRACT.md` e a especificação; conferir branch, `git status` e `git log`. Não refazer A/B e não reaplicar migrations já registradas.
2. **Continuar apenas C:** a base privada está no commit `05f9857`; seus testes carregam a migration em transação e desfazem o schema no fim. Não reaplicar A/B e não anunciar C como pronto. Antes de aplicar permanentemente C, integrar o restante e adaptar a limpeza das fixtures ao ledger. Em seguida, inspecionar a integração entre propostas existentes, revisões compartilhadas e workspaces. Escolher uma autoridade de conteúdo, preservando vínculo e identificador do documento; não manter duas cópias editáveis concorrentes nem criar outro motor clínico.
3. Integrar criação dos três documentos e alterações naturais a operações estruturadas. Identificar itens por UUID, preservar campos não mencionados, desambiguar atleta/documento/item/valor, pedir dados ausentes. Mudança deve criar/revincular a revisão exata e invalidar confirmações anteriores; aplicar CAS e recuperar estado da persistência.
4. Testar e commitar C antes de D. Não ativar `operation.confirm` como ferramenta do modelo. A entrada de confirmação continuará sendo a mensagem original autenticada, não saída do modelo ou texto do documento.
5. D: execução clínica idempotente vinculada ao recibo, com nova checagem de estado/epochs/acesso/versão/hash/identidade/destinatário/expiração na transação que invoca `document_review_command` e o motor B.2. Propagar origem de chat também aos eventos clínicos compartilhados, além dos eventos operacionais já implementados. Nunca tratar o recibo como assinatura concluída.
6. E: apresentar o documento e resumo no chat antes do ack de apresentação; integrar acompanhamento/recuperação, voz segura, acessibilidade, matriz de paridade, inventário pendente e evidências reais. Executar a suíte integral no fim da branch estável.

Ponto de parada seguro neste checkpoint C: criação/alteração natural completa, assinatura/finalização/entrega integral pelo chat e confirmação de assinatura por voz **continuam pendentes e não habilitadas**. O orçamento limitado permanece como restrição; não abrir uma nova frente complexa sem poder deixá-la em estado consistente.
