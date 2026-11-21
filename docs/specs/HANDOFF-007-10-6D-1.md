# HANDOFF 007.10.6D.1 — Simplificação da Criação de Evoluções Clínicas

**Projeto:** Prontuário CBB  
**Prioridade:** P1 — Refinamento do fluxo tradicional para o primeiro release  
**Natureza:** Ajuste pontual de UX e orquestração clínica  
**Baseline:** Estado mais recente do repositório, incluindo as correções anteriores de evoluções  
**Escopo:** Exclusivamente criação, salvamento e finalização de evoluções clínicas.

---

## 1. Contexto

Atualmente, o fluxo de criação de uma evolução exige:

1. Clicar em **Nova evolução**.
2. Preencher os dados.
3. Clicar em **Salvar rascunho**.
4. Posteriormente, solicitar e confirmar a finalização.

Esse processo introduz etapas desnecessárias para o profissional que já terminou seu registro e deseja publicá-lo.

A decisão de produto aprovada é simplificar o fluxo para:

**Nova evolução → Preencher → Finalizar evolução**

O salvamento de rascunho permanece disponível, mas deixa de ser obrigatório.

Este handoff não deve refazer nem modificar as correções de timeline, sigilo de Psicologia e edição/versionamento de evoluções já implementadas.

## 2. Nova experiência do formulário

Na tela de criação de evolução, apresentar duas ações claramente identificadas:

### Ação primária — Finalizar evolução

- Deve estar visualmente destacada.
- Executa a validação, persistência e finalização.
- Não exige salvamento manual anterior.
- Não abre um modal genérico de confirmação.
- Redireciona ou atualiza a interface para exibir a evolução finalizada.

### Ação secundária — Salvar rascunho

- Salva o conteúdo sem finalizar.
- Permite continuar editando posteriormente.
- Preserva o comportamento de rascunho já existente.

Preservar a ação de cancelar/voltar e a proteção contra perda de conteúdo não salvo.

Não redesenhar o formulário, alterar seus campos ou modificar a estrutura da navegação.

## 3. Finalização direta

Ao clicar em **Finalizar evolução**, o sistema deverá:

1. Validar os campos obrigatórios.
2. Validar o usuário autenticado e sua autorização clínica.
3. Aplicar as regras de sigilo existentes.
4. Persistir o conteúdo atual do formulário.
5. Registrar a finalização.
6. Preservar autoria e data/hora corretas.
7. Registrar a auditoria correspondente.
8. Atualizar a timeline e apresentar o registro finalizado.

A persistência e a finalização deverão ocorrer em uma operação transacional ou mecanismo equivalente que garanta integridade.

Não deixar um rascunho intermediário indevido quando a finalização falhar.

Não criar uma evolução duplicada quando houver:

- Clique duplo.
- Requisição repetida.
- Timeout.
- Perda de resposta após gravação.
- Retentativa.

### Evolução já salva como rascunho

O mesmo botão **Finalizar evolução** deverá finalizar o rascunho existente, utilizando seu identificador e a versão atual.

Não criar um segundo registro clínico.

## 4. Confirmação e feedback

Remover exclusivamente a confirmação genérica obrigatória que atualmente aparece após a solicitação de finalização na interface tradicional.

O próprio botão **Finalizar evolução** expressa a intenção do usuário.

A operação deverá apresentar estados claros:

- Validando.
- Finalizando.
- Finalizado.
- Erro recuperável.

Bloquear interações duplicadas enquanto a operação estiver em andamento.

Em caso de falha:

- Preservar o conteúdo.
- Exibir mensagem compreensível.
- Permitir uma retentativa segura.
- Não informar sucesso sem confirmação do backend.

Após o sucesso, exibir a evolução publicada na jornada habitual, com acesso às ações de correção que já existirem.

## 5. Preservações obrigatórias

**Não modificar neste handoff:**

- Regras de visibilidade da timeline.
- Metadados de evoluções restritas.
- Sigilo obrigatório de Psicologia.
- Políticas de acesso entre especialidades.
- Edição e retificação de evoluções publicadas.
- Histórico de revisões.
- Documentos médicos e assinatura.
- Motor de entrega.
- CBB Intelligence e suas ferramentas.
- Protocolo de confirmação clínica do chat.
- Modelo clínico dos campos de evolução.

A simplificação é exclusiva da interface tradicional.

Reutilizar os serviços e regras do backend existentes, alterando apenas o necessário para suportar a finalização direta de maneira segura.

Não introduzir migrações ou novas entidades sem necessidade demonstrada.

## 6. Identidade visual

Preservar o Clinical Design North Star e a paleta aprovada no 007.10.6C.

- **Finalizar evolução:** ação primária, utilizando os tokens existentes.
- **Salvar rascunho:** ação secundária.
- Manter os estados de foco, loading e disabled.
- Preservar responsividade e operação por teclado.

Não criar novos estilos globais desnecessariamente.

## 7. Estratégia de implementação

Antes de alterar código:

1. Inspecionar o estado atual do Git e preservar o trabalho existente.
2. Identificar o formulário de criação.
3. Identificar a operação atual de salvamento.
4. Identificar a operação de finalização.
5. Verificar se existe uma operação transacional reutilizável.
6. Implementar o caminho direto sem duplicar as regras clínicas.
7. Criar branch ou commit específico conforme a estratégia atual do repositório.

Evitar refatorações extensas.

Se o backend já permitir salvar e finalizar diretamente com segurança, priorizar a alteração de interface e orquestração.

## 8. Testes direcionados

Aplicar a política de testes proporcionais ao risco.

Verificar:

1. Criar e finalizar diretamente uma evolução médica.
2. Criar e finalizar diretamente uma evolução de Psicologia, preservando seu sigilo.
3. Salvar rascunho sem finalizar.
4. Retomar rascunho e finalizar.
5. Validar campos obrigatórios.
6. Bloquear usuário sem autorização.
7. Evitar duplicação por clique repetido.
8. Recuperar resposta perdida após persistência.
9. Preservar conteúdo após falha.
10. Registrar autoria e auditoria.
11. Atualizar a timeline uma única vez.
12. Confirmar a ausência do modal genérico de confirmação.
13. Verificar desktop e mobile.
14. Confirmar que as regras de timeline, sigilo e edição anteriores continuam funcionando.

Executar testes direcionados e regressão dos contratos diretamente afetados.

Executar lint, typecheck e build.

Não executar a suíte integral indiscriminadamente para este ajuste pontual.

## 9. Critérios de aceite

O handoff estará concluído quando:

- O profissional conseguir preencher e finalizar uma evolução diretamente.
- Não for necessário salvar rascunho antes de finalizar.
- Não existir confirmação genérica adicional.
- A opção de salvar rascunho permanecer disponível.
- Um rascunho existente puder ser finalizado sem gerar duplicidade.
- A persistência e a finalização forem seguras e auditáveis.
- O formulário preservar informações em caso de falha.
- As regras existentes de sigilo e autorização continuarem intactas.
- Nenhuma alteração for realizada na timeline, edição ou jornada conversacional além de regressões estritamente necessárias.

## 10. Entrega final

Apresentar:

- Resumo das alterações.
- Arquivos modificados.
- Fluxo anterior versus novo.
- Estratégia de persistência e idempotência.
- Captura real do formulário com as duas ações.
- Evidência da finalização direta.
- Resultado dos testes direcionados.
- Estado da branch e commits.
- Eventuais limitações.

Não realizar merge, push ou deploy sem homologação.

---

## Diretriz final

**O profissional não precisa compreender o ciclo técnico de persistência para registrar uma evolução clínica.**

Ele deve apenas escolher entre guardar o trabalho para depois ou finalizar o atendimento.

O sistema é responsável por executar as operações necessárias, preservando a segurança, a rastreabilidade e todas as regras clínicas já implementadas.
