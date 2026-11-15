# HANDOFF 003 — Athlete Workspace & Longitudinal Medical Record

**Projeto:** Prontuário CBB  
**Categoria:** Product / UX / Clinical Workflow  
**Prioridade:** P0  
**Dependências:** Handoffs anteriores, incluindo o workspace conversacional  
**Marco:** Versão demonstrável de 17/11/2026

## 1. Missão

Implementar a experiência central de trabalho do Prontuário CBB: o **Perfil do Atleta e seu Prontuário Longitudinal Multiprofissional**.

O atleta deve se tornar a entidade central da navegação, permitindo que profissionais autorizados consultem seu histórico e realizem operações relacionadas ao acompanhamento clínico.

A experiência deve integrar:

- Identidade e contexto do atleta.
- Histórico clínico longitudinal.
- Registros de múltiplas especialidades.
- Navegação tradicional.
- Chat contextual com IA, conforme capacidades existentes.
- Permissões granulares.
- Auditoria completa das operações relevantes.

Não criar um produto separado. Evoluir a experiência existente.

## 2. Decisões de produto aprovadas

Estas decisões são obrigatórias:

1. **Athlete First:** o atleta é a entidade central do produto.
2. **Cadastro manual inicial:** criar e identificar atletas sem depender de integrações externas.
3. **Integração CBB futura:** preservar identificadores internos e permitir associação posterior a identificadores oficiais.
4. **Prontuário longitudinal compartilhado:** um histórico clínico integrado por atleta.
5. **Acesso granular:** compartilhamento não significa visibilidade irrestrita.
6. **Chat First:** a IA é uma forma central de interação, integrada à interface tradicional.
7. **Auditoria obrigatória:** rastrear acessos, alterações, autoria, origem das operações e aprovações.
8. **Identidade CBB:** preservar o logotipo oficial, as cores institucionais e o Design System.
9. **Supervisão humana:** a IA não pode finalizar ações clínicas sem a aprovação exigida.

As políticas detalhadas de acesso, sigilo e compartilhamento por profissão ainda precisam de validação clínica e jurídica. Use uma postura conservadora enquanto essas definições não estiverem formalizadas.

## 3. Inspeção inicial

Antes de alterar código:

- Inspecione `AGENTS.md`, `DESIGN.md` e as skills disponíveis.
- Identifique o estado real dos handoffs anteriores.
- Verifique entidades e contratos existentes.
- Identifique mecanismos atuais de autenticação e autorização.
- Verifique os eventos de auditoria já suportados.
- Inspecione a navegação existente.
- Identifique componentes compartilhados.

Reutilize a arquitetura atual sempre que adequado.

Não recrie estruturas que já existam.

## 4. Estrutura do Athlete Workspace

Implementar ou evoluir a página central do atleta.

### 4.1 Cabeçalho do atleta

Apresentar:

- Nome completo e, quando aplicável, nome social.
- Identificador interno.
- Data de nascimento ou idade calculada.
- Clube/equipe, se disponível.
- Categoria esportiva, se disponível.
- Status cadastral.
- Origem do cadastro.

O identificador interno não deve depender de nome, CPF ou código externo da CBB.

Nenhum campo ausente deve ser preenchido com valores fictícios.

### 4.2 Navegação interna

Organizar o perfil com as seguintes áreas:

**Visão geral**
- Identificação resumida.
- Contexto esportivo.
- Resumo clínico autorizado, quando disponível.
- Ações principais.

**Linha do tempo**
- Eventos clínicos em ordem cronológica.
- Origem por especialidade.
- Profissional responsável.
- Data do evento.
- Status.
- Acesso aos detalhes autorizados.

**Atendimentos**
- Registros e evoluções clínicas.
- Organização por especialidade.
- Identificação de autoria.
- Estados de rascunho e finalização, quando existentes.

**Exames e documentos**
- Documentos clínicos associados ao atleta.
- Metadados e origem.
- Controle de acesso.

**Dados cadastrais**
- Informações de identificação.
- Dados esportivos.
- Origem e identificadores externos.
- Edição conforme permissão.

Apresente somente módulos realmente disponíveis. Para funcionalidades ainda não implementadas, utilize estados explícitos de indisponibilidade ou mantenha sua navegação fora do fluxo principal.

Não preencha áreas vazias com dados clínicos artificiais.

## 5. Linha do tempo longitudinal

A timeline será o principal mecanismo de consulta histórica do atleta.

### Comportamento

- Ordenar eventos cronologicamente.
- Identificar tipo e especialidade.
- Exibir autoria e data.
- Diferenciar estados dos registros.
- Permitir abrir detalhes autorizados.
- Utilizar os eventos reais disponíveis no sistema.

Preparar a composição para filtros futuros por:

- Especialidade.
- Período.
- Tipo de registro.
- Profissional.
- Status.

### Segurança

A timeline deve apresentar exclusivamente dados autorizados.

Não revelar conteúdo, existência, contagens ou metadados restritos a usuários sem permissão.

Se um evento estiver inacessível, não usar sua existência para produzir resumos, sugestões ou inferências para aquele usuário.

## 6. Modelo de permissões

Adotar como direção de produto um modelo que combine:

- Papel do usuário.
- Relação assistencial autorizada.
- Tipo de recurso.
- Classificação de confidencialidade.
- Operação solicitada.

Exemplos de operações:

- Visualizar perfil.
- Consultar registro.
- Criar registro.
- Alterar rascunho.
- Finalizar registro.
- Consultar trilha de auditoria.
- Administrar permissões.

### Regras mínimas

- O profissional não deve acessar informações fora de suas permissões.
- O administrador não recebe acesso irrestrito ao conteúdo clínico apenas por administrar o sistema.
- A permissão de consultar não implica permissão de alterar.
- O agente de IA opera respeitando o escopo de autorização do usuário responsável.
- O frontend não substitui as verificações de autorização no backend.
- Usuários sem autorização não devem conseguir obter informações por API, URL direta ou chat.

Não implementar uma matriz arbitrária e definitiva por especialidade.

Reutilizar as políticas existentes e documentar as lacunas que exigem decisão de produto ou validação profissional.

Na ausência de autorização comprovada, negar o acesso de forma segura.

## 7. Contexto ativo do atleta

Uma vez selecionado o atleta, ele se torna o contexto ativo da navegação clínica.

### Requisitos

- Identificação visível do atleta atual.
- Persistência coerente do contexto durante a navegação.
- Possibilidade de trocar de atleta.
- Limpeza ou revalidação de ações pendentes ao trocar de contexto.
- Prevenção de alterações no atleta errado.

Não depender exclusivamente da memória conversacional para identificar o atleta.

O contexto deve ser explícito, verificável e associado a um identificador interno.

## 8. Integração com o Chat First

O usuário deverá conseguir iniciar uma interação contextual a partir do perfil do atleta, respeitando o estado real de implementação do agente.

Exemplos de intenções futuras:

- Consultar últimas evoluções.
- Buscar eventos de uma especialidade.
- Solicitar resumo longitudinal.
- Preparar registro de nova evolução.

### Regras obrigatórias

1. A IA só pode consultar dados autorizados.
2. Toda informação clínica apresentada deve ter origem verificável.
3. Respostas não podem inventar achados clínicos.
4. Ações propostas devem ser diferenciadas de ações executadas.
5. Ações que exigem aprovação humana precisam passar por revisão explícita.
6. Ações executadas precisam preservar o responsável humano.
7. Mudanças de contexto do atleta invalidam ou exigem reconfirmação de operações pendentes.

Se o backend de IA ainda não oferecer essas capacidades, preparar somente a integração visual e os contratos necessários, sem simular execução clínica real.

## 9. Autoria, integridade e auditoria

A auditoria é parte essencial da primeira versão demonstrável.

Para cada operação auditável, utilizar os mecanismos existentes para registrar:

- Usuário responsável.
- Entidade ou registro envolvido.
- Identificador da entidade.
- Tipo de operação.
- Data e hora.
- Origem da operação: interface tradicional ou agente de IA.
- Responsável humano por aprovação, quando aplicável.
- Resultado da operação.

Registrar visualizações de informações clínicas conforme a política do produto.

Evitar incluir dados clínicos sensíveis desnecessários no conteúdo dos logs.

### Integridade de registros

Diferenciar registros em elaboração de registros finalizados, quando esses estados já estiverem disponíveis.

Não sobrescrever silenciosamente documentos clínicos finalizados.

Preparar o produto para retificações, versionamento e preservação da autoria, sem introduzir um mecanismo de assinatura ou certificação não especificado.

## 10. Identidade e integração futura com CBB

O atleta deve possuir uma identidade interna estável.

Preparar o modelo conceitualmente para vincular identificadores externos da CBB no futuro.

Não assumir:

- Que CPF está sempre disponível.
- Que nome é único.
- Que o vínculo com clube é permanente.
- Que um identificador externo substituirá o identificador interno.
- Que a integração oficial já possui API ou contrato disponível.

Mudanças de clube ou categoria não devem alterar retroativamente fatos clínicos históricos.

Evitar migrações estruturais não justificadas pelo escopo atual.

## 11. Diretrizes de interface

Utilizar o App Shell e o Design System estabelecidos.

O perfil deve parecer uma área de trabalho clínico, não um conjunto de cards decorativos.

Priorizar:

- Boa hierarquia de informações.
- Navegação clara.
- Densidade apropriada.
- Tipografia consistente.
- Timeline de fácil leitura.
- Ações próximas ao contexto.
- Identificação clara de autoria e status.
- Estados vazios úteis.
- Responsividade.

Não executar outro redesenho geral.

Preservar os avanços visuais dos handoffs anteriores.

## 12. Escopo de implementação

### P0 — Obrigatório para a demonstração

1. Abrir perfil de atleta existente.
2. Exibir dados reais do cadastro.
3. Manter contexto ativo do atleta.
4. Navegar entre as seções efetivamente disponíveis.
5. Apresentar eventos reais existentes em uma timeline, quando houver suporte.
6. Restringir acesso conforme permissões existentes.
7. Registrar eventos auditáveis previstos.
8. Preparar o ponto de entrada do chat contextual.
9. Validar os principais estados de erro e ausência de dados.

### P1 — Após estabilização

1. Filtros avançados da timeline.
2. Visualizações específicas por especialidade.
3. Gestão avançada de exames e documentos.
4. Resumos clínicos estruturados.
5. Integração funcional ampliada com o agente.

### P2 — Futuro

1. Integração com base oficial CBB.
2. Compartilhamento avançado entre organizações.
3. Gestão refinada de equipes assistenciais.
4. Inteligência longitudinal e análises clínicas assistidas.

Não transformar itens P1 ou P2 em pré-requisitos do P0.

## 13. Critérios de aceite

Validar pelo menos os seguintes cenários:

**C01 — Seleção**
Um profissional autorizado seleciona um atleta e acessa seu perfil correto.

**C02 — Identidade**
Os dados exibidos correspondem ao cadastro persistido, sem preenchimento artificial.

**C03 — Contexto**
Ao navegar pelo sistema, o atleta selecionado permanece corretamente identificado.

**C04 — Troca de atleta**
Ao mudar o atleta ativo, operações pendentes não podem ser aplicadas ao atleta anterior ou ao novo sem validação apropriada.

**C05 — Histórico**
Os eventos clínicos existentes aparecem em ordem cronológica, respeitando as permissões.

**C06 — Acesso negado**
Um usuário sem permissão não consegue consultar o prontuário ou obter dados protegidos por outras rotas.

**C07 — Auditoria**
O acesso a informações clínicas e as alterações relevantes geram os eventos de auditoria definidos.

**C08 — Agente de IA**
O chat não amplia permissões nem conclui ações que exigem aprovação humana.

**C09 — Estado vazio**
O sistema apresenta um estado compreensível quando não existem eventos clínicos para o atleta.

**C10 — Regressão**
Cadastro, busca, autenticação, navegação e funcionalidades anteriores continuam funcionando.

Se uma dependência ainda não existir, documentar o bloqueio e não considerar o cenário aprovado sem teste.

## 14. Execução e entrega

Execute de forma incremental.

1. Inspecione o projeto e identifique capacidades existentes.
2. Registre decisões e dependências.
3. Implemente o escopo P0 suportado.
4. Preserve os fluxos atuais.
5. Rode os testes disponíveis.
6. Valide a experiência no navegador, quando possível.
7. Faça uma revisão de acessibilidade e permissões.
8. Documente pendências de produto e integração.

Ao finalizar, apresente:

- O que foi implementado.
- Quais telas e componentes mudaram.
- Quais dados e serviços foram reutilizados.
- Como as permissões foram aplicadas.
- Quais eventos de auditoria foram validados.
- Quais cenários de aceite passaram.
- Quais pontos não puderam ser implementados.
- Quais decisões de produto continuam abertas.

**Resultado esperado:** um perfil do atleta funcional, integrado ao workspace e preparado para um prontuário longitudinal multiprofissional, respeitando as capacidades reais do sistema, o sigilo profissional e a supervisão humana sobre a IA.