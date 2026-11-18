# Prontuário CBB — pacote de início do desenvolvimento

**Versão:** Discovery/Delivery 0.1  
**Data de elaboração:** 14/11/2026  
**Meta interna:** primeira versão demonstrável até terça-feira **17/11/2026**  
**Apresentação ao stakeholder Carlos Vicente Andreoli:** segunda-feira **23/11/2026**

## Ordem de uso

1. Leia [`PRD-0.1.md`](PRD-0.1.md) — visão, premissas, escopo e aceite.
2. Leia [`ARQUITETURA-0.1.md`](ARQUITETURA-0.1.md) — domínio, fluxos, autorização, IA e auditoria.
3. Use [`HANDOFF-001.md`](HANDOFF-001.md) como **primeira demanda para o Cursor/Claude Code**. O handoff instrui a implementar a primeira vertical, executar verificações e entregar evidências.
4. Acompanhe [`BACKLOG-0.1.md`](BACKLOG-0.1.md) — ordenação por prioridade e corte da entrega.

## Premissas de execução

- Produto **CBB-first**, com logotipo oficial e paleta da CBB; white-label fica fora do escopo atual.
- **Chat-first**: interface inicial com caixa central, texto e voz previstos, cards contextuais; interface tradicional acessível via UI e por comando do chat.
- **Atleta é o centro** do prontuário; convocações/categorias são vínculos, não cadastros duplicados.
- **Auditoria é parte do produto desde o primeiro incremento**. Exibir quem fez, o quê, sobre qual recurso, quando, origem (UI/chat/voz), resultado e aprovação quando aplicável.
- **Sem dados reais de pacientes na demonstração**. Usar dados 100% fictícios e identificados como demonstração.
- **Integrações Bird ID, Soluti, SNCR/Anvisa: pontos de extensão, NÃO dependências da primeira entrega**.
- Uma demo funcional **não é prontidão para produção clínica**; haverá validação jurídica, regulatória, de privacidade e segurança antes de pilotos reais.

## Fontes

- Transcrição da reunião de 11/11/2026 com Carlos Vicente Andreoli e equipe, disponibilizada em PDF.
- Resumo do Gemini da mesma reunião; onde houver divergência, prevalece a transcrição.
- Decisões posteriores tomadas nesta conversa (MVP Plus, AI-first, duas interfaces, branding, auditoria e novo prazo).

## Como iniciar

Em um repositório **vazio ou recém-criado**, anexe o pacote de documentos e envie ao agente de código:

> Leia `PRD-0.1.md` e `ARQUITETURA-0.1.md`. Execute `HANDOFF-001.md` **por fases**, validando cada etapa e respeitando os limites de escopo. Não use dados reais de pacientes. Ao final, apresente arquivos modificados, comandos de validação executados e pendências objetivas.

**Este pacote contém especificação e instruções de implementação, não contém a aplicação já codificada ou publicada.**

## Rodar a Fase A no WSL

No Ubuntu, com Node 22 e Docker em execução:

```bash
cd ~/projects/prontuario-cbb
source "$HOME/.nvm/nvm.sh"
nvm use 22
npm ci
npm run supabase:start
npm run demo:env
# Ao executar o bloco, aguarde o aviso, digite uma senha nova e pressione Enter.
# O texto entre aspas é o aviso exibido no terminal.
printf '%s' 'Senha local da conta DEMO (12 caracteres ou mais): '
IFS= read -rs demo_password
printf '\n'
printf '%s' "$demo_password" | npm run demo:user -- medico.demo@example.com medico
unset demo_password
npm run dev -- --hostname 127.0.0.1
```

Abra http://localhost:3000 e entre com a conta fictícia criada. Repita a criação com
outro e-mail `@example.com` e perfil `fisio` ou `auditor`. O perfil `auditor` tem
acesso à página reservada à auditoria. O provisionamento usa a chave administrativa
apenas no script local. `demo:env` cria o arquivo ignorado `.env.local` uma vez.

Para validar com o Supabase local iniciado:

```bash
npx playwright install chromium
npm run lint
npm run typecheck
npm run build
npm test
npm audit --omit=dev
```

Os testes usam contas temporárias próprias e as removem ao terminar. Para a suíte
do Handoff 004, aplique as migrations e gere o elenco `cbb-qa-1` antes de
executar `npm test` (comandos abaixo). O contrato de auditoria está em
`src/features/audit/contract.ts`. Atendimentos e evoluções já permitem salvar
rascunhos, revisar e finalizar mediante confirmação. O assistente de IA permanece
indisponível. O escudo fornecido e a paleta estão documentados em DESIGN.md.
O shell usa Tailwind e componentes locais, com a adoção de shadcn/ui adiada até
haver componentes compartilhados que precisem dele.

### GitHub

A branch local é `main`. Quando o repositório privado do projeto estiver disponível
e o GitHub autenticado, associe a URL a `origin` com `git remote add origin`.

## Demonstração do prontuário longitudinal

Com o Supabase local iniciado, aplique as migrations pendentes e conceda acesso
à conta fictícia que você já criou. Ajuste o e-mail se criou outro.

```bash
npx supabase migration up
docker exec -i supabase_db_prontuario-cbb psql -X -U postgres -d postgres \
  -v email=medico.demo@example.com < scripts/seed-athletes.sql
npm run dev -- --hostname 127.0.0.1
```

Em **Buscar atleta**, abra **Atleta DEMO Aurora** para ver dois registros
sintéticos persistidos. **Atleta DEMO Horizonte** demonstra a linha do tempo vazia.

Para espalhar evoluções, prescrições, solicitações de exame e pedidos
cirúrgicos fictícios pelo elenco já existente, com quantidades diferentes
por atleta:

```bash
node scripts/seed-demo-chart.mjs
```

O comando só funciona no Supabase local e pode ser repetido. Horizonte
continua sem esses registros.
O cadastro manual fica disponível para a conta escolhida. A auditoria é acessível
com um perfil criado com a opção `auditor`.

## Handoff 004 e homologação local

O gerador exige o Supabase local e recusa NODE_ENV=production. Ele recria o lote
informado e provisiona os quatro especialistas fictícios descritos abaixo. A conta
`medico.demo@example.com`, quando já existe, também recebe acesso ao elenco.
O estado atual para apresentação está no [inventário da demo](docs/demo/INVENTARIO-SEED-2026-11-18.md).
Não reexecute o gerador apenas para consultar a massa existente.

```bash
node scripts/qa-athletes.mjs roster cbb-qa-1
node scripts/qa-athletes.mjs reset cbb-qa-1
```

O elenco tem 14 ou 15 atletas fictícios em cada categoria e naipe, com nomes
femininos no feminino, nomes masculinos no masculino e clubes reais de basquete
brasileiro. Também cria, se ainda não existirem, uma conta local de ortopedia,
cardiologia, fisioterapia e psicologia. A senha das contas novas aparece só na
saída do comando e não fica no repositório. O reset remove os atletas, registros
e vínculos da seed indicada. As contas e os eventos de auditoria permanecem.
Fotos são imagens abstratas sintéticas. Para o upload,
configure SUPABASE_SERVICE_ROLE_KEY apenas no servidor, com o segredo do projeto
Supabase correspondente. O endpoint verifica sessão e vínculo antes da gravação.
Em instalações novas, `npm run demo:env` já escreve essa variável no arquivo local
ignorado pelo Git. O comando não sobrescreve configurações existentes.

O gerador prepara quatro atendimentos/evoluções multidisciplinares de Marina Costa.
Concede leitura, escrita e finalização aos especialistas no elenco; edição e cadastro
ficam habilitados para ortopedia. A conta médica existente recebe leitura, edição,
escrita e finalização no lote. Não concede acesso universal a outros atletas,
autoria de documentos médicos ou auditoria. O reset não revoga as permissões
globais previamente configuradas da conta.
Utilize contas individuais exclusivamente locais e nunca reutilize credenciais
de produção. Nenhum gerador roda no build ou na inicialização da aplicação.

Para demonstrar: entre com a conta provisionada, selecione um atleta da massa,
abra **Dados cadastrais** para editar ou adicionar uma foto e use **Iniciar
atendimento** para salvar, revisar e finalizar uma evolução. O atendimento é
persistido junto com o primeiro rascunho. A foto é adicionada após o cadastro.

O relatório de entrega, a matriz QA e as limitações estão em
`docs/HANDOFF-004-RESULTADO.md`. As capturas estão em `docs/visual/handoff-004/`.
