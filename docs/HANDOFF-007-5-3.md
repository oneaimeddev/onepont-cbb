# HANDOFF 007.5.3 — Busca Clínica Transversal pelo CBB Intelligence

**Projeto:** Prontuário CBB
**Prioridade:** P0
**Estratégia:** Clinical Core First, AI-Ready
**Objetivo:** Permitir buscas clínicas em linguagem natural sobre múltiplos atletas autorizados, cruzando filtros cadastrais, esportivos, temporais e registros do prontuário.

## 1. Contexto

O CBB Intelligence já possui ferramentas para localizar atletas, consultar prontuários individuais e realizar operações clínicas autorizadas.

Atualmente, não consegue responder a perguntas como:

"Quais atletas possuem exames registrados nos últimos 20 dias?"

O agente informa que suas ferramentas permitem apenas buscas por atributos cadastrais.

Precisamos introduzir consultas clínicas transversais, sem oferecer acesso irrestrito ao banco de dados.

## 2. Preparação

Antes de implementar:

1. Inspecionar ferramentas existentes de busca de atletas.
2. Inspecionar RPCs de evoluções, documentos e anexos.
3. Verificar o estado real de implementação de cada domínio.
4. Identificar quais registros possuem datas clínicas confiáveis.
5. Revisar regras de autorização por atleta, documento, autoria e especialidade.
6. Preservar a arquitetura PostgreSQL com RPCs autorizadas.
7. Criar branch dedicada.

Não criar um mecanismo paralelo de permissões.

## 3. Nova capacidade

Implementar uma ferramenta lógica denominada:

`searchClinicalActivity`

A ferramenta deverá receber filtros estruturados e consultar registros autorizados.

Filtros iniciais sugeridos:

- Tipo de atividade clínica.
- Data inicial.
- Data final.
- Categoria esportiva.
- Clube ou equipe.
- Naipe competitivo.
- Modalidade.
- Especialidade, quando aplicável e suportada.
- Status do documento, quando aplicável.
- Paginação e ordenação.

A ferramenta não receberá SQL livre.

Não permitir que o LLM escolha nomes arbitrários de tabelas, operadores SQL, joins ou políticas de autorização.

O backend deverá validar os filtros e executar consultas previamente definidas.

## 4. Atividades clínicas suportadas

Implementar inicialmente busca pelos tipos efetivamente disponíveis:

- Evoluções clínicas.
- Prescrições médicas.
- Pedidos cirúrgicos.
- Solicitações de exames.
- Anexos classificados como resultados ou laudos de exames, quando o Handoff 007.6 estiver implementado.

Permitir expandir futuramente para outros tipos de eventos clínicos.

A existência de um tipo de registro não significa que ele esteja visível para todos os profissionais com acesso ao atleta.

## 5. Semântica dos exames

Estabelecer distinção explícita:

### Solicitação de exame

Buscar documentos do tipo `exam_request`.

Usar a data clínica relevante ou o campo de criação apropriado, identificando qual foi utilizado.

### Resultado ou laudo anexado

Buscar anexos autorizados classificados adequadamente.

Distinguir:

- Data do documento.
- Data do upload.
- Data de realização do exame, somente quando estiver registrada em campo confiável.

Não utilizar automaticamente a data de upload como data de realização.

### Exame realizado

Somente afirmar realização quando existir evidência estruturada ou registro confiável que sustente essa classificação.

Se a base contiver apenas pedidos e anexos sem confirmação de realização, informar a limitação.

Nunca converter solicitação de exame em exame realizado.

## 6. Interpretação conversacional

O agente deverá compreender consultas como:

- "Mostre os atletas com exames nos últimos 20 dias."
- "Quais atletas tiveram prescrições este mês?"
- "Me traga os atletas da Sub-19 com pedidos cirúrgicos."
- "Quem teve evolução fisioterapêutica nos últimos 30 dias?"
- "Quais atletas do Flamengo têm exames solicitados?"
- "Agora filtre somente os resultados anexados."
- "Desses, mostre somente os da categoria Sub-17."

Preservar os filtros anteriores em perguntas subsequentes quando a referência for clara.

Não alterar silenciosamente o significado de "solicitado", "anexado" e "realizado".

Quando a ambiguidade mudar materialmente a resposta, solicitar esclarecimento ou apresentar categorias separadas.

## 7. Consultas temporais

Suportar períodos relativos:

- Hoje.
- Ontem.
- Últimos 7 dias.
- Últimos 20 dias.
- Últimos 30 dias.
- Este mês.
- Últimos 6 meses.
- Intervalo específico.

Calcular datas no servidor com fuso horário explícito.

Para períodos por data civil, usar limites consistentes e documentados, considerando o fuso da aplicação.

Não depender do relógio do LLM.

Não filtrar pela data de criação quando o usuário pedir data de realização, sem evidência de que sejam equivalentes.

## 8. Autorização

Requisito crítico.

A consulta transversal deve operar exclusivamente sobre o conjunto de atletas e registros que o profissional possui autorização para consultar.

Aplicar:

- Identidade da sessão via `auth.uid()`.
- Permissão de acesso ao atleta.
- Permissão para consultar o tipo de documento.
- Restrições por especialidade.
- Autoria e visibilidade.
- Revogação de acesso.

Não utilizar permissões administrativas para contornar restrições clínicas.

Não retornar identificadores, títulos, contagens ou metadados de registros inacessíveis.

A contagem total deverá representar somente resultados autorizados.

Nenhum filtro do LLM poderá ampliar o escopo de autorização.

## 9. Estratégia de consulta e desempenho

Executar os filtros diretamente no PostgreSQL.

Não carregar todos os atletas e prontuários para filtrar em JavaScript.

Não enviar todos os registros ao Gemini.

Implementar:

- Filtros tipados.
- Ordenação estável.
- Paginação real.
- Deduplicação de atletas.
- Contagem de resultados autorizados.
- Limites de consulta.
- Tratamento de timeout e erros.
- Índices necessários, conforme o plano de consulta real.

Um atleta pode possuir múltiplos documentos correspondentes.

A busca deverá evitar apresentar o mesmo atleta repetidamente, permitindo visualizar os registros que justificaram sua inclusão.

## 10. Proveniência dos resultados

Cada atleta encontrado deverá estar associado a pelo menos um registro autorizado que sustente o resultado.

Exemplo:

Atleta: Heitor Ibrahim Zanetti.

Correspondência: solicitação de exame.

Data: data registrada no documento.

Fonte: identificador e link autorizado para o pedido original.

Se o usuário solicitar detalhes, o agente poderá abrir o registro correspondente usando as ferramentas clínicas existentes.

Não inventar documentos para justificar a correspondência.

## 11. Apresentação no chat

Reutilizar o padrão visual aprovado para busca de atletas.

Apresentar cards compactos com:

- Nome do atleta.
- Categoria.
- Clube/equipe.
- Tipo de atividade clínica encontrada.
- Data relevante.
- Quantidade de registros correspondentes visíveis.
- Ação para abrir o registro.
- Ação para colocar o atleta em contexto.

Quando houver muitos resultados:

- Mostrar inicialmente até cinco atletas.
- Oferecer paginação real.
- Preservar filtros.
- Não repetir toda a lista em Markdown.

Apresentar o escopo da consulta:

"Atletas autorizados com solicitações de exames registradas nos últimos 20 dias."

Quando o resultado reunir categorias distintas de exames, identificá-las separadamente.

## 12. Integração com contexto de atleta

A busca transversal não deverá substituir automaticamente o atleta em contexto.

O profissional poderá selecionar um resultado e solicitar:

- "Coloque esse atleta em contexto."
- "Abra o prontuário dele."
- "Mostre os exames que justificaram sua inclusão."
- "Analise o histórico desse atleta."

Reutilizar o mecanismo seguro de resolução de identidade e contexto.

Não perder propostas clínicas pendentes durante uma troca de atleta.

## 13. Auditoria

Registrar consultas e acessos conforme o padrão existente.

Preservar:

- Ator.
- Operação.
- Origem.
- Tipo de consulta.
- Data e horário.
- Resultado.
- Referências necessárias à rastreabilidade.

Não registrar conteúdos clínicos completos nos metadados de auditoria.

Evitar armazenar informações sensíveis desnecessárias em logs de diagnóstico.

## 14. Testes

Criar cenários fictícios controlados.

### Funcionais

1. Buscar atletas com solicitações de exames nos últimos 20 dias.
2. Buscar resultados anexados, quando suportados.
3. Não classificar solicitação como realização.
4. Buscar atletas com prescrições recentes.
5. Buscar atletas com pedidos cirúrgicos.
6. Buscar evoluções por período.
7. Combinar clube e tipo de documento.
8. Combinar categoria e período.
9. Combinar naipe e tipo de documento.
10. Refinar filtros em mensagem subsequente.
11. Abrir a fonte correspondente.
12. Colocar o atleta selecionado em contexto.

### Temporais

13. Excluir registro fora do período.
14. Tratar registros exatamente no limite da data.
15. Distinguir data clínica de data de criação.
16. Distinguir data de upload de data do exame.
17. Usar fuso horário consistente.

### Segurança

18. Não retornar atleta sem autorização.
19. Não incluir documento privado de outro profissional.
20. Não vazar metadados ou contagens restritas.
21. Respeitar revogação de acesso.
22. Impedir filtros SQL arbitrários.
23. Preservar auditoria.

### Escala

24. Buscar em uma base com milhares de atletas fictícios.
25. Validar paginação real.
26. Evitar duplicação de atletas com múltiplos documentos.
27. Confirmar que o LLM recebe apenas os dados necessários.
28. Verificar o plano de execução e índices adequados.

### Regressão

29. Preservar busca cadastral.
30. Preservar seleção de contexto.
31. Preservar análise longitudinal.
32. Preservar criação e consulta de documentos.
33. Preservar modo de voz.
34. Preservar permissões existentes.

## 15. Limites do handoff

Não implementar agora:

- SQL livre gerado pelo LLM.
- Consulta irrestrita a todas as tabelas.
- Busca semântica profunda em textos clínicos.
- Banco vetorial.
- Geração automática de diagnósticos.
- Predição de lesões.
- Relatórios epidemiológicos avançados.
- Interpretação automática de PDFs e imagens.
- Novas funcionalidades de escrita.

O objetivo é implementar uma base de consultas clínicas transversais confiável e extensível.

## 16. Entrega

Apresentar:

1. Ferramenta implementada.
2. RPCs criadas ou reutilizadas.
3. Filtros disponíveis.
4. Modelo de autorização.
5. Estratégia de paginação e índices.
6. Capturas reais das consultas.
7. Testes executados.
8. Comportamento dos filtros temporais.
9. Limitações documentadas.
10. Estado da branch e commits.

Executar lint, typecheck, build e testes disponíveis.

Não realizar merge sem homologação.

**Critério final:** o profissional consegue perguntar ao CBB Intelligence quais atletas autorizados possuem determinados registros clínicos em um período, combinar filtros esportivos e clínicos, consultar as fontes e navegar para os atletas encontrados, sem ultrapassar as permissões ou confundir tipos de eventos clínicos.
