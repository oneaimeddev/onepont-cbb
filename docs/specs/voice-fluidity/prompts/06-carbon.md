# Prompt 06

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local; sem merge ou deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: etapas 02–05 e revisão A. Objetivo: configurar Carbon e resolver consultas/referências naturais usando C3 e C7, sem ampliar poderes de gravação.

Referências: config.ts, agent.ts, athlete-resolution.ts, document-resolution.ts, history-analysis.ts, operations/workflow-service.ts, SDK instalado e .env.example.

1. Verifique a API oficial e tipos da versão instalada do @ai-sdk/google. Configure gemini-4-carbon explicitamente, com esforço baixo se suportado; não adivinhe providerOptions.
2. Mantenha transcrição separada, com configuração server-only e fallback compatível da chave quando necessário. Não altere .env real, produção ou modelo silenciosamente em erro.
3. Reuse o loop de ferramentas. Disponibilize estado de tarefa e perguntas validadas. Registre perguntas estruturadas, com opções autorizadas e TTL, sem confiar em texto inventado pelo cliente.
4. Resolva variações de busca, escolha e consulta, “ela”, “o segundo”, “a outra”, conforme C3. Uma referência ambígua gera uma pergunta específica.
5. Evite interceptação genérica de “sim/confirmo” por fluxo documental sem challenge pertinente. Mantenha confirmadores clínicos determinísticos e os bloqueios de voz.
6. Preserve caminhos determinísticos rápidos seguros. Não adicione uma chamada LLM classificadora antes de cada chamada ao agente.
7. Prompts, schemas e tools não podem conceder consentimento, inventar evidência nem buscar dados fora das permissões. Não altere interpretação de patches ainda: etapa 07.

Aceite: T09–T10, T24–T25, T29, T31–T32 e T40. Inclua fixture de tool calling Google compatível, erro do provider e cenários de nomes parecidos. Se chamada real não estiver disponível, marque T25 pendente e documente configuração. Isso não autoriza alegar homologação real.

Ao terminar, escreva docs/delivery/voice-fluidity/06.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final e se a etapa seguinte está liberada. Não avance para ela. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
