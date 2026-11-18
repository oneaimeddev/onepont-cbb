# HANDOFF 007.10.3B — Cadastro e diretório de atletas

18/11/2026. Implementação pontual na branch `feat/handoff-007-10-3b-athlete-directory`, sem merge ou publicação.

## Baseline e preservação

Início com workspace limpo em `479e5f5`, relatório e capturas do [007.10.3A](HANDOFF-007-10-3A-cadastro-listagem-atletas.md), descendente direto da baseline validada `c5c0154`. Assim, foram preservados tanto o 007.10.2B (`269b8f6`) quanto a correção posterior do menu de documentos e da edição por item (`c5c0154`). A branch de implementação foi criada antes das alterações.

Referências: Clinical Design North Star, DESIGN.md, capturas e proposta conceitual do 007.10.3A. Aplicadas as orientações locais de frontend-design, web-design-guidelines, composição e Playwright JS. Mantidos Geist, identidade CBB, tokens existentes e composição por linhas. Todas as capturas desta entrega foram produzidas por Chromium **headless**, sem abrir janelas ou controlar o navegador pessoal.

Nenhuma alteração em migrações, RPCs, autorização, auditoria, regras clínicas, estrutura de persistência, CSV, Intelligence, voz, documentos, anexos, assinatura ou emissão. Não foram instaladas dependências. O refinamento do diretório é limitado a `/atletas`; os usos compartilhados em `/prontuarios` e `/evolucoes` preservam sua apresentação anterior.

## Alterações e diagnóstico

| Problema do 007.10.3A | Implementação | Contrato preservado |
|---|---|---|
| Interações distintas de nascimento e escolha trabalhosa de anos distantes | Um componente com selects nativos Dia/Mês/Ano, meses em português e anos do atual até 1900, nos três fluxos | Valor civil `YYYY-MM-DD`, vazio opcional, sem idade mínima; backend permanece autoridade final |
| Datas parciais ou impossíveis pouco claras | Erro junto ao campo, associação acessível e bloqueio nativo da submissão. Ao salvar a partir de outra seção, abre Dados pessoais e foca o primeiro seletor inválido | Nenhuma correção silenciosa: 29/02/2024 → 2023 mantém dia 29 e pede correção |
| Corte temporal em UTC no cadastro | Data civil de hoje calculada em `America/Sao_Paulo`; atualização ao focar o campo/janela e periodicamente | Nascimento não é convertido para timestamp nem deslocado de dia |
| Resultado correto mostrando outro vínculo | Quando todos os critérios esportivos têm igualdade literal em um único vínculo autorizado, apresenta esse registro e indica os outros | Não altera atletas retornados nem combina atributos de registros distintos |
| Correspondência normalizada/ambígua impossível de reconstruir com certeza | Exibe todos os vínculos vigentes autorizados, sem declarar qual originou o resultado | Não duplica a normalização ou a filtragem PostgreSQL |
| Primeiro vínculo tratado implicitamente como principal | Sem filtros, resumo ordenado por atributos esportivos, de forma estável e neutra, com “Mais N vínculos vigentes” | Não cria vínculo principal nem altera a ordem dos atletas |
| Informação legada parecendo vínculo vigente | Rótulo “Informação esportiva legada”, com os valores originais | Não fabrica datas nem altera histórico |
| Aplicação de filtros distante e formulário extenso após aplicar | “Aplicar filtros” dentro do disclosure; GET explícito; resumo, contagem e “Limpar busca e filtros” visíveis; recolhimento após aplicar e restauração de foco | Não há autoaplicação ou filtragem local dos 25 atletas |
| Estado vazio confundido com falta de acesso | Mensagens distintas para nenhum atleta disponível e nenhum resultado para critérios | Só usa o resultado autorizado; cadastro continua condicionado à permissão |
| Página 999 exibida como ausência de atletas | Redireciona à última página válida segundo o total autorizado e preserva critérios; total zero usa página 1 | Paginação real de 25 itens, consulta e ordenação do backend mantidas |
| Pouco espaço para nomes no mobile | Menor desperdício lateral, avatar compacto, nome com quebra natural e filtros em duas colunas | Sem truncamento indiscriminado, grandes cards ou novas colunas pessoais/clínicas |
| UUID na leitura rotineira | Identificador interno oculto à tecnologia assistiva no diretório | Links continuam usando o identificador seguro existente |

A paginação também limita o número de página ao intervalo numérico já aceito pela RPC antes de consultá-la. Não foi introduzida nova semântica de busca. A ordem continua por `full_name` e identificador; o texto discreto “Ordem por nome completo” esclarece por que um nome social pode aparecer depois de nomes visualmente anteriores.

## Capturas reais antes/depois

As imagens “antes” pertencem ao 007.10.3A e foram preservadas. As imagens “depois” mostram a aplicação real com dados fictícios. Fixtures de cada execução diferem em quantidade/contexto cadastral; não são uma comparação de dados idênticos pixel a pixel.

| Cenário | Antes | Depois |
|---|---|---|
| Nascimento no modal | [1440](../visual/handoff-007-10-3a/cadastro-modal-1440.png) · [320](../visual/handoff-007-10-3a/cadastro-modal-320.png) | [1440](../visual/handoff-007-10-3b/nascimento-modal-1440.png) · [390](../visual/handoff-007-10-3b/nascimento-modal-390.png) · [320](../visual/handoff-007-10-3b/nascimento-modal-320.png) |
| Página de cadastro | [1440](../visual/handoff-007-10-3a/cadastro-nascimento-1440.png) | [1440](../visual/handoff-007-10-3b/nascimento-pagina-1440.png) · [390](../visual/handoff-007-10-3b/nascimento-pagina-390.png) · [320](../visual/handoff-007-10-3b/nascimento-pagina-320.png) |
| Edição do perfil | [1440](../visual/handoff-007-10-3a/edicao-nascimento-1440.png) | [1440](../visual/handoff-007-10-3b/nascimento-edicao-1440.png) · [390](../visual/handoff-007-10-3b/nascimento-edicao-390.png) · [320](../visual/handoff-007-10-3b/nascimento-edicao-320.png) |
| Data impossível | [Antes](../visual/handoff-007-10-3a/data-invalida-teclado.png) | [1440](../visual/handoff-007-10-3b/nascimento-invalido-1440.png) · [390](../visual/handoff-007-10-3b/nascimento-invalido-390.png) · [320](../visual/handoff-007-10-3b/nascimento-invalido-320.png) |
| Diretório vazio, profissional sem cadastro | [Antes](../visual/handoff-007-10-3a/lista-0-390.png) | [1440](../visual/handoff-007-10-3b/vazio-inicial-1440.png) · [390](../visual/handoff-007-10-3b/vazio-inicial-390.png) · [320](../visual/handoff-007-10-3b/vazio-inicial-320.png) |
| Um atleta | [Antes](../visual/handoff-007-10-3a/lista-1-1440.png) | [1440](../visual/handoff-007-10-3b/lista-1-1440.png) · [390](../visual/handoff-007-10-3b/lista-1-390.png) · [320](../visual/handoff-007-10-3b/lista-1-320.png) |
| Dez atletas, foto, nome longo e social | [1440](../visual/handoff-007-10-3a/lista-10-1440.png) · [320](../visual/handoff-007-10-3a/lista-10-320.png) | [1440](../visual/handoff-007-10-3b/lista-10-1440.png) · [390](../visual/handoff-007-10-3b/lista-10-390.png) · [320](../visual/handoff-007-10-3b/lista-10-320.png) |
| Cinquenta atletas | [Antes](../visual/handoff-007-10-3a/lista-50-1440.png) | [1440](../visual/handoff-007-10-3b/lista-50-1440.png) · [390](../visual/handoff-007-10-3b/lista-50-390.png) · [320](../visual/handoff-007-10-3b/lista-50-320.png) |
| Três mil atletas | [Antes](../visual/handoff-007-10-3a/lista-3000-1440.png) | [1440](../visual/handoff-007-10-3b/lista-3000-1440.png) · [390](../visual/handoff-007-10-3b/lista-3000-390.png) · [320](../visual/handoff-007-10-3b/lista-3000-320.png) |
| Múltiplos vínculos, filtros aplicados e recolhidos | [1440](../visual/handoff-007-10-3a/filtros-combinados-1440.png) · [390](../visual/handoff-007-10-3a/filtros-combinados-390.png) | [1440](../visual/handoff-007-10-3b/vinculo-filtrado-1440.png) · [390](../visual/handoff-007-10-3b/vinculo-filtrado-390.png) · [320](../visual/handoff-007-10-3b/vinculo-filtrado-320.png) |
| Ajuste dos filtros | [Antes](../visual/handoff-007-10-3a/filtros-abertos-320.png) | [1440](../visual/handoff-007-10-3b/filtros-abertos-1440.png) · [390](../visual/handoff-007-10-3b/filtros-abertos-390.png) · [320](../visual/handoff-007-10-3b/filtros-abertos-320.png) |
| Critérios sem correspondência | [Antes](../visual/handoff-007-10-3a/combinacao-sem-resultados-1440.png) | [1440](../visual/handoff-007-10-3b/sem-correspondencia-1440.png) · [390](../visual/handoff-007-10-3b/sem-correspondencia-390.png) · [320](../visual/handoff-007-10-3b/sem-correspondencia-320.png) |
| Informação esportiva legada | [Antes](../visual/handoff-007-10-3a/vinculo-encerrado-1440.png) | [Depois](../visual/handoff-007-10-3b/legado-1440.png) |
| Página inválida | [Antes](../visual/handoff-007-10-3a/pagina-fora-limite-1440.png) | [Depois: página 120/120](../visual/handoff-007-10-3b/pagina-recuperada-1440.png) |

## Verificação funcional e acessibilidade

O novo teste `tests/athlete-directory-ux.spec.mjs` exercita a aplicação compilada com Supabase local e usuários/atletas fictícios próprios. As fixtures são removidas ao final, incluindo as opções esportivas criadas pelo teste. Não usa mocks de tela nem substitui a consulta do diretório. Os cenários de nascimento usam um profissional separado do cenário de escala.

- Nascimentos em 1990, 2006, 2012, 2018, data atual válida, 29/02/2024 e vazio: salvar/reabrir, verificar valor civil persistido; edição para 29/02/2012; cadastro no modal.
- Validação de 29/02/2023 e 29/02/1900, limite inferior, futuro e seleção parcial; troca de ano sem reduzir automaticamente o dia; limpar nascimento e foco no erro a partir de outra seção.
- Ano selecionado pelo teclado; fronteira UTC/São Paulo, inclusive virada de ano; atualização do limite ao cruzar meia-noite de São Paulo em relógio de navegador simulado, sem persistir data futura no servidor.
- Crescimento autorizado 0 → 1 → 10 → 50 → 3.000; consulta parcial de atleta fora da primeira página; busca por Érica sem acento; foto, nome longo, nome social, atleta inativo e dados legados nas capturas.
- Filtros em um único vínculo, combinação impossível entre vínculos, fallback de apresentação quando o filtro usa normalização, retorno perfil → diretório com critérios, aplicação explícita, limpar tudo, correção de página 999 e preservação de critérios.
- Profissional sem atletas/cadastro e profissional com apenas um atleta autorizado; nenhum `document_id` ou `gender_identity` no payload do diretório; URL de atleta não autorizado indisponível.
- Sem overflow horizontal em todas as capturas de 1440, 390 e 320 px; resumo de filtros operável por Enter, recolhido após aplicar, com foco restaurado; rótulos e erros associados aos selects.

Axe-core já presente nas dependências transitivas, sem instalação adicional: **15 avaliações, zero violações automáticas** nas tags WCAG 2 A/AA e 2.1 AA, cobrindo cadastro em página/modal, edição, lista de dez atletas e filtros combinados nas três larguras. [Resultados brutos](../visual/handoff-007-10-3b/acessibilidade.json). Há apontamentos `incomplete: color-contrast` na listagem; são verificações inconclusivas, não uma certificação de contraste. Os textos novos reutilizam as cores e fundos existentes, conferidos nas capturas. Cálculo sRGB dos pares usados: texto secundário `#3a4660` sobre `#f4f6fa` = 8,72:1 e sobre branco = 9,44:1; erro `#8a1c1c` sobre esses fundos = 8,57:1 e 9,28:1. Isso verifica esses pares, sem substituir uma auditoria com leitor de tela ou certificar toda a aplicação. Os estados de erro também usam texto, além de cor.

Limites: Chromium headless com viewports simulados; não houve teste em aparelho físico, Safari, leitor de tela real ou hardware de teclado móvel. Selects permanecem nativos e sua aparência pode variar por sistema/localidade. A preservação de foco entre navegações GET é de melhor esforço quando o armazenamento de sessão do navegador está bloqueado. A apresentação conservadora de todos os vínculos em casos ambíguos pode ocupar mais linhas; é a alternativa aprovada para evitar indicar um vínculo incorreto. O ensaio de 3 mil atletas verifica consulta/paginação e interface; não constitui benchmark de produção.

## Arquivos e validação final

Produção:

- `src/features/athletes/birth-date.ts`, `birth-date-field.tsx`, `birth-date.css`: valor civil, validação compartilhada e seletores.
- `src/features/athletes/registration-form.tsx`, `profile-registration.tsx`, `src/app/(workspace)/atletas/novo/page.tsx`: integração nos três fluxos.
- `src/features/athletes/directory-sports.tsx`, `directory-filters.tsx`, `directory.css`, `catalog.tsx`: apresentação dos vínculos, filtros, mensagens e recuperação de página.

Testes: novo `tests/athlete-directory-ux.spec.mjs` e adaptação do preenchimento de nascimento existente em `tests/catalog.spec.mjs` aos três selects, preservando suas verificações. Documentação: este relatório e 38 capturas com resultados em `docs/visual/handoff-007-10-3b/`. Os 104 artefatos históricos regravados pela suíte foram restaurados à baseline para não misturar entregas.

| Verificação | Resultado |
|---|---|
| Suíte completa — `npm test -- --workers=1` | **73 aprovados, 5,9 minutos** |
| Direcionados finais — `athlete-directory-ux` + `catalog`, um worker | **6 aprovados, 49,7 segundos** |
| `npm run lint` | Aprovado |
| `npm run typecheck` | Aprovado |
| `npm run build` | Aprovado; build de produção usado nos testes |
| `git diff --check` | Aprovado |

Os direcionados foram repetidos depois da suíte completa para validar verificações adicionais de nome social/status/vínculo encerrado e regenerar capturas com localidade pt-BR, fuso São Paulo e posição inicial de rolagem consistente. O código de produção permaneceu igual entre essas execuções. A suíte integral inclui CSV com até 5 mil atletas fictícios, perfil, autorizações, Intelligence, documentos, anexos e voz.

[Registro estruturado de validação](../visual/handoff-007-10-3b/validacao.json). Confirmados zero usuários de fixture `ux-directory-*` e zero opções esportivas próprias remanescentes. Os servidores temporários de teste foram encerrados; o servidor de desenvolvimento preexistente foi preservado. Os avisos de `NO_COLOR/FORCE_COLOR` e `MODULE_TYPELESS_PACKAGE_JSON` não impediram a execução e não motivaram mudanças fora de escopo.

A implementação fica em commit local nesta branch, junto deste relatório e das evidências. Nenhum merge, push ou publicação foi realizado. A homologação visual permanece com o responsável pelo produto.

## Ajuste posterior — filtros sempre visíveis

Por solicitação do usuário, o disclosure foi substituído por um fieldset sempre visível. Os cinco filtros e “Aplicar filtros” ficam em uma linha no desktop; em telas pequenas, os campos quebram em duas colunas, sem overflow. A busca mantém sua largura anterior. Permanecem GET explícito, contagem de critérios, limpeza e semântica do backend. O comportamento de recolher/restaurar foco descrito na entrega inicial foi substituído por esta interação direta; o componente não precisa mais de estado cliente ou armazenamento de sessão.

Validação desta alteração: **4 testes direcionados aprovados (42,2 s)**, lint, typecheck e build aprovados; 15 avaliações axe sem violações automáticas, com a mesma ressalva de contraste inconclusivo registrada anteriormente. A suíte completa de 73 testes acima pertence à entrega inicial; não foi repetida neste ajuste visual. Testes adaptados para verificar campos visíveis antes/depois da aplicação e navegação entre selects com Tab.

Capturas atuais: [desktop](../visual/handoff-007-10-3b-inline-filters/vinculo-filtrado-1440.png), [390 px](../visual/handoff-007-10-3b-inline-filters/vinculo-filtrado-390.png), [320 px](../visual/handoff-007-10-3b-inline-filters/vinculo-filtrado-320.png). Evidências desta nova execução em `docs/visual/handoff-007-10-3b-inline-filters/`; as imagens anteriores permanecem como registro da entrega inicial. Validação somente em segundo plano, sem navegador visível. Sem merge ou publicação.
