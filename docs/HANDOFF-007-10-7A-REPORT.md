# Handoff 007.10.7A — Conversa simulada com PDF real

Implementação na branch `feat/handoff-007-10-7a-simulated-pdf`, sem merge, push ou deploy.

## Resultado

O fluxo existente de prescrição, revisão, confirmação humana e assinatura demonstrativa agora permite receber a entrega em uma conversa interna. O destinatário virtual não precisa de telefone. Somente atletas com `source=demo`, profissionais autorizados e ambiente demonstrativo habilitado podem usar o recurso.

O worker existente gera o PDF a partir do snapshot associado à finalização e persiste os bytes, SHA-256, texto e horário na própria solicitação. Retentativas reutilizam esse anexo; reenvios geram mensagens distintas no histórico. Um trigger impede alteração silenciosa dos bytes e da associação ao documento/snapshot. O motor continua responsável pelos estados e sua auditoria. A conversa apenas consulta persistência; não avança estados.

O PDF inclui documento, versão, snapshot, identificação clínica, conteúdo e o aviso **PRÉVIA NÃO ASSINADA — SEM VALIDADE PARA DISPENSAÇÃO**, repetido em todas as páginas. Acesso e download exigem sessão, vínculo de edição e autoria da entrega. Outro profissional, mesmo vinculado ao atleta, não acessa esta conversa privada. Nenhuma integração externa foi implementada.

## Arquivos alterados

| Arquivo | Finalidade |
|---|---|
| `supabase/migrations/20261121000700_simulated_conversation_pdf.sql` | Configuração virtual, campos na entrega, imutabilidade, RPC do worker, consulta autorizada e disponibilidade do anexo |
| `src/features/delivery/engine.ts` | Geração/persistência antes da observação do adaptador e validação da chave do transporte |
| `src/features/delivery/prescription-pdf.ts` | Gerador específico de prescrição demonstrativa, com paginação |
| `src/features/delivery/conversation.tsx` | Histórico persistido, abertura/download do PDF e atualização somente de leitura |
| `src/features/delivery/conversation.css` | Estilos restritos à nova tela, desktop e celular |
| `src/app/api/documents/simulation/route.ts` | Consulta e entrega privada do PDF, sem cache |
| `src/app/(workspace)/atletas/[id]/documentos/[documentId]/conversa-simulada/page.tsx` | Rota autenticada da conversa |
| `src/features/documents/workflow-types.ts` | Campo opcional de disponibilidade do anexo |
| `src/features/documents/workflow-view.tsx` | Link da entrega para a conversa, somente após persistência do PDF |
| `src/features/documents/review-panel.tsx` | Identificação do contato virtual e texto de autorização demonstrativa |
| `scripts/signing-demo.mjs` | Opção local explícita `--virtual-recipient`; desabilitar a demonstração também desabilita o destinatário virtual |
| `tsconfig.json` | Importações `.ts` permitidas com `noEmit`, mantendo o reconciliador nativo do Node funcional |
| `playwright.simulation.config.ts` | Configuração direcionada com servidor local de teste |
| `tests/delivery-simulation.spec.mjs` | Testes novos de domínio, PDF, falha/recuperação, segurança e interface |

Evidências: `docs/visual/handoff-007-10-7a/` (capturas de desktop/celular, PDF fictício e renderização). Nenhuma tabela ou dependência adicionada. Nenhum contrato de operação do CBB Intelligence foi substituído.

## Validação

- Nova suíte: **7 aprovados em 24,9 s**, incluindo jornada completa sem telefone; persistência, versão e hash; extração de texto do PDF; aviso em todas as páginas; idempotência; imutabilidade; retentativa e reenvio; falha injetada na persistência do anexo; controle de acesso; isolamento dos modos; ausência de transporte externo; interface responsiva.
- Motor existente: **23 aprovados em 34,9 s**, em reexecução integral da suíte direcionada.
- Regressão tradicional/CBB Intelligence: **52 aprovados em 44,7 s** (`chat-document-adapters`, `chat-workflow-execution`, `workflow-ui`). Total: **82 cenários distintos**.
- Lint, typecheck e build de produção aprovados. Reconciliador executado também em processo Node separado.
- Axe WCAG 2 A/AA e 2.1 AA sem violações na conversa a 1440 e 390 px; sem rolagem horizontal. Capturas e PDF renderizado inspecionados visualmente.

Na primeira execução da nova suíte, a validação detectou uma referência incorreta entre `id` da revisão e `document_id` do snapshot e contraste herdado no cabeçalho; ambos foram corrigidos. Uma execução inicial do motor não encontrou a tarefa no teste de retomada por outro processo; a repetição isolada e a reexecução dos 23 testes passaram.

## Como abrir

1. Aplicar a migração nova sobre o baseline atual, sem reset ou replay de migrações antigas. Ela foi aplicada somente ao Supabase local durante esta implementação.
2. No ambiente local, executar `npm run signing:demo -- enable --virtual-recipient` e iniciar/reiniciar a aplicação. Esse comando foi executado ao concluir a validação local. Em outros ambientes demonstrativos controlados, a configuração correspondente no banco exige credencial de backend; o cliente autenticado não pode habilitá-la.
3. Com profissional médico autorizado e atleta fictício, criar uma prescrição, revisar, selecionar identidade e envio demonstrativo, confirmar e aguardar a entrega.
4. No resultado, clicar em **Abrir conversa simulada** e em **Visualizar PDF** ou **Baixar PDF**.

Rota: `/atletas/{athleteId}/documentos/{documentId}/conversa-simulada`. A conversa contém as entregas demonstrativas daquela prescrição, incluindo reenvios; não é uma caixa compartilhada entre profissionais ou um chat livre.

## Limitações

- Somente prescrições demonstrativas recebem PDF nesta implementação. Outros documentos mantêm seu fluxo existente.
- A conversa não movimenta a fila. Atualizar o andamento do documento ou executar `npm run documents:reconcile -- --document={documentId}` processa o motor existente.
- Instâncias já em execução precisam reiniciar para carregar o código/configuração. Homologação do usuário pendente.
- PDF com fontes padrão para português; caracteres fora da cobertura são representados explicitamente como `[U+XXXX]`, sem remoção silenciosa.
- Não foram exercitados provedores reais, assinatura válida ou navegadores/dispositivos além do Chromium headless. Os dados de teste são fictícios e as contas temporárias são removidas ao final.
- Em outros ambientes, a configuração virtual começa desligada. A política tradicional permanece disponível quando a opção virtual está desligada; ela não cria autorização de produção.
