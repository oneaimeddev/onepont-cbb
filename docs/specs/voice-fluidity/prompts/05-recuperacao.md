# Prompt 05

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local; sem merge ou deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: etapa 04 concluída. Objetivo: implementar C6 sem perda silenciosa ou repetição de operações.

Referências: voice/use-voice-session.ts, token.ts, config.ts, api/inteligencia/voz/route.ts e coordenador da etapa 03.

1. Diferencie erro transitório, autenticação/permissão, limite e setup inválido. Implemente backoff limitado, online/offline e cancelamento das tentativas em stop/troca de conversa.
2. Pausar envio de áudio durante intervalo sem conexão pronta; mostrar esse estado. Não prometer recuperar o áudio desse intervalo.
3. Preserve finais e partial separado para revisão. Nunca envie parcial como mensagem final por reconexão.
4. Prepare renovação antes de cortar socket atual, com uma única fonte de envio de áudio e drenagem limitada de eventos finais.
5. Proteja eventos assíncronos com generation. Stop/desmontagem limpam timers, sockets e tracks; não há reconexão após stop.
6. Antes de retentar chat com resultado incerto, consulte o turno no servidor. Transporte de áudio não pode retentar a operação clínica.
7. Preserve chave efêmera e setup restrito. Não registrar áudio nem tokens; não abrir exceção para localhost em produção.

Aceite: T05, T07, T20–T23 e T39. Testes devem cobrir goAway, fechamento abrupto, token expirado, 429 com Retry-After, stop durante fetch e final atrasado da conexão anterior.

Ao terminar, escreva docs/delivery/voice-fluidity/05.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
