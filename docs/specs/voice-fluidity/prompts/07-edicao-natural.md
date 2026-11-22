# Prompt 07

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local; sem merge ou deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: etapa 06 concluída. Objetivo: C8, substituindo rigidez de linguagem por interpretação estruturada de propostas, sem enfraquecer autorização.

Referências: operations/document-intent.ts, document-service.ts, document-creation.ts, clinical-draft-actions.ts, agent.ts e serviços/RPCs de proposta.

1. Centralize o resolvedor de patches/valores validados. O caminho determinístico e o semântico usam o mesmo resolvedor e RPCs versionados.
2. A intenção semântica inclui alvo, campo, operação e spans de evidência da fala humana. Nunca aceite texto livre do modelo como novo valor clínico sem origem validada.
3. Respostas curtas só completam pendingQuestion ativa, com proposta/versão/atleta iguais. Não use uma mensagem de outra tarefa para preencher valores.
4. Aceite cortesia, paráfrase e autocorreção clara. Diferencie ordem, pergunta, negação e hipótese. Não basta remover “não” ou “?” antes da regex.
5. Atualize somente propostas autorizadas e preserve os campos não pedidos. Mostre alterações. Conflitos e dirty card exigem resolução, não sobrescrita.
6. Para evoluções, mantenha guards e contratos próprios. Para documentos médicos, preserve schemas e validação literal já existentes. Não trate todos como uma tabela genérica.
7. Salvar/finalizar/assinar continuam nos respectivos fluxos humanos; não exponha gateway de confirmação ao modelo e não habilite assinatura por voz.
8. Remova interceptações que bloqueiam paráfrase antes de permitir o caminho semântico, mas preserve validações finais do servidor.

Aceite: T26–T32, T14, T28 e T40. Teste span falso, unidade inferida, alteração de outro item/atleta, negação, hipótese, source de assistant, proposta modificada e confirmação fabricada. Mocks de intenção e testes de banco verificam proteção; exemplos reais com Carbon ficam identificados separadamente.

Ao concluir, liberar somente a revisão B. Não avançar para feedback antes dela.

Ao terminar, escreva docs/delivery/voice-fluidity/07.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
