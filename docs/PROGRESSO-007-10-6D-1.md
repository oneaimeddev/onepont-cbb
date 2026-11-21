# Progresso — 007.10.6D.1

Baseline: 0da6779 (007.10.6D completo). Branch: fix/handoff-007-10-6d-1-direct-evolution. Main permanece 5f86dac.

- Backend implementado e validado: RPC evolution_submit reutiliza clinical_save dentro de transação; rollback integral em falha; recibo idempotente no audit_events existente, sem conteúdo/hash clínico. Nenhuma nova entidade clínica.
- Uma migração necessária: 20261121000600. A operação anterior não suportava criação+finalização atômicas.
- 11 testes novos de backend passaram (36,5 s), incluindo concorrência, rollback, falha após persistência e repetição.
- Formulário tradicional em validação: primária Finalizar evolução; secundária Salvar rascunho; retenção de conteúdo e mesma chave nas retentativas; sem confirmação adicional.
- Próximos passos: testes UI, regressão 007.10.6D e confirmação do chat; lint/typecheck/build; capturas e relatório.
- Não realizar merge, push ou deploy.

## Fechamento funcional

- 13 testes novos de backend aprovados: 12 em execução direcionada (41,5 s) e revogação/replay auditado em teste específico (8,5 s).
- 11 testes de UI/contratos afetados aprovados (1,1 min), incluindo 5 cenários novos e 6 regressões tradicionais/conversacionais.
- 15 testes do 007.10.6D aprovados (47,0 s).
- Total: 39 cenários distintos, sem suíte integral.
- Captura neutra do formulário e trava de edição durante atualização do rascunho revalidadas por testes específicos (14,0 s e 12,8 s).
- Build, lint sem warnings e typecheck aprovados no estado final.
- Zero contas temporárias e zero gatilhos de injeção de falha remanescentes. Arquivo de migração idêntico ao histórico local.
- Nova chave de submissão é privada ao ator, independente do identificador de atendimento; recibos não armazenam título, corpo ou hash clínico.
- Preservação do texto após falha e da chave durante retentativas comprovada com perda real de resposta simulada após commit.
- Próximo passo: concluir relatório e homologar; não realizar merge/push/deploy.
