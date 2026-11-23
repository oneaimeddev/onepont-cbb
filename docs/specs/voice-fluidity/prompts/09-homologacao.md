# Prompt 09

Você vai implementar uma única etapa do fluxo de voz do Prontuário CBB. Não precisa do histórico do chat que criou o plano.

Leia as instruções locais para encontrar o repositório, seu AGENTS.md e os arquivos README.md, REGRAS.md, CONTRATOS.md e ACEITE.md em docs/specs/voice-fluidity. Trabalhe na branch feat/voice-conversation-fluidity. Siga integralmente REGRAS.md: dados fictícios, escopo limitado, testes, relatório e commit local; sem merge ou deploy; somente a etapa 09 pode enviar a branch ao GitHub.

Dependência: etapas 01–08 concluídas, revisões A/B aprovadas. Objetivo: executar ACEITE.md de ponta a ponta e entregar evidências sem ampliar implementação.

1. Confira commits e relatórios. Rode lint, typecheck, build e suites pertinentes, incluindo voz, contexto, documentos, operações, histórico e regressão do chat digitado.
2. Execute todos os cenários T01–T40 ou marque explicitamente os que dependem de infraestrutura ausente. Não altere asserts apenas para esconder falha.
3. Corrija apenas regressões localizadas; se envolver contrato de autoridade/consentimento, devolva a etapa à revisão correspondente.
4. Adapte scripts/voice-homologation.mjs para separar tempo de transcrição, espera do cliente e operação. Mantenha somente frases fictícias e relatório sanitizado.
5. Com credencial autorizada, rode o conjunto com Carbon real sem tocar em produção. Não use acesso a arquivos .env como autorização para mudar ambiente.
6. Conduza ou forneça o roteiro de homologação humana de ACEITE.md. Não alegue microfone físico testado a partir de Playwright com fake device.
7. Meça p50/p95 e reporte qualidade de referências/correções, perdas, duplicações e conflitos. Não use texto “processando” como resposta útil.
8. Atualize ADR 0013 e a documentação do fluxo entregue. Descreva configuração de ativação/rollback sem aplicar mudanças de produção.

Entrega: matriz requisito→evidência, limitações e estado “apto para revisão de publicação” ou pendências concretas. Após checks automatizados aprovados, faça o commit e envie somente feat/voice-conversation-fluidity ao remote GitHub verificado, sem force push. Preserve o filtro de deploy existente; não envie main nem faça merge/deploy. Pendência de homologação humana deve ficar explícita na branch e na resposta. Se checks críticos falharem, entregue o bloqueio e não apresente a branch como pronta. Informe hash e referência remota.

Ao terminar, escreva docs/delivery/voice-fluidity/09.md, execute os checks pertinentes e faça um commit local com os arquivos da etapa. Informe resultados reais, hash final, referência remota e pendências para revisão de publicação. Não publique a main. Se alguma dependência não estiver concluída, explique o bloqueio concreto sem substituí-la por mocks.
