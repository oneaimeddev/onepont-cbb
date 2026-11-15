# HANDOFF 004 — Clinical Evolution & Athlete Experience 2.0

**Projeto:** Prontuário CBB  
**Prioridade:** Alta  
**Categoria:** Produto, UX, Frontend, Backend e QA  
**Dependências:** Handoffs 001, 002 e 003  
**Marco de entrega:** Demo funcional de 17/11/2026

## 1. Objetivo

Evoluir o Prontuário CBB em cinco frentes:

1. Reestruturar o perfil do atleta para torná-lo mais completo, moderno e funcional.
2. Implementar suporte a fotografias de perfil.
3. Evoluir a listagem para suportar grande volume de atletas, múltiplas categorias, modalidades e naipes.
4. Criar dados sintéticos e usuários controlados para homologação completa da plataforma.
5. Iniciar a Jornada 03: Atendimento e Evolução Clínica.

O objetivo não é redesenhar o aplicativo inteiro, mas consolidar a experiência Athlete First, permitindo que o perfil do atleta se torne o ponto central do trabalho clínico.

Utilize as skills instaladas de frontend, UX, arquitetura e testes.

Inspecione o estado atual do projeto antes de implementar. Preserve funcionalidades, componentes, contratos, autenticação, permissões e auditoria.

---

## 2. Athlete Profile 2.0

### Problema

O perfil atual do atleta está excessivamente simples e não comunica a riqueza de informações e possibilidades de uma plataforma clínica multiprofissional.

### Objetivo

Transformar o perfil em um workspace clínico completo, mantendo a linguagem visual estabelecida no Handoff 002.

### Estrutura

**Cabeçalho de identificação**

Exibir:

- Foto do atleta ou avatar alternativo.
- Nome completo e nome social, quando informado.
- Identificador interno.
- Idade, calculada a partir da data de nascimento.
- Clube/equipe atual, quando disponível.
- Categoria competitiva atual.
- Naipe de competição.
- Modalidade 5x5 ou 3x3.
- Status cadastral.
- Ações principais disponíveis ao usuário autorizado.

**Visão geral**

Apresentar, conforme disponibilidade e permissões:

- Identificação resumida.
- Contexto esportivo.
- Resumo clínico existente.
- Contagem de atendimentos.
- Contagem de evoluções.
- Contagem de exames.
- Atividades recentes.
- Ações relevantes.

As contagens devem ser reais, derivadas de registros autorizados, nunca valores estáticos.

**Navegação interna**

Preservar ou evoluir:

- Visão geral.
- Linha do tempo.
- Atendimentos.
- Evoluções.
- Exames e documentos.
- Dados cadastrais.

Evitar duplicações desnecessárias entre atendimentos e evoluções. Uma evolução deve poder ser associada ao atendimento correspondente.

### Diretrizes visuais

- Layout moderno, profissional e consistente.
- Foto com proporções e tratamento adequados.
- Hierarquia tipográfica clara.
- Densidade informacional moderada.
- Informações esportivas visualmente organizadas.
- Atividades recentes facilmente acessíveis.
- Poucos cards, utilizados somente quando funcionais.
- Evitar aparência genérica de dashboard.
- Preservar o App Shell existente.
- Responsividade para desktop e mobile.

O resultado deve parecer uma plataforma clínica especializada, não uma página administrativa simplificada.

---

## 3. Fotografias dos atletas

Implementar suporte real a foto de perfil, com as seguintes capacidades:

- Upload da imagem.
- Pré-visualização.
- Substituição.
- Remoção mediante permissão.
- Avatar alternativo quando não houver foto.
- Exibição no perfil.
- Exibição em miniatura nas listas e resultados de busca.

### Segurança

- Aceitar somente formatos seguros de imagem, como JPEG, PNG e WebP.
- Validar conteúdo real do arquivo, não apenas sua extensão.
- Limitar tamanho, inicialmente a 5 MB.
- Normalizar dimensões e otimizar arquivos.
- Remover metadados desnecessários, incluindo EXIF.
- Armazenar em local privado, sem exposição pública indiscriminada.
- Aplicar autenticação e autorização à visualização e alteração.
- Registrar alterações auditáveis.
- Prever regras específicas para imagens de menores de idade.

Não utilizar fotos reais de atletas da CBB sem direitos e autorizações apropriados.

Para testes, utilizar apenas imagens sintéticas, assets autorizados ou avatares abstratos.

Não implementar reconhecimento facial ou identificação biométrica.

---

## 4. Categorias, naipes e modalidades

A Confederação Brasileira de Basketball trabalha com diferentes categorias, naipes, modalidades e temporadas.

A plataforma não deve assumir que todos os atletas pertencem à mesma categoria, gênero ou modalidade.

### Modelagem

Distinguir:

**Identidade do atleta**
- Identificador interno.
- Dados pessoais.
- Dados cadastrais estáveis.

**Classificação esportiva**
- Modalidade: 5x5 ou 3x3.
- Categoria etária ou competitiva.
- Naipe da competição.
- Clube/equipe.
- Temporada ou período de validade.
- Status do vínculo.

**Dados pessoais adicionais**
- Identidade de gênero, somente quando necessária e conforme regras de privacidade.
- Não confundir gênero pessoal com naipe competitivo.
- Não inferir uma informação a partir da outra.

Um mesmo atleta poderá possuir vínculos esportivos distintos ao longo do tempo.

### Categorias de referência

Preparar catálogo configurável para categorias como:

- Sub-15.
- Sub-17.
- Sub-19.
- Sub-21.
- Sub-23.
- Adulto.

Essas são referências para testes, não uma lista oficial exaustiva.

Não assumir que todas as combinações de categoria, modalidade e naipe são válidas em todas as temporadas.

O catálogo deve ser configurável e permitir evolução conforme as competições da CBB.

Não fixar permanentemente esses valores em enums rígidos quando isso prejudicar futuras alterações.

---

## 5. Diretório de atletas em escala

### Objetivo

Transformar a página de atletas em um diretório profissional, adequado ao uso com milhares de registros.

### Listagem

Cada registro deve permitir identificar rapidamente:

- Foto ou avatar.
- Nome.
- Identificador.
- Idade ou data de nascimento, conforme apresentação escolhida.
- Clube/equipe.
- Categoria.
- Naipe competitivo.
- Modalidade.
- Status.

### Busca

Permitir pesquisa por:

- Nome.
- Nome social, quando aplicável.
- Identificador interno.
- Identificador CBB, quando disponível.

Implementar tratamento adequado de acentos, espaços e diferenças de maiúsculas/minúsculas.

### Filtros

Incluir:

- Categoria.
- Naipe.
- Modalidade.
- Clube/equipe.
- Status.
- Faixa etária, se apropriado.

Permitir combinação de filtros e opção clara para removê-los.

### Paginação e performance

Implementar:

- Paginação preferencialmente no servidor.
- Ordenação estável.
- Contagem de resultados autorizados.
- Estados de carregamento.
- Estados vazios.
- Tratamento de falhas.
- Navegação de retorno preservando filtros.
- Consultas eficientes.
- Índices apropriados, quando necessários.
- Evitar carregar todos os atletas no navegador.

A experiência deve permanecer fluida em bases com milhares de registros.

Não implementar paginação apenas visual sobre uma lista integralmente carregada.

---

## 6. Massa de dados para homologação

Criar um mecanismo reproduzível de geração de atletas inteiramente fictícios.

### Cenário padrão

**500 atletas sintéticos**, com variedade representativa de:

- Nomes.
- Datas de nascimento.
- Categorias.
- Modalidades.
- Naipes.
- Clubes/equipes fictícios.
- Estados cadastrais.
- Fotografias sintéticas e avatares alternativos.

Distribuir os registros entre diferentes categorias e modalidades, evitando concentrações artificiais em apenas um grupo.

### Cenário de estresse

**5.000 atletas sintéticos** para validar paginação, filtros, buscas e carregamento.

Incluir casos especiais:

- Homônimos.
- Nomes com acentos.
- Nomes compostos longos.
- Atletas sem fotografia.
- Atletas sem clube informado.
- Registros inativos.
- Múltiplos vínculos esportivos.
- Diferentes categorias e temporadas.
- Identificadores externos ausentes.
- Datas de nascimento próximas dos limites de categorias.

### Requisitos do gerador

- Executável somente em desenvolvimento ou homologação.
- Dados identificados como sintéticos.
- Geração determinística quando fornecida uma seed.
- Operação idempotente ou com estratégia segura contra duplicação.
- Possibilidade de remover somente os dados gerados.
- Não alterar registros reais.
- Não utilizar CPFs, contatos ou informações pessoais reais.
- Não depender de fotos reais ou dados extraídos de atletas existentes.
- Não executar automaticamente em produção.

Criar comandos ou scripts documentados para:

1. Popular ambiente com 500 atletas.
2. Gerar ou expandir o cenário para 5.000.
3. Resetar exclusivamente a massa sintética.

Preparar também alguns atendimentos e evoluções inteiramente fictícios para validar o histórico longitudinal, desde que claramente identificados como dados de homologação.

---

## 7. Perfil de homologação com permissões completas

Criar a capacidade de provisionar uma conta de teste com todas as permissões funcionais disponíveis no Prontuário CBB.

### Objetivo

Permitir validar integralmente:

- Cadastro de atletas.
- Edição de cadastros.
- Busca e seleção.
- Visualização de prontuários.
- Criação de atendimentos.
- Registro de evoluções.
- Finalização de registros.
- Consulta à auditoria.
- Funcionalidades administrativas.
- Interações com IA, quando disponíveis.

### Regras de segurança obrigatórias

Esta conta deve existir **exclusivamente em ambiente de desenvolvimento ou homologação isolado, com dados sintéticos**.

Não criar usuário superadministrador universal em produção.

Não criar backdoors.

Não desativar verificações de autorização.

Não inserir senhas em código, seeds ou controle de versão.

Não conceder privilégios por comparação com um e-mail fixo.

Utilizar o mecanismo real de autenticação e autorização do projeto.

Provisionar permissões de forma explícita e verificável, utilizando o modelo existente.

Não expor credenciais em logs ou documentação.

Se o ambiente atual não possuir isolamento confiável, preparar o provisionamento sem criar a conta até que esse isolamento esteja garantido.

### Auditoria

Todas as operações executadas pela conta de teste devem continuar auditadas.

O perfil com permissões completas não pode desabilitar rastreabilidade, aprovações obrigatórias ou controles de integridade clínica.

### Testes negativos

Uma conta com todas as permissões não é suficiente para validar a segurança.

Preparar também, quando viável, usuários sintéticos representando:

- Profissional assistencial com acesso limitado.
- Profissional de outra especialidade.
- Usuário administrativo sem acesso clínico.
- Usuário sem acesso ao atleta testado.

Validar concessões e negações no backend.

---

## 8. Jornada 03 — Atendimento e Evolução Clínica

Implementar o primeiro fluxo funcional de evolução clínica vinculado ao atleta.

### Objetivo

Um profissional autorizado deve conseguir:

1. Selecionar um atleta.
2. Iniciar um atendimento.
3. Identificar sua especialidade.
4. Registrar uma evolução clínica.
5. Salvar como rascunho.
6. Revisar as informações.
7. Finalizar o registro mediante confirmação.
8. Consultar a evolução no histórico longitudinal.

### Atendimento

Cada atendimento deve permitir identificar:

- Atleta associado.
- Profissional responsável.
- Especialidade.
- Data e hora do atendimento.
- Estado do atendimento.
- Registros associados.

Não criar agenda, faturamento ou gestão administrativa de consultas neste handoff.

### Evolução clínica

Começar com um modelo mínimo e extensível.

Campos propostos:

- Atendimento associado.
- Tipo de evolução.
- Conteúdo do registro.
- Profissional autor.
- Especialidade.
- Data e hora.
- Status.
- Histórico de alterações aplicável.

Não obrigar todas as especialidades a utilizarem um único template clínico rígido.

O formato especializado de evolução médica, fisioterapêutica e nutricional será refinado em uma etapa posterior.

### Ciclo de vida

Implementar, conforme os contratos existentes:

**Rascunho → Revisão → Finalizado**

O profissional poderá editar rascunhos autorizados.

Após finalização, não permitir alteração silenciosa do registro original.

Correções posteriores devem preservar histórico, autoria e integridade, por mecanismo de retificação ou adendo quando definido.

Não implementar assinatura digital com validade jurídica sem especificação própria.

### Integração com o perfil

Ao finalizar uma evolução:

- Ela deverá aparecer no histórico autorizado.
- Permanecer vinculada ao atleta correto.
- Exibir autoria.
- Exibir especialidade.
- Exibir data e status.
- Ser acessível conforme as permissões.

### Integração conversacional

Preparar ações contextuais como:

"Registrar evolução para este atleta."

"Consultar últimas evoluções."

"Mostrar atendimentos anteriores."

Se a IA já possuir backend funcional, integrar com os mecanismos reais de permissão e aprovação.

Se ainda não possuir, manter apenas pontos de entrada explícitos, sem fingir execução clínica.

Nenhuma evolução gerada pela IA poderá ser finalizada automaticamente sem a aprovação humana exigida.

---

## 9. Auditoria e rastreabilidade

Preservar a auditoria como requisito obrigatório e demonstrável.

Registrar conforme o modelo existente:

- Quem acessou informações clínicas.
- Qual atleta ou registro foi acessado.
- Quem criou ou alterou registros.
- Quando ocorreu a operação.
- Qual foi a operação.
- Origem: interface ou agente de IA.
- Quem aprovou a ação, quando aplicável.
- Resultado da operação.

Evitar registrar informações clínicas sensíveis desnecessárias dentro dos próprios logs.

Auditar também alterações de foto e de dados cadastrais.

Todas as novas APIs devem aplicar autorização no servidor.

---

## 10. Sequência de implementação

Executar em etapas independentes e verificáveis.

### Etapa A — Fundação do Athlete Profile

- Inspecionar componentes existentes.
- Reestruturar o layout.
- Implementar foto.
- Organizar contexto esportivo.
- Preservar o Design System.

### Etapa B — Diretório e dados de teste

- Evoluir listagem.
- Implementar filtros e paginação.
- Preparar catálogo esportivo configurável.
- Criar seed com 500 atletas.
- Validar estresse com 5.000.
- Verificar performance e comportamento visual.

### Etapa C — Ambiente de homologação

- Provisionar usuários de teste de forma segura.
- Configurar permissões.
- Validar concessões e bloqueios.
- Preservar auditoria.

### Etapa D — Atendimento e evolução

- Criar fluxo mínimo de atendimento.
- Implementar rascunho.
- Permitir revisão.
- Finalizar de forma controlada.
- Integrar ao histórico longitudinal.

### Etapa E — Validação

- Executar testes automatizados existentes.
- Testar fluxos pelo navegador.
- Verificar responsividade.
- Validar permissões no backend.
- Revisar integridade da auditoria.
- Comparar capturas de tela antes e depois.
- Documentar limitações.

---

## 11. Cenários obrigatórios de homologação

**QA-001:** cadastrar atleta com foto.

**QA-002:** alterar e remover foto conforme permissão.

**QA-003:** visualizar avatar quando não houver foto.

**QA-004:** navegar por uma lista com 500 atletas.

**QA-005:** consultar uma base com 5.000 atletas sem carregar tudo de uma vez.

**QA-006:** combinar filtros de categoria, naipe, clube e modalidade.

**QA-007:** encontrar homônimos e diferenciá-los corretamente.

**QA-008:** abrir um atleta e retornar à listagem preservando busca, filtros e paginação.

**QA-009:** criar atendimento vinculado ao atleta.

**QA-010:** salvar e recuperar uma evolução em rascunho.

**QA-011:** finalizar evolução com confirmação explícita.

**QA-012:** visualizar a evolução no histórico longitudinal autorizado.

**QA-013:** garantir que a troca de atleta não cause operações no prontuário errado.

**QA-014:** validar ações permitidas com conta QA de permissões completas.

**QA-015:** validar negação de acesso com usuários restritos.

**QA-016:** confirmar auditoria de acessos e modificações.

**QA-017:** validar desempenho e responsividade com dados sintéticos.

**QA-018:** confirmar que dados, contas e credenciais de homologação não são publicados em produção.

Não considerar um cenário aprovado sem execução ou evidência correspondente.

---

## 12. Critérios de qualidade

O handoff deve entregar:

- Perfil do atleta visualmente mais completo.
- Upload e exibição funcional de foto.
- Informações esportivas coerentes.
- Modelagem flexível de categorias e modalidades.
- Diretório eficiente para milhares de atletas.
- Massa de dados sintéticos reproduzível.
- Ambiente de QA controlado.
- Conta de teste com permissões funcionais amplas.
- Testes de acesso restrito.
- Primeira evolução clínica vinculada ao atleta.
- Auditoria preservada.
- Nenhuma regressão crítica nos handoffs anteriores.

Não otimizar apenas para screenshots.

O objetivo é que a aplicação funcione corretamente com volumes maiores de dados e diferentes perfis de usuário.

---

## 13. Restrições e prioridades

A demonstração está prevista para 17/11/2026.

Não comprometa a estabilidade do projeto com uma refatoração excessiva.

Priorize primeiro os blocos independentes de maior impacto:

1. Perfil do atleta e fotografias.
2. Diretório, filtros e dados de teste.
3. Homologação e permissões.
4. Fluxo mínimo de atendimento e evolução.

Essas quatro frentes são o escopo-alvo deste handoff. Caso alguma dependa de decisões clínicas ainda não aprovadas, documente a lacuna e implemente somente a parte segura e validável.

Evitar adicionar:

- Diagnósticos automáticos.
- Recomendações clínicas por IA.
- Agenda médica.
- Controle financeiro.
- Integrações externas não especificadas.
- Templates clínicos avançados por especialidade.
- Reconhecimento facial.
- Funcionalidades meramente decorativas.

---

## 14. Entrega final

Ao concluir, apresente:

1. Resumo executivo do que foi implementado.
2. Estrutura final do perfil do atleta.
3. Componentes e arquivos modificados.
4. Funcionamento do upload de fotos.
5. Modelagem de categorias, modalidades e naipes.
6. Número de atletas sintéticos gerados.
7. Resultados de performance da listagem.
8. Forma segura de provisionar os usuários QA.
9. Matriz de permissões efetivamente testada.
10. Fluxo de atendimento e evolução implementado.
11. Evidências de auditoria.
12. Testes executados e resultados.
13. Capturas de tela comparativas.
14. Pendências e riscos.

**Resultado esperado:** um Athlete Workspace mais moderno, completo e preparado para crescer, com diretório escalável, dados de homologação, acesso de teste controlado e a primeira jornada real de evolução clínica.

Não declare funcionalidades concluídas quando estiverem somente preparadas visualmente ou bloqueadas por dependências.