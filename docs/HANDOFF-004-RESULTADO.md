# Handoff 004 — resultado e evidências

Implementação local em `/home/tomaz/projects/prontuario-cbb`, preservando o App
Shell, a paleta, os componentes e os ajustes feitos no Cursor. Marco da demo:
17/11/2026. Não houve publicação ou criação de repositório remoto; `git remote -v`
não possui destino configurado.

## O que funciona

O perfil mostra foto/alternativa por iniciais, identificação, idade, contexto
esportivo atual e histórico de vínculos. A visão geral possui contagens reais
de atendimentos/evoluções e até três atividades recentes, sempre limitadas aos
registros autorizados. A linha do tempo reúne atendimentos e evoluções, com
autoria, especialidade, data, estado e vínculo. Dados cadastrais permite edição
e gerenciamento da foto conforme permissão.

O diretório faz busca normalizada por nome, nome social, UUID e identificador
CBB. Categoria, naipe, modalidade, clube e status podem ser combinados. O banco
retorna 25 atletas por página, total autorizado e ordenação estável por nome/UUID.
O retorno pelo perfil e suas abas preserva busca, filtros e página. Identificador
e nascimento ajudam a distinguir homônimos. Estados vazios, erro recuperável e
feedback de gravação são explícitos. A navegação de busca utiliza o carregamento
normal do navegador; não há um skeleton específico para o diretório.

O profissional identifica sua especialidade no formulário, salva um rascunho,
edita e revisa a versão persistida antes de confirmar a finalização. O primeiro
rascunho cria o atendimento na mesma transação. O UUID da solicitação evita
duplicação por repetição. Alterações usam versão esperada para detectar conflitos.
Somente o autor autorizado edita; finalizar exige permissão adicional. A
finalização preserva o conteúdo salvo e fecha o atendimento. O banco bloqueia
updates de registros finalizados. Versões anteriores dos rascunhos ficam em
`clinical.record_revisions`.

O chat oferece entradas contextuais para registrar e consultar evoluções. Não há
backend de IA nem simulação de execução clínica pelo assistente.

## Fotografias

O fluxo é em duas etapas: salvar o cadastro e abrir **Dados cadastrais** para
adicionar a foto. Há pré-visualização, substituição e remoção. A API valida a
sessão, a origem da requisição e o vínculo autorizado. O conteúdo é inspecionado
com Sharp: JPEG, PNG ou WebP, até 5 MB, limite de pixels, uma imagem estática.
A imagem é orientada, redimensionada para até 512 × 512, recodificada em WebP
e perde metadados EXIF. O corpo do upload também tem limite antes do parse.

Nesta demo, os bytes ficam em `clinical.athletes.photo`, em schema privado com
RLS; não há bucket nem URL pública. A leitura autenticada usa `private, no-store`
e `nosniff`. A função que grava os bytes exige `service_role`, recebe o usuário
verificado pelo servidor e reaplica a permissão de edição. Usuários comuns não
podem chamar essa função diretamente e contornar a normalização. A chave nunca
é enviada ao cliente. O DTO do perfil não inclui os bytes da imagem.

Todas as imagens geradas são abstratas. Uso de fotos reais, inclusive de menores,
permanece fora desta homologação: antes dessa liberação, definir e implementar
comprovação de autorização do responsável quando aplicável, finalidade,
revogação e retenção. Esses controles ainda não estão implementados; a existência
de um campo de nascimento não equivale à autorização de uso da foto.

## Modelo esportivo e massa sintética

`clinical.sport_options` contém combinações configuráveis de categoria,
modalidade, naipe e temporada; `clinical.sport_links` associa atleta, opção,
clube e período. Esses valores não são enums permanentes. O modelo não infere
identidade de gênero a partir do naipe. Configuração é administrativa via banco;
uma tela para gerir o catálogo e os vínculos ainda não foi implementada.

Foram executados os cenários 500 e 5.000, a repetição idempotente e um reset de
seed independente. A seed principal `cbb-qa-1` contém **5.000 atletas**, **5.500
vínculos** (5.000 atuais e 500 históricos), **12 atendimentos e 12 evoluções**
(6 rascunhos, 6 finalizadas). As temporadas são 2025 e 2026. Fotos abstratas em
1.250 atletas; os demais usam iniciais. Existem homônimos, acentos, nomes longos,
clubes ausentes, inativos e identificadores externos ausentes. As combinações
esportivas são exemplos sintéticos, não validação de regulamentos da CBB.

`scripts/qa-athletes.mjs` só aceita o Supabase local esperado e recusa
`NODE_ENV=production`. UUIDs são determinísticos por seed. O reset exclui apenas
os atletas marcados com aquela seed e seus registros/vínculos, preservando os
eventos de auditoria. O teste `reset-check` removeu sua massa de 500 e preservou
os 5.000 da seed principal e os cadastros preexistentes. Catálogos de referência
são compartilhados e não são apagados pelo reset.

## Provisionamento e permissões testadas

Criar a conta com `npm run demo:user`, fornecendo senha pela entrada padrão, e
passar seu e-mail sintético ao gerador. A conta deve ser individual. O script
resolve o UUID autenticado e grava concessões explícitas; nenhuma decisão de
permissão da aplicação compara um e-mail fixo. A conta DEMO local existente foi
provisionada para a massa principal. Não foi criada senha fixa ou compartilhada.

| Perfil/caso exercitado | Resultado verificado |
|---|---|
| QA com vínculo completo | Cadastro, edição, foto, escrita, revisão, finalização e auditoria permitidos |
| Autor com finalização revogada | RPC de finalização negada, mesmo mantendo escrita |
| Profissional com leitura limitada | Não escreve, não vê evolução restrita de outro autor nem sua contagem/resumo |
| Usuário sem vínculo | Não consulta o atleta ou sua fotografia |
| Auditor com vínculo cadastral sem acesso clínico | Timeline negada; auditoria permitida |
| Profissional sem permissão de auditoria | URL/RPC de auditoria bloqueadas |
| Anônimo | API de perfil e foto retornam 401; páginas exigem login |
| Conta autenticada sem perfil | API retorna 403 |
| Tentativa de elevar próprio perfil | RLS impede alteração das permissões |
| Atleta diferente, embora autorizado | Registro de outro atleta não pode ser alterado usando seu ID |
| Repetição de cadastro após revogação | Não restaura a permissão de edição revogada |

As especialidades constam nos registros; autorização depende de vínculo,
autoria e capacidades explícitas. Não há regra especial de acesso inferida
automaticamente pela especialidade. Contas dos testes automatizados usam
credenciais aleatórias e são removidas no encerramento.

## Validação

Executados `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` e
captura pelo Chromium. A suíte tem 8 testes com múltiplas verificações de fluxo e
backend. Resultado final: **8 aprovados em 12,7 s**, lint, TypeScript e build sem
erros. Pré-requisitos: Supabase local, migrations aplicadas e seed `cbb-qa-1`
com 5.000 atletas. Ver `tests/auth.spec.mjs`, `tests/athlete.spec.mjs` e
`tests/evolution.spec.mjs`.

Medição observada em execução local: consulta RPC com 5.000 atletas, página de
25, **140 ms**, **11.136 caracteres de JSON serializado**. O valor é uma amostra,
não p95 nem teste de usuários simultâneos. O teste verifica páginas sem
sobreposição, busca sem acentos, espaços normalizados e filtros combinados.

| Cenário | Evidência e resultado |
|---|---|
| QA-001 | Cadastro pelo navegador seguido de upload: aprovado no fluxo de duas etapas |
| QA-002 | PNG, substituição por JPEG com EXIF, remoção, arquivo inválido e limite de tamanho: aprovado |
| QA-003 | Iniciais em atletas sem foto: ver capturas de diretório e perfil |
| QA-004 | Diretório com 500 autorizados e navegação para página 2: aprovado |
| QA-005 | 5.000 autorizados, resposta limitada a 25 e páginas distintas: aprovado |
| QA-006 | Filtros combinados e conferência dos vínculos retornados: aprovado |
| QA-007 | Busca de homônimos, 25 IDs distintos na página: aprovado |
| QA-008 | Busca/status/página preservados ao abrir perfil, trocar aba e retornar: aprovado |
| QA-009–012 | Atendimento, rascunho, revisão, confirmação e histórico finalizado: aprovado |
| QA-013 | Tentativa de salvar registro em outro atleta autorizado negada: aprovado |
| QA-014–015 | Concessões e negações da matriz acima: aprovado para funções disponíveis |
| QA-016 | Eventos de foto, finalização com aprovador e ausência de corpo clínico nos logs: aprovado |
| QA-017 | Consulta medida e capturas desktop/mobile sem overflow horizontal: aprovado no ambiente local |
| QA-018 | Bloqueio do gerador em produção e configuração local ignorada pelo Git verificados. Publicação em produção não realizada nem homologada |

A auditoria armazena ator, recurso, atleta quando autorizado, operação, horário,
origem, resultado e aprovador na finalização. A suíte verifica os eventos via RPC,
incluindo `photo.replace` e `clinical_record.finalized`, e confirma que o conteúdo
clínico não aparece nos eventos. Resumos recentes também geram evento de leitura.
O reset do gerador preserva auditoria. A tela exibe as 100 operações mais recentes.

## Capturas e arquivos

Comparação visual com a entrega do Cursor:

| Tela | Antes | Depois |
|---|---|---|
| Perfil desktop | [Antes](visual/ui-refresh/perfil-desktop.png) | [Depois](visual/handoff-004/perfil-desktop.png) |
| Perfil mobile | [Antes](visual/ui-refresh/perfil-mobile.png) | [Depois](visual/handoff-004/perfil-mobile.png) |
| Diretório mobile | [Antes](visual/ui-refresh/atletas-mobile.png) | [Depois, massa de 5.000](visual/handoff-004/directory-mobile.png) |
| Evolução | Não disponível | [Revisão mobile](visual/handoff-004/evolucao-mobile.png) |

As capturas usam apenas fixtures fictícias. `scripts/capture-workspace.mjs`
reproduz a comparação em 1440 × 1000 e 390 × 844, verificando overflow.

Arquivos principais: `src/features/athletes/{data,catalog,photo-editor}.tsx/ts`,
rotas em `src/app/(workspace)/atletas/`, `src/app/api/atletas/[id]/foto/route.ts`,
`src/components/avatar.tsx`, `src/app/globals.css`, pontos de entrada no chat e
evoluções, rótulos da auditoria, oito migrations `20261115000100` a
`20261115000800`, scripts de QA/configuração/captura, testes, README e este
relatório. `sharp` foi adicionado como dependência direta.

## Limitações para a próxima etapa

- Fotos de pessoas reais/menores: controles e regras ainda precisam ser definidos
  e implementados; demonstração somente com imagens sintéticas.
- Exames/documentos, resumo clínico especializado, retificação/adendo, assinatura
  digital e templates por especialidade não fazem parte do fluxo disponível.
- Revisão é uma etapa da interface sobre o rascunho salvo; não é um terceiro
  status persistido. O histórico de versões existe no banco, sem tela própria.
- Há um atendimento por nova evolução neste fluxo mínimo; não há seleção de
  atendimento existente para anexar novas evoluções nem gestão de consultas.
- Catálogo/vínculos esportivos são configuráveis no banco, sem formulário de
  administração. Clube/categoria cadastrais legados permanecem por compatibilidade.
- Foto binária no banco atende à demo; migração para armazenamento privado
  dedicado, limites operacionais e concorrência precisam de avaliação antes de
  uso amplo. A medição local não comprova capacidade de produção.
- Não houve deploy, avaliação de ambiente de produção ou configuração de GitHub.
