# 0026. Categoria atual, clube de origem e convocação

Pedido do responsável pelo produto em 23/11/2026.

## Contexto

O atleta compete por um clube de origem e, conforme o calendário de convocação, integra a Seleção Brasileira; depois de cada período volta ao clube. Muitos atletas compartilham o mesmo clube e a mesma categoria, e a equipe precisa agrupá-los para buscas e análises (por clube, categoria e gênero).

No Beta, os catálogos de categorias e clubes estavam vazios: o clube existia só como texto livre no vínculo esportivo, sem `club_id`, e grafias diferentes do mesmo clube não se agrupavam. Categoria e clube do cadastro (`athletes.category` e `athletes.team`) estavam desatualizados em relação ao vínculo vigente.

## Decisão

- **Catálogos preenchidos** a partir dos vínculos existentes. Cada vínculo aponta para o clube do catálogo, com o nome padronizado pela chave normalizada (sem acento, caixa e espaços extras).
- **Gatilhos** em `clinical.sport_links` e `clinical.sport_options` mantêm o catálogo, o texto do clube e o cadastro do atleta sincronizados em todo caminho de gravação: cadastro, novo vínculo e importação. Um clube informado só por texto entra no catálogo; `club_id` define o nome exibido; `national_team_id` precisa ser de uma seleção.
- **Cadastro do atleta**: os campos passam a se chamar "Categoria atual" e "Clube de origem", com orientação. O campo opcional "Convocação para seleção" registra a convocação no vínculo, sem trocar o clube de origem. O catálogo traz "Seleção Brasileira".
- **Diretório** (`athlete_directory`) aceita os filtros `gender` (identidade de gênero informada ou, sem ela, o naipe do vínculo vigente) e `national_team` (nome da seleção, ou `sim` para qualquer uma). O filtro de clube aceita o nome exato normalizado ou parte do nome.
- **Chat**: a busca de atletas recebe gênero e convocação; o agente é orientado a usar clube, categoria e gênero para listar e contar atletas do mesmo grupo. A busca clínica por clube passa a contar com o catálogo preenchido.

## Consequências

Atletas do mesmo clube ou categoria se agrupam mesmo com grafias diferentes no cadastro original. A importação em lote continua exigindo categoria e clube do catálogo, agora preenchido. A migração é idempotente.
