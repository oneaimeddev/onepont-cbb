# HANDOFF 007.9B — Refinamento do Perfil Longitudinal do Atleta

Data: 18/11/2026. Branch: `feat/handoff-007-9b-athlete-profile`.
Base obrigatória: [auditoria 007.9A](../audits/HANDOFF-007-9A-perfil-atleta.md).
Especificação recebida: [Handoff 007.9B](../HANDOFF-007-9B.md).

A composição Clinical Design North Star foi preservada: escudo oficial, masthead esportivo, Geist Serif no nome, Geist Sans operacional, contexto lateral e histórico em coluna. Os refinamentos usam as consultas e operações existentes. **Nenhuma migração, RPC, permissão, regra de auditoria ou ferramenta do agente foi alterada.**

## Alterações por achado

| Achado | Entrega |
|---|---|
| UX-01 | O link recente inclui o parâmetro `registro` e o fragmento. A fonte autorizada abre, recebe foco e rolagem. Fragmentos legados continuam funcionando; IDs ausentes do conjunto autorizado não geram linhas ou avisos de existência. |
| UX-02 | A aba ativa é revelada no mobile. Há indicação de outras seções e setas com nomes acessíveis. As abas continuam sendo links; a navegação desktop foi mantida. |
| UX-03 | Alterações de cadastro têm aviso de pendência, confirmação de descarte em links e proteção nativa de recarga/saída. Onde suportada, a Navigation API cobre também travessia de histórico. Formulários e foto só deixam de estar pendentes após envio/confirmação correspondente; não há autosave clínico. |
| UX-04 | Abas e títulos distinguem **Documentos médicos** e **Anexos clínicos**. O upload se chama **Adicionar anexo**. Tipos internos, dados e RPCs permanecem iguais. |
| UX-05 | Cadastro em leitura: Identificação, Informações pessoais, Contatos e responsáveis, Dados esportivos e Histórico de vínculos. Edição básica, fotografia e novo vínculo são disclosures explícitos. Telefone e e-mail válidos têm links acionáveis. O alcance da edição e a indisponibilidade da edição de contatos são informados. |
| UX-06 | Filtros de período, especialidade e estado usam exclusivamente as evoluções já autorizadas. Há filtros ativos, contagens, limpeza e validação de intervalo. Mantidos ordem e grupos mensais. A interface revela 20 evoluções por vez; uma fonte profunda pode ser aberta separadamente sem apagar os filtros. |
| UX-07 | Documentos médicos exibem tipo, estado, versão e atualização. Filtro por tipo e ordenação por atualização recente/antiga ou tipo. Nenhum conteúdo clínico foi acrescentado ao contrato de listagem. |
| UX-08 | “Restrito ao autor” aparece na linha da própria autora, a partir de `is_author` e `is_restricted` já retornados. Para terceiros, não há linha, cadeado, contador ou placeholder de registros ocultos. |
| UX-09 | Visão geral usa **Evoluções recentes**, datas completas e **Ver todas as evoluções**. |
| UX-10 | Marcador de expandir/recolher restaurado. O acesso ao Intelligence tem texto no desktop, título e nome acessível coerente; o ícone compacto continua no mobile. |
| UX-11 | Estados vazios orientam consulta, alteração de filtros ou criação de evolução somente quando permitida. Não se afirma ausência total de registros do atleta. |

## Execução incremental

A primeira etapa foi estabilizada antes da segunda: **quatro testes passaram**, cobrindo alvo e foco, abas 320/390 px e teclado, descarte/recarga/salvamento e confidencialidade. Capturas em [stage-1](../visual/handoff-007-9b/stage-1/). Checkpoint: `0c0fa44`.

A etapa seguinte acrescentou leitura cadastral, filtros e ordenação, mantendo os testes da primeira. Os testes existentes foram atualizados apenas para os novos rótulos ou para abrir as ações de edição agora explícitas; suas verificações de domínio foram mantidas.

## Capturas de antes e depois

Todas as imagens mostram aplicação, autenticação e dados fictícios reais no Supabase local, sem mocks de conteúdo clínico. Os atletas e os identificadores são distintos entre rodadas, mas os cenários equivalentes foram repetidos.

| Área | Antes — auditoria | Depois |
|---|---|---|
| Perfil inicial e ações | [Visão inicial](../visual/handoff-007-9a/01-perfil-inicial-desktop.png) | [Perfil desktop](../visual/handoff-007-9b/after/profile-1440.png) |
| Fonte recente | [Fechada no destino](../visual/handoff-007-9a/03a-timeline-link-recente.png) | [Aberta e focada](../visual/handoff-007-9b/after/timeline-target.png) |
| Cadastro | [Formulário e contatos abaixo](../visual/handoff-007-9a/02-dados-pessoais-esportivos-desktop.png) | [Leitura organizada](../visual/handoff-007-9b/after/registration-desktop.png) |
| Cadastro mobile | [Antes](../visual/handoff-007-9a/07b-mobile-cadastro.png) | [Depois](../visual/handoff-007-9b/after/registration-mobile.png) |
| Histórico | [Sem filtros](../visual/handoff-007-9a/03-linha-do-tempo-desktop.png) | [Filtros aplicados](../visual/handoff-007-9b/after/timeline-filtered.png) |
| Documentos médicos | [Lista anterior](../visual/handoff-007-9a/04-documentos-medicos-desktop.png) | [Lista e controles](../visual/handoff-007-9b/after/documents-1440.png), [tipo e ordem aplicados](../visual/handoff-007-9b/after/medical-documents.png) |
| Anexos | [Antes](../visual/handoff-007-9a/05-anexos-clinicos-desktop.png) | [Anexos clínicos](../visual/handoff-007-9b/after/attachments-1440.png) |
| Abas em mobile | [Aba ativa oculta](../visual/handoff-007-9a/07g-mobile-documentos-ptbr.png) | [390 px](../visual/handoff-007-9b/after/tabs-390.png), [320 px](../visual/handoff-007-9b/after/tabs-320.png) |
| Atleta sem histórico | [Antes](../visual/handoff-007-9a/09-atleta-recem-cadastrado.png) | [Orientação contextual](../visual/handoff-007-9b/after/empty-athlete.png) |

Também foram capturadas as cinco seções em 1440, 390 e 320 px em `docs/visual/handoff-007-9b/after`.

## Validação funcional e permissões

`tests/profile-refinement.spec.mjs` e sua fixture repetem os cenários de prontuário extenso, recém-cadastrado, múltiplos vínculos, evoluções multidisciplinares, documentos/anexos e registros restritos. A fixture utiliza três atletas, quatro perfis, 65 evoluções de medicina/fisioterapia (64 visíveis à médica), uma evolução privada adicional, cinco documentos médicos e um PDF real. Há dois vínculos vigentes e um encerrado no histórico.

Foram verificados:

- Abertura por parâmetro e fragmento, foco, URL antiga e fonte profunda fora do primeiro trecho ou dos filtros.
- Abas ativas visíveis, teclado e ausência de overflow da página em 320/390 px.
- Cancelamento e confirmação de descarte ao trocar seção; cancelamento de saída para outra rota; recarga com aviso nativo; salvamento com mensagem retornada pelo fluxo atual. O teste cobre também a escolha em um catálogo de vínculo, cujo valor é atualizado por controle customizado.
- Leitura de contatos e vínculos, edição/fotografia sob demanda e ausência de contatos/identificadores nos dados devolvidos a fisioterapia sem permissão cadastral.
- Filtros combinados, intervalo inválido, limpeza, persistência na URL após recarga e ampliação de 20 para 40 registros.
- Documentos filtrados e ordenados, abertura no editor com atleta correto e avisos de não emissão/assinatura preservados.
- Contexto do atleta ao abrir o Intelligence; a consulta do provedor não foi necessária para verificar essa transição.
- Registro restrito visível à autora, sem título ou UUID no HTML de terceiros; documento médico negado ao perfil sem habilitação; anexo de outro autor ausente; perfil cadastral sem ação de evolução ou aba clínica.

As contas e dados são temporários, com remoção limitada aos identificadores da fixture, inclusive o objeto de Storage. Não são usados dados reais.

## Acessibilidade

Resultado automatizado em [accessibility.json](../visual/handoff-007-9b/accessibility.json): quinze varreduras axe-core, tags WCAG A/AA até 2.2, nas cinco seções × três larguras. A versão final não apresentou violações automáticas. Foram corrigidos contraste dos novos links e correspondência entre texto visível e nome acessível do acesso ao chat.

No mobile, axe marcou `color-contrast` e `label-content-name-mismatch` como avaliações incompletas que exigem revisão humana; isso não foi tratado como aprovação automática dessas regras. A navegação por teclado, o foco da fonte, os indicadores e as capturas foram conferidos. Não se declara certificação WCAG, teste completo com leitor de tela ou validação Safari/iOS.

## Limitações mantidas e comportamento explícito

- **Contatos/identificação ampliada:** a autorização atual da RPC cadastral continua condicionada a `can_edit`. Esses dados não foram liberados aos demais perfis. A tela de leitura muda a organização, não a permissão. Não há nova edição de contatos ou responsáveis.
- **Histórico:** a revelação em trechos reduz o DOM inicial, mas não pagina o banco nem reduz o conjunto já retornado pela RPC. Os filtros usam datas civis no fuso de São Paulo. Um registro solicitado por link, se autorizado e fora dos filtros/trecho, é apresentado em bloco identificado; não entra indevidamente na contagem dos filtros.
- **URL:** filtros e ordenação podem ser retomados por recarga. Trocar de seção pelos links inicia o escopo padrão dessa seção.
- **Alterações pendentes:** confirmação em links usa o diálogo do navegador. Recarga e fechamento dependem das regras nativas de ativação e suporte a `beforeunload`; Voltar/Avançar usa a Navigation API quando disponível. Não há armazenamento local de dados pessoais nem autosave. Uma submissão deixa de ser uma alteração local pendente, mas sucesso só é informado pela resposta do fluxo atual. Falhas de submissão seguem o tratamento existente.
- **Documentos:** continuam rascunhos privados, não assinados/emitidos. Não há resumo de conteúdo nem busca em documentos de outro profissional.
- **Sem expansão clínica:** não foram introduzidos resumo clínico automático, modelagem de lesão, diagnóstico, novas regras assistenciais ou alteração do agente.

## Verificações finais e estado

- `npm run lint`: passou sem avisos.
- `npm run typecheck`: passou.
- `npm run build`: passou.
- Checkpoint 007.9B.1: **4/4 testes passaram**.
- Suíte completa serial: **56 passaram, 3 falharam**, em 59 casos. Os oito testes novos do perfil, incluindo as 15 varreduras de acessibilidade, passaram nessa execução.
- Duas falhas eram seletores antigos: um regex de clube atingia também um contêiner ancestral; “Finalizado” atingia também a nova opção do filtro. Foram delimitados às linhas do histórico e à etiqueta da timeline, sem remover as verificações clínicas. A primeira reexecução direcionada de catálogo/evolução passou em **4/4 testes**. Após incluir a proteção dos valores dos seletores customizados, a validação final de catálogo, evolução e perfil passou em **12/12 testes**, incluindo **8/8 testes do refinamento**. Assim, as duas falhas de seletor foram resolvidas; a única falha remanescente identificada na rodada geral é a longitudinal preexistente. A suíte geral inteira não foi repetida após esses ajustes; foram repetidos os arquivos afetados.
- A falha longitudinal preexistente permanece: `tests/longitudinal-history.spec.mjs:217` espera uma prescrição criada hoje em um intervalo fixo encerrado em 17/11/2026. O teste e a implementação correspondente não foram alterados.

A branch inclui o checkpoint `0c0fa44` e o commit de conclusão informado na entrega. As alterações longitudinais e demais arquivos preexistentes no workspace permanecem fora dos commits deste handoff. **Sem merge, publicação ou implantação.**
