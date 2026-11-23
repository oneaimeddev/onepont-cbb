# 0023. Voz como ditado revisado no campo de mensagem

Substitui a [0013](0013-voice-conversation.md). Pedido do responsável pelo produto em 23/11/2026.

## Decisão

O botão de microfone do CBB Intelligence grava como uma mensagem de voz. Um clique inicia a gravação, outro clique encerra. A transcrição entra no campo de mensagem, depois do texto que já estiver ali. O profissional revisa, edita e envia. Nada é enviado sozinho, e não há painel de conversa, pausa, revisão opcional nem encerramento por inatividade.

A mensagem ditada segue para `POST /api/inteligencia` com `inputMode: "voice"`. O agente continua aplicando as regras de transcrição, e a auditoria registra a origem por voz. Mensagens digitadas seguem como `text`.

## Captura e transcrição

O navegador abre o microfone no clique e grava localmente em PCM 16 kHz mono, pelo mesmo worklet `public/voice/pcm-capture.js`. A gravação começa em cerca de 150 ms, sem esperar rede. Gravações longas são divididas em trechos de até 50 s, cortados no quadro mais silencioso dos últimos 5 s, e cada trecho é transcrito enquanto a gravação continua. O limite é de 10 minutos.

`POST /api/inteligencia/ditado` confere a origem, a sessão e o perfil profissional no Supabase, aplica o limite de 40 trechos a cada 10 minutos por profissional e valida o WAV: formato, tamanho entre 0,2 s e 55 s e cabeçalho. Em seguida, transcreve com `generateContent` do Gemini (`CBB_DICTATION_MODEL`, padrão `gemini-3.5-flash-lite`) e devolve só o texto. O áudio não é gravado, não vai para logs e é descartado após a resposta. A instrução e o vocabulário clínico ficam em `src/features/chat/voice/dictation-prompt.ts`.

Se a transcrição falhar, a gravação fica na memória do navegador até o profissional tentar novamente ou descartar. Descartar, sair da tela, abrir anexo ou trocar de conversa liberam o microfone sem enviar nada.

## Motivo

Na conversa ao vivo, a fala só valia depois do token, da conexão e do `setupComplete` (cerca de 2 s). O início das frases se perdia, e o envio automático tirava do profissional a revisão do texto antes do envio.

## Consequências

- Saem `use-voice-session.ts`, `voice-panel.tsx`, `token.ts`, `live-setup.json`, `POST /api/inteligencia/voz` e `scripts/voice-homologation.mjs`.
- `CBB_VOICE_ENABLED=false` desliga o ditado. Ele também fica indisponível quando o agente não usa a API Gemini.
- A gravação de consulta da evolução por voz (`/atletas/[id]/evolucao?modo=voz`) não muda.
