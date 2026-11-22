# Regras para os chats executores

## Preparação e escopo

1. Leia o AGENTS.md da entrada do projeto e o AGENTS.md do repositório; localize o checkout conforme a configuração da máquina. Os comandos de projeto devem seguir essas instruções.
2. Leia README.md, CONTRATOS.md e ACEITE.md deste pacote, o seu prompt e os relatórios das dependências.
3. Confira branch, HEAD, status e diferenças. A branch esperada é `feat/voice-conversation-fluidity`, criada a partir de `ce14154`. Não faça reset nem descarte alterações de outro trabalho. Se o checkout divergiu, determine se os pré-requisitos continuam válidos antes de editar.
4. Não copie caminhos específicos desta máquina para documentação compartilhada. Os caminhos do pacote são relativos ao repositório.
5. Execute apenas a etapa atribuída. Preserve a implementação existente fora do seu escopo. Não substitua SDK, framework, banco ou sistema de cartões sem necessidade demonstrada.
6. Consulte apenas skills pertinentes, seguindo docs/SKILLS.md. Mudanças visuais e de acessibilidade seguem as skills exigidas pelo AGENTS.md.
7. Nenhum prompt autoriza criar outros chats, delegar a subagentes ou publicar o Beta.
8. Se houver contradição entre implementação e contrato que afete segurança ou arquitetura, registre uma proposta concreta no relatório e interrompa apenas a parte dependente. Não invente uma nova regra de consentimento.

## Segurança e execução

- Use dados fictícios e ambiente local de teste. Confirme o destino do banco antes de migrations e fixtures. Não rode reset destrutivo para fazer testes passarem.
- Reutilize autenticação, RLS, guards de proposta, origem ai_voice/ai_chat, aprovação humana e idempotência existentes.
- O ator vem da sessão autenticada. IDs, listas, versões e flags do cliente/modelo são pistas a validar, nunca autorização.
- O gateway de assinatura não pode se tornar uma ferramenta do modelo. A mensagem original do profissional nunca pode ser substituída por texto reescrito pelo Carbon para verificar confirmação.
- Logs não recebem áudio, transcrição, nomes, conteúdo clínico, prompts, respostas, tokens nem URLs com credenciais.
- Não introduza dependência de gravação de áudio para testes automatizados.
- Não anuncie cancelamento de uma operação que pode ter sido confirmada. Primeiro reconcilie seu estado.
- Não altere permissões, os fluxos tradicionais nem a configuração de produção para facilitar a implementação.
- Se mudar schemas, adicione migration com novo identificador cronológico; não edite migrations aplicadas.

## Verificação

Execute lint, typecheck, build e os testes pertinentes exigidos pelo repositório. Reutilize Playwright JS e as fixtures existentes.

Comandos de referência, executados a partir do repositório:

```sh
npm run lint
npm run typecheck
npm run build
npm run test:conversation-security
npm run test:chat-operations
npm run test:workflow
npx playwright test --project=voice
```

Os comandos de testes dependem do Supabase local e, conforme o projeto Playwright, de servidores e portas configurados. Leia a configuração antes de executá-los. Não mate processos desconhecidos e não imprima segredos de arquivos de ambiente.

- Testes novos devem reproduzir comportamentos reais: corrida, reconexão, contexto, origem ou decisão. Evite asserts que só copiem constantes.
- Atualize testes antigos somente se o comportamento esperado mudou pelo contrato. Não remova proteção para obter aprovação.
- Provider mockado prova o contrato, não a qualidade linguística do Carbon.
- Falta de chave, microfone físico ou infraestrutura deve aparecer como “não executado”, com motivo. Não marque homologação completa nesse caso.
- Não regenere capturas históricas; guarde evidências novas na pasta da entrega.

## Checkpoint e continuidade

Ao concluir uma etapa validada, crie um commit somente com seus arquivos e o relatório da etapa. Não inclua .env, segredos, saídas grandes ou dados de pessoas. Não use git add indiscriminadamente.

Este pacote autoriza commits locais de implementação na branch. As etapas 01 a 08 não fazem push. A etapa 09 pode enviar a branch de trabalho ao remote GitHub verificado, conforme o pedido original de subir uma branch, após checks e relato honesto das pendências. Não usar force push. Nenhuma etapa autoriza merge na main ou publicação do Beta.

O relatório `docs/delivery/voice-fluidity/NN.md` deve registrar:

- Etapa, commit de partida e conclusão funcional.
- Arquivos alterados, contratos preservados e mudanças de schema.
- Cenários de ACEITE.md executados, com comandos e resultado real.
- Testes que falharam antes e depois; falhas preexistentes separadas.
- Medições com origem: mock, áudio sintetizado ou pessoa com microfone.
- Pendências e próximo prompt liberado ou não liberado.

Informe o hash final também na resposta do chat; o relatório pode ser incluído no mesmo commit sem tentar referenciar seu próprio hash.

As revisões A e B são gates de qualidade solicitados por este plano, não pedidos genéricos de permissão. O executor conclui seu trabalho antes da revisão e não pede confirmação para edições ou testes rotineiros já abrangidos.
