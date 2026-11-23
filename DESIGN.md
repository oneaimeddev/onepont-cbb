# Identidade do Prontuário CBB

Aplicação clínica de operação, com entrada Chat First e navegação tradicional.
O escudo fornecido pelo usuário em 14/11/2026 está em public/brand/cbb.png.
O arquivo original foi copiado integralmente. Sua proporção é 697 × 869.

## Paleta

Cores predominantes medidas no arquivo por contagem dos pixels opacos.

| Cor | Imagem | Aplicação |
|---|---|---|
| Azul-marinho | #102849 | Marca, títulos, navegação ativa |
| Verde | #0b9649 | Ajustado para #07803e nos botões com texto branco |
| Amarelo | #f3d115 | Detalhe institucional no login |
| Azul secundário | #4676bb | Referência da borda do escudo |
| Branco | #ffffff | Superfícies e texto sobre fundo escuro |

Tokens adicionais de interface em src/app/globals.css. Fundo #f5f7fa, texto
#142c46, texto secundário #536579, foco #2366b2 e erro #a32631.
Os tons adicionais são decisões de interface, sujeitos à homologação da CBB.
A imagem enviada é a fonte visual desta entrega.

## Tipografia e estrutura

Barlow regular e semibold, arquivos locais sob OFL em src/app/fonts.
Corpo 16 px, apoio 14 px, títulos responsivos de 29 a 40 px.
Linha de texto limitada nos estados vazios. Pesos de destaque 600.
Espaçamento em múltiplos de 4 px, preferindo 8, 12, 16, 24 e 32 px.
Raio principal 6 px. Elevação leve somente no modo selecionado.

Login em duas colunas no desktop, com área institucional e formulário.
Em até 850 px, marca compacta acima do formulário.
Workspace autenticado com sidebar compartilhada de 248 px no desktop e 216 px
em telas intermediárias. Área de conversa limitada a 820 px com composer no
rodapé e sugestões de tarefas no início.
Até 700 px, navegação recolhida em um disclosure acionado por Menu.
A abertura ocupa espaço no fluxo e Escape devolve o foco ao botão.
Perfil e logout ficam junto da navegação.
Botões e links principais com altura mínima de 44 px.
Todos os estados ativos combinam cor e outro sinal, como peso, borda ou fundo.

## Interação e componentes

Brand apresenta o escudo com dimensões reservadas e texto alternativo.
WorkspaceShell concentra navegação e sessão, e indica a seleção atual com
aria-current. O conteúdo das páginas e a sessão são compostos como children.
WorkspaceArea aceita um contexto opcional. A coluna aparece somente quando há
conteúdo, e passa abaixo da tarefa em até 1000 px.
MessageComposer apresenta o estado indisponível do assistente com descrição
associada ao campo e botão de envio desabilitado. A descrição fica dentro do
composer, junto ao botão, em uma única mensagem.
Módulos sem implementação exibem a etiqueta “Indisponível” na sidebar. Nas
sugestões do chat, esses módulos não são links. A abertura do chat cita o
atleta quando há contexto ativo.
SubmitButton informa envio em andamento e bloqueia submissão duplicada.
Inputs têm rótulos, autocomplete e foco visível.
Erros de autenticação ficam associados aos campos e anunciados por role=alert.
O link “Ir para o conteúdo” permite saltar a navegação por teclado.

Os módulos clínicos seguem a sequência do handoff. Tabelas, diálogos, notificações
e skeletons serão concretizados quando seus fluxos forem implementados.
Nessas superfícies, usar HTML semântico, estado explícito, leitura temporal clara,
autoria e confirmação de sucesso respaldada pelo backend.
O chat permanece indisponível até a implementação de sua integração.

## Restilização do workspace

O azul-marinho do login passou a estruturar o produto autenticado. A sidebar e a
barra móvel usam #102849 com o filete amarelo institucional no topo. O conteúdo
permanece em superfícies claras. No azul-marinho, o item ativo combina fundo
#224270, peso 600, ícone e barra lateral verde #4cc883.

Tokens adicionados em src/app/globals.css: raio de 12 px para superfícies,
sombras leves (shadow-sm e shadow-md), transições de 150 ms e etiquetas de
status (pill) em verde, amarelo e vermelho suaves, com texto de contraste
superior a 6:1. Transições respeitam prefers-reduced-motion.

Componentes compartilhados: Icon (SVG próprio, aria-hidden), Avatar (iniciais),
EmptyState e Brand. O chat usa blocos de ação com ícone. O composer fica elevado,
com foco no contorno inteiro, e acompanha a rolagem apenas acima de 700 px.
O painel de contexto exibe o cartão do atleta. A lista de atletas usa linhas
inteiramente clicáveis com o nome como único link. O perfil tem cabeçalho com
avatar, abas sublinhadas e dados em grade. A linha do tempo distingue Rascunho
e Finalizado por texto, cor e marcador. A auditoria exibe o resultado em etiqueta.
Campos opcionais do cadastro são indicados e o formulário oferece Cancelar.

Na sidebar desktop, módulos indisponíveis mostram um cadeado com texto
acessível. No celular, a etiqueta “Indisponível” aparece por extenso.
Capturas em docs/visual/ui-refresh, geradas por scripts/capture-workspace.mjs,
que cria atleta e registros fictícios temporários e os remove ao final.

## Verificação

Capturas em docs/visual/before e docs/visual/after, desktop 1440 × 1000 e celular
390 × 844. O script scripts/capture-ui.mjs cria uma conta fictícia temporária,
captura as páginas e remove essa conta. Executar com a aplicação na porta 3100.


## Continuidade conversacional prevista

O próximo handoff com integração real deverá preencher a região conversation-content
com mensagens e resultados autorizados. O composer continuará separado da região
de conteúdo. Sua ativação requer um contrato de envio e tratamento de falhas.

| Tipo de conteúdo | Apresentação prevista | Evidência necessária |
|---|---|---|
| Informação do agente | Autoria explícita e fontes disponíveis | Resposta real do provedor |
| Ação proposta | Resumo revisável e estado “Aguardando revisão” | Rascunho autorizado |
| Ação aprovada | Identificação de quem confirmou e estado de envio | Confirmação humana |
| Ação executada | Resultado e identificação da operação | Sucesso confirmado pelo backend |

Mensagens longas exigirão quebra de palavras e área de leitura com rolagem.
Enter enviará e Shift+Enter inserirá uma linha quando existir envio real, com
proteção para composição de caracteres por IME. O processamento terá anúncio
acessível, erro recuperável e preservação do texto digitado.
Histórico e contexto de atleta dependem de persistência e autorização.

As capturas do Handoff 002 estão em docs/visual/handoff-002. A série anterior
continua em docs/visual/after para comparação.

## Design sprint 002

A operação tradicional deixa a sidebar azul-marinha e passa a usar a mesma
linguagem da Home: faixa clara de 80 px, escudo oficial, Geist Sans e títulos
em Geist Serif. A faixa expande para mostrar os rótulos. O diretório prioriza
nome, foto e dados esportivos. O registro do sprint está em
docs/design-sprint-002.md.

## Clinical Design North Star

A direção visual das telas convencionais foi aprovada em 15/11/2026.
A referência permanece isolada em `/design-lab/clinical-north-star`.
Ela ainda não está integrada ao prontuário real.

Padrões, restrições de sigilo e o plano de aproveitamento estão em
docs/design-lab/clinical-north-star.md. A captura aprovada está em
docs/visual/design-sprint-002-1/perfil-longitudinal-1440x900.png.
A Home CBB Intelligence continua sendo a entrada aprovada.

## Identidade CBB (23/11/2026)

Releitura da identidade do site oficial da CBB, aplicada de forma contida para preservar a
leitura clínica. As cores ficam centralizadas em tokens (`:root` em src/app/globals.css); as
folhas de estilo das funcionalidades usam só os tokens, sem códigos de cor soltos. Os
documentos médicos mantêm a paleta própria, fixada em documents.css.

| Token | Cor | Uso |
|---|---|---|
| `--cbb-green` | #2e6a29 | Ação principal (botões), links de ação, abas ativas. Branco sobre ele: 6,5:1 |
| `--cbb-green-deep` | #1d3a1a | Barras de navegação, painel do login, cartão do atleta sem foto |
| `--cbb-yellow` | #dcc54c | Estado ativo na navegação, filetes institucionais. Nunca como texto sobre branco |
| `--cbb-navy` | #171d33 | Títulos, avatares de iniciais, texto forte |
| `--ink` / `--muted` | #182033 / #505b6b | Texto e texto de apoio (6,3:1 sobre a superfície) |
| `--surface` / `--line` | #f5f6f2 / #e3e6df | Fundo neutro levemente quente e divisórias |

Elementos de marca:
- Barra lateral (workspace e chat) no verde-escuro com a textura discreta da camisa (duas
  tramas diagonais em CSS), filete amarelo no topo e item ativo com barra amarela.
- Login em duas colunas: painel verde com escudo, frase institucional sobre filete amarelo e a
  silhueta do jogador (public/brand/player.png, usada como máscara e tingida pelo token). No
  celular, faixa verde compacta acima do formulário.
- Perfil sem foto: cartão de atleta verde com a silhueta e as iniciais, como no site da CBB.

Tipografia mantida: Geist Sans na interface e Geist Serif nos nomes de atletas e na saudação.
Capturas de antes e depois geradas com a homologação (dados fictícios), desktop 1440 × 1000 e
celular 390 × 844.
