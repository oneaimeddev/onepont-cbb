# Prompt 02B

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local. Não faça merge nem deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: relatórios 01 e 02a; testes de persistência aprovados. Objetivo: ligar o protocolo de C2 ao agente, aos caminhos determinísticos e às ferramentas, ainda com adaptador para a UI antiga.

Referências: agent.ts, security.ts, api/inteligencia/route.ts, historico/route.ts, sessao/route.ts, clinical-draft-actions.ts e operations/*.

1. Crie um dispatcher único para aceite, execução, finalização e reconciliação. Mesma coordenação para voz/texto e histórico longitudinal.
2. Use o estado autorizado, mensagem original e IDs do envelope. Não aceite histórico do navegador como evidência nem duplique a mensagem atual no contexto do modelo.
3. Mova a confirmação de rascunho para o fluxo do servidor quando a entrada usar o protocolo novo. Não execute em paralelo com uma interpretação conflitante do mesmo pedido.
4. Faça todas as ferramentas com efeitos conferirem turno/revisão/sessão ainda válidos junto da transação que produz o efeito. Reuse guards e idempotência do domínio.
5. Propague cancelamento para geração/consultas quando possível; não afirme rollback de uma gravação. Timeout exige consulta do resultado, não replay do LLM.
6. Persista resultado sanitizado e revisão antes de done. Os eventos SSE são correlacionados. Leitura de resultado antigo revalida acesso.
7. Proteja a rota save para não sobrescrever turnos do novo protocolo, preservando histórico legado e atualizações de UI permitidas.
8. Mantenha adaptador explícito para a UI anterior até 03. Não habilite confirmação de assinatura por voz nem faça mudanças de modelo.
9. Teste endpoints e RPCs, não só mocks de funções. Documente todos os caminhos de envio que foram migrados e os efeitos que não são canceláveis.

Aceite: T04–T08, T31–T32, T37, T39 e T40. Inclua perda de resposta após mutação, troca de sessão no meio de ferramenta e request falsificado. Checks de security/operations/workflow e API são obrigatórios.


Ao terminar, escreva docs/delivery/voice-fluidity/02b.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
