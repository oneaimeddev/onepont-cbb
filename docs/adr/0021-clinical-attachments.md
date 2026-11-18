# ADR 0021 — Anexos clínicos no perfil e no CBB Intelligence

Data da entrega: 18/11/2026. Handoff 007.6 e adendo obrigatório de upload pelo chat.
Especificação recebida preservada em `docs/HANDOFF-007-6.md`.
Branch: `feat/handoff-007-6-clinical-attachments`. Não há merge ou publicação.

## Experiência entregue

O perfil oferece a seção **Documentos e Anexos**, com upload, título, categoria,
data clínica, descrição, associação clínica opcional, pesquisa, filtros,
ordenação e páginas de 25 arquivos. Os documentos estruturados existentes
continuam na seção Documentos: um arquivo anexado não é uma prescrição emitida,
um exame realizado ou um registro clínico validado.

O compositor do CBB Intelligence oferece **Anexar ao prontuário**, inclusive quando
o provedor de IA está indisponível. Sem contexto, o formulário exige escolher um
atleta autorizado. Com contexto, o destinatário é validado no servidor e mostrado
antes da confirmação explícita. O mesmo formulário, serviço, bucket, validação,
autorização e visualizador são utilizados nas duas interfaces.

Após a confirmação, o arquivo aparece no perfil e em um card na conversa. O card
persiste apenas os identificadores autorizados, nunca o binário ou a descrição.
Ao reabrir uma conversa, os metadados são consultados novamente; um arquivo
retirado de uso ou sem permissão atual não é revelado pelo card.

PDFs são renderizados em canvas pelo PDF.js, com páginas e zoom, sem camada de
JavaScript, formulários XFA, links externos ou anexos ativos do PDF. Imagens são
exibidas por Blob local autenticado, sem serviços externos de otimização. Há
alternativa de download autorizado. Visualização e download são eventos distintos.
Os arquivos não são enviados a um visualizador de terceiros.

É possível editar metadados, alterar associações permitidas e retirar um anexo de
uso. Não existe exclusão física de um arquivo confirmado pela interface.
Anexos associados a uma evolução finalizada não podem ser retirados de uso nem
ter a associação removida para contornar essa proteção.

## Modelo e Storage

Migração: `20261118000100_clinical_attachments.sql`.

- `clinical.attachments`: atleta, autor do upload, título, descrição, categoria,
  data clínica, nome original, MIME detectado, bytes, SHA-256, visibilidade,
  estado, associações opcionais, origem, conversa, versão e datas.
- `clinical.attachment_uploads`: tentativa, caminho controlado pelo servidor,
  validade, confirmação e limpeza. O nome do objeto contém UUIDs do anexo e da
  tentativa; o nome fornecido pelo usuário não decide seu caminho.
- `clinical.conversation_messages.attachments`: referência sanitizada contendo
  somente atleta, IDs e ID a abrir. As rotinas existentes de persistência e
  retomada de conversas foram estendidas para esse campo.
- Bucket privado `clinical-attachments`, restrito a PDF, JPEG, PNG e WebP, com
  teto de 20 MiB. Políticas restritivas impedem acesso direto via Storage por
  anon/authenticated, mesmo que outra política permissiva seja criada depois.

Os binários não são gravados no PostgreSQL. O servidor usa a credencial de serviço
exclusivamente para transferir/remover objetos já autorizados por RPC clínica.
A credencial não decide quem pode ler, não é enviada ao navegador e não é usada
para consultar prontuários. As tabelas clínicas têm RLS e nenhum grant direto ao
cliente. As funções internas também não têm grant ao cliente.

O ambiente local agora inicia o Storage API em `npm run supabase:start`.
O bucket é criado/configurado pela migração. O worker do PDF.js vem da dependência
fixada no lockfile e é copiado para `public/vendor` no prebuild/predev. Ele é código
público da biblioteca, sem dados clínicos. O arquivo gerado fica fora do Git e do
lint; nenhuma dependência remota é baixada pelo visualizador em tempo de uso.

## Autorização

Não foi criado um novo papel nem concedido acesso a atletas existentes.

- Upload e edição exigem perfil, vínculo com `can_read_records` e `can_write`.
- Listagem, leitura e download exigem acesso clínico atual **e autoria do anexo**.
- A visibilidade inicial é `author_only`; acesso ao atleta ou administração
  operacional não revela nomes, contagens, categorias ou bytes de outro autor.
- A associação precisa pertencer ao mesmo atleta e ser legível pelo usuário.
  Evoluções respeitam autoria/visibilidade/estado existentes. Documentos
  estruturados respeitam `can_author_documents` e a autoria atual.
- A associação é verificada novamente nas leituras e não amplia a visibilidade.
- O upload pelo chat exige conversa ativa do usuário com o mesmo atleta.
  Sessão, contexto e permissões são revalidados depois da transferência.
- A seleção do arquivo congela o destinatário. O diálogo impede interação com
  outro contexto; navegação e troca de conversa têm proteção de descarte.
  Voz e mensagens que poderiam mudar contexto são suspensas durante o preparo.
- Endpoints de mutação verificam a origem; IDs, categorias e associações são
  tratados como dados não confiáveis. O arquivo não escolhe ator ou permissões.

Os bytes são servidos por endpoint autenticado, com autorização antes da busca e
novamente antes da resposta. Não há URL pública nem URL assinada com validade
residual. Respostas usam `private, no-store`, `nosniff`, política de mesma origem
e disposição de conteúdo controlada. Revogação bloqueia novas leituras/downloads;
ela não recolhe cópias que já tenham sido baixadas ou exibidas ao profissional.

## Contratos principais

| RPC | Responsabilidade |
| --- | --- |
| `attachment_options` | Destinatário e referências autorizadas para o formulário |
| `attachment_begin` | Reserva, identidade do arquivo e tentativa com prazo |
| `attachment_finish` | Confirmação dos bytes e revalidação clínica/contextual |
| `attachment_cleanup` | Identificação e confirmação de limpeza de tentativas expiradas |
| `attachment_list` | Metadados autorizados, filtros e paginação |
| `attachment_open` | Autorização de metadados, visualização e download |
| `attachment_edit` | Versão, metadados, associação e retirada de uso |

`src/features/attachments/service.ts` é o único serviço HTTP das duas interfaces.
`/api/anexos` e `/api/inteligencia/anexos` fixam a origem apropriada e reutilizam
esse serviço. O upload no chat usa `/api/inteligencia/anexos/upload`.
Caminhos internos podem ser retornados à camada servidora para transferência,
mas são removidos das respostas HTTP e não aparecem como informação na interface.

## Validação e limites operacionais

O backend valida o conteúdo real antes de gravar: parser PDF com estrutura válida,
EOF, pelo menos uma página e rejeição de PDF criptografado; decodificação de imagem
por Sharp, formato permitido e uma única imagem/quadro. A extensão deve corresponder
ao formato detectado; o MIME declarado pelo navegador não determina o resultado.

Limites nesta versão:

- `CBB_ATTACHMENT_MAX_MB`: tamanho configurável, padrão 20 MiB e teto 20 MiB.
- Corpo do proxy do Next: 21 MiB, permitindo o envelope multipart; a rota aplica
  seu próprio limite durante a leitura do stream e novamente sobre o arquivo.
- PDF: até 2.000 páginas. Imagem: até 30 milhões de pixels e sem animação.
- Título: 160 caracteres; descrição: 2.000; nome original: 200.
- Um arquivo por operação, com múltiplos anexos por atleta. Não há upload em lote.
- Listagem de 25 por página; o seletor de associações oferece as últimas 100
  evoluções e os últimos 100 documentos autorizados.

O progresso mede a transferência real ao servidor. Ao terminar essa transferência,
a interface informa que está confirmando o armazenamento; só exibe sucesso após
resposta `ready` do backend. Não utiliza uma porcentagem fictícia para o Storage.

## Falhas, reenvio e limpeza

Storage e banco não formam uma transação distribuída. O fluxo tem reserva,
transferência e confirmação; somente `ready` é listado/servido. As alterações do
banco e os eventos de auditoria correspondentes ficam na mesma transação.

O UUID de envio é preservado na tentativa da interface. Além dele, uma identidade
única `(atleta, autor, SHA-256)` protege reenvios com outro UUID ou após recarregar.
Uma trava por essa identidade serializa tentativas concorrentes. O mesmo arquivo
já confirmado retorna o anexo existente, preservando seus metadados e informando
a reutilização. Não é revelada a existência de arquivos de outro profissional.
O mesmo conteúdo pode existir para autores ou atletas diferentes sem compartilhar
sua visibilidade. Um arquivo retirado não é reativado por um simples reenvio.

Cada transferência recebe um caminho novo e prazo de dez minutos. Nenhuma tentativa
sobrescreve um objeto confirmado. Falha, cancelamento antes da confirmação ou
perda de autorização deixam o envio indisponível. A aplicação tenta remover os
objetos incompletos e mantém a referência de limpeza caso a remoção falhe.
A confirmação de limpeza verifica que o objeto deixou de existir no Storage.

Cada novo upload tenta limpar tentativas antigas do mesmo usuário. A ação
**Recuperar envios interrompidos** também faz essa recuperação explicitamente,
inclusive de reservas que venceram após queda do processo. Objetos confirmados,
mesmo retirados de uso, não entram na limpeza. Não há job de coleta global: uma
operação institucional recorrente poderá ser definida quando a implantação exigir.

Se a conexão cair depois do commit, repetir o arquivo devolve o resultado existente.
Interromper no cliente não garante desfazer uma confirmação que já tenha terminado;
a mensagem orienta consultar a listagem. Metadados do formulário são preservados
num erro enquanto o diálogo permanece aberto. Não há retomada parcial de bytes
via TUS nesta versão: uma transferência incompleta é reenviada integralmente.

## Integração com o agente

O agente tem a ferramenta `listClinicalAttachments` para consultar metadados e
apresentar referências seguras ao visualizador. Comandos de anexos em contexto,
como “quais anexos estão disponíveis?”, “abra o último laudo” ou “abra o primeiro
arquivo”, também têm resolução determinística no servidor. IDs e referências
ordinais enviados pelo cliente são reautorizados e limitados ao atleta indicado.
Sem contexto válido, solicita-se escolher um atleta; não se assume o de uma
conversa anterior. Texto e voz usam o mesmo contrato.

Os cards consultam os metadados novamente e abrem os bytes pela interface, sem
fornecer esses bytes ao modelo. O agente não possui ferramenta de upload nem de
interpretação de arquivos. O simples upload não chama o endpoint do LLM.
As instruções do agente proíbem afirmar leitura clínica do conteúdo; anexos não
lidos não são adicionados às fontes examinadas ou à contagem de registros da
análise longitudinal. A consulta de metadados permanece separada dessa análise.

## Auditoria e privacidade

Há eventos de início, confirmação, reutilização, falha, limpeza, listagem,
metadados, visualização, download, edição, associação, retirada e negação.
Preservam ator, anexo, atleta quando autorizado, operação, resultado e horário.
Upload humano no chat usa `ai_chat / human_ui`. Consulta por voz usa
`ai_voice / human_voice`; a ferramenta do agente usa `agent_tool`.

Nenhum arquivo, conteúdo clínico, descrição ou título é copiado para logs ou
metadados de auditoria. Arquivos ficam em memória durante validação/transferência,
no Storage privado quando confirmados e em Blob/canvas autorizado na visualização.
Não há OCR, análise multimodal, telemetria do arquivo ou visualizador externo.

**Não há antivírus/antimalware nesta entrega.** Validação de formato, isolamento,
autorização e renderização não equivalem a varredura antimalware. Downloads devem
ser tratados como documentos não confiáveis. Não há declaração de conformidade
regulatória completa, assinatura ou emissão legal.

## Custos e implantação

O limite de 20 MiB foi testado no Next e no Supabase **locais**. Limites do host,
proxy/reverse proxy, tempo de execução e quota do projeto precisam ser conferidos
na implantação; por exemplo, um host com limite de corpo menor exige reduzir
`CBB_ATTACHMENT_MAX_MB` ou definir outro transporte com a mesma autorização.
Não foi publicada uma alteração em ambiente remoto.

Custos dependem do plano de Storage, bytes retidos, operações, saída de dados e
tráfego do servidor. Não há preço contratado ou quota remota disponível nesta
entrega. Como referência de volume, 1.000 arquivos de 20 MiB ocupam aproximadamente
19,53 GiB antes de outras quotas; não é uma previsão de uso. A retirada lógica
preserva o consumo de armazenamento. Consulta e renderização locais não acrescentam
custo de interpretação por LLM.

Referências técnicas: [limites do Storage](https://supabase.com/docs/guides/storage/uploads/file-limits),
[upload padrão](https://supabase.com/docs/guides/storage/uploads/standard-uploads),
[API PDF.js](https://mozilla.github.io/pdf.js/api/draft/api.js.html).

## Evidências e preservação do trabalho anterior

`tests/attachments.spec.mjs` exercita arquivos reais fictícios, upload HTTP,
reenvio com o mesmo e com outro UUID, tamanho de 20 MiB, formatos inválidos,
privacidade entre autores, administrador sem acesso clínico, revogação durante
transferência, limpeza de órfão, retenção, associação a exame, download, PDF e
imagem no navegador, filtros, contexto, persistência e ausência de chamada ao LLM
no upload. `tests/voice-attachments.spec.mjs` usa transcrição de voz simulada,
com microfone/WebSocket de teste e o backend real para lista e referência ordinal.

Capturas reais, com dados fictícios: `docs/visual/handoff-007-6/` (perfil e PDF em
desktop/mobile, chat, visualizador no chat e consulta por voz). A migração foi
executada integralmente sobre objetos locais vazios em uma transação de verificação.

As alterações anteriores de README e histórico longitudinal foram preservadas.
Nos três arquivos do chat que já estavam modificados, foi aplicado e separado
somente o patch de anexos; as mudanças anteriores permanecem fora dos commits
deste handoff. Uma cópia isolada do conteúdo preparado para commit é verificada
separadamente da árvore de trabalho com essas alterações anteriores.

## Verificação de entrega

Lint, TypeScript e build de produção foram aprovados. O conteúdo preparado para
commit também passou num build Turbopack em worktree isolada, sem as alterações
anteriores de histórico longitudinal. Os cinco testes de anexos e o teste de voz
passaram com banco e Storage locais, incluindo PDF de exatamente 20 MiB, download
binário comparado ao original e reutilização do mesmo arquivo com outro UUID.
Numa execução sequencial, o upload sintético de 20 MiB levou 470 ms neste ambiente;
esse valor não é um SLA nem uma medição de rede de produção.

O teste preexistente `tests/longitudinal-history.spec.mjs` usa um recorte fixo de
17/05/2026 a **17/11/2026**, mas grava prescrições e pedidos cirúrgicos com a data
corrente. Em 18/11/2026 esses documentos ficam fora do recorte e a asserção de
presença falha. O arquivo já estava entre as alterações anteriores não commitadas;
a implementação de anexos não altera a RPC ou os testes de análise longitudinal.
Essa falha deve ser tratada no trabalho correspondente, não apresentada como
regressão corrigida nesta entrega.

Os testes gerais são executados com um worker na validação final. A auditoria
geral existente devolve um conjunto limitado dos eventos recentes; executar a
carga de importação de 5.000 atletas simultaneamente a uma asserção desse conjunto
pode expulsar os eventos esperados da janela do teste. A execução sequencial
preserva o cenário de cada teste sem mudar regras de auditoria da aplicação.

A homologação técnica usa exclusivamente dados fictícios. A aprovação humana de
produto e o merge continuam pendentes; não foi realizada publicação remota.

Resultado da suíte completa final, em sequência: **44 aprovados e 2 falhas** em
46 testes (3,6 min). Além da data fixa do histórico, `voice-reading.spec.mjs`
falhou porque procura a substring `500` em todo o JSON e o UUID aleatório do
atleta continha `4500`. A ocorrência era parte do identificador, não conteúdo de
medicação ou do arquivo. O teste passou na repetição isolada, sem modificá-lo.

Verificação adicional na worktree contendo somente o patch de anexos:
**7 aprovados**, incluindo os cinco testes de anexos, voz de anexos e a repetição
de leitura por voz (30,4 s). Portanto, a suíte ampla não é declarada totalmente
verde e os testes preexistentes não foram alterados para esconder suas falhas.

A revisão visual final também verificou o zoom real do PDF (100% para 200%) e o
ajuste à largura no celular. O teste do perfil/visualizador passou novamente
(1 aprovado, 10,2 s), assim como lint, typecheck e build após esse refinamento.
