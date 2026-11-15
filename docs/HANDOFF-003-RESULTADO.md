# Handoff 003

O workspace passou a consultar atletas e registros persistidos no Supabase local.
O catálogo permite buscar por nome completo, nome social ou identificador interno.
O perfil tem identificação, dados esportivos, abas de linha do tempo e cadastro,
e uma entrada no chat contextual. Atendimentos, documentos e evolução têm
dependências nas próximas fases do Handoff 001.

A autorização combina perfil individual, concessão explícita de cadastro,
vínculo por atleta e permissão específica para consultar registros. A conta de
auditoria tem acesso aos eventos operacionais. O acesso clínico depende de
concessão independente. Registros finalizados compartilhados ficam disponíveis
à equipe autorizada. Rascunhos e registros restritos exigem autoria e vínculo
com leitura clínica. Os filtros são aplicados no banco antes de retornar a lista.
As tabelas ficam em schema privado com RLS habilitada. As funções expostas
restringem execução a usuários autenticados, verificam o ator da sessão e usam
search_path vazio com nomes qualificados. [Supabase](https://supabase.com/docs/guides/database/functions)

A seleção usa a URL com UUID e passa por nova verificação a cada consulta de
perfil, timeline e chat. A timeline ordena do evento mais recente ao mais antigo
e usa horários de Brasília. O chat recebe apenas o contexto de identificação e
exibe o compositor desabilitado nesta entrega.

A auditoria registra consulta ao catálogo, perfil, timeline, contexto, cadastro
e consulta à auditoria. A trilha inclui ator, horário, operação, origem e
resultado, com identificador do atleta para consultas autorizadas. O cadastro,
vínculo e evento ficam na mesma transação. Tentativas negadas de consultar um
atleta ou de cadastrá-lo têm eventos sem conteúdo clínico e sem confirmação de
que o atleta solicitado existe. As leituras de detalhes pertencem à consulta da
timeline, que entrega os registros autorizados em conjunto.

| Aceite | Evidência |
|---|---|
| C01 e C02 | Busca, seleção, dados persistidos e omissão de campos ausentes |
| C03 | UUID preservado nas abas e no chat contextual |
| C04 | Troca entre dois atletas verificada. Reconfirmação de ações aguarda operações clínicas pendentes |
| C05 e C06 | Ordem da timeline e proteção de registros restritos e rascunhos validadas. Acesso direto à timeline e ao chat bloqueado por URL e RPC |
| C07 | Cadastro, repetição idempotente, leituras e negativas verificadas na trilha operacional |
| C08 | Contexto consultado com permissão e envio desabilitado. Execução e aprovação pelo agente dependem da integração da Fase D |
| C09 e C10 | Estado vazio, cadastro, busca, login, logout, navegação e permissões exercitados pelo Playwright |

O cadastro permite criar registros de identificação e atribui ao criador o
vínculo de leitura cadastral. Edição, gestão de vínculos por interface,
evoluções, aprovações, documentos e integração oficial CBB ficam pendentes.
Os limites da busca e da auditoria são 50 atletas por consulta e 100 operações
recentes. A matriz de compartilhamento por profissão, a governança dos vínculos,
a visibilidade dos eventos de auditoria, a retenção e a atribuição das
permissões de edição requerem validação de produto.
