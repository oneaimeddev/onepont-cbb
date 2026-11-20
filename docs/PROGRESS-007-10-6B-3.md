# Progresso — 007.10.6B.3

Atualizado em 20/11/2026. Baseline: main/origin/main `51c1426`, workspace inicialmente limpo. Branch: `feat/handoff-007-10-6b-3-intelligence-journey`.

Especificação completa: [specs/HANDOFF-007-10-6B-3.md](specs/HANDOFF-007-10-6B-3.md). O adendo de execução com orçamento limitado (~19% informado pelo usuário) tem prioridade: concluir e testar um corte antes de abrir o próximo; commits verificáveis; nenhuma capacidade clínica parcial exposta; nenhum reset/descarte; manter retomada documentada; sem suíte integral a cada corte; preservar validações críticas.

## Estado dos cortes

| Corte | Estado | Entrega |
|---|---|---|
| A — Segurança conversacional | Concluído e validado neste checkpoint | Quatro P0 corrigidos; resultados abaixo |
| B — Infraestrutura de capacidades | Não iniciado | Catálogo, estado operacional, desafios e confirmação segura |
| C — Criação/alterações | Não iniciado | Edição natural dos três documentos e revisão persistente |
| D — Assinatura/entrega | Não iniciado | Confirmação contextual, integração compartilhada e retentativas |
| E — UX/homologação | Não iniciado | Preview, voz, histórico, mobile, paridade e regressão final |

**O handoff completo ainda não está concluído nem homologado.** O checkpoint deliberado encerra um corte consistente antes de abrir outra frente complexa, conforme o orçamento. A nova jornada de assinatura/entrega pelo chat não está habilitada. O fluxo tradicional do B.2 foi preservado.

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

## Commits e estado

`a0502a4` — `fix: guard conversational lifecycle and revoked clinical history` (corte A funcional, migration, testes e especificação). Atualização de progresso registrada em commit documental subsequente.

Sem merge, push ou deploy. `main` e `origin/main` preservadas em `51c1426`. A nova migration já está aplicada localmente: não reaplicar o arquivo manualmente sobre objetos existentes.

## Retomada — próximo passo exato

1. Ler este arquivo e a especificação; conferir branch, `git status` e `git log`. Não refazer A.
2. Confirmar orçamento disponível antes de abrir B. Manter a jornada nova indisponível até fechar os contratos e testes.
3. **Iniciar apenas B:** catálogo explícito de capacidades; estado operacional persistente por usuário/sessão/atleta/documento; desafio de confirmação criado pelo servidor e vinculado a versão/hash, identidade, modo, destinatário, expiração, nonce/idempotência e entrada original autenticada do usuário. Saída do modelo não pode confirmar nada.
4. Reutilizar `document_review_command`, o domínio B.2 e seus contratos; respeitar também `security_epoch`/sessão atual. Integrar auditoria com origem e correlação corretas. Evitar comandos genéricos ou um segundo motor clínico.
5. Testar e commitar B antes de C. Depois seguir C → D → E. A matriz de paridade, inventário de outras capacidades, evidências completas e relatório final permanecem pendentes.

Limitações ainda intencionais: sem nova assinatura pelo chat, sem alteração natural completa de rascunhos, sem desafio novo de confirmação, sem entrega nova pelo chat e sem alegação de confirmação de assinatura por voz. Nada disso deve ser anunciado como disponível antes dos cortes correspondentes.
