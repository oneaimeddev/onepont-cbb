# Progresso — 007.10.6B.3

Atualizado em 20/11/2026. Baseline: main/origin/main `51c1426`, workspace inicialmente limpo. Branch: `feat/handoff-007-10-6b-3-intelligence-journey`.

Especificação completa: [specs/HANDOFF-007-10-6B-3.md](specs/HANDOFF-007-10-6B-3.md). O adendo de execução com orçamento limitado (~19% informado pelo usuário) tem prioridade: concluir e testar um corte antes de abrir o próximo; commits verificáveis; nenhuma capacidade clínica parcial exposta; nenhum reset/descarte; manter retomada documentada; sem suíte integral a cada corte; preservar validações críticas.

## Estado dos cortes

| Corte | Estado | Entrega |
|---|---|---|
| A — Segurança conversacional | Concluído e validado neste checkpoint | Quatro P0 corrigidos; resultados abaixo |
| B — Infraestrutura de capacidades | Concluído e validado | Catálogo, estado persistente e autorização segura; execução clínica desabilitada |
| C — Criação/alterações | Concluído no escopo textual delimitado e validado | Criação com fonte explícita nos três tipos, edição CAS, revisão, salvamento humano e retomada |
| D — Assinatura/entrega | Não iniciado | Confirmação contextual, integração compartilhada e retentativas |
| E — UX/homologação | Não iniciado | Preview, voz, histórico, mobile, paridade e regressão final |

**O handoff completo ainda não está concluído nem homologado.** A/B permanecem concluídos. C foi concluído para os comandos textuais delimitados descritos no fechamento abaixo; a homologação ampla de linguagem/voz/UX permanece em E. A nova jornada de assinatura/entrega pelo chat não está habilitada. O fluxo tradicional do B.2 foi preservado.

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

## Corte C — checkpoint inicial `05f9857` (histórico)

Commit `05f9857` — `feat: stage private versioned document edits without chat exposure`.

- A proposta clínica existente é a autoridade editável; não há outra cópia editável de conteúdo, outro motor clínico ou substituição do registro/salvamento legado.
- Preparados helpers **privados em `clinical`** para leitura autorizada e alterações esparsas (`set_field`, `append_field`, `add_item`, `remove_item`, `reorder_items`). Referências de itens usam UUID. Campos não mencionados e grafia são preservados; limites/enums usam o canonicalizador existente. Append verifica o tamanho combinado, evitando truncamento silencioso.
- Lock do profissional/sessão, contexto do atleta, acesso atual, CAS da proposta, ledger de idempotência e evento de auditoria sem corpo clínico. Proposta salva exige versão clínica correspondente; alteração externa impede trabalhar sobre a referência antiga.
- Patch invalida desafios pendentes já associados ao mesmo identificador lógico. **Isso ainda não constitui o vínculo completo de revisão/autorização:** rebinding de revisão, fonte/versão no workspace e revalidação de recibos confirmados dependem da integração seguinte e são necessários antes de exposição.
- Sem wrappers públicos, grants para `anon`/`authenticated`/`service_role`, ferramenta do modelo, gateway, botão ou integração de produção. Nada novo de C está anunciado como disponível. Não houve mudança em assinatura, entrega, revisão ou salvamento da aplicação atual.
- Naquele checkpoint inicial, a migration `20261120000700_conversational_document_edits.sql` estava preparada no Git, sem aplicação permanente. **O estado atual foi atualizado no checkpoint `245de1f` abaixo.** Os testes executam a migration e as operações dentro de transações com `ROLLBACK`; as fixtures usam somente atletas/profissionais fictícios. O runner também aceita o schema já instalado futuramente.

### Validação do checkpoint inicial C

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

## Corte C — checkpoint interno anterior (`245de1f`, histórico)

- Revisão privada chama `document_review_command:open` e vincula o workspace à versão exata da proposta, sem salvar documento clínico. O UUID da proposta é o mesmo identificador lógico do documento.
- `source_proposal_version` e validação do conteúdo, ator, sessão, atleta e versão clínica impedem revincular uma revisão superada. A checagem de workspace passa a recusar a fonte antiga; a checagem de desafio já usada por B também recusa um recibo confirmado após alteração. A evidência histórica não é apagada nem promovida à nova versão. Nova revisão reinicia identidade/entrega e não recupera o recibo anterior como autorização vigente.
- Serviço privado de salvamento sem assinatura reutiliza `document_review_command:save` para documentos aptos à revisão e `document_save` para rascunhos incompletos. Vínculo com a proposta, versão clínica e ledger são atômicos. Pode continuar editando o rascunho salvo; a alteração cria nova versão da proposta e nova revisão, sem sobrescrever mudanças externas.
- Repetição exata recupera o resultado, sem duplicar gravação/auditoria; chave reutilizada para outra versão/operação conflita. Documento com assinatura em andamento bloqueia edição e novo salvamento.
- Auditoria da revisão compartilhada agora usa os helpers existentes de origem/método: serviços controlados do chat registram `ai_chat`/`agent_tool`; os padrões tradicionais continuam `traditional_ui`/`human_ui`. Não se fabricam eventos clínicos separados.
- **Continua privado:** leitura/patch/revisão/salvamento novos não têm grants para `anon`, `authenticated` ou `service_role`; não há ferramenta do modelo, wrapper público, gateway ou UI anunciando C. O futuro adaptador deve validar a entrada humana ORIGINAL antes de invocar salvamento. A função privada de save não é um produtor de consentimento e não pode virar ferramenta do modelo.
- Migration `20261120000700` **aplicada e registrada atomicamente apenas no Supabase local**, após validação transacional dos helpers. Foi necessário instalar a base privada para verificar concorrência real e regressão do motor compartilhado sobre o schema efetivo; não habilitou funcionalidades no chat. SHA256 do arquivo e registro: `672e68a01371e26a359a009b68cabda290eb50db124ed7ffc6db536cf366280c`. **Não reaplicar manualmente.** Migrations futuras devem ser aditivas.
- Limpeza compartilhada das fixtures remove o ledger C dos profissionais fictícios antes das referências clínicas. Os cenários isolados continuam com rollback; os dois testes de concorrência usam duas conexões reais e dados fictícios posteriormente limpos.

### Validação atual

- **100/100 aprovados numa única execução final**, sem skips: 40 cenários C (25 anteriores + 15 adicionados), 22 do protocolo B, 15 P0 de A e 23 de finalização/entrega tradicional B.2.
- Os 15 cenários adicionais cobrem revisão e save dos três tipos, rascunho incompleto e posterior completude, recibo confirmado superado, fonte antiga impedida de rebinding, origem de auditoria/default tradicional, helpers privados, assinatura em andamento e concorrência real (mesma chave/diferentes chaves).
- Nos lotes de desenvolvimento houve duas expectativas de fixture corrigidas: confirmação B retorna `effect` diretamente (não em `authorization`); iniciar assinatura simulada exige `scenario` explícito, então o teste usa `delayed` e `delivery_requested: false`. Retestes direcionados passaram antes da bateria final. Nenhuma regra clínica foi afrouxada.
- `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`: aprovados depois do lote final. Correspondência SQL registrado/arquivo verificada.
- Suíte integral e testes de API/UI não repetidos: não houve alteração nos adaptadores HTTP, modelo ou componentes nesta entrega. A suíte integral permanece para o fim da branch estável, conforme adendo. Nenhuma janela de navegador, captura visual ou chamada paga à IA.
- **Pendências reais de C:** adaptadores autenticados com schemas estritos, grounding da criação/alterações na fala humana, seleção/desambiguação de documento/item/valor, CAS do card exibido, persistência de referências finas e hidratação autorizada dos cards após recarga, apresentação do preview compartilhado e integração do salvamento humano. Cobrir a jornada HTTP/UI antes de habilitá-la e encerrar C.
- **D/E não iniciados.** O teste de assinatura em andamento exercita o fluxo tradicional como fixture de bloqueio; não implementa assinatura pelo chat. Recibo B continua com `executionEnabled: false`.

```sh
npx playwright test --config playwright.document-edits.config.ts
```

## Corte C — integração textual e recuperação (`49d9c63`, estado atual)

### Comportamento entregue na branch

- Edição por comandos textuais delimitados nos três tipos: prescrição, solicitação de exames e pedido cirúrgico. O adaptador executa antes da chamada ao modelo e usa **a mensagem humana original autenticada**, não uma reformulação do assistente. Não há ferramenta nova de confirmação/assinatura ou SQL livre exposta ao modelo.
- Documento em contexto é escolhido pelo cartão (`Usar nesta conversa`); mais de uma proposta compatível pede escolha. A seleção explícita preserva cartões antigos mesmo além do limite de 12 referências da requisição. Cartão escolhido descartado não redireciona para outro documento. Atleta, ator, sessão e acesso continuam validados no banco.
- O servidor recupera a proposta real e verifica versão/hash exibidos antes de resolver posições para UUIDs. Versão antiga atualiza o cartão e pede repetição da solicitação, sem aplicar a alteração sobre uma ordem de itens diferente. Edição local ainda não revisada impede outra alteração textual concorrente.
- Valores livres são trechos literais da mensagem original, preservando grafia científica e unidades. Campos não mencionados permanecem intactos. Posição/nome ambíguos, valor ausente, referência adicional a paciente/documento e mistura de remoção/inclusão com alteração posicional pedem esclarecimento. Dose com unidade já preenchida não recebe outra unidade concatenada; dose/unidade são solicitadas separadamente. Não há inferência de valor clínico nem conversão de unidades.
- Inclusão nomeada gera UUID estável por mensagem e deixa os demais campos clínicos vazios; remoção usa o UUID resolvido. Enumerações de lateralidade/prioridade só aceitam traduções explícitas reconhecidas pelo contrato existente. Este é um interpretador delimitado, não uma alegação de compreensão de toda paráfrase possível.
- Nova revisão usa o mesmo `document_review_command` e `DocumentPreview`. O cartão da mesma proposta passa à resposta mais recente, sem duplicar o documento. Callback atrasado de cartão movido não recria o cartão antigo nem sobrescreve versão nova.
- O botão `Revisar documento` também persiste alterações locais da proposta com CAS antes de abrir a revisão compartilhada. `Confirmar e salvar` usa o serviço compartilhado sem assinatura, com idempotência, vínculo e versão retornados pelo banco. Não assina, finaliza ou envia.
- Histórico grava **referências finas**, sem `content`, itens, hash ou corpo de proposta. Leitura reidrata o conteúdo atual autorizado. Propostas pendentes voltam ao reabrir; referências antigas não viram cópias editáveis concorrentes. Contexto histórico/registro bloqueado aparece somente para consulta, sem afirmar que permanece um rascunho não assinado.
- Bridge de compatibilidade captura a versão clínica de salvamentos legados quando o conteúdo/autor/atleta coincidem, sem mudar o corpo clínico. Os novos adaptadores autenticados não concedem acesso aos helpers privados; origem do salvamento pelo cartão é `ai_chat`/`human_ui`.
- As operações novas de edição/revisão por **voz estão bloqueadas** com orientação para revisar a transcrição e enviar por texto. Os fluxos antigos de voz foram preservados; isto não homologa voz ou assinatura conversacional.

### Banco e exposição

Migration aditiva `20261120000800_chat_document_adapters.sql`, aplicada e registrada atomicamente **somente localmente**, com recarga do schema PostgREST. SHA256 confirmado entre arquivo e registro: `0498be0dd42fbf87c49dfcacbe044a022aebf1c0399b5ed168f31519b865209e`. `20261120000700` permanece intacta e sua correspondência também foi conferida. **Não reaplicar nem editar migrations já registradas.**

Adaptadores autenticados: `chat_document_proposal_read`, `chat_document_proposal_patch`, `chat_document_proposal_review` e `chat_document_card` (`review`/`save` apenas). Identidade do ator vem de `auth.uid()`. Novos caminhos de HTTP têm schemas estritos e a proteção de origem/sessão existente; SDK/ferramentas do modelo não recebem um dispatcher livre desses métodos.

### Validação e evidências

- **31/31** no módulo novo `chat-document-adapters.spec.mjs` no código final: serviços de cartão dos três documentos, revisão e idempotência, CAS por versão/hash, recuperação/hidratação autorizada, ausência de corpo no histórico, profissional alheio, recusa de assinatura/finalização/entrega, resolução literal/ambiguidade, seleção antiga/descartada, callbacks atrasados, dose/unidade e referências adicionais.
- **6/6 HTTP/UI** no código final: alteração dos três documentos, UUID/campos preservados, versão antiga, editor local sujo, voz bloqueada, referência alheia, um único cartão, revisão compartilhada, salvamento real do rascunho, recarga e mobile sem overflow horizontal. Provedor não é chamado: a chave offline do servidor de teste só habilita o composer. O nome `voice` do projeto Playwright é infraestrutura de teste, não homologação de voz.
- Regressão por impacto anterior: **125/126** (C privado, A/B, motor tradicional e três contratos legados de documentos/voz). Uma falha ocorreu ao obter o primeiro job no teste de lease de entrega (`job: null`); não se alterou o motor para satisfazer o teste. Reteste isolado **1/1**, seguido de **49/49** (26 cenários do novo módulo naquele momento + os 23 cenários completos do motor tradicional), aprovados. Foi acrescentado diagnóstico de estado/política/lease na fixture para eventual recorrência. **A causa da oscilação não foi reproduzida ou comprovada; permanece risco residual de teste**, não uma correção clínica alegada.
- No desenvolvimento, três expectativas de teste foram ajustadas ao evento nativo `document.draft_created` (não `document.draft_saved` na primeira gravação). Quatro requisições HTTP da fixture continham `state` indevido dentro de `displayedProposals`; corrigida a fixture, preservando o schema estrito. Não se afrouxou autorização, domínio ou validação para obter sucesso.
- `npm run lint`, `npm run build`, `npm run typecheck` e `git diff --check`: aprovados no código final. Suíte integral **não executada**: C/D/E continuam incompletos e o adendo reserva a execução integral à branch estável no fim. Testes de módulos sem relação não foram repetidos.
- Duas capturas reais finais, inspecionadas, com profissionais/atletas fictícios e Chromium headless **sem janela visível**. A captura representa o viewport real e mostra o segundo item alterado; nenhuma captura histórica foi regenerada.

[Captura desktop — prescrição com três itens](visual/handoff-007-10-6b-3/document-chat-desktop.png) · [Captura mobile — exames com três itens](visual/handoff-007-10-6b-3/document-chat-mobile.png)

```sh
npx playwright test --config playwright.document-edits.config.ts
npx playwright test --config playwright.document-edits.config.ts workflow-backend --grep "leases retomam"
npx playwright test --config playwright.document-edits.config.ts "chat-document-adapters|workflow-backend"
npx playwright test --config playwright.document-edits.config.ts chat-document-adapters
npx playwright test tests/voice-document-conversation.spec.mjs --project=voice --workers=1 --reporter=line
```

### Pendências do checkpoint `49d9c63` — resolvidas no fechamento C abaixo

1. Auditar/integrar a criação pelos três `prepare*` do SDK à autoridade compartilhada. Comprovar que nomes, doses, quantidade, apresentação, indicação e outros valores vêm da fala humana autorizada, pedindo dados ausentes; não confiar só no prompt, em texto do assistente ou em histórico clínico. Preservar grafia e unidades.
2. Substituir o fallback legado `prepareExamRequest`/`examFollowUp`/`mergeExamContent` de substituição completa por alterações estruturadas com CAS. **Mensagens fora da gramática delimitada ainda podem seguir o agente legado; esses caminhos não estão homologados como a nova edição segura completa.** Não encerrar C sem resolver essa diferença.
3. Validar criação/idempotência/retomada e as ferramentas reais do SDK com provedor controlado. As provas HTTP atuais validam o adaptador delimitado e não a interpretação do modelo.
4. Unificar o salvamento textual legado e o cartão no contrato exato de versão, mantendo a confirmação humana original. Não transformar `operation.confirm` em ferramenta do modelo.

D/E não foram iniciados como cortes. Preview e recuperação implementados aqui apoiam revisão/persistência de C; não substituem a homologação ampla E. Refinamentos observados para E: reduzir redundância de metadados/pendências entre cartão e preview e explicitar seleção ativa entre cartões, preservando a direção visual.

## Commits e estado

`a0502a4` — `fix: guard conversational lifecycle and revoked clinical history` (corte A funcional, migration, testes e especificação). Atualização de progresso A: `b8555a4`.

`5e697f9` — `feat: persist conversational workspaces and human authorization challenges` (corte B funcional, migração, gateway, catálogo, contratos e testes). Atualização de progresso em commit documental subsequente.

Sem merge, push ou deploy. `main` e `origin/main` preservadas em `51c1426`. As migrations `20261120000500`, `20261120000600`, `20261120000700` e `20261120000800` já estão aplicadas localmente: não reaplicar os arquivos manualmente sobre objetos existentes.

## Fechamento C — criação com fonte e salvamento humano

Commit funcional: `c344366` — `feat: ground document creation and bind chat saves to human consent`. Branch de trabalho preservada; `main` e `origin/main` continuam em `51c1426`.

Os três `prepare*` do SDK só criam propostas novas. Cada campo é conferido contra a mensagem humana original atual: não se usa histórico clínico ou texto do assistente como fonte. Nomes, grafia e unidades são preservados; não há conversão de dose/unidade nem inferência de quantidade. Campos ausentes continuam vazios. Itens múltiplos exigem papéis explícitos e separação por ponto e vírgula/nova linha (`Medicamento: NOME; Dose: VALOR; Unidade: VALOR` ou `Exame: NOME; Tipo: Laboratorial`). Uma referência clínica ambígua, negada, contraditória ou sem fonte pede esclarecimento; isso não é homologação de linguagem natural irrestrita.

A criação usa UUID estável por ator/sessão/mensagem humana/tipo. Repetição recupera a proposta real, sem substituir conteúdo editado, ressuscitar descartada ou gravar documento clínico. Atleta e autoria são revalidados no banco. O fallback de merge integral de exames foi removido do SDK; complementos passam pelas operações CAS do cartão.

A narrativa médica do modelo fica retida até a validação das ferramentas. O estado retornado pelo servidor determina o resultado documental; o provedor controlado tentou anunciar falsamente “salvo e assinado” e essa afirmação não foi transmitida. Essa proteção acrescenta latência à narrativa dos médicos; não homologa a qualidade de um modelo real.

O salvamento pelo chat usa a mensagem original autenticada, tipo, UUID, versão/hash exibidos e chave idempotente. Aceita confirmação explícita, como “Pode confirmar e salvar a prescrição.”; recusa perguntas, condicionais, negação, confirmação genérica “Sim”, texto atribuído ao assistente, entrada longa e pedidos combinados de assinatura/envio. O caminho atual da UI não dispara mais a confirmação médica legada em paralelo. O motor compartilhado permanece responsável pela persistência; auditoria conserva `human_message`/`human_voice`, inclusive no evento clínico nativo. Voz aqui preserva somente o salvamento de rascunho já existente, com contrato reforçado. Edição/revisão por voz e assinatura por voz não foram habilitadas. APIs legadas permanecem para compatibilidade; não são usadas pelos novos `prepare*` ou pelo salvamento médico atual da UI.

### Migrações locais novas

- `20261120000900_chat_document_creation.sql`: aplicada e registrada; SHA-256 `ea7527b51ea01dc9b74edc2c8a0c9bdd922d74e33808fe77422d5153c80f2e1e`.
- `20261120001000_chat_document_message_save.sql`: aplicada e registrada; SHA-256 `9f464b9c3ec0defb672ffab8e4c151ab313e17fd7267f2ce55aeb340c35c43bf`.

Não reaplicar manualmente as migrations 005–010. Nenhum reset, merge, push ou deploy foi feito.

### Validação deste fechamento

- **187/187** regressões direcionadas: A, B, domínio C, adaptadores, criação, salvamento, legado documental/evolução e 23 cenários do motor B.2. A falha histórica de lease descrita no checkpoint anterior não reapareceu; não foi alterado o motor para mascará-la.
- **38/38** testes de criação após reforçar a recusa de negação; 35 já estavam no lote de 187, mais 3 novos cenários de negação.
- **18/18** testes de salvamento revalidados com asserção adicional da origem no evento clínico nativo. Os mesmos 18 já integram o lote de regressão.
- **8/8** testes com SDK real e provedor HTTP local controlado: três documentos, fonte literal, retry, dados inventados, paciente divergente, histórico do assistente, merge legado, parâmetros forjados, narrativa falsa e criação→edição→salvamento sem nova chamada ao modelo. Sem custo de provedor de IA externo.
- **6/6** cenários HTTP/UI headless: três tipos, conflitos/ambiguidades, referência alheia, desktop com edição e confirmação textual real, reabertura exata e mobile sem overflow horizontal. Capturas reais atualizadas em `docs/visual/handoff-007-10-6b-3/document-chat-desktop.png` e `document-chat-mobile.png`; nenhuma janela de navegador visível.
- Lint, typecheck, build e `git diff --check`: aprovados. Uma asserção nova inicialmente consultava `status` em vez do contrato existente `state`; corrigida no teste, sem alterar implementação clínica para satisfazê-la.
- Suíte integral do repositório não executada neste corte: reservada para E, quando a branch estiver pronta para homologação, conforme adendo. Os lotes acima são por impacto; não somar execuções repetidas como testes únicos.

Riscos residuais: formato de criação conservador pode pedir esclarecimento com frequência; integração com modelo real e voz ampla precisa de E; redundância visual de pendências e indicação da seleção ativa observadas no checkpoint anterior permanecem refinamentos de E. Assinatura/finalização/entrega integral pelo chat ainda não estão expostas.

## Retomada — próximo passo exato

1. Conferir branch, status, commits e este fechamento. A/B/C estão concluídos nos limites documentados; não refazer nem reaplicar migrations locais registradas.
2. Iniciar **corte D** pela seleção explícita de identidade e execução idempotente vinculada ao recibo B. Revalidar estado/epochs/acesso/versão/hash/identidade/destinatário/expiração na transação que invoca `document_review_command` e o motor B.2. Não expor uma operação clínica antes de concluir e testar esse vínculo.
3. Integrar confirmação humana original e apresentação exata do resumo/documento; `operation.confirm` não vira ferramenta do modelo. Recibo não equivale a assinatura concluída. Preservar auditoria de origem em assinatura, finalização e entrega.
4. Concluir D e seu commit antes de E. Depois homologar texto/voz, estados/histórico/recuperação, acessibilidade/mobile e paridade com o fluxo tradicional. Executar suíte integral uma vez ao final estável.

Ponto de parada seguro: C validado, D/E pendentes; assinatura/finalização/entrega nova pelo chat e confirmação de assinatura por voz permanecem desabilitadas. Não iniciar nova frente complexa sem orçamento para deixá-la consistente.
