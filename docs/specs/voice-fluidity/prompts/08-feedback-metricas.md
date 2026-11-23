# Prompt 08

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local; sem merge ou deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: revisão B aprovada. Objetivo: C9, feedback real e orçamento compatível com conversas.

Referências: agent.ts, api/inteligencia/route.ts, rotas alternativas, processing-indicator.tsx, intelligence-home.tsx e infraestrutura de auditoria.

1. Emita accepted/status quando os fatos acontecerem. Correlacione todos os eventos e resultados ao turno. Teste SSE fragmentado e evento atrasado.
2. Substitua holdClinicalNarrative baseado só em perfil por política de conteúdo. Propostas e afirmações de efeito só aparecem após validação. Não faça “if true send delta” para liberar streaming.
3. Quando a segurança do delta não puder ser assegurada, use status útil e resultado validado. Separe feedback de progresso de primeiro retorno útil nas medições.
4. Implemente orçamento compartilhado entre instâncias, conforme C9, e mantenha exclusividade de turno do protocolo. Não use apenas Map.
5. Preserve texto no 429 e respeite Retry-After. Não contar replay aceito como nova geração. Proteja consultas de status contra polling abusivo.
6. Registre durações/contagens sanitizadas e correlação, sem conteúdo clínico ou credenciais. Não compare timestamps de relógios diferentes.
7. Inclua diagnóstico local de captura sem textos sensíveis e sem criar painel administrativo fora do escopo.

Aceite: T33–T36, T05 e T37. Demonstre limite antigo removido em conversa de 25 turnos, bloqueio acima do novo orçamento e consistência entre instâncias. Teste conteúdo malicioso do modelo e verifique que logs não incluem marcadores clínicos DEMO.

Ao terminar, escreva docs/delivery/voice-fluidity/08.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
