# Prompt 03

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local; sem merge ou deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: relatórios 01, 02a e 02b. Objetivo: adotar C2–C4 na UI para texto e voz, substituindo a persistência transitória por um ciclo único.

Referências: intelligence-home.tsx, transcript.ts, conversation.ts, message-composer.tsx e voice/use-voice-session.ts.

1. Extraia um coordenador tipado de turnos, com trava síncrona, fila de mensagens individuais e revisão do servidor. Evite refatoração visual ampla.
2. Use o novo envelope também no caminho longitudinal e nas confirmações existentes. Retire a confirmação paralela do cliente; continue exibindo seu resultado.
3. Preserve turnId em falhas/retries e texto até aceite. Resultado deve ser reconciliado se a resposta HTTP foi perdida. Não repetir efeito automaticamente.
4. Mantenha captura e processamento independentes. A fila aparece como falas pendentes, com relação new/supplement/correction e alvo validado; não junte todos os textos.
5. Implemente cancelamento/reconciliação de C4, sem prometer desfazer gravação. Correção incerta fica preservada para esclarecimento.
6. Atualize revisão, pergunta pendente, atleta e cartões de um único resultado autorizado. Ignore apresentação de respostas obsoletas.
7. Garanta origem voice para transcrição revisada no composer. Uma mensagem inteiramente nova digitada continua text; limpar o rascunho limpa a proveniência.
8. Remova dupla persistência de turnos migrados. Preserve histórico, navegação, anexos e UI tradicional.

Aceite: T01–T14, T19, T30–T32, T37–T40, com foco em concorrência e texto preservado. Teste duas abas, conflito e troca de conversa. Não afrouxe estado servidor para acomodar a UI.

Ao concluir, a próxima ação é revisão A; não execute captura ou mudanças de Carbon ainda.

Ao terminar, escreva docs/delivery/voice-fluidity/03.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
