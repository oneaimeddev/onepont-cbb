# Cenários de aceite e regressão

Use apenas pessoas, textos e documentos fictícios. Cada teste deve observar o estado no servidor quando houver efeito; texto na tela sozinho não comprova gravação.

| ID | Cenário | Resultado exigido |
| --- | --- | --- |
| T01 | Primeiro turno por voz na Home vazia | Cria/associa uma conversa e responde sem exigir mensagem digitada anterior |
| T02 | Atrasar o save do turno A e falar B imediatamente | B recebe A uma vez no histórico; fila fica visível |
| T03 | Save de A falha | B não segue com contexto incompleto; texto é preservado e erro recuperável |
| T04 | Duas abas enviam usando a mesma revisão | Uma execução aceita, conflito explícito para a outra |
| T05 | Repetir turnId após perder a resposta | Mesmo resultado autorizado; nenhuma ferramenta mutante repetida |
| T06 | Repetir turnId com outro texto/alvo | Conflito, sem efeito |
| T07 | Trocar conversa durante resposta antiga | Resultado antigo não muda atleta, cartão ou tarefa nova |
| T08 | Revogar acesso entre aceite e ferramenta | Servidor nega efeito e não devolve conteúdo revogado |
| T09 | “Abra a Lara”; duas pessoas; “a segunda” | Seleciona a opção daquela pergunta, após revalidar acesso |
| T10 | “Ela”, “a outra”, “isso”, “sim” sem referência válida | Pergunta objetiva; nenhum alvo escolhido arbitrariamente |
| T11 | Nova fala enquanto agente processa | Turnos separados e visíveis; sem concatenação cega |
| T12 | “Espera” isolado antes do efeito | Cancelamento confirmado ou reconciliação, sem falso sucesso |
| T13 | “Ela espera retorno amanhã”, “não cancele” | Não cancela consulta nem mutação |
| T14 | Correção chega após gravação | Informa o resultado real; não desfaz nem edita finalizado silenciosamente |
| T15 | Comando curto com pausa final | Envia uma vez; mede espera do cliente separada do provedor |
| T16 | Nova fala durante timer de envio | Timer cancelado; não envia fragmento enquanto pessoa continua |
| T17 | Ditado com pausas de 0,8, 1,8 e 3 s | Acumula; só envia quando a pessoa conclui explicitamente |
| T18 | Dois “sim” legítimos em perguntas diferentes | Não elimina a segunda resposta por igualdade de texto |
| T19 | Mais de 2000 caracteres ou fila cheia | Preserva conteúdo e oferece revisão/divisão; não trunca |
| T20 | Queda transitória do WebSocket | Recuperação limitada, estado visível e nenhum replay de operação |
| T21 | Permissão negada, offline prolongado, 429 | Sem loop infinito; respeita Retry-After e preserva texto |
| T22 | Renovação durante frase e evento tardio da conexão antiga | Sem duplicação nem mistura; trecho incerto vai para revisão |
| T23 | Silenciar, ocultar aba, sair, nova conversa | Sem microfone retomado após encerramento; pendências tratadas explicitamente |
| T24 | Pedido natural de consulta com provider simulado | Mesmos guards e resultado tipado de texto e voz |
| T25 | Carbon real: parafrases e referência curta | Mede resolução da tarefa; mocks não contam como evidência linguística |
| T26 | “Por favor, altere...” e variação equivalente | Atualiza somente proposta autorizada, campos pedidos e versão correta |
| T27 | “Posso alterar?”, “não altere”, hipótese e fala ambígua | Esclarece ou responde; nenhuma mutação silenciosa |
| T28 | Modelo devolve span inexistente, dose inferida, item/alvo estranho | Rejeita patch, não grava |
| T29 | Pergunta por campo; resposta curta; versão/contexto mudou | Invalida pergunta e solicita novo esclarecimento |
| T30 | Proposta editada localmente ou versão/hash antigo | Conflito/revisão; não sobrescreve |
| T31 | Confirmação de rascunho com fala original | Mesmo fluxo existente, origem ai_voice, efeito único |
| T32 | “Sim/confirmo” por voz para assinatura | Mantém bloqueio existente e orienta alternativa já disponível |
| T33 | Perfil médico pede consulta simples | Feedback progressivo real sem esperar toda a resposta em silêncio |
| T34 | Modelo inventa “salvei” ou narrativa clínica antes do resultado | Não exibe sucesso nem conteúdo não validado |
| T35 | 25 turnos legítimos em dez minutos, duas instâncias | Sem bloqueio antigo; orçamento compartilhado e limite real testado |
| T36 | Métricas e falha do provedor com dados DEMO sensíveis | Logs livres de texto clínico, áudio, token e URL secreta |
| T37 | Histórico longo, anexo, análise longitudinal e documento | Participam da mesma coordenação; não contornam revisão/origem |
| T38 | Proposta revisada no composer e enviada | Preserva origem de voz quando a mensagem deriva de transcrição |
| T39 | Reserva running vence após efeito e resposta perdida | Reconcilia por operação; não executa novamente por timeout |
| T40 | Chat digitado e fluxos tradicionais | Continuam operacionais e com permissões/auditoria anteriores |

## Suítes existentes a reaproveitar

- Voz: `tests/voice*.spec.mjs`, projeto Playwright voice.
- Contexto e revogação: `conversation-security.spec.mjs` e `conversation-security-api.spec.mjs`.
- Operações: `chat-operations*.spec.mjs`, `chat-workflow-execution.spec.mjs`, `chat-journey*.spec.mjs`.
- Propostas e alterações: `conversational-document-edits.spec.mjs`, `chat-document-creation.spec.mjs`, `chat-document-message-save.spec.mjs`, `chat-document-adapters.spec.mjs`.
- Modelo: `chat-document-model.spec.mjs`, projeto document-model.
- Histórico e busca: `longitudinal-history.spec.mjs` e `clinical-search.spec.mjs`.
- Contratos puros novos: use a infraestrutura existente, sem instalar um runner só para esta entrega.
- SQL/backend: configs operations, security e backend existentes; adicionar casos nas suítes apropriadas.

## Homologação real

Separar três níveis no relatório: simulação de eventos, áudio sintetizado via script de homologação e pessoa com microfone. Nenhum substitui automaticamente o seguinte.

Roteiro mínimo com pessoa: 30 turnos por sessão, pelo menos duas sessões, uma em ambiente silencioso e outra com ruído moderado. Incluir todos os passos da jornada, três pausas longas em Ditado, autocorreção de lateralidade, homônimos, correção durante processamento e uma interrupção de rede.

Registrar navegador/dispositivo, modo, versão, modelo, contagens de sucesso/erro, p50/p95 dos trechos medidos e observações sem conteúdo pessoal. Não registrar áudio. Para o conjunto fictício, nomes, negações, dose/unidade e lateralidade precisam estar corretos ou provocar esclarecimento; interpretação errada silenciosa reprova.

Se não houver pessoa/microfone ou credencial autorizada disponível, entregar relatório de testes automatizados e roteiro pendente. Status final: “implementação automatizada validada; homologação humana/Carbon pendente”, nunca “voz homologada”.

## Bloqueadores de aceite

Qualquer bypass de acesso, confirmação fabricada, gravação duplicada, perda silenciosa de texto, contexto cruzado entre conversas ou afirmação falsa de conclusão bloqueia a entrega. Latência deve ser medida; não rebaixe testes de segurança para atingir uma meta de tempo.
