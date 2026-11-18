# Consolidação do protótipo na main — 18/11/2026

Solicitação do usuário: reunir todas as alterações na main, validar uma baseline para demonstração e apresentar o estado da massa fictícia do banco.

## Histórico preservado

A main local/remota estava em `bb8ce5e`. Após fetch, todas as branches locais e remotas existentes estavam contidas em `49adb19`; não havia outra linha divergente a mesclar. Esse estado reunia 18 commits à frente da main, incluindo:

- CSV, anexos e busca clínica transversal.
- Perfil longitudinal refinado, proteção de alterações e timeline.
- Home/chat e destaque da saudação.
- Fixture temporal determinística, trabalho longitudinal e seed preexistentes preservados.
- Editores de documentos, menu ancorado e navegação por item.
- Cadastro e diretório 007.10.3B, nascimento Dia/Mês/Ano e filtros sempre visíveis.
- Auditorias documentais, incluindo 007.10.4A; nenhuma gestão nova de conversas implementada.

A integração foi preparada na branch `release/prototype-demo-2026-11-18`. As branches de trabalho anteriores foram preservadas. A atualização da main usa fast-forward, preservando os commits, sem squash, reset ou force push.

## Ajuste necessário na validação

A primeira execução completa terminou com 72 testes aprovados e um teste obsoleto: `tests/evolution.spec.mjs:192` ainda tentava abrir `details.directory-filters`, removido pelo refinamento solicitado pelo usuário. Não foi uma falha da consulta/paginação do backend.

O commit **`d663754`** troca essa manipulação do DOM pela verificação de que o campo Categoria está visível. Mantém as verificações de autorização, busca normalizada, filtros, paginação e retorno ao diretório. Nenhum código de produção ou regra clínica foi alterado nesta consolidação.

## Validação final

| Verificação | Resultado |
|---|---|
| Suíte completa após corrigir o teste obsoleto — um worker | **73 aprovados, 6,0 minutos** |
| Lint | Aprovado |
| Typecheck | Aprovado |
| Build de produção | Aprovado; utilizado pela suíte |
| `git diff --check` | Aprovado |

Toda validação de navegador ocorreu em segundo plano, sem abrir janelas. O único ajuste de teste está isolado em `d663754`. Não houve mudança adicional de produção. O README foi atualizado para descrever o gerador atual: quatro registros multidisciplinares, contas provisionadas e recriação do lote, removendo instruções antigas de terceiro argumento/12 evoluções.

As contagens da massa foram conferidas novamente após a limpeza dos testes: 178 atletas, 340 evoluções, 744 documentos, zero anexos e sete perfis, iguais à consulta inicial. A inspeção identificou uma versão antiga ausente no ledger de migrações (`20261115000900`), embora seus objetos de acesso já existam; nenhum DDL ou reparo de ledger foi executado. A divergência está descrita no inventário.

## Massa para apresentação

[Inventário e roteiro](../demo/INVENTARIO-SEED-2026-11-18.md), [snapshot estruturado](../demo/seed-local-2026-11-18.json) e [CSV dos atletas DEMO](../demo/atletas-demo-2026-11-18.csv).

A consulta original encontrou 178 atletas, 340 evoluções, 744 documentos e nenhum anexo. O elenco principal tem 174 atletas; os demais são Aurora, Horizonte e dois cadastros manuais. As contas principais são de medicina, ortopedia, cardiologia, fisioterapia e psicologia. A massa foi inspecionada sem executar seed/reset ou alterar permissões.

Os testes usam fixtures fictícias próprias, removidas pelos hooks de limpeza. Capturas históricas regravadas automaticamente são restauradas ao conteúdo anterior para não misturar entregas. O banco é independente da tag Git; o inventário não é backup ou autorização para recriar a massa.

## Limitações preservadas

A gestão de conversas do 007.10.4B não integra esta entrega. Permanecem os achados e contratos do [007.10.4A](../audits/HANDOFF-007-10-4A-gestao-conversas.md), incluindo confirmações pendentes e política de acesso histórico. A consolidação valida uma baseline do protótipo para demonstração dos fluxos implementados; não declara prontidão para produção.

## Referência da versão

A referência de demonstração é a tag anotada **`prototype-demo-2026-11-18`**. A main recebe a consolidação por fast-forward; as branches anteriores continuam preservadas. O resultado do envio ao remoto é informado no fechamento da tarefa. Não foi realizado deploy da aplicação nem executado seed/reset do banco.
