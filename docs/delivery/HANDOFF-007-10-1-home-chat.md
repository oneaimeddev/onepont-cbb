# HANDOFF 007.10.1 — Polimento do Chat e Home

Entrega de 18/11/2026. Branch: `feat/handoff-007-10-1-home-chat-polish`.
Especificação recebida: [Handoff](../HANDOFF-007-10-1.md).

## Cinco ajustes entregues

1. **Processamento:** três pontos animados e um único estado transitório na resposta ativa. A indicação continua durante texto parcial e desaparece na conclusão, erro, troca de conversa ou cancelamento. Não é incluída no texto nem no histórico persistido. Se o fluxo fornecer `status` com fase `tool`/`response`, a UI distingue a consulta autorizada da preparação da resposta. O agente atual não emite esse estado granular; não foi alterado para produzir sinais de ferramenta e não se deduz execução a partir do texto.
2. **Microfone:** o compositor usa os ícones existentes `mic`/`micOff`. Estado, descrição acessível e tooltip distinguem inatividade, escuta, silêncio e processamento. O botão continua iniciando/encerrando a conversa por voz; o modo contínuo, a captura, a transcrição e os controles de silenciar permanecem os mesmos.
3. **Home simplificada:** removidos os três atalhos e seu CSS exclusivo. Mantidos marca, saudação, compositor, navegação lateral, histórico e entrada pela interface tradicional. Nenhum card substituto foi criado.
4. **Entrada limpa:** `/` sem atleta explícito não seleciona a conversa anterior. O transcript apresentado é vazio, sem chamada de `start` ao montar a Home. O histórico continua consultável e sua seleção recupera a conversa e o contexto. A primeira mensagem efetiva inicia uma conversa por meio da operação existente; a abertura é serializada com a fila já usada pela UI, para que cancelamento ou troca de conversa não disputem a sessão. Links explícitos de atleta continuam funcionando. Visitar ou recarregar a Home não apaga mensagens, contextos ou documentos salvos.
5. **Saudação local:** catálogo com as vinte frases fornecidas, escolha inicial e rotação sem repetição consecutiva. Digitação de 50 ms/caractere, espera de 13,5 segundos após conclusão e transição de opacidade de 180 ms antes da próxima frase. A preferência por movimento reduzido mostra uma frase completa e estática. Foco no compositor, texto digitado, voz ativa, anexo aberto ou aba oculta pausam a rotação. Ao pausar durante a digitação, a frase atual é completada; ao retomar, inicia-se outra espera, sem transições acumuladas.

O título mantém Geist Serif e os tamanhos existentes. Uma camada invisível, excluída da árvore acessível, reserva a altura necessária para as frases do catálogo. O texto visual em digitação também é excluído da árvore acessível; o heading tem uma representação completa e `aria-live="off"`. Não há anúncio por caractere nem anúncio automático a cada rotação. O componente desmonta ao começar uma conversa e remove timers/listeners.

Não foram modificados RPCs, ferramentas, configuração/modelos Gemini, permissões, confirmação de documentos ou o formato persistido das conversas. Não foram instaladas dependências. As saudações não acessam API, LLM ou banco.

## Arquivos do produto

- `src/app/(workspace)/page.tsx`: entrada padrão sem restauração automática.
- `src/features/chat/intelligence-home.tsx`: integração da saudação, foco, estado transitório, remoção dos atalhos e início de sessão após mensagem efetiva.
- `src/features/chat/intelligence.css`: área estável de título, pontos, estados do microfone e movimento reduzido; remoção das regras dos atalhos.
- `src/features/chat/message-composer.tsx`: foco e ícone padrão, com mensagem operacional sem duplicar o indicador de processamento.
- `src/features/chat/voice/voice-panel.tsx`: microfone e descrições de estado.
- `src/features/chat/home-greeting.tsx`, `home-greetings.ts` e `processing-indicator.tsx`: componentes e catálogo locais.

Os testes de autenticação, atleta e Intelligence foram ajustados para usar a saudação dinâmica e a navegação lateral, e para recuperar conversas explicitamente pelo histórico. As verificações de autorização e conteúdo foram mantidas. O novo arquivo `tests/home-polish.spec.mjs` cobre os cinco ajustes.

## Capturas e demonstração

Imagens reais da interface com dados fictícios. O endpoint do agente é controlado apenas nos testes de processamento; persistência e retomada usam Auth/PostgreSQL locais reais.

| Evidência | Artefato |
|---|---|
| Home desktop, sem atalhos | [Captura](../visual/handoff-007-10-1/home-desktop.png) |
| Home mobile | [Captura](../visual/handoff-007-10-1/home-mobile.png) |
| Digitação em andamento | [Captura](../visual/handoff-007-10-1/home-typing.png) |
| Voz contínua e microfone | [Ouvindo](../visual/handoff-007-10-1/voice-listening.png), [silenciado](../visual/handoff-007-10-1/voice-muted.png) |
| Processamento e fase de consulta fornecida ao teste | [Captura](../visual/handoff-007-10-1/processing.png) |
| Troca de frase, reserva de altura e contagem de API | [Medições](../visual/handoff-007-10-1/animation.json) |
| Acessibilidade | [Resultado axe-core](../visual/handoff-007-10-1/accessibility.json) |

O teste usa relógio controlado para validar digitação, espera, rotação, foco, texto pendente e aba oculta. Foram verificadas vinte frases no catálogo, troca sem repetição imediata, ausência de chamadas de saudação e variação de no máximo 1 px na posição vertical do compositor entre as frases medidas em desktop. No mobile, a variação medida foi de **0 px**, e não houve overflow horizontal.

## Validações

Os cinco testes novos verificam:

- Login e novo login na mesma página abrem a Home limpa; contagem de sessões inalterada antes da primeira mensagem.
- Conversa anterior e atleta recuperáveis pelo histórico. Linhas de mensagens anteriores e documento médico fictício permanecem inalterados após login e primeira mensagem de uma conversa nova.
- Digitação e rotação locais; pausa por foco, rascunho e visibilidade; desmontagem ao deixar a Home.
- Indicador único com três pontos, fase opcional de ferramenta, texto parcial, conclusão, erro e cancelamento. O banco não recebe as frases do indicador.
- Cancelamento durante a abertura inicial mantém uma única sessão ativa e permite persistir a mensagem seguinte na conversa correta.
- Movimento reduzido apresenta texto completo estático e pontos sem animação. Heading não anuncia caracteres.

- Lint, typecheck e build passaram.
- Rodada completa serial: **60 passaram e 4 falharam**, em 64 casos. Os **cinco testes novos passaram** nessa rodada.
- Três falhas de voz eram fixtures que registravam uma proposta antes de a UI iniciar sua conversa corrente. Foram ajustadas para registrar a proposta nessa conversa, mantendo todas as verificações de aprovação explícita, autoria, idempotência e auditoria. Reexecução de contexto e documentos por voz: **3/3 passaram**. Nenhum código de confirmação foi alterado.
- A falha remanescente é a longitudinal preexistente, `tests/longitudinal-history.spec.mjs:217`: espera um documento criado em 18/11 em intervalo fixo encerrado em 17/11. O teste e a implementação correspondente foram preservados. A suíte completa não foi repetida após os ajustes exclusivos nas fixtures; os arquivos afetados foram repetidos.
- O patch isolado, sem a implementação longitudinal não commitada do workspace, passou em lint e build. No worktree isolado, os **5/5 testes novos passaram**. Uma rechecagem adicional da animação validou também o compositor estável no mobile.

## Acessibilidade e limitações

A varredura axe-core da região principal alterada, com tags WCAG A/AA até 2.2, não reportou violações nem avaliações incompletas. A página inteira tem uma ocorrência **preexistente**, `label-content-name-mismatch`, no botão de Conta: a especialidade visível não está incluída no nome acessível. O trecho não foi alterado por este handoff de escopo fechado. O JSON separa o resultado da região alterada do resultado da página inteira. Não se declara certificação de acessibilidade ou teste completo com leitores de tela/Safari/iOS. Os testes de voz usam transporte/provedor simulados e captura fictícia do Playwright; não houve chamada ao Gemini nem verificação de microfone físico nesta entrega.

O tempo de digitação é uma programação de 50 ms; carga do navegador pode atrasar frames. O modo de movimento reduzido permanece estático. A pausa recomeça o intervalo de espera ao retornar. As capturas de frases são determinísticas no teste; a produção escolhe localmente uma frase aleatória.

O estado de ferramenta é mostrado somente quando houver sinal explícito. O transporte atual do agente continua emitindo os eventos que já possuía; este handoff não acrescentou instrumentação do backend. O teste da fase de ferramenta é uma simulação do evento na camada de apresentação, não evidência de um evento novo emitido pelo agente real.

Abrir uma Home limpa não inicia sessão. Mensagem efetiva, upload confirmado e o comando explícito de nova conversa continuam podendo criar sessão pelas operações existentes. A primeira mensagem pode incluir uma espera adicional pela abertura da sessão; isso impede reutilizar ou sobrescrever a conversa antiga. Nenhuma conversa anterior é apagada.

## Estado de entrega

As alterações longitudinais que já existiam no workspace foram preservadas e excluídas deste commit. O patch é verificado também sem esses arquivos, em worktree temporário. Sem merge, publicação ou implantação.
