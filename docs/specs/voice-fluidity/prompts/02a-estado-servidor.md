# Prompt 02A

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local. Não faça merge nem deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: relatório 01 e seu commit. Objetivo: implementar schemas, persistência de turnos e estado de tarefa de C1–C3, com testes de banco, sem migrar o agente ou a UI.

Referências: security.ts, transcript.ts, conversation.ts, operações existentes, migrations de conversation_sessions, conversation_security_p0 e chat_workflow.

1. Defina schemas de TurnEnvelope, ConversationTaskState, TurnState e eventos, com limites explícitos e validação estrita.
2. Proponha o mapeamento para o schema existente antes de editar. Reuse conversa, mensagens e autorização clínica; adicione apenas metadados de coordenação ausentes.
3. Implemente aceite atômico de um turno por conversa, revisão monotônica, fingerprint no servidor, conflito entre abas e idempotência de turnId.
4. Implemente finalizar/consultar/cancelar e reconciliação de reserva vencida. Nenhuma repetição por expiração executa efeitos automaticamente.
5. Estado de tarefa inclui referências autorizadas e pergunta pendente conforme C3. Revogação e troca de contexto invalidam referências. Metadados não duplicam conteúdo clínico.
6. Operações de coordenação têm RLS/grants mínimos, ator autenticado, sessão explícita e transações curtas. Nunca mantenha lock enquanto espera LLM.
7. Defina como o próximo executor integra verificações de validade de turno aos efeitos existentes. Este passo ainda não autoriza ligar o protocolo em produção/UI.
8. Atualize o documento de contratos com os nomes efetivamente adotados, sem alterar os comportamentos aprovados.

Aceite: T04–T08, T29 e T39 no nível de persistência. Simule dois clientes, duplicata com mesmo e outro payload, revogação, cancelamento concorrente e resultado incerto. Não crie um novo ledger de aprovação clínica. Rode security/operations/workflow para detectar regressões.


Ao terminar, escreva docs/delivery/voice-fluidity/02a.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
