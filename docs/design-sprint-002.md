# Design sprint 002

A Home CBB Intelligence continua sendo a referência e não foi redesenhada. O shell operacional e o diretório de atletas passam a usar a mesma identidade: fundo `#f4f6fa`, superfície branca, azul-marinho `#0a1731`, azul `#0079d5` e verde `#007132` só na ação principal.

Geist Serif fica nos títulos. Geist Sans fica na navegação, nos formulários e no conteúdo. A faixa lateral nasce em 80 px, como a Home, e pode expandir para mostrar os nomes das seções. No celular, a navegação abre pelo botão Menu.

O diretório mostra nome, foto e até quatro dados esportivos atuais: categoria, naipe, modalidade e clube. O identificador deixa de ser uma linha visível. Busca, filtros e paginação de 25 registros continuam os mesmos.

Capturas anteriores estão em `docs/visual/design-sprint-002/before`. As posteriores ficam em `docs/visual/design-sprint-002/after`.

## Arquitetura de informação

Estas páginas não mudaram de fluxo. A recomendação fica para aprovação de produto.

O diretório em `/atletas` é o lugar de encontrar alguém. Hoje, “Prontuários” e “Nova evolução” repetem essa mesma lista com outro título. A escolha do atleta pode ser uma só, e a intenção — consultar ou evoluir — pode aparecer depois, no perfil.

O prontuário do atleta é o histórico autorizado. A abertura natural é a linha do tempo, com o cadastro em segundo plano. O identificador técnico pode sair do cabeçalho e ficar nos dados cadastrais.

A nova evolução pertence ao atleta já escolhido. O caminho principal continua sendo “Iniciar atendimento” dentro do perfil. O item de menu só precisa pedir um atleta quando ainda não existe um em contexto.

## Próximas telas, ainda sem desenho

Evolução, prontuário e auditoria permaneceram com a estrutura anterior, apenas dentro do shell novo.

- No perfil, o nome do atleta pode assumir o título em serif e os dados esportivos podem vir antes do cadastro.
- O formulário de evolução pode usar a mesma superfície clara do campo de busca, sem o aspecto de ficha administrativa.
- A auditoria pode manter a lista, com menos cara de tabela de backoffice.
- O login ainda ocupa um painel azul inteiro. Ele pode passar ao canvas claro e deixar o escudo como marca, não como fundo.
