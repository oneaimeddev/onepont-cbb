# Revisão A de concorrência e autoridade

Você é o revisor de arquitetura deste pacote. Faça revisão, não implementação. Leia as instruções locais, AGENTS.md e docs/specs/voice-fluidity/{README,REGRAS,CONTRATOS,ACEITE}.md. Não precisa do histórico do chat de planejamento.

Confira a branch feat/voice-conversation-fluidity, os relatórios de entrega e os commits reais. Examine o diff desde o checkpoint indicado e os arquivos finais, além de executar testes focados quando necessário. Não declare aprovação somente porque o executor relatou testes verdes.

Dependência: 01, 02a, 02b e 03 concluídas. Revise desde ce14154 até o checkpoint 03, isolando mudanças deste pacote de eventual trabalho externo.

Verifique especialmente:
- Turno tem sessão explícita, exclusividade e revisão validadas no servidor.
- Duas abas, respostas antigas e falha de save não cruzam contextos.
- Replays e reservas vencidas não repetem efeitos.
- Cancelamento do transporte não é confundido com rollback.
- Verificação antes do efeito ocorre na proteção transacional adequada.
- Todas as rotas de envio e a confirmação paralela foram coordenadas.
- Origem voice permanece em transcrição revisada.
- Histórico sanitizado/revogado e RPCs legadas não contornam o novo contrato.
- Ledger de turno não cria novo poder de assinatura ou consentimento.
- Compatibilidade com o fluxo tradicional.

Execute ou confira evidência concreta de T02–T08, T11–T14, T31–T32 e T37–T40. Uma falha de autorização, idempotência, perda de texto ou isolamento bloqueia o gate. A próxima etapa liberada, se aprovada, é 04.

Relate cada achado com gravidade, cenário reproduzível, arquivo/linha e ajuste esperado. Diferencie defeito confirmado de hipótese a testar. Não invente achados para preencher uma lista. Registre resultado aprovado ou reprovado, commits revisados, evidências e pendências não bloqueantes. Se reprovado, forneça um prompt de reparo limitado ao defeito, com testes; não reescreva todo o plano. A aprovação cobre os hashes revisados e deve ser reavaliada se houver alteração material.

Escreva apenas o relatório em docs/delivery/voice-fluidity/revisao-a.md. Não altere implementação, faça push ou publique. Não precisa de nova autorização para a revisão read-only e seus testes locais.
