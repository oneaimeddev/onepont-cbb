# Baseline antes da alteração de paleta — 20/11/2026

Tag de referência: `baseline/pre-paleta-2026-11-20`.

A main foi consolidada por solicitação expressa do usuário, por fast-forward de `51c1426` até a entrega `32bc100`. Todas as demais branches locais estavam contidas nessa entrega; nenhuma branch foi descartada. O código de aplicação e as migrations permanecem exatamente os da versão validada com 351 testes, lint, typecheck e build aprovados. O commit deste guia acrescenta somente documentação.

A tag aponta para a main consolidada incluindo este guia. É um ponto de referência fixo: não movê-la nem sobrescrevê-la durante o experimento. Consolidação e tag são locais; não houve push nem deploy.

## Próxima mudança de cores

Antes de editar cores, criar uma branch separada a partir desta baseline:

```sh
git switch -c design/paleta-cores baseline/pre-paleta-2026-11-20
```

Manter os commits de paleta separados de alterações funcionais. Não alterar banco, permissões ou fluxos clínicos para um ajuste de cores.

## Se a paleta não agradar

Com as alterações do experimento preservadas em commits e o workspace limpo, voltar à main:

```sh
git switch main
```

Enquanto a paleta estiver apenas na branch experimental, isso recupera esta versão estável sem apagar o experimento.

Para conferir especificamente o código marcado pela tag, sem mover branches:

```sh
git switch --detach baseline/pre-paleta-2026-11-20
```

Se a paleta já tiver sido integrada, reverter seus commits com `git revert`, preservando o histórico e as mudanças funcionais posteriores. Não usar reset destrutivo nem restaurar indiscriminadamente o repositório inteiro. O retorno da paleta deve ser feito só sobre os arquivos/commits visuais correspondentes.

A tag registra código e documentação; não é um backup do banco. A baseline já inclui as migrations locais 005–014. Uma mudança apenas de paleta não exige reaplicá-las nem revertê-las.
