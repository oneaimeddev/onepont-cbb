# 0013. Voz como entrada do mesmo agente

A conversa por voz é só outro modo de entrada da Home CBB Intelligence. O áudio vira texto no navegador, e cada turno finalizado segue para `POST /api/inteligencia` como uma mensagem digitada, com `inputMode: "voice"`. O agente, as ferramentas, as permissões e a auditoria são os mesmos. A voz não tem ferramentas próprias, e o navegador não chama RPCs clínicas em nome do modelo.

A transcrição usa `gemini-3.5-transcribe-live` pela Live API. O navegador não recebe a chave permanente. `POST /api/inteligencia/voz` confere a origem, a sessão e o perfil e então pede ao Gemini um token efêmero. O token vale para uma única sessão, precisa ser usado em 60 segundos e expira em 11 minutos. O endpoint `BidiGenerateContentConstrained` aplica a configuração gravada no token: modelo, pt-BR, modo `VERBATIM`, vocabulário esportivo e parâmetros de detecção de fala. O navegador não consegue trocá-la. A configuração fica em `src/features/chat/voice/live-setup.json`, lida tanto pela rota quanto por `scripts/voice-homologation.mjs`.

O áudio sai do navegador em PCM 16 kHz, em quadros de 100 ms, somente depois do `setupComplete`, enquanto o modo de voz estiver ativo e sem silêncio acionado. Nada é gravado: o áudio não passa pelo servidor da aplicação, não vai para logs e não é persistido. Só o texto entra no histórico da conversa, pela política que já existe.

O Gemini fecha um segmento após 1 s de silêncio. O cliente espera mais 1,6 s, ou 3 s em textos longos, antes de enviar. Uma nova fala ou uma transcrição parcial adia o envio, e segmentos seguidos viram uma só mensagem. O modo "Revisar antes de enviar" e o botão "Corrigir" levam o texto ao campo de mensagem em vez de enviá-lo. Texto vazio, hesitações e repetições idênticas em até 4 s são descartados.

A sessão de voz é separada da conversa. Encerrar a voz mantém a conversa; nova conversa, troca de conversa ou saída da tela encerram a captura. Ela também termina após 2 minutos sem atividade, com aviso aos 105 s, e quando o microfone deixa de estar autorizado. Uma queda de conexão encerra a voz sem reconectar sozinha e leva o texto pendente para o campo de mensagem, sem reenviá-lo. Um `goAway` ou os 9,5 minutos de sessão renovam o token até seis vezes.

`CBB_VOICE_ENABLED=false` desliga a voz. Ela também fica indisponível quando o agente não usa a API Gemini.
