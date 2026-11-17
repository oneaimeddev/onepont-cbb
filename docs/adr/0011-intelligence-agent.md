# 0011. Um agente sobre as RPCs clínicas

A Home CBB Intelligence conversa com um único modelo, configurado por `CBB_INTELLIGENCE_API_KEY`. Sem a chave, o compositor permanece desabilitado. Um identificador que começa com `gemini` usa a API Gemini; os demais usam Chat Completions compatível com a OpenAI. `CBB_INTELLIGENCE_BASE_URL` substitui esse destino.

O modelo só consulta dados por três ferramentas: `searchAthletes`, `getAthleteSummary` e `navigateToAthlete`. Elas usam a sessão autenticada e as funções `agent_athlete_directory` e `agent_athlete_workspace`, que chamam as RPCs já existentes. A busca do agente pede cinco atletas por página na própria RPC; “Ver mais” consulta a página seguinte na mesma função, com a sessão autenticada. A origem `ai_chat` / `agent_tool` é gravada no servidor, dentro dessas funções. Não há parâmetro de origem aceito do navegador ou do modelo.

O histórico clínico enviado ao modelo é o que a RPC já devolve ao profissional. A resposta HTTP não inclui o corpo dos registros, só o texto do modelo, os cards e um caminho `/atletas/{id}` validado.

Cada conversa é uma sessão do profissional, com status `active`, `idle`, `closed` ou `archived`. A sessão guarda o texto do chat e os cards já exibidos, e pode apontar para um atleta em contexto. Não copia o corpo dos registros clínicos. Uma sessão ativa sem interação por 24 horas passa a `idle` na próxima leitura. Nova conversa encerra a sessão ativa e abre outra, sem levar o atleta nem as mensagens anteriores. A sessão ativa é recuperada ao abrir a Home. A coluna esquerda lista até vinte conversas não arquivadas. O rótulo é o começo da primeira pergunta. Reabrir uma conversa torna essa sessão ativa e encerra a que estava aberta.
