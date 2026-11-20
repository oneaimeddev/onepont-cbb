# Handoff 007.10.6B.2 — Finalização documental, assinatura e entrega

Data: 20/11/2026. Implementação local para homologação; sem merge, push ou publicação. Política de testes: adendo de otimização de recursos aplicado.

## Baseline e preservação

Branch dedicada: `feat/handoff-007-10-6b-2-finalization-delivery`, criada a partir de `164b284` (entrega integral do 007.10.6B.1). O 007.10.6B (`d29dd55`) e suas migrations permanecem no histórico. `main` e `origin/main` permanecem em `162b9a9`. Workspace inicialmente limpo; não havia alterações preexistentes a incorporar. Baseline anterior: 114 testes aprovados.

Nenhuma alteração no agente, gestão de conversas, permissões por perfil, modelos clínicos dos três documentos, integrações externas ou evidências históricas. Novos guards protegem inclusive as gravações existentes originadas pelo Intelligence.

## Resultado da jornada

Antes: o sucesso da assinatura demonstrativa permanecia visualmente como rascunho, com edição disponível; envio era apenas uma intenção histórica inelegível.

Agora: **Preencher → Revisar → Assinar → Finalizar → Enviar → Consultar**. O profissional continua nos mesmos editores e na mesma revisão. A finalização e a liberação da entrega acontecem automaticamente. A visualização final usa o template da revisão e o conteúdo do snapshot, sem ações de edição ou salvamento. A assinatura simulada nunca é apresentada como assinatura digital válida.

O resultado simulado finaliza de fato o documento demonstrativo no banco, preserva a origem, bloqueia alterações e permite criar um documento derivado independente. A entrega demonstrativa percorre fila, processamento, aceitação pelo adaptador e conclusão; não faz chamadas de rede a fornecedores.

## Ciclo de vida e imutabilidade

O contrato consultado pela aplicação é `workflow.lifecycle`: `draft`, `ready_for_review` ou `finalized`. A finalização é registrada em `clinical.document_finalizations`, com versão, operação, snapshot, hash, profissional, data, modo e procedência.

O campo histórico `clinical.documents.status` mantém a semântica anterior. Isso evita alterar os bytes canônicos, hashes e relações dos snapshots antigos. A existência da finalização é a autoridade do bloqueio, não uma tag de frontend. As listas e o detalhe usam o contrato enriquecido, sem exibir rascunho junto de finalizado para a mesma versão.

Proteções:

- Locks transacionais e unicidade por documento/operação impedem finalização duplicada.
- Triggers impedem UPDATE/DELETE do documento e das revisões, além de INSERT de revisão, enquanto a assinatura está em andamento ou após finalização. Incluem RPCs diretas e outros escritores privilegiados existentes.
- `document_save` e `document_review_command` rejeitam gravações/revisões incompatíveis; tentativas de edição pela RPC recebem erro específico e auditoria.
- Finalizações não admitem UPDATE. A operação de assinatura finalizada não pode ser reescrita.
- Modo e procedência não podem ser relabelados nas operações, autorizações, solicitações, tentativas, transições ou resultados.
- A versão original permanece somente leitura; falha, negativa, expiração ou cancelamento anterior ao sucesso não finalizam o documento.
- Resultados históricos anteriores à migração não são inscritos retroativamente no novo domínio nem promovidos automaticamente.

A nova ação **Criar documento derivado** cria outro identificador, rascunho independente e vínculo com a finalização, versão e hash de origem. Exige revisão, identidade e autorização novas. Não reutiliza a autorização de assinatura ou envio anterior. A origem não é cancelada ou substituída automaticamente; nenhuma semântica regulatória de retificação foi inventada.

## Domínio compartilhado e assinatura

`document_signature_operations` normaliza as novas tentativas do motor de assinatura existente. Um bridge transacional integra o adaptador demonstrativo à finalização compartilhada. Não foi criado outro módulo ou template de documentos para DEMO.

Finalização demonstrativa exige resultado simulado persistido, ambiente habilitado, autoria/identidade e correspondência exata de versão, bytes e hash. Finalização de produção exige evidência vinculada à operação, identidade, snapshot, hash e artefato validado. `document_verified_signature_evidence` fica reservada para o futuro validador confiável, sem dados artificiais ou endpoint público de escrita. A assinatura efetiva é derivada dessa cadeia, nunca de um booleano enviado pelo cliente.

## Motor de entrega

Entidades novas, compartilhadas entre modos:

| Entidade | Responsabilidade |
|---|---|
| `document_delivery_requests` | Documento/versão, operação, autorização, canal, adaptador, modo, procedência, estado e idempotência |
| `document_delivery_attempts` | Tentativas numeradas e observações persistidas |
| `document_delivery_jobs` | Trabalho durável, disponibilidade, lease e retomada |
| `document_delivery_transitions` | Histórico de estados |
| `document_delivery_results` | Eventos deduplicados e disposição aplicada/ignorada |
| `document_delivery_authorizations` | Política fictícia explícita, destinatário mascarado e digest privado do contato |
| `document_delivery_actions` | Justificativa e idempotência de retentativa/reenvio |
| `document_delivery_choices` | Cenário demonstrativo escolhido na revisão |

Sem envio solicitado, não se cria entrega. Com envio solicitado, a solicitação aguarda assinatura; sucesso libera a fila se houver autorização elegível, e ausência de autorização bloqueia a entrega. Falha da assinatura cancela a solicitação em espera. Falha de entrega não altera assinatura ou finalização.

Estados: `waiting_signature`, `queued`, `processing`, `accepted_by_provider`, `delivered`, `failed`, `cancelled`, mais `blocked` para inelegibilidade e `uncertain` para resultado incerto. Ausência de solicitação é representada por nenhuma linha, exibida como “Envio não solicitado”. Aceitação não é prova de entrega. O estado `delivered` com procedência `simulated` aparece como **Entrega simulada concluída**, nunca como entrega externa efetiva.

O adaptador declara capacidades de reconciliação, cancelamento e confirmação; disponibiliza `submit`, `reconcile` e `cancel`. O simulador exercita sucesso, atraso, duplicata, timeout, falha temporária e definitiva. Retentativa manual exige justificativa e confirmação explícita. Reenvio após conclusão cria solicitação distinta sobre o mesmo documento finalizado, sem nova assinatura.

### Recuperação, concorrência e idempotência

A aquisição usa `FOR UPDATE SKIP LOCKED`, lease de 30 segundos e trabalho persistido no PostgreSQL. O adaptador executa fora da transação de aquisição. Lease vencido retoma a mesma tentativa em reconciliação; resultado incerto não provoca reenvio cego. Eventos duplicados são reconhecidos, eventos de tentativa anterior não substituem a atual e eventos terminais tardios não reabrem a operação.

A interface reconcilia trabalhos autorizados ao consultar o documento. Existe também um processo independente e limitado por lote:

```sh
npm run documents:reconcile
npm run documents:reconcile -- --document=UUID
```

Esse comando pode ser invocado por um agendador de backend no ambiente futuro. Não foi instalado cron, serviço permanente ou fila externa neste handoff. O trabalho sobrevive a reinícios mesmo quando nenhum processo está executando; avança na próxima consulta ou execução do reconciliador. O teste de retomada executa o CLI em um processo novo após expiração do lease.

## Autorização, destinatário e privacidade

Todos os novos DTOs respeitam o mesmo escopo de autoria e leitura clínica do documento. Profissão ou dados editáveis do perfil não concedem autoria. Tabelas novas têm RLS e não possuem grants diretos para `anon`/`authenticated`; funções auxiliares privadas e funções originais renomeadas também foram revogadas. Aquisição/conclusão de jobs e configuração de fixtures são exclusivas de `service_role`.

A checkbox confirma uma escolha, sem conceder autorização institucional real. A autorização demonstrativa exige cumulativamente ambiente permitido, gate do banco, política `fixture-demo-v1`, atleta de origem `demo`, idade conhecida, contato elegível e permissões atuais. Para menor, exige responsável e contato próprios; não recorre silenciosamente ao telefone do menor. Contato manual, ausência de responsável e revogação bloqueiam envio.

Política e digest de identidade/contato são revalidados antes do despacho e da persistência do resultado. Metadados do destinatário são mascarados e ocultados quando o acesso cadastral é restrito. Telefone integral, conteúdo clínico, tokens e credenciais não entram nos eventos técnicos ou DTOs de entrega. Payloads não podem escolher modo, procedência, telefone, destinatário, autorização, artefato ou resultado assinado.

Acesso de outro profissional produz resposta genérica, sem metadados. Consulta de workflow e recusas relevantes usam a infraestrutura existente de auditoria; eventos guardam referências, versão, correlações, modo, procedência e resultado, sem copiar o documento.

## Interface e evidências reais

A listagem mantém a composição compacta, exibindo tipo, autor, data, versão e dimensões independentes de elaboração, assinatura e entrega. O detalhe oferece conteúdo congelado, identidade, adaptador, data de finalização, histórico, tentativas, atualização, cancelamento de operação pendente e retentativa/reenvio elegíveis. A recuperação de resposta perdida também chega à visualização final sem repetir assinatura.

Capturas feitas com dados criados exclusivamente para os testes, em Chromium **headless**, sem abrir janela de navegador. Capturas representativas agrupam vários critérios para evitar redundância.

| Evidência | Critérios cobertos |
|---|---|
| [Elaboração 1440](visual/handoff-007-10-6b-2/01-elaboracao-1440.png) | Editor existente e dados fictícios |
| [Revisão 1440](visual/handoff-007-10-6b-2/02-revisao-identidade-envio-1440.png) | Template, identidade explícita, envio opcional e política fictícia |
| [Assinatura em andamento 390](visual/handoff-007-10-6b-2/03-assinatura-andamento-390.png) | Processamento e cancelamento |
| [Finalização com falha de entrega 1440](visual/handoff-007-10-6b-2/04-finalizado-falha-historico-1440.png) | Documento preservado, somente leitura e histórico |
| [Retentativa 390](visual/handoff-007-10-6b-2/05-retentativa-390.png) | Justificativa e confirmação explícita |
| [Entrega em andamento 390](visual/handoff-007-10-6b-2/05b-entrega-andamento-390.png) | Processamento da nova tentativa |
| [Conclusão 1440](visual/handoff-007-10-6b-2/06-finalizado-entrega-historico-1440.png) | Assinatura, finalização, entrega e histórico completo |
| [Conclusão 390](visual/handoff-007-10-6b-2/06-finalizado-entrega-historico-390.png) | Mobile e conteúdo congelado |
| [Conclusão 320](visual/handoff-007-10-6b-2/06-finalizado-entrega-historico-320.png) | Menor largura avaliada |
| [Derivado 390](visual/handoff-007-10-6b-2/07-derivado-390.png) | Novo rascunho e vínculo com origem preservada |
| [Lista 1440](visual/handoff-007-10-6b-2/08-listagem-mista-1440.png) | Rascunho/finalizado, autor e estados independentes |
| [Lista 390](visual/handoff-007-10-6b-2/08-listagem-mista-390.png) | Perfil mobile e ações existentes |

As evidências históricas dos três editores e revisões do B.1 permanecem preservadas. Não foram regeneradas para ilustrar esta entrega.

## Migração e operação local

Nova migration aditiva: `20261120000400_document_finalization_delivery.sql`. Preserva as migrations `20261120000100`, `20261120000200` e `20261120000300`; não faz backfill de finalizações/entregas, não transforma intenções históricas em fila e não introduz cascatas destrutivas sobre novas evidências.

Aplicada isoladamente ao Supabase local e registrada no controle de migrations. Durante o desenvolvimento, substituições de funções foram sincronizadas com o SQL final registrado. A lacuna histórica `20261115000900` continua documentada: objetos existentes com ausência do registro de controle. Não houve reset, reaplicação geral ou correção alheia ao escopo.

Para a demonstração local, `npm run signing:demo -- enable` configura assinatura e política fictícia; `disable` desabilita ambas. As variáveis continuam locais e fora do Git. Nenhuma credencial ou conector Z-API foi adicionado.

## Testes e política de recursos

**Novos:** 23 casos parametrizados de backend e uma jornada integrada de UI. Cobrem os três tipos documentais, guards reais, concorrência, hash/autoria, derivação, históricos não promovidos, modos, autorização, menor/responsável, revogação, estados de entrega, duplicatas, eventos tardios, timeout, lease, processo novo, retry/reenvio e procedência imutável.

**Reutilizados:** testes existentes de assinatura e revisão, atualizados somente onde a nova finalização muda o contrato esperado e a limpeza das fixtures. As asserções dos demais módulos foram preservadas, exceto a descrição antiga da lista de rascunhos, ajustada ao novo texto do perfil. Um fixture compartilhado torna capturas históricas explícitas opt-in (`CBB_REGENERATE_HISTORICAL_EVIDENCE=1`); isso não pula testes nem verificações. Evita gerar novamente dezenas de evidências antigas.

**Direcionados:** `npm run test:workflow` (23 casos); assinatura + revisão + nova UI (40 casos); recuperação de resposta perdida e nova UI reexecutadas após a correção. A primeira regressão encontrou o redirecionamento de resposta perdida, corrigido sem criar outra assinatura. Um seletor antigo foi ajustado para o heading específico porque o histórico agora repete legitimamente o mesmo rótulo.

**Regressões por impacto:** editor/revisão dos três documentos, assinatura, listagem e leitura. Verificações axe WCAG A/AA, teclado/foco e ausência de overflow na nova jornada em 1440/390/320 px. Sem tráfego de navegador para fornecedores; adaptador simulado não possui transporte externo.

Antes do fechamento estável, houve uma falha de coleta (reexport de `request` no fixture compartilhado), corrigida sem executar casos. A primeira execução iniciada foi interrompida com 9 casos aprovados ao identificar na captura um texto antigo que chamava todos os documentos de rascunhos. A descrição e os rótulos de negativa/falha da assinatura foram corrigidos; duas regressões direcionadas de listagem/jornada passaram antes da execução final. Essas reexecuções tiveram motivo técnico, sem repetir uma suíte completa aprovada.

A primeira suíte completa terminou com **135 aprovados e 3 falhas**. Duas falhas vinham de seletores antigos que confundiam o nome do médico no menu/listagem com a identificação no editor. Foram delimitados à identificação profissional no cabeçalho documental. A terceira era uma asserção imediata sobre o estado da entrega: houve reprodução intermitente no runner, inclusive após retorno de sucesso da assinatura, sem reprodução nas inspeções programáticas isoladas. A causa exata dessa leitura intermitente não foi comprovada. O teste agora exige evidência da finalização diretamente no banco e aguarda até 5 segundos o estado assíncrono esperado, mantendo as verificações de tentativas, idempotência e ausência de nova assinatura. Não se alterou código clínico para satisfazer esses testes.

Diagnóstico adicional: uma repetição direcionada teve 11/12 aprovações e reproduziu a intermitência; outra teve 12/12 aprovações. Após a estabilização, os **23 testes de backend** e as **2 regressões de documentos** passaram. Isso justificou uma segunda execução integral para confirmar a estabilidade, conforme o adendo.

**Fechamento:** a segunda execução integral (`npm test -- --workers=1 --reporter=line`) executou os **138 cenários** em **11,2 minutos**: **137 aprovados e 1 falha**, exclusivamente na fixture de relógio do teste antigo da Home (`clock.pauseAt: Cannot fast-forward to the past`). Esse teste lia `Date.now()` e tentava pausar depois, quando aquele instante já podia ter passado. O relógio passou a ser fixado e pausado antes da navegação; a asserção funcional original foi preservada. Revalidação isolada: **2/2 aprovações**, usando os servidores headless já em execução, sem abrir outro servidor ou janela.

Assim, os **138 cenários têm resultado positivo entre a integral e as revalidações**, mas não houve uma execução única final com 138/138 após a correção da fixture. A última integral retornou exit code 1 por esse teste. Não foi feita uma terceira integral: a única alteração posterior estava no preparo temporal do próprio teste, sem alteração em código de produção ou dependências. Essa decisão segue o adendo; evita repetir módulos já verificados sem novo risco de impacto.

`npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check`: **aprovados**. Lint foi reexecutado após os ajustes de testes. Typecheck e build foram aprovados no código de produção entregue, que permaneceu igual durante as estabilizações dos testes.

Módulos sem dependência direta (voz, CSV, diretório, busca, anexos etc.) não foram repetidos durante cada alteração. São abrangidos pela suíte integral no fechamento. Nenhuma cobertura crítica foi substituída por lint/build. Não há teste de assinatura criptográfica real, entrega WhatsApp real ou callback real, porque tais integrações estão expressamente fora do escopo e não foram configuradas.

## Limitações e integração futura

- Demonstração não autoriza uso clínico real: não produz assinatura criptográfica, certificado validado, mensagem WhatsApp ou comprovante jurídico real.
- Conector de assinatura real deve preencher evidências confiáveis e artefato correspondente, validar cadeia de integridade/identidade e usar a finalização compartilhada.
- Z-API ainda exige política institucional e consentimento/base apropriada, destinatário autorizado, transporte seguro, acesso ao artefato, validação de callbacks, correlação e capacidades reais do provedor. O despacho de produção permanece bloqueado até esses requisitos existirem.
- Em produção, haverá decisão operacional sobre agendamento/frequência e supervisão do reconciliador. Nenhum serviço foi publicado aqui.
- P0 de gestão de conversas identificados no 007.10.4A permanecem fora do escopo; assinatura não foi exposta como ferramenta do agente.
- O worker atual é o adaptador simulado; futuras capacidades externas exigirão testes de contrato contra o provedor, preservando os estados e a UI compartilhados.

## Git e entrega

Implementação e testes: `f3ec73d` — `feat: finalize documents and orchestrate durable simulated delivery`. Estabilização dos testes: `b2e1f9d` — `test: stabilize document navigation and asynchronous delivery assertions`. Fixture de relógio da Home: `19a0b85` — `test: freeze greeting clock before navigation`. Relatório e 12 capturas registrados em commit documental separado. Workspace conferido no fechamento; `.env.local` permanece ignorado, com simulação e política fictícia habilitadas apenas na instância local. Nenhuma alteração em `main`/`origin/main` e nenhum push, merge ou publicação.

Critério de entrega: pronto para homologação da jornada demonstrativa após os resultados finais abaixo, sem afirmar habilitação de integração clínica externa.
