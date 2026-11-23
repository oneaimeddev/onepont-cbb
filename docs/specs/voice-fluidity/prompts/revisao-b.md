# Revisão B de interpretação e consentimento

Você é o revisor de arquitetura deste pacote. Faça revisão, não implementação. Leia as instruções locais, AGENTS.md e docs/specs/voice-fluidity/{README,REGRAS,CONTRATOS,ACEITE}.md. Não precisa do histórico do chat de planejamento.

Confira a branch feat/voice-conversation-fluidity, os relatórios de entrega e os commits reais. Examine o diff desde o checkpoint indicado e os arquivos finais, além de executar testes focados quando necessário. Não declare aprovação somente porque o executor relatou testes verdes.

Dependência: revisão A e etapas 04–07 concluídas. Revise os commits posteriores ao checkpoint A, incluindo mudanças na integração de servidor.

Verifique especialmente:
- Parser não transforma negação ou pergunta em ordem removendo palavras.
- Carbon não pode confirmar sua própria operação nem chamar gateway de assinatura.
- Valores clínicos têm spans humanos válidos e alvo/versão autorizados.
- Referências curtas usam pergunta/lista correta e invalidam após troca.
- “Sim/confirmo” não captura arbitrariamente outra tarefa.
- Não há salto de permissões por mudar de voz para texto ou usar rota alternativa.
- Confirmação de assinatura por voz continua bloqueada.
- Captura em Ditado não envia por silêncio.
- Reconexão preserva texto sem fingir captura no intervalo e sem replay.
- Configuração Carbon corresponde a API/SDK reais; mock não é homologação linguística.

Execute ou confira T15–T32, T05, T07 e T38–T40. Entregue reparos para o executor específico, sem permitir expansão dos confirmadores. A próxima etapa liberada, se aprovada, é 08.

Relate cada achado com gravidade, cenário reproduzível, arquivo/linha e ajuste esperado. Diferencie defeito confirmado de hipótese a testar. Não invente achados para preencher uma lista. Registre resultado aprovado ou reprovado, commits revisados, evidências e pendências não bloqueantes. Se reprovado, forneça um prompt de reparo limitado ao defeito, com testes; não reescreva todo o plano. A aprovação cobre os hashes revisados e deve ser reavaliada se houver alteração material.

Escreva apenas o relatório em docs/delivery/voice-fluidity/revisao-b.md. Não altere implementação, faça push ou publique. Não precisa de nova autorização para a revisão read-only e seus testes locais.
