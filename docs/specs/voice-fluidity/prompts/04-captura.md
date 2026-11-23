# Prompt 04

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local; sem merge ou deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: revisão A aprovada e seus reparos concluídos. Objetivo: C5 e testes determinísticos de captura/turnos.

Referências: voice/live-setup.json, token.ts, transcription.ts, use-voice-session.ts, voice-panel.tsx e public/voice/pcm-capture.js.

1. Adicione modos explícitos Conversa e Ditado usando os componentes/tokens existentes. Conversa envia automaticamente; Ditado acumula até ação de concluir/enviar.
2. Comece medindo silêncio 700 ms e debounce final 450 ms em Conversa. Remova a regra que aumenta espera só por 120 caracteres.
3. Início de fala e partial cancelam o timer, em vez de apenas empurrá-lo por prazo fixo. Finalização requer final real; watchdog preserva texto incompleto para revisão.
4. Preserve pausas longas em Ditado, troca de modo, mute e limite de texto. Não envie ditado quando o usuário só silencia.
5. Remova dedupe que elimina frases legítimas iguais; use identidade de evento/turno e testes de duplicação.
6. Mantenha setup do token e do cliente consistentes. Não mude o modelo de transcrição nem envie antes de setupComplete.
7. Atualize acessibilidade e mensagens de captura sem criar síntese de áudio.

Aceite: T15–T19, T23 e T38. Teste pausas de 0,8/1,8/3 segundos, fala retomada perto do timeout, ditado longo, modo/review e dois “sim” válidos. Registre medidas de mock como medidas de mock; tuning real fica para 09.

Ao terminar, escreva docs/delivery/voice-fluidity/04.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
