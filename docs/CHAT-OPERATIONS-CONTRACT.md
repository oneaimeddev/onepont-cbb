# Contrato de operações conversacionais — corte B do 007.10.6B.3

## Limite desta entrega

Infraestrutura interna, sem ferramenta nova habilitada no modelo e sem interface clínica parcial. Registrar autorização **não assina, salva, finaliza ou envia** um documento. As respostas de estado, desafio e confirmação informam `executionEnabled: false`. A execução clínica é responsabilidade do corte D, após C.

O catálogo explícito está em `src/features/chat/operations/capabilities.ts`: 21 capacidades com identificador, descrição, schema estrito, permissão, confirmação, auditoria, serviço e resultado. Estados `existing`, `infrastructure` e `reserved` descrevem implementação; não concedem acesso nem ativam ferramentas. Todas as entradas novas têm `exposedToModel: false`. Não há dispatcher de comandos livres ou SQL do modelo.

Os tipos de estado, desafio e recibo estão em `contracts.ts`. A revisão clínica é `DocumentReviewRecord`, recebida do `document_review_command`; não existe outro editor/modelo de conteúdo ou motor clínico.

## Persistência

| Entidade | Responsabilidade |
|---|---|
| `chat_document_workspaces` | Referência à revisão compartilhada, usuário/sessão/atleta/documento, revisão CAS, identidade e opção de entrega |
| `chat_document_contexts` | Documento ativo da sessão, sem usar o histórico do modelo como autoridade |
| `chat_operation_challenges` | Snapshot imutável dos vínculos, versão/hash, identidade/conexão, modo, destinatário, efeitos, expiração e nonce |
| `chat_human_inputs` | Entrada original autenticada, origem, sequência, hash e resultado da verificação; acesso privado |
| `chat_operation_authorizations` | Evidência imutável de confirmação; não equivale a execução ou assinatura |

As tabelas têm RLS, sem grants diretos para clientes, e FKs sem cascatas destrutivas sobre esses registros. A limpeza das fixtures remove somente os registros dos profissionais fictícios do teste, na ordem das referências.

A sessão possui `operation_epoch` e contador de entradas humanas. Mudança de atleta ou estado da sessão altera o epoch, incluindo mudança de contexto seguida de retorno ao mesmo atleta. O epoch de segurança do corte A continua obrigatório. Inatividade de 24 horas é revalidada pelo helper existente; não há reativação implícita.

## Protocolo

1. Vincular explicitamente uma revisão própria ao atleta em contexto. O domínio existente valida propriedade e versão. Selecionar identidade própria conectada; preferência não é seleção automática. A opção de envio começa desmarcada.
2. Qualquer alteração exige revisão CAS. Troca de revisão, identidade, documento ou destinatário invalida o desafio anterior. Requisições concorrentes com a mesma revisão não sobrescrevem uma à outra.
3. Preparar desafio `sign_review` com chave de idempotência. O servidor fixa o modo demonstrativo, hashes do conteúdo e composição documental, revisão clínica, identidade/conexão e política do destinatário. Validade máxima de cinco minutos, limitada também pela revisão.
4. Uma fronteira de backend registra a apresentação do **resumo exato**, conferindo nonce e hash. O componente futuro deve chamar esse passo somente após apresentar documento, identidade, destinatário e efeitos. Preparar sozinho não registra apresentação.
5. A entrada de confirmação vem diretamente da requisição HTTP autenticada. O servidor obtém o ator da sessão Supabase; o schema recusa campos `actor`, modo, procedência e booleanos livres de confirmação. Um produtor privilegiado registra a entrada original com identificador estável; o modelo não pode chamar esse produtor.
6. Confirmar exige a entrada vinculada ao mesmo desafio, criada **depois** da apresentação pelo contador monotônico. Verificar novamente sessão, contexto, epochs, acesso, revisão, documento, identidade/conexão, contato/política, modo e expiração. “Sim” só é aceito quando há exatamente um desafio apresentado pendente. Perguntas, condicionais, negação e texto atribuído ao assistente não são confirmação.
7. Registrar um recibo imutável e um evento de confirmação. Uma repetição com o mesmo identificador/entrada retorna o mesmo recibo, sem duplicar autorização ou auditoria de sucesso. Outra entrada não reutiliza um desafio confirmado. Uma entrada rejeitada não se torna válida retroativamente.

Um workspace com autorização ainda válida não recebe outro desafio para a mesma revisão sem nova alteração explícita. O estado recuperado inclui o recibo após perda da resposta ou recarga. Expiração e estado confirmado são fatos diferentes: um recibo histórico não dispensa revalidação para futura execução.

## Fronteiras de autorização

RPCs de workspace, preparação, confirmação e cancelamento são autenticadas e validam o próprio ator. `chat_operation_present` e `chat_capture_human_input` são exclusivas de `service_role`; não podem ser chamadas pelo cliente ou por uma ferramenta com credenciais de usuário.

O gateway interno `POST /api/inteligencia/operacoes` exige sessão, perfil, mesma origem, schema estrito e corpo limitado a 16 KiB. O ator nunca vem do corpo. Serviços de apresentação/captura usam chave somente no backend, sem entregá-la ao navegador/modelo. Nenhum endpoint aceita execução clínica arbitrária.

Preparação, apresentação e confirmação também exigem o gate seguro de ambiente do simulador, além do gate do banco. Um servidor operacional não autoriza demonstração mesmo se o banco local tiver o gate ligado. A procedência é permanente e não pode virar produção.

Envio selecionado exige a política existente `delivery_policy`: checkbox não concede autorização institucional. Menor usa responsável, sem fallback para telefone do menor. Mudança de contato/política ou revogação impede confirmar o desafio antigo. Os DTOs só têm contato mascarado; digest de contato permanece privado.

O original da confirmação fica na tabela operacional privada porque compõe a prova da intenção. Auditoria técnica contém referências, hashes, versão, modo, procedência e resultado; não copia texto original, documento, nonce, telefone integral ou credenciais. A confirmação tem origem `ai_chat` e método `human_message`; rejeição de entrada de voz conserva `human_voice`.

## Voz e apresentação

A confirmação por voz **não está habilitada**. Tanto o gateway quanto o banco recusam esse modo nesta etapa. O texto/voz não devem ganhar jornadas clínicas independentes: a abertura exige validar a infraestrutura de intenção no corte E, ou oferecer confirmação explícita no próprio chat. Não interpretar essa infraestrutura como homologação de voz.

O gateway está disponível como contrato técnico para a próxima integração, mas não há botão, card novo ou ferramenta de modelo anunciando a jornada. Nenhuma captura de mockup representa implementação.

## Obrigações dos próximos cortes

- C: usar os schemas explícitos e identificadores estáveis para alterações sobre a revisão compartilhada; desambiguar; invalidar recibos/desafios por revisão; não reconstruir todo o conteúdo nem inventar campos clínicos.
- D: criar execução idempotente vinculada ao recibo, verificar novamente toda a autoridade **na transação que chama o domínio** e usar `document_review_command:sign` com chave estável. Recuperar a execução existente após perda de resposta; não repetir assinatura/envio. O recibo isolado nunca pode ser tratado como comando executável ou resultado de assinatura.
- D: preservar origem/correlação de chat também nos eventos do domínio compartilhado; não fabricar outra trilha clínica. A auditoria deste corte comprova apenas preparação/apresentação/confirmação.
- D: integrar o motor de entrega/finalização existente, sem callbacks externos reais, conectores reais ou conversão de simulação em evidência real.
- E: apresentar `DocumentPreview` e resumo completo no chat antes de registrar apresentação; integrar estado recuperado, acessibilidade e voz; produzir evidências reais.

Não fazer merge, push ou deploy sem homologação. A migração deste corte é aditiva e aplicada apenas localmente; não resetar nem reaplicar migrations anteriores.


## Complemento C — domínio interno de revisão/rascunhos

Checkpoint `245de1f`: helpers privados `clinical.chat_document_proposal_read`, `chat_document_proposal_patch`, `chat_document_proposal_review` e `chat_document_proposal_save`. Fonte editável: `document_proposals`; revisão: `document_review_command`; documento lógico: UUID da proposta. Workspace captura `source_proposal_version` e exige corpo/tipo/versão clínica compatíveis. Edição torna revisão/desafio/recibo anteriores inelegíveis; a prova histórica permanece. Nova revisão exige nova identidade/intenção de entrega e nova confirmação futura.

Save privado usa o motor compartilhado, vincula a proposta e mantém idempotência. Não autoriza assinatura, finalização ou envio. Funções C não têm grants para papéis da aplicação; antes da exposição, o adaptador deve verificar a mensagem humana original e o CAS da proposta exibida. Não permitir que uma ferramenta de modelo invoque save ou forneça uma própria confirmação.

A migration `20261120000700` está instalada apenas localmente. C ainda precisa dos adaptadores e da jornada de linguagem natural/preview/persistência dos cards. Não interpretar os 100 testes backend aprovados como homologação dessa jornada ou da voz. D/E permanecem pendentes.
