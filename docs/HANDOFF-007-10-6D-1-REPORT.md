# Handoff 007.10.6D.1 — Simplificação da criação de evoluções

Data: 21/11/2026. Concluído para homologação; sem merge, push ou deploy.

## Resultado

O formulário tradicional agora oferece **Finalizar evolução** como ação primária e **Salvar rascunho** como secundária. Finalizar valida e registra o conteúdo atual em uma operação transacional, sem salvamento manual prévio e sem checkbox/modal genérico adicional. O registro finalizado é aberto na timeline habitual, com acesso à correção já implementada no 007.10.6D.

Um rascunho existente pode ser retomado e finalizado com as alterações atuais do formulário, sem criar outro registro. Se o conteúdo não mudou, a orquestração utiliza a versão já salva; se mudou, a atualização e a finalização ocorrem juntas. Falhas não deixam uma criação parcial nem alteram um rascunho anterior.

**Antes:** Nova evolução → preencher → salvar rascunho → revisar versão salva → marcar confirmação → confirmar finalização.

**Agora:** Nova evolução → preencher → Finalizar evolução → timeline finalizada. Alternativa: Salvar rascunho → retomar quando necessário.

Campos, autoria, paleta, tipografia, navegação e regras clínicas existentes preservados. Nenhum estilo global novo. O destaque usa `.button`; o rascunho usa `.outline`. A confirmação de correções publicadas e o protocolo de confirmação do CBB Intelligence não foram removidos.

## Persistência e idempotência

A inspeção confirmou que `clinical_save` cria rascunhos e finaliza registros existentes, mas não oferece a criação+finalização atômica necessária. Duas chamadas independentes poderiam deixar um rascunho após falha. Por isso foi necessária uma única migração, `20261121000600_traditional_evolution_submit.sql`, com:

- Nova RPC autenticada `evolution_submit`, exclusiva da orquestração tradicional.
- Reutilização de `clinical_save`, sem alterar seu contrato ou as regras de sigilo, autorização, publicação e revisões.
- Bloco transacional que desfaz registro, atendimento, revisão e auditorias de sucesso intermediárias se a operação falhar. O evento de falha é registrado separadamente, sem conteúdo clínico.
- Recibo durável em `clinical.audit_events`, já existente, com índice único por profissional e chave de submissão. Nenhuma nova tabela ou entidade clínica.
- Chave estável durante a vida do formulário e suas retentativas, distinta do identificador clínico de atendimento, que é gerado no servidor. A mesma chave usada por outro profissional não revela nem conflita com o atendimento original.
- Locks para serializar solicitações concorrentes; repetição confirmada retorna o mesmo registro sem duplicar finalização, atendimento ou recibo.
- Validação do contexto, versão, intenção e conteúdo correspondente no replay. Uma chave consumida com outro conteúdo é recusada, sem sobrescrever o registro.
- Verificação atual de autorização também no replay; revogação de concessão específica nega e audita a tentativa.

Os recibos guardam apenas identificadores, intenção e versões. Não contêm título, corpo ou hash do conteúdo clínico. Quando necessário, a comparação de uma retentativa usa o registro ou a revisão clínica protegida, dentro do backend.

Autoria e data/hora continuam sendo preenchidas pelos serviços existentes a partir do usuário autenticado e do banco. A finalização recebe aprovação associada ao próprio autor da operação; nenhuma flag de visibilidade do cliente substitui a regra de domínio.

## Formulário e falhas

O componente mantém os valores em memória e não os limpa quando uma requisição falha. O estado real da submissão, obtido por `useFormStatus`, bloqueia os campos e ambos os botões e mostra feedback de salvamento/finalização. A chave permanece a mesma ao tentar novamente.

O sucesso só é apresentado depois da confirmação do backend. Se a resposta se perder depois do commit, a interface informa que não conseguiu confirmar o salvamento, conserva o texto e permite consultar o recibo pela retentativa. O teste simula exatamente esse caso: a resposta é abortada depois de o servidor gravar; a nova tentativa retorna o mesmo registro.

Após salvar um rascunho, os controles permanecem bloqueados até que a versão confirmada do servidor remonte o formulário. Isso evita editar imediatamente sobre uma versão anterior durante a atualização da página.

Validações nativas e do servidor, foco, controles por teclado e proteção de saída foram mantidos. A confirmação de descarte ao sair com texto não salvo continua existindo; ela não faz parte da finalização. Nenhum texto clínico é gravado em armazenamento persistente do navegador: somente a flag de alteração já existente é utilizada.

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/features/clinical/evolution-form.tsx` | Formulário específico, duas ações, valores controlados, pending, erro recuperável e proteção de saída |
| `src/app/(workspace)/atletas/[id]/evolucao/page.tsx` | Usa o novo formulário somente na criação/edição de rascunhos; remove a confirmação tradicional separada |
| `src/app/(workspace)/atletas/[id]/evolucao/actions.ts` | Ação estruturada de submissão, validação, resposta segura e invalidação de cache após confirmação |
| `supabase/migrations/20261121000600_traditional_evolution_submit.sql` | Orquestração atômica e recibo idempotente no esquema existente |
| `tests/evolution-submit.spec.mjs` | 13 testes direcionados do novo contrato |
| `tests/evolution-submit-ui.spec.mjs` | 5 testes de interface, falha/retry e desktop/mobile |
| `playwright.evolution-submit.config.ts` | Execução direcionada de backend, sem servidores de interface |
| `tests/evolution.spec.mjs` | Troca da confirmação tradicional pelo novo botão e espera pela versão confirmada após salvar |
| `tests/evolution-ux.spec.mjs` | Adaptação do botão tradicional; capturas históricas passam a ser opt-in |

Documentação: especificação copiada, progresso, este relatório, quatro capturas, galeria e manifesto de verificação. As evidências do handoff anterior foram preservadas.

**Não foram modificados:** timeline, DTO de metadados restritos, política de Psicologia, regras entre especialidades, RPCs de correção/histórico, documentos/assinaturas, motor de entrega, agente, ferramentas ou confirmação do chat. A correção publicada mantém seu formulário e confirmação próprios.

## Testes

**39 cenários distintos aprovados em execuções direcionadas**, sem execução integral indiscriminada.

| Grupo | Resultado |
|---|---|
| Backend da nova submissão | 12 testes passaram em 41,5 s; teste específico adicional de revogação/replay auditado passou em 8,5 s (13 distintos) |
| UI e contratos afetados | 11 testes passaram em 1,1 min: 5 novos e 6 regressões |
| Segurança/versionamento do 007.10.6D | 15 testes passaram em 47,0 s |
| Rechecagem do formulário/captura | Cenário de finalização direta passou em 14,0 s |
| Rechecagem da retomada de rascunho | Cenário passou em 12,8 s após a trava de atualização da versão |
| Lint | Aprovado, sem erros ou warnings |
| Typecheck | Aprovado |
| Build | Aprovado |
| Acessibilidade das novas capturas | Quatro estados axe WCAG 2 A/AA e 2.1 AA sem violações |
| Diff check | Aprovado |
| Cleanup | Zero contas `evolution-domain-*` e zero gatilhos de injeção de falha remanescentes |
| Migração local | Aplicada; conteúdo do arquivo conferido contra o registro em `schema_migrations` |
| Permissões da nova RPC | Anônimo sem execução; execução somente autenticada |

Cobertura nova: finalização médica e de Psicologia; rascunho opcional; retomada com texto ainda não salvo; campos obrigatórios; ausência de autorização; ausência de permissão de finalização; clique/requisição repetida; concorrência; resposta perdida; rollback após persistência; rascunho anterior intacto na falha; chave reutilizada com outro texto; versão desatualizada; recibo anterior sem sobrescrever edição posterior; isolamento por profissional; replay após revogação; autoria, auditoria e uma única entrada na timeline.

As regressões reutilizadas incluem metadados restritos, sigilo obrigatório, tentativa de contorno de Psicologia, edição/versionamento, histórico original, concessões, concorrência, adendo de versão com trava de assinatura, evolução assistida e confirmação falada do chat. O teste tradicional passou a aguardar o retorno da versão confirmada, em vez de considerar o valor local do input como prova de persistência.

Na validação mobile, o pending foi ajustado para usar o estado real do formulário; isso garantiu bloqueio efetivo durante a requisição. Os alertas dos testes foram escopados ao formulário, distinguindo-os do anunciador de rotas do Next.js.

## Capturas reais

[Galeria](visual/handoff-007-10-6d-1/index.html). Dados fictícios, Chromium headless, nenhuma janela visível de navegador aberta.

- [Formulário tradicional com as duas ações — 1440 px](visual/handoff-007-10-6d-1/form-1440.png).
- [Finalização direta confirmada na timeline — 1440 px](visual/handoff-007-10-6d-1/finalized-1440.png).
- [Formulário mobile de Psicologia com sigilo obrigatório — 390 px](visual/handoff-007-10-6d-1/form-390.png).
- [Conteúdo preservado após perda de resposta já gravada — 1440 px](visual/handoff-007-10-6d-1/retry-preserved-1440.png).

## Git e aplicação local

- Baseline: `0da6779`, com o 007.10.6D completo.
- Branch: `fix/handoff-007-10-6d-1-direct-evolution`.
- `4e445d6`: operação atômica e recibos de submissão.
- `e96cfbf`: novo formulário, recuperação segura, isolamento da chave por profissional e validações adicionais.
- Commit documental posterior registra este fechamento.
- `main` preservada em `5f86dac`. Workspace limpo ao finalizar. Sem merge, push ou deploy.

A migração 006 foi aplicada somente no Supabase local. Ajustes da própria migração ainda em desenvolvimento foram reconciliados transacionalmente antes da homologação; arquivo e histórico local foram conferidos como idênticos. As migrações 001–005 do handoff anterior não foram reexecutadas nem modificadas.

A lacuna preexistente `20261115000900` no histórico local da CLI permanece documentada no 007.10.6D. Não foi usado reset, `--include-all`, reseed ou replay de migrações antigas. Outros ambientes precisam conter o baseline de 007.10.6D e aplicar a nova migração antes de executar este código.

## Homologação básica

1. Médico: abrir Nova evolução, preencher e clicar em Finalizar evolução. Não deve haver salvamento manual anterior, modal ou checkbox adicional de confirmação. Conferir a entrada finalizada e o texto na timeline.
2. Salvar outro atendimento como rascunho, reabri-lo, modificar o texto e finalizar sem salvar novamente. Deve continuar sendo o mesmo atendimento, com o último texto preenchido.
3. Psicólogo: conferir sigilo obrigatório, finalizar diretamente e verificar como médico que somente os metadados permitidos aparecem.
4. Abrir uma evolução publicada e conferir que a correção, motivo e histórico do 007.10.6D continuam disponíveis.
5. Conferir as capturas de falha e mobile. A retentativa deve conservar o texto e não gerar um segundo registro.

## Limites e pendências

- Homologação visual/funcional do usuário pendente. Sem pendência técnica conhecida nos cenários deste handoff.
- Retentativas seguras se referem à mesma solicitação no formulário aberto. Fechar a aba ou descartar/recarregar o formulário não oferece recuperação automática de texto; a proteção de saída continua disponível. Não foi criado armazenamento persistente de conteúdo clínico no navegador.
- Se a solicitação já tiver sido concluída e o texto for alterado antes da retentativa, a chave não poderá registrar outro conteúdo silenciosamente. O usuário deve consultar o registro confirmado e usar a correção existente quando necessário.
- Os recibos de idempotência são duráveis no armazenamento de auditoria existente. Uma futura política de expurgo deve preservar esse mecanismo ou fornecer retenção equivalente.
- Não foram executados suíte integral, fornecedores reais de IA/transcrição/assinatura/entrega, Firefox/Safari ou dispositivos físicos. A validação de voz reutiliza o contrato mockado já existente.

Próximo passo: homologar e solicitar integração quando aprovado. Nenhum merge/push/deploy foi realizado.
