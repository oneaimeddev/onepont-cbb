# Progresso — 007.10.6D.1

Baseline: 0da6779 (007.10.6D completo). Branch: fix/handoff-007-10-6d-1-direct-evolution. Main permanece 5f86dac.

- Backend implementado e validado: RPC evolution_submit reutiliza clinical_save dentro de transação; rollback integral em falha; recibo idempotente no audit_events existente, sem conteúdo/hash clínico. Nenhuma nova entidade clínica.
- Uma migração necessária: 20261121000600. A operação anterior não suportava criação+finalização atômicas.
- 11 testes novos de backend passaram (36,5 s), incluindo concorrência, rollback, falha após persistência e repetição.
- Formulário tradicional em validação: primária Finalizar evolução; secundária Salvar rascunho; retenção de conteúdo e mesma chave nas retentativas; sem confirmação adicional.
- Próximos passos: testes UI, regressão 007.10.6D e confirmação do chat; lint/typecheck/build; capturas e relatório.
- Não realizar merge, push ou deploy.
