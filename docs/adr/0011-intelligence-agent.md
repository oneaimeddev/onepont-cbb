# 0011. Um agente sobre as RPCs clínicas

A Home CBB Intelligence conversa com um único modelo, configurado por `CBB_INTELLIGENCE_API_KEY`. Sem a chave, o compositor permanece desabilitado.

O modelo só consulta dados por três ferramentas: `searchAthletes`, `getAthleteSummary` e `navigateToAthlete`. Elas usam a sessão autenticada e as funções `agent_athlete_directory` e `agent_athlete_workspace`, que chamam as RPCs já existentes. A origem `ai_chat` / `agent_tool` é gravada no servidor, dentro dessas funções. Não há parâmetro de origem aceito do navegador ou do modelo.

O histórico clínico enviado ao modelo é o que a RPC já devolve ao profissional. A resposta HTTP não inclui o corpo dos registros, só o texto do modelo, os cards e um caminho `/atletas/{id}` validado.
