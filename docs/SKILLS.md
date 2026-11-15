# Skills locais

Instaladas com skill-installer em .agents/skills, a partir dos repositórios
indicados no handoff. Nenhuma skill equivalente existia no projeto.
São instruções e recursos de desenvolvimento. A aplicação não as importa.

| Nome invocável | Pasta | Quando consultar |
|---|---|---|
| frontend-design | frontend-design | Direção visual e refinamento |
| web-design-guidelines | web-design-guidelines | Revisão de interface e acessibilidade |
| vercel-react-best-practices | react-best-practices | Performance de React e Next.js |
| vercel-composition-patterns | composition-patterns | APIs e composição de componentes |
| impeccable | impeccable | Crítica e polimento visual específicos |
| webapp-testing | webapp-testing | Inspeção por navegador |
| ui-ux-pro-max | ui-ux-pro-max | Decisões de UI, UX, paleta, tipografia e revisão visual |

Fontes fixadas nesta instalação

- anthropics/skills, commit 1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064.
  frontend-design e webapp-testing incluem licença Apache 2.0.
- vercel-labs/agent-skills, commit 1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62.
  React e composição declaram MIT no frontmatter. web-design-guidelines não
  declara licença própria e o snapshot não inclui LICENSE. A confirmação dessa
  licença permanece pendente.
- pbakaus/impeccable, commit 1b2aa57ca0f1cd6e393689bba70a780cb701aacd.
  Apache 2.0, licença do repositório copiada junto da skill.

Nesta entrega foram aplicadas frontend-design e web-design-guidelines.
A preferência de webapp-testing por Python foi adaptada ao Playwright JS já
instalado, conforme a orientação de reutilizar ferramentas do projeto.
Impeccable contém um launcher que pode baixar um executável. Sua execução e hooks
ficam para quando essa skill for aplicada a uma tarefa específica.
As skills de composição e performance ficam disponíveis para demandas adequadas.

As recomendações visuais se sobrepõem. Escolha uma direção por tarefa e use
DESIGN.md como referência para resolver diferenças de estilo.
Os exemplos externos ficam excluídos do lint e do TypeScript da aplicação.
As skills estarão disponíveis para descoberta na próxima interação do Codex.

## Instalação de 14/11/2026

`frontend-design`, `web-design-guidelines` e `ui-ux-pro-max` foram instaladas
com `npx skills add` para Cursor e Codex, na pasta compartilhada
`.agents/skills`. As duas primeiras já estavam no projeto e o conteúdo
permaneceu o mesmo. `ui-ux-pro-max` é nova e veio de
nextlevelbuilder/ui-ux-pro-max-skill. A procedência dessas três fica em
`skills-lock.json`. Ela consulta dados locais e não substitui `DESIGN.md`
quando houver conflito de estilo.
