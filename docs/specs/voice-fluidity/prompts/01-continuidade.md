# Prompt 01

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local; sem merge ou deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Objetivo: reproduzir e corrigir a corrida entre persistência de um turno e o envio do próximo, sem trocar o provedor ou introduzir estado novo no banco.

Referências: intelligence-home.tsx (send, persist, queuePersist), voice/use-voice-session.ts (flush, onTurn), security.ts e as rotas inteligencia/sessao e inteligencia/historico.

1. Reproduza T02 com resposta do agente pronta e persistência atrasada. Demonstre se a próxima requisição parte antes do save e registre a evidência.
2. Faça persist/queuePersist retornarem resultado distinguindo sucesso, conflito/closed e falha. Não engula a falha permitindo próximo envio.
3. Serialize o envio seguinte contra a persistência e as mudanças de contexto em andamento, inclusive caminho de histórico. Adicione trava síncrona para duplo envio antes do rerender; não dependa só de setPending.
4. Faça onTurn/flush terem aceite explícito: uma fala só sai da fila após o coordenador aceitar. Em falha, preserve texto e permita recuperação sem duplicar a mensagem.
5. Preserve geração/epoch em troca de conversa. Não deixe callback de save antigo liberar fila nova.
6. Mantenha o resultado de confirmação de rascunho existente. Não amplie o que pode ser confirmado por voz.

Não reescreva o componente inteiro, não reduza timers e não substitua o histórico autorizado por mensagens do navegador. Essa é uma correção transitória; a etapa 03 migra a persistência para o protocolo definitivo.

Aceite: T01–T03, T07, T11, T31 e T40. Use testes com atraso e falha de persistência e origem voice. Rode as suítes de voz e contexto afetadas. Reporte as falhas de baseline separadamente.

Ao terminar, escreva docs/delivery/voice-fluidity/01.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
