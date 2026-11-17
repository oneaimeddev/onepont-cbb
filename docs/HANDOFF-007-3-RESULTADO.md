# Handoff 007.3 — resultado

Trabalho local na `develop`, ainda sem commit. A `develop` local está dois commits à frente de `origin/develop` (`c40caae`, `498d710`). Esta entrega não foi enviada ao remoto e não entrou na `main`.

## O que mudou

A Home do CBB Intelligence permanece. Durante uma conversa, **Nova conversa** fica no topo. Ela encerra a resposta em andamento, limpa o histórico apresentado, apaga resultados e links pendentes e tira o atleta de `?atleta=`. A tela volta ao cumprimento centralizado. Não cria atendimento e não apaga prontuário, rascunho gravado nem auditoria.

Se houver edição local não salva numa evolução ou num rascunho de documento, o navegador pede confirmação. O aviso não guarda o texto clínico. Confirmar só descarta o sinal local; os dados já gravados continuam no banco.

Uma busca de atletas mostra até cinco cards, com categoria, naipe e clube, e o total autorizado. O texto diz a quantidade e não repete a lista. **Ver mais** chama `POST /api/inteligencia/busca`, que lê a página seguinte em `agent_athlete_directory` com a sessão autenticada. A página tradicional continua com 25 registros. Selecionar um card troca o atleta em contexto. Abrir o prontuário segue para a ficha, onde o acesso é revalidado.

## Arquivos

- `supabase/migrations/20261116000200_agent_directory_page.sql` — `page_size` opcional, padrão 25, teto 25. Aplicada no Postgres local e registrada em `supabase_migrations.schema_migrations`.
- `src/features/chat/guards.ts`, `agent.ts`, `transcript.ts`, `intelligence-home.tsx`, `intelligence.css`
- `src/app/api/inteligencia/busca/route.ts`
- `src/app/(workspace)/page.tsx`
- `src/features/clinical/unsaved.ts`, `draft-watch.tsx`
- `src/features/documents/editors.tsx`, `src/app/(workspace)/atletas/[id]/evolucao/page.tsx`
- `docs/adr/0011-intelligence-agent.md`
- `tests/intelligence.spec.mjs`
- `docs/visual/handoff-007-3/`

## Testes

Lint e `tsc --noEmit` passaram. `npm run build` passou. Playwright, com a chave do modelo vazia: intelligence, documents, auth, athlete e evolution, 10 testes, todos verdes.

A paginação foi medida na RPC e na rota: página 1 devolve 5 de 8, página 2 devolve os 3 restantes, sem repetir e sem o atleta sem acesso. Busca anônima responde 401, origem estranha 403, e um `page_size` vindo do navegador é recusado.

## Limitações

Não há histórico de conversa no servidor. Recarregar a página abre a Home vazia; voltar de outra tela na mesma visita conserva a conversa atual. **Nova conversa** é o que zera essa visita.

O modelo é instruído a não listar nomes, e a resposta final de uma busca é a frase curta. Um trecho transmitido antes do fechamento ainda pode aparecer por um instante.

**Ver mais** avança de cinco em cinco, no máximo 40 páginas. O refinamento em linguagem natural é uma nova mensagem, que dispara outra busca autorizada. O agente continua pedindo confirmação quando há mais de uma pessoa; o profissional pode abrir um card por conta própria.

A migração precisa ser aplicada nos outros ambientes antes de usar a página de cinco. Sem ela, o diretório ignora `page_size` e devolve até 25.
