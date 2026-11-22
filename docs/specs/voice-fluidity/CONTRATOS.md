# Contratos da conversa por voz

As decisões abaixo definem o resultado da primeira versão. Nomes de novos módulos e RPCs são propostos; o executor pode adaptar nomes ao padrão do projeto sem mudar os contratos. Mudanças de comportamento exigem justificativa e revisão.

## C1 Autoridade e fronteiras

- Captura: navegador e transcritor; áudio somente em memória e no transporte autorizado para transcrição.
- Tarefa: servidor, por conversa e profissional autenticado.
- Intenção: Carbon, com schema estrito e ferramentas permitidas.
- Execução: serviços/RPCs existentes, com autorização atual, versão, idempotência e auditoria.
- Apresentação: navegador, com eventos correlacionados ao turno.
- Conversa por voz produz texto e cartões. Não usar APIs de geração/reprodução de fala.

Não criar um segundo ledger de autorização clínica. O registro de turnos descrito abaixo serve à coordenação e não substitui propostas, challenges, approvals ou operações já existentes.

## C2 Identidade e ciclo dos turnos

Introduzir um envelope comum para mensagens digitadas e transcritas:

| Campo | Contrato |
| --- | --- |
| sessionId | Conversa explícita; servidor confere ator, status e acesso |
| turnId | UUID da mensagem, estável em retentativas da mesma mensagem |
| expectedRevision | Revisão da coordenação; diferente da versão clínica |
| inputMode | text ou voice; manter também em texto transcrito revisado |
| text | Mensagem humana original, sem reescrita do modelo |
| relation | new, supplement ou correction; indicação a validar no servidor |
| relatedTurnId | Obrigatório para complemento/correção vinculados |
| captureMode | conversation ou dictation, somente política de captura |

A relação proposta pelo modelo/cliente não autoriza seleção de outro atleta, gravação ou substituição de consentimento.

O servidor mantém uma revisão monotônica por conversa e um registro mínimo de turnos, reaproveitando estruturas existentes onde atenderem ao contrato. Nova tabela só é necessária para metadados que ainda não existem.

Mapa de implementação previsto para a etapa 02A:
- Módulo de contratos em `src/features/chat/turns/contracts.ts` e serviço server-only em `turns/server.ts`; coordenador do cliente em `turns/use-conversation-turns.ts`.
- `clinical.chat_turns`: session_id, turn_id, actor_id, fingerprint, input_mode, relation, related_turn_id, status, base_revision, result_revision, lease_expires_at, operation_ref, referências às mensagens e timestamps. Unicidade de session_id/turn_id e reserva ativa única por conversa; estado incerto bloqueia novo efeito até reconciliação.
- `clinical.chat_task_state`: uma linha por sessão, revision e metadados C3. Conteúdo de proposta continua nas tabelas existentes. Use FKs reais quando o tipo permitir.
- RPCs de accept, finish, inspect e cancel, com nomes seguindo o projeto. Aceite incrementa a revisão reservada e finalização publica a revisão resultante; todas as mudanças de contexto/tarefa invalidam versões anteriores.
- Endpoints autenticados de status/cancel, ou ações equivalentes num endpoint existente. Respostas usam no-store. O cliente não recebe actor_id ou fingerprint.
- O executor pode evitar uma tabela quando provar equivalência com schema existente; deve registrar o mapeamento no relatório, não trocar o contrato.
- Chamadas de aceitação/finalização do protocolo não concedem poderes a anon ou ao modelo. Guards e efeitos clínicos continuam usando a identidade humana autenticada.

Estados: accepted → running → completed, failed ou cancelled. awaiting_clarification é resultado de um turno concluído e estado da tarefa; não mantém uma requisição HTTP aberta. unknown_outcome exige reconciliação e nunca equivale a “falhou, pode repetir”.

Requisitos:

1. Aceitar turno, registrar a mensagem original na política de persistência atual e adquirir exclusividade de execução por conversa de forma atômica. Nunca manter transação/lock SQL aberto durante a chamada ao provedor.
2. Persistir resultado sanitizado e revisão antes de emitir done. A janela do modelo não recebe a mensagem atual duas vezes.
3. Duas abas não podem sobrescrever silenciosamente a tarefa: revisão vencida retorna conflito e estado atual autorizado.
4. Repetição de turnId com mesmo fingerprint retorna estado/resultado autorizado. Mesmo ID com texto, relação ou alvo diferente retorna conflito. Fingerprint é calculado no servidor.
5. Um turno concluído não executa novamente suas ferramentas ao repetir a requisição. Revalide acesso antes de devolver resultado armazenado.
6. Uma reserva running tem prazo explícito. Reserva vencida requer reconciliação de efeitos antes de liberar repetição; não reexecute uma mutação por expiração do prazo.
7. Mudança de conversa/contexto ou revogação invalida referências e impede novos efeitos de respostas antigas.
8. RPCs com efeitos conferem sessão/revisão/turno ainda válidos dentro da mesma proteção transacional do efeito. Checar apenas no navegador ou antes de iniciar o LLM não basta.
9. Cancelar uma consulta pode encerrar a geração e invalidar sua apresentação. Cancelar o transporte não desfaz uma transação já concluída.
10. Registrar estado mínimo para consultar resultado após perda de resposta, sem persistir uma segunda cópia integral de conteúdo clínico.

O fluxo de histórico longitudinal, as rotas determinísticas de documentos e a confirmação de rascunho devem participar desse ciclo. Hoje há caminhos anteriores ao agente e uma confirmação paralela no cliente: removê-los como executores independentes, preservando os validadores e efeitos existentes no dispatcher do servidor.

A rota antiga de save da conversa não pode sobrescrever turnos que já pertencem ao novo protocolo. Mantenha compatibilidade com histórico antigo e saves de UI necessários, com merge por IDs/revisão e origem validada.

## C3 Estado da tarefa

Manter uma representação tipada do estado autorizado. Pode ser reconstruída a partir da conversa e das propostas, com apenas a pergunta pendente e o vínculo de turnos persistidos como metadados novos.

- sessionId, revision, securityEpoch e activeTurnId.
- selectedAthleteId validado pela sessão atual.
- taskKind: idle, athlete_lookup, reading, drafting ou editing.
- subject: referência ao documento/proposta, kind, version e contentHash, quando aplicável.
- presentedChoices: IDs em ordem, vinculados ao turno que os apresentou; nunca uma lista global.
- pendingQuestion: id, kind, field opcional, sourceTurnId e opções autorizadas.
- operationRef: identificador de uma operação existente, sem duplicar autorização.

Perguntas aceitas: choose_athlete, choose_document, specify_field e specify_value. Prazo inicial de dez minutos para usar uma resposta curta; contexto/versão/permissão alterados invalidam imediatamente a pergunta. A expiração pode gerar uma nova pergunta específica, não executar a resposta em contexto antigo.

“O segundo” só resolve dentro da lista ligada à pergunta ou da lista atualmente apresentada. “Ela” usa o atleta validado. “O outro” exige exatamente uma alternativa válida. “Sim” pode responder a uma pergunta informativa; nunca é consentimento clínico genérico.

Não ampliar indiscriminadamente o histórico enviado ao modelo nem criar resumo clínico persistente para contornar a janela. Referências antigas e conteúdos protegidos são revalidados; o cartão autorizado continua sendo a fonte do conteúdo.

## C4 Coordenador do navegador

Separar a máquina de captura da máquina de tarefa. Um estado busy único não representa tudo.

- Captura: inactive, connecting, listening, muted, reconnecting, error.
- Turno: idle, collecting, queued, processing, awaiting_clarification, reconciling, error.

O coordenador mantém turnos individuais, com IDs e estado visível. Limite inicial: cinco turnos pendentes e 10000 caracteres no conjunto, respeitando os 2000 por mensagem existentes. Ao atingir limite, preservar o texto, pausar envio automático e orientar revisão; nunca cortar silenciosamente.

Nova fala durante processamento:

| Situação | Comportamento |
| --- | --- |
| Nova pergunta | Enfileirar individualmente e informar que será enviada após a atual |
| Complemento ou correção do turno pendente | Preservar a nova fala e vincular ao turno; nunca concatenar todos os pedidos |
| “Espera” ou “cancela esta consulta” isolado e final | Solicitar cancelamento; aguardar confirmação/reconciliação |
| Correção enquanto há possível efeito em andamento | Reconciliar primeiro; aplicar depois como nova operação se necessário |
| Relação incerta | Preservar e perguntar se complementa o pedido anterior |

Não chamar Carbon para cada parcial. O detector local pode apenas reconhecer controles conservadores e classificar provisoriamente a relação; a intenção definitiva usa o turno completo e o estado autorizado. Não cancelar ação por uma palavra dentro de um relato, uma negação ou uma transcrição parcial.

Respostas e timers antigos carregam generation/turnId. Descartar eventos de uma sessão anterior para apresentação, sem apagar o registro de efeitos confirmados.

O texto vai sair da fila somente após aceite do servidor. Erro ou limite mantém o mesmo turnId para consulta/retry seguro. O cliente não repete mutações por conta própria.

## C5 Captura e pausas

Dois modos explícitos, sem inferir mudança de modo apenas pelo tamanho do texto:

- Conversa: padrão; envio automático de uma fala final após a janela de composição.
- Ditado: acumula segmentos e suporta pausas longas; envio explícito ao concluir. Não envia por silêncio. Mantém revisão antes do envio.

Parâmetros iniciais para medir, não promessa de desempenho:

- Conversa: silêncio do transcritor de 700 ms e janela adicional de 450 ms após final.
- Novo início de fala/partial cancela o timer de envio. Não usar somente “adiar X segundos”: uma fala ativa não pode ser enviada pelo vencimento de um timer antigo.
- Não enviar parciais como finais por timeout. Transcrição sem final deve ficar disponível para revisão.
- Ditado: o silêncio pode fechar segmentos de transcrição, mas não o turno da pessoa.
- Alteração de modo preserva o texto e não envia automaticamente. Se mudar configuração do transcritor, aplicar token/setup consistente, sem descartar trecho.
- Ao superar 2000 caracteres, preservar tudo para edição/divisão explícita; não truncar nem fazer múltiplas gravações automáticas.
- Dedupe por identidade do evento/segmento e turno. Igualdade textual em quatro segundos não deve eliminar duas respostas legítimas iguais em perguntas diferentes.
- Silenciar para de enviar áudio. Em ditado, não encerra nem envia o texto acumulado.

Se 700/450 fragmentar frases nos testes, ajuste de forma documentada antes de liberar a etapa. Preserve nomes, negações, datas, doses e lateralidade, incluindo autocorreções dentro do mesmo relato.

## C6 Conexão e continuidade

Token efêmero continua sendo emitido no servidor e limitado ao setup. Separar a configuração do transcritor da do agente; fallback à chave atual pode preservar compatibilidade. Nunca expor chave permanente.

- Reconectar somente falhas transitórias, até três tentativas com backoff de aproximadamente 0,5, 1,5 e 3 segundos e jitter limitado.
- Não retentar automaticamente permissão negada, sessão encerrada, setup inválido ou revogação. Respeitar Retry-After em 429.
- Offline aguarda online dentro de limite total de 30 segundos. Depois mantém texto para revisão e oferece retry manual.
- Durante reconexão, pausar captura/envio e mostrar “Reconectando; aguarde para continuar”. Não fingir que a fala do intervalo foi recebida.
- Não gravar áudio em disco e não implementar replay de áudio. Manter segmentos finais e parcial separado; parcial não confirmado exige revisão.
- Renovação planejada: obter token e preparar nova conexão antes de trocar a fonte de envio. Nunca enviar o mesmo quadro a duas conexões. Drenar a antiga por prazo limitado e rejeitar eventos após a geração ser descartada.
- Se o fechamento de segmento entre conexões for incerto, preservar para revisão, sem juntar silenciosamente duplicatas.
- Ao sair da aba, manter política de silenciar; ao voltar, indicar ação de reativar. Não reabrir microfone após encerramento explícito.
- Consulta de turno após perda de resposta precede qualquer retry do chat. Reconexão do WebSocket de áudio não reenvia turnos do agente.

## C7 Carbon e interpretação

Configuração prevista do agente: `gemini-4-carbon`, API Google sem BASE_URL compatível OpenAI, esforço baixo inicialmente se suportado pela versão real do SDK. Confirmar parâmetros na documentação e tipos instalados antes de usar. Não trocar modelo silenciosamente em falha.

O Carbon oferece saída textual, ferramentas e saída estruturada; não oferece Live API nem geração de áudio. A transcrição usa um modelo separado. Fontes consultadas em 22/11/2026: [Carbon](https://aistudio.google.com/docs/models/gemini-4-carbon) e [Live Transcription](https://aistudio.google.com/docs/live-api/live-transcribe).

Reaproveitar o loop de ferramentas existente. Não adicionar uma classificação remota extra para todos os turnos se o mesmo loop puder fazer a tarefa. Limitar passos, tempo e ferramentas conforme a operação; nenhum modelo tem SQL ou gateway de confirmação livre.

A interpretação natural deve cobrir busca, seleção, consulta, preparação, complemento e correção de proposta. Não despachar para assinatura apenas pela ocorrência de “sim” ou “confirmo” fora de um challenge apropriado.

Se faltar um campo, pedir somente esse campo. A resposta curta é ligada a pendingQuestion e sua versão. Carbon não cria consentimento, não recebe identidade arbitrária do cliente e não escolhe entre pessoas ambíguas.

## C8 Edição natural sem consentimento inventado

Manter o fluxo determinístico de aprovação e gravação. Não afrouxar regex de confirmação para “resolver fluidez”.

Para preparar/alterar propostas:

1. Interpretar o pedido com schema estrito. Aceitar cortesia e variações de frase.
2. Validar alvo contra proposta e itens autorizados, versão/hash atuais e pergunta pendente.
3. Valores clínicos devem vir de spans da fala original ou da resposta humana à pergunta ainda válida. Registrar messageId e intervalo; não copiar conteúdo de respostas do assistente.
4. Validar que os spans existem, valores são literais e campos/itens pertencem ao tipo. Enumerações usam somente os mapeamentos existentes e testados. Não converter dose/unidade, inferir diagnóstico nem normalizar lateralidade por conta própria.
5. Ter um único resolvedor de patches que sirva à sintaxe determinística e à interpretação natural. Usar os RPCs de patch/versionamento existentes.
6. Edição clara atualiza só a proposta e mostra os campos alterados. Pergunta hipotética, negação ou duas interpretações plausíveis gera esclarecimento sem mutação.
7. “Por favor, altere a dose para 10” pode ser pedido. “Posso alterar a dose?” é pergunta, não instrução. “Não altere a dose” nunca altera.
8. “Direito… não, esquerdo”, no mesmo ditado, deve preservar a fonte da correção e preparar a proposta final correspondente; se o modelo não resolver com segurança, perguntar.
9. Texto histórico de uma proposta não é nova evidência para inventar um valor pedido. Resposta como “500” só completa um campo se a pergunta ativa definir esse campo e sua unidade sem ambiguidades.
10. Salvar rascunho continua separado de editar proposta. Finalizar, assinar e enviar mantêm os fluxos e bloqueios já existentes.

Mudanças semânticas em evolução precisam preservar seus próprios guards e ações; não fingir que o contrato de documentos médicos cobre todos os tipos de registro.

## C9 Respostas, limites e observabilidade

Eventos propostos, sempre com sessionId, turnId e revisão: accepted, status, delta, result, done, error. O cliente tolera chunks SSE partidos. done vem após persistência. Não usar um status de ferramenta que o servidor não emitiu.

Feedback:
- accepted/status são imediatos quando a requisição foi realmente aceita.
- Estados descrevem fatos: consultando atletas, preparando proposta, aguardando campo, reconciliando resultado.
- Remover a decisão de reter toda resposta apenas por perfil médico.
- Não liberar narrativa clínica bruta indiscriminadamente. Propostas e alegações de execução são bufferizadas até validação/resultado. Streaming deve ser autorizado por classe de conteúdo e ferramentas disponíveis, não por papel.
- Se não for possível provar segurança de um delta, emitir status e resultado validado; isso é preferível a expor texto clínico inventado.
- Sucesso de gravação vem de resultado confirmado. Não usar “salvei” por inferência do LLM.

Limites iniciais:
- 120 turnos novos por dez minutos por profissional e burst de 12 em dez segundos.
- Um turno em execução por conversa, garantido no servidor.
- Retry de turno já aceito não consome novamente o orçamento de geração; chamadas de status têm proteção própria contra abuso.
- Estado de rate limit compartilhado entre instâncias, com TTL/limpeza; Map local não é a garantia.
- Contagens de turno continuam válidas nas rotas alternativas. Overrides somente por configuração confiável do servidor, nunca body do cliente.
- 429 com Retry-After e mensagem recuperável; preservar turno/texto.

Tempos e contadores permitidos: tempo para parcial/final, final→envio, aceite, primeira resposta útil, duração de ferramenta, conclusão, reconexões, conflitos e descartes de eventos obsoletos. Use enumerações, durações e IDs aleatórios de correlação sem conteúdo. Métricas de cliente são diagnósticas, não prova de segurança. Não subtraia relógio do navegador do relógio do servidor; meça cada trecho em seu relógio e correlacione por ID.

Metas para homologação, não garantias: overhead final→envio mediano até 600 ms em Conversa; feedback visual local em até 100 ms; medir p50/p95 fim da fala→primeiro retorno útil e conclusão com Carbon. Um “processando” não conta como retorno útil. O alvo de dois segundos para retorno útil deve ser confirmado experimentalmente, não imposto aos mocks.
