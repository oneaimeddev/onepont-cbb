# 0026. Categoria atual e clube de origem

Pedido do responsável pelo produto em 23/11/2026.

## Contexto

O Prontuário CBB atende os atletas convocados pela Confederação Brasileira de Basketball, de todas as categorias. Todos os atletas da plataforma são convocados: ao longo da temporada atuam no clube de origem e, nos períodos de convocação (que acontecem periodicamente, conforme o calendário de competições e treinamentos das seleções), integram a seleção da sua categoria. Depois voltam ao clube.

Muitos atletas compartilham o mesmo clube e a mesma categoria, e a equipe precisa agrupá-los para buscas e análises (por clube, categoria e gênero). A cada nova convocação podem chegar atletas de clubes que ainda não passaram pela plataforma.

No Beta, os catálogos de categorias e clubes estavam vazios: o clube existia só como texto livre no vínculo esportivo, sem `club_id`, e grafias diferentes do mesmo clube não se agrupavam.

## Decisão

- **Categorias: lista completa e fixa.** O catálogo traz Sub-13 a Sub-23 e Profissional, e o cadastro mostra uma lista de escolha em ordem de idade, sem criação livre. Uma categoria nova continua possível pelo catálogo (`catalog_create_category`), por quem cadastra atletas.
- **Clubes: lista aberta.** O campo "Clube de origem" busca os clubes cadastrados e, quando o nome não existe, oferece "Cadastrar novo clube". O clube novo fica disponível para os próximos atletas e grafias equivalentes (acento, caixa, espaços) são reconhecidas como o mesmo clube.
- **Catálogos preenchidos** a partir dos vínculos existentes. Cada vínculo aponta para o clube do catálogo, com o nome padronizado.
- **Gatilhos** em `clinical.sport_links` e `clinical.sport_options` mantêm catálogo, texto do clube e cadastro do atleta (`athletes.category` e `athletes.team`) sincronizados em todo caminho de gravação: cadastro, novo vínculo e importação.
- **Convocação não é filtro.** Como todos são convocados, não há campo nem filtro de convocação no cadastro, no diretório ou no chat.
- **Diretório** (`athlete_directory`) aceita o filtro `gender`: identidade de gênero informada ou, sem ela, o naipe do vínculo vigente. O filtro de clube aceita o nome normalizado ou parte do nome.
- **Chat**: a busca de atletas recebe gênero; o agente conhece o contexto da CBB e usa clube, categoria e gênero para listar e contar atletas do mesmo grupo.

## Consequências

Atletas do mesmo clube ou categoria se agrupam mesmo com grafias diferentes no cadastro original. A importação em lote continua exigindo categoria e clube do catálogo; a tela de importação já permite cadastrar o clube que faltar. A migração é idempotente.
