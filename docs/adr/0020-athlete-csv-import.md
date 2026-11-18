# ADR 0020 — Importação cadastral de atletas por CSV

Data: 17/11/2026. Handoff 007.7. Branch `feat/handoff-007-7-csv-import`.

## Decisão

A interface tradicional oferece `/atletas/importar`, próxima ao cadastro individual,
com seleção, mapeamento, revisão e confirmação/acompanhamento. O diretório envia
seus filtros e página em `retorno`; a importação invalida `/atletas` após cada
lote confirmado. Os perfis criados têm links no relatório.

Papa Parse interpreta o arquivo no navegador, com strings, UTF-8 estrito, BOM,
vírgula ou ponto e vírgula, aspas, quebras de linha dentro de células e acentos.
O cabeçalho é examinado com o próprio parser para escolher o delimitador, evitando
que linhas incompletas sejam interpretadas como CSV de coluna única. Cabeçalhos
repetidos, vazios, mais de 60 colunas, aspas inválidas e linhas com quantidade de
colunas divergente impedem a prévia. Linhas totalmente vazias são descartadas.
A numeração exibida corresponde ao registro lógico: cabeçalho = 1, primeiro atleta = 2;
células multilinha e linhas vazias não equivalem a novas linhas cadastrais.
Colunas desconhecidas ficam explicitamente como “Ignorar esta coluna”.

## Domínio e contratos

- `athlete_import_job(target, operation, digest, row_count)`: inicia, consulta ou
  confirma uma importação pertencente ao usuário autenticado. Confirmação exige
  revisão de todas as linhas. Totais e resultados vêm do banco.
- `athlete_import_batch(target, items, execute_rows)`: até 25 registros por chamada,
  até 256 KiB por lote. Serializa chamadas da mesma importação com lock de linha;
  a gravação também usa lock por identidade candidata entre importações.
- `athlete_register(creation_id, payload)`: única implementação de criação, usada
  tanto pelo cadastro individual quanto pela importação.
- `catalog_list`, `catalog_create_category`, `catalog_create_organization`: catálogos
  existentes, criação explícita e auditada. A importação aceita somente organizações
  `club`; não interpreta clube como seleção nacional.
- `clinical.open_sport_link`: acionada pelo cadastro existente. Um CSV representa
  **um vínculo inicial por atleta**, com categoria, naipe e modalidade juntos.
  O histórico e a possibilidade de vínculos posteriores permanecem intactos.

A prévia chama `athlete_register` em uma subtransação que sempre lança e captura
uma exceção reservada para desfazer atletas, contatos, vínculos, permissões e
respectivos eventos. As variáveis de resultado conservam apenas a validação.
Somente hashes, classificação e campo inválido são gravados no ledger da prévia.
Além do domínio existente, o envelope CSV exige datas ISO explícitas e verifica
tamanhos por campo antes da chamada para produzir mensagens úteis.

A gravação repete a validação e chama a mesma RPC de cadastro. Cada atleta e suas
associações são atômicos. Exceções de uma linha geram rejeição sanitizada e não
anulam os demais registros do lote. Falhas da requisição são recuperadas pela
consulta ao ledger; sucesso visual só aparece após resposta do banco.

## Duplicidade e idempotência

O servidor procura identificador institucional e nome completo normalizado. A data
de nascimento participa da identidade candidata dentro do arquivo; nomes iguais
continuam sinalizados mesmo com datas diferentes. Correspondência de nome é
**possível duplicidade**, nunca mesclagem ou diagnóstico definitivo de duplicação.
O operador pode ignorar ou confirmar a criação de outro atleta após revisão.
Identificadores e número de camisa continuam strings, incluindo zeros iniciais.

Repetição exata do payload no arquivo ou payload já criado pelo mesmo importador
recebe classificação de repetido. Outras repetições de identidade ou nome recebem
classificação de possível duplicidade. Linhas criadas, ignoradas e rejeitadas são
terminais para aquela importação. Corrigir uma linha exige revisar novo arquivo.

O ledger relaciona `(importação, linha)` ao hash do payload, resultado e atleta.
O UUID de criação deriva de importação + linha e também reutiliza a idempotência
existente de `athlete_register`. Reenvios consultam o resultado gravado; mudanças
no payload confirmado são recusadas. Lotes usam concorrência 1 na interface.
Não há milhares de requisições simultâneas nem infraestrutura assíncrona nova.

## Segurança e privacidade

RPCs exigem perfil autenticado e a capacidade existente `athlete_creators`.
Não foi criado papel que implique leitura clínica. As permissões de cada atleta
novo são exatamente as do cadastro individual, inclusive as capacidades opcionais
do criador; nenhum vínculo a atleta existente é concedido pela importação.
As tabelas têm RLS habilitada e nenhum grant direto a anon/authenticated.
As funções internas não são executáveis pelo cliente.

A consulta de duplicidade só retorna nomes/IDs associados a `athlete_access` do
operador; correspondência por documento só revela o candidato se também houver
`can_edit`, conforme o acesso cadastral atual. Um conflito restrito mostra apenas
“Possível duplicidade”, sem nome, identificador, data ou quantidade de candidatos
restritos. Arquivos não definem ator, origem, permissões nem IDs de organização.
O servidor aceita somente uma lista fixa de campos e resolve catálogos por nome.

O CSV bruto e a prévia pessoal vivem apenas na memória da página. Não há upload
para Storage, LLM, serviço de planilhas, logs ou telemetria. Recarregar/sair descarta
a memória. `sessionStorage` guarda UUID, hashes, mapeamento e IDs de catálogo por
linha para retomar ao selecionar o mesmo arquivo na mesma aba; não guarda nomes,
contatos, arquivo ou conteúdo de células. Fechar a sessão da aba descarta essa
referência. O banco guarda hashes e resultados, com acesso exclusivo do importador;
o próprio cadastro passa a reter os dados dos atletas efetivamente criados.

Auditoria registra início, confirmação com aprovador, criação de cada atleta,
falhas relevantes, negação e conclusão. Os eventos preservam a auditoria individual
`athlete.create` e adicionam correlação à importação. `safe_metadata` contém apenas
linha ou quantidades, nunca conteúdo pessoal. Criação de catálogo mantém sua
própria auditoria. Relatórios CSV protegem fórmulas iniciadas por `=`, `+`, `-`, `@`
e também precedidas por whitespace.

## Modelo e operação

O botão “Baixar modelo CSV” gera UTF-8 com BOM, ponto e vírgula e um exemplo fictício.
O único campo incondicionalmente obrigatório é `nome_completo`.

| Cabeçalho | Campo existente |
| --- | --- |
| nome_completo | name |
| nome_social | social |
| data_nascimento | birth, formato AAAA-MM-DD, entre 1900 e hoje |
| identificador_institucional | document, CPF ou identificador, até 40 caracteres |
| identidade_genero | gender_identity |
| categoria | categoria persistida, resolve category_id |
| naipe_competitivo | division, Feminino ou Masculino/catálogo |
| modalidade | modality, 5x5 ou 3x3/catálogo |
| posicao | position, até 40 caracteres |
| clube | organização club persistida, resolve club_id |
| numero_camisa | shirt, 1 a 3 dígitos |
| telefone | phone |
| email | email |
| responsavel_legal | guardian_name |
| relacao_responsavel | guardian_relation |
| contato_responsavel | guardian_contact |
| contato_emergencia | emergency_contact |

Não são importados `external_cbb_id`, fotografia, seleção nacional, conteúdo clínico
ou permissões. `identificador_institucional` usa o campo cadastral `document` já
existente, e não o identificador externo reservado à integração CBB.

Limites configurados: 5 MB, 5.000 atletas, 60 colunas, 25 registros/lote, prévia
paginada de 25 linhas. O navegador precisa permanecer aberto para avançar.
Ao interromper, selecione o mesmo arquivo na mesma aba e continue as etapas:
o servidor apresenta o estado persistido e o botão de retomada. Não há worker
em segundo plano. Decisões de duplicidade ainda não processadas são conservadoras
após recarregar: ficam ignoradas por padrão; decisões já gravadas são preservadas.
Se a referência da aba foi perdida, repetir o arquivo ainda detecta payloads
anteriormente importados pelo mesmo usuário, mas não reabre o mesmo relatório.

## Evidências

`tests/csv-import.spec.mjs` cobre parser e proteção de fórmulas, validação sem
persistência, autorização positiva/negativa, escopo da deduplicação, validação no
commit, proteção contra payload alterado, vínculo esportivo, acesso clínico,
concorrência, reenvio, falhas parciais, retomada e jornada real no navegador.
Cargas reais de 10, 100, 1.000 e 5.000 são executadas via RPC autenticada em
Supabase local, exclusivamente com dados fictícios e limpeza ao final.
Medições: `docs/visual/handoff-007-7/measurements.json`; capturas desktop e móvel
na mesma pasta. Os números medem o ambiente local, não um SLA de produção.

## Validação desta entrega

- `npm run lint`, `npm run typecheck` e `npm run build`: aprovados.
- Migração final executada integralmente no Supabase local, em transação.
- Suíte completa executada: **37 aprovados, 2 falharam** (39 testes naquele momento).
- Os oito testes originais de CSV passaram, inclusive cargas reais de 10, 100,
  1.000 e 5.000. Uma verificação adicional cobre mapeamento manual, resolução de
  categoria existente, criação de clube autorizada e retomada sem reter células
  no armazenamento do navegador.
- A suíte também aprovou cadastro individual, diretório e filtros, fotos, evolução,
  restrição de acesso, documentos, exames, chat e voz existentes.

As duas falhas estão nos arquivos previamente não commitados
`tests/longitudinal-history.spec.mjs` e `tests/voice-history.spec.mjs`.
As prescrições/pedidos cirúrgicos usam `created_at::date` em UTC na RPC de histórico
já existente. No momento da execução, o banco informava **18/11/2026 UTC**,
embora ainda fosse **17/11/2026 em São Paulo**. Os testes esperam que documentos
criados agora estejam no recorte encerrado em 17/11/2026. Eles ficam fora desse
recorte e as asserções falham. A importação não modifica essa RPC, essas datas ou
os arquivos do histórico. A suíte completa, portanto, não deve ser apresentada
como integralmente aprovada. Esta incompatibilidade de data precisa de tratamento
no trabalho de histórico longitudinal que já estava no diretório.

A primeira medição de escala mostrou varredura repetida na deduplicação. Índices
B-tree no normalizador imutável já existente e no identificador normalizado
reduziram o custo. A execução completa posterior mediu, via RPC autenticada:

| Atletas | Prévia | Gravação |
| --- | --- | --- |
| 10 | 17 ms | 23 ms |
| 100 | 131 ms | 193 ms |
| 1.000 | 1.646 ms | 2.270 ms |
| 5.000 | 12.419 ms | 18.976 ms |

Os valores vêm de `measurements.json`, medem chamadas RPC locais e excluem seleção
e revisão humana. Não certificam latência, concorrência ou capacidade em produção.
A interface mantém tabela com rolagem horizontal focável por teclado no celular.

Payloads de transporte retêm no máximo 161 caracteres Unicode por célula mapeada:
todos os campos do domínio aceitam no máximo 160. Esse caractere excedente permite
a rejeição no servidor sem transportar células gigantes. Valores válidos não são
truncados; células acima do limite são rejeitadas, nunca importadas parcialmente.

As alterações anteriores de README e do histórico longitudinal foram preservadas
e não integram o commit desta importação. Não houve merge nem publicação.

O teste adicional de mapeamento manual e revisão/retomada de catálogos foi aprovado.
A revisão de acessibilidade acrescentou foco nas etapas sem cobrir os títulos pelo
cabeçalho e uma região de tabela focável para rolagem com teclado.
Na verificação do cadastro individual foi identificado um temporizador de blur
que podia fechar um catálogo reaberto; o componente compartilhado agora cancela
esse fechamento ao receber foco ou nova busca e limpa o timer ao desmontar.

Após os ajustes finais, lint, typecheck e build passaram novamente. A execução
focada final aprovou os quatro testes de cadastro completo, parser, jornada CSV
com confirmação/relatório e mapeamento manual com recuperação de catálogos
(`4 passed`, 16,7 s). As medições de escala permanecem as da suíte completa.
A migração `20261117000300` está aplicada e registrada apenas no Supabase local.
