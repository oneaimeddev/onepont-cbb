# ADR 0022 — Busca clínica transversal no CBB Intelligence

Entrega: 18/11/2026. Especificação: [HANDOFF 007.5.3](../HANDOFF-007-5-3.md).
Branch: `feat/handoff-007-5-3-clinical-search`. Sem merge ou publicação.

## Consulta e interface

A ferramenta lógica `searchClinicalActivity` aceita exclusivamente filtros
estruturados: tipos, período, categoria, clube/equipe, naipe, modalidade,
especialidade de evolução, status e ordenação. A interpretação determinística
atende as expressões previstas mesmo sem provedor de IA; a ferramenta também
está disponível ao agente. Não aceita SQL, nomes de tabela ou operadores livres.

Os tipos são evolução, prescrição, pedido cirúrgico, solicitação de exame e
resultado/laudo anexado. A expressão genérica “exames registrados” consulta
solicitações e resultados anexados, indicando essa abrangência. “Exames
realizados” exige esclarecimento: o modelo atual não confirma realização.

Os cards apresentam cinco atletas, contagem de atletas e registros autorizados,
filtros aplicados, vínculos esportivos e até três fontes iniciais por atleta.
“Ver registros correspondentes” pagina fontes de cinco em cinco. Fontes abrem
os leitores existentes de evoluções, documentos estruturados e anexos.
A seleção explícita usa o mecanismo existente de contexto e proteção de rascunho;
a busca e a paginação não trocam o atleta em contexto.

Refinamentos claros, como “Desses, mostre somente os da categoria Sub-17”,
preservam os filtros anteriores. O intervalo retornado pelo servidor é absoluto:
um refinamento posterior não desloca silenciosamente a janela relativa original.
Uma busca nova inicia outro escopo. Referências ambíguas pedem esclarecimento.

## Banco e autorização

Migração: `20261118000200_cross_athlete_clinical_search.sql`.
RPC pública autenticada: `search_clinical_activity(jsonb,text,text)`.
Função interna sem EXECUTE para clientes: `clinical.activity_matches(uuid,jsonb)`.
A função interna reúne somente atletas com `can_read_records` do usuário atual.

Evoluções: próprias ou finalizadas compartilhadas com a equipe. Documentos:
próprios e sujeitos a `can_author_documents`, conforme o domínio existente.
Anexos: próprios, disponíveis, categorias laboratório ou laudo de imagem,
com associações atualmente autorizadas por `attachment_reference`.
Contagens, agrupamento e paginação ocorrem após esses filtros. A revogação é
reavaliada em cada consulta e abertura. Não se usa service role nesta busca.

A persistência da conversa guarda apenas filtros e página em `clinical_search`;
nomes, contagens, títulos e conteúdos das fontes não são duplicados nesse campo.
A retomada consulta novamente os resultados autorizados. O LLM recebe no máximo
cinco identificadores/nomes com contagem, tipos e data de referência, além do
escopo e total autorizado. Não recebe conteúdo clínico nem arquivos. A resposta
final de busca usa o resumo produzido pelo servidor.

A auditoria `clinical_activity.search` registra canal texto/voz, método, tipos,
intervalo, páginas e total autorizado, sem textos clínicos ou arquivos.

## Datas, filtros e limites

O servidor calcula o dia civil em `America/Sao_Paulo`, com limites inclusivos.
Últimos N dias inclui hoje: início = hoje menos N−1. Últimos N meses usa
subtração de meses de calendário. Hoje, ontem, mês corrente e intervalos com
ano explícito são aceitos. Limites: 365 dias ou 60 meses nas janelas relativas;
intervalos absolutos entre 1900 e 2100; página máxima 20.000.

Evoluções usam ocorrência clínica. Solicitações usam a data clínica válida,
com criação como alternativa explícita quando ausente ou inválida. Prescrições
e pedidos cirúrgicos usam criação. Anexos usam data do documento, com upload
como alternativa explícita. Nenhuma dessas datas comprova realização de exame.
A interface identifica a origem temporal de cada fonte. Conteúdo de PDF/imagem
não é interpretado, e categoria de anexo é metadado informado no upload.

Filtros esportivos utilizam vínculos vigentes hoje; múltiplos filtros devem
coincidir no mesmo vínculo. Não reconstrói a equipe histórica na data do evento.
Especialidade existe somente em evoluções; combinar com outros tipos pede
esclarecimento. Busca exata normalizada, sem busca semântica em textos livres.
Sem snapshot entre páginas: alterações concorrentes podem modificar resultados;
ordenadores possuem desempate por UUID para estabilidade em base inalterada.

Índices por dia civil e atleta em evoluções, por autor/tipo/dia em documentos e
por autor/categoria/dia nos anexos disponíveis. O plano sintético registrado em
[scale.json](../visual/handoff-007-5-3/scale.json) usa o índice de documentos e
os índices existentes de acesso e vínculos. Teste com 3.000 atletas, 100 atletas
correspondentes e 101 documentos, percorrendo as vinte páginas sem duplicação.
O plano é evidência local sintética, não uma garantia de latência em produção.
A chamada HTTP tem cancelamento em dez segundos; a função configura timeout de
oito segundos. A implantação deve manter também os limites de execução do
PostgREST/PostgreSQL adequados à carga institucional.

## Evidências e validação

Capturas reais com dados fictícios: [desktop](../visual/handoff-007-5-3/search-desktop.png)
e [mobile](../visual/handoff-007-5-3/search-mobile.png).
Testes: `tests/clinical-search.spec.mjs` cobre interpretação, períodos e fronteira
de fuso, visibilidade, revogação, documentos privados, metadados de anexos,
validação contra filtros arbitrários, auditoria, escala, paginação, fontes,
refinamentos, contexto e entrada marcada como voz.

A migração completa foi recriada em transação de verificação com rollback,
incluindo as extensões de persistência. Lint, typecheck, build e a suíte
Playwright são executados na entrega; o resultado final consta no relatório.
As alterações longitudinais preexistentes permanecem fora deste commit.

Resultado da suíte geral: **50 passaram e 1 falhou** (51 testes, execução serial).
A falha está no teste preexistente não commitado
`tests/longitudinal-history.spec.mjs:217`: intervalo fixo encerrado em
17/11/2026 exclui a prescrição criada no dia corrente 18/11/2026.
O teste e a implementação longitudinal foram preservados. Lint e typecheck
passaram sem avisos; build passou também com apenas o patch deste handoff.

Validação isolada do patch: **5/5 testes novos passaram**, incluindo envio e
refinamento reais pelo compositor com o provedor habilitado, sem chamadas ao
LLM para as expressões determinísticas. Paginação de fontes de 5 para 2 registros
validada. Entrada `inputMode=voice` produz o mesmo filtro e auditoria `ai_voice`.
Na rodada isolada: 142 ms para a primeira página da RPC e 483,541 ms no EXPLAIN
instrumentado (medidas distintas, não diretamente comparáveis).
