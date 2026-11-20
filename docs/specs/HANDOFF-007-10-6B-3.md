# HANDOFF 007.10.6B.3 — Jornada Clínica Completa pelo CBB Intelligence

**Projeto:** Prontuário CBB
**Natureza:** Implementação funcional, integração IA/backend, UX conversacional e segurança
**Prioridade:** Alta — consolidação AI-first
**Baseline:** Handoff 007.10.6B.2
**Objetivo:** Permitir criar, revisar, alterar, assinar, finalizar, enviar e consultar documentos médicos integralmente pelo CBB Intelligence, por linguagem natural, reutilizando a mesma infraestrutura da interface tradicional.

---

## 1. Decisão estratégica de produto

O Prontuário CBB possui duas interfaces complementares:

1. **CBB Clinical:** interface tradicional.
2. **CBB Intelligence:** interface conversacional com texto e voz.

A decisão definitiva é:

**Toda funcionalidade disponível na interface tradicional deverá, progressivamente, poder ser executada pelo CBB Intelligence.**

Isso inclui operações de consulta, criação, alteração, revisão, confirmação e acompanhamento, sempre respeitando permissões e regras de segurança.

Não queremos um chatbot que apenas explique onde clicar.

Queremos uma interface conversacional capaz de operar o prontuário.

O profissional deve conseguir concluir uma jornada inteira pelo chat sem precisar abrir o formulário tradicional.

### Escopo deste handoff

Implementar a paridade conversacional completa para:

- Prescrição médica.
- Solicitação de exames.
- Pedido cirúrgico.
- Revisão documental.
- Modificação dos documentos antes da assinatura.
- Seleção de identidade de assinatura.
- Autorização de assinatura.
- Finalização.
- Autorização e execução de entrega.
- Consulta de status e histórico.
- Retentativa autorizada de entrega.
- Criação de documento derivado após finalização.

O objetivo geral de paridade com todas as funcionalidades da plataforma continua válido, mas não exige implementar todos os outros módulos neste handoff.

Construir a infraestrutura conversacional de forma extensível para essas futuras capacidades.

---

## 2. Experiência desejada

O CBB Intelligence deve conduzir uma jornada conversacional natural.

Exemplo:

**Profissional:**

"Crie uma prescrição para o atleta João Silva com os medicamentos que acabamos de definir."

**CBB Intelligence:**

Identifica o atleta dentro do escopo autorizado, recupera somente o contexto clínico pertinente e prepara uma proposta de prescrição.

Apresenta o documento para revisão.

**Profissional:**

"Altere a dose do segundo medicamento e acrescente uma orientação de uso."

**CBB Intelligence:**

Atualiza a proposta, apresenta as alterações e atualiza a pré-visualização.

**Profissional:**

"Agora está correto. Quero assinar com minha identidade preferencial e enviar ao atleta pelo WhatsApp."

**CBB Intelligence:**

Apresenta a versão definitiva, a identidade de assinatura selecionável, o destinatário elegível e o resumo das ações solicitadas.

Solicita uma confirmação explícita vinculada àquela versão.

**Profissional:**

"Confirmo essa versão, a assinatura e o envio para o destinatário apresentado."

**CBB Intelligence:**

Encaminha a autorização para o backend, utilizando os serviços de assinatura, finalização e entrega já existentes.

Na DEMO, os respectivos adaptadores executam as simulações.

Ao concluir, apresenta o resultado e o andamento da entrega.

### Regra fundamental

O usuário pode conduzir todo o fluxo usando linguagem natural.

Os componentes visuais continuam existindo como apoio, não como passagem obrigatória para outra interface.

Uma confirmação em linguagem natural pode ser aceita quando houver um desafio de confirmação explícito, contextual e validado pelo servidor.

A IA não pode produzir a própria confirmação, presumir consentimento ou executar uma assinatura somente porque inferiu que essa seria a intenção provável do usuário.

---

## 3. Arquitetura: um único backend

A implementação deve reutilizar o domínio existente.

```text
CBB Clinical ───────────────┐
                            |
                            v
                  Serviços clínicos CBB
                            ^
                            |
CBB Intelligence ───────────┘
       |
       v
Interpretação de linguagem natural
       |
       v
Resolução de entidade e intenção
       |
       v
Operação estruturada autorizada
       |
       v
Validação e confirmação humana
       |
       v
Mesmos serviços clínicos CBB
```

A IA interpreta intenções e apresenta resultados.

O backend continua responsável por:

- Identificação do usuário.
- Autorização.
- Seleção de entidades.
- Validação.
- Persistência.
- Versionamento.
- Finalização.
- Assinatura.
- Entrega.
- Idempotência.
- Auditoria.

Não permitir que o modelo execute SQL arbitrário.

Não criar um segundo motor de documentos exclusivo para o chat.

Não implementar uma API paralela com regras clínicas diferentes das existentes.

Preferir serviços de aplicação compartilhados e contratos estruturados.

---

## 4. Correção obrigatória dos bloqueios P0

A auditoria 007.10.4A identificou vulnerabilidades no ciclo de vida das conversas.

**Não habilitar operações clínicas sensíveis pelo chat enquanto os bloqueios relevantes permanecerem abertos.**

Antes de expor a nova jornada, corrigir e validar:

### P0-1 — Retomada de conversa encerrada

Uma conversa encerrada ou arquivada não pode ser reativada indevidamente por `conversation_resume`.

Definir comportamento seguro para consulta histórica somente leitura, conforme autorização vigente.

### P0-2 — Confirmação depois de arquivamento

Nenhuma proposta ou autorização clínica pode ser confirmada em uma sessão que deixou de ser elegível para mutação.

Validar o estado da conversa no backend no momento da execução.

### P0-3 — Vínculo de proposta e documento

Corrigir a ambiguidade de `request_id` em `clinical_draft_proposal_attach`.

Não permitir que um documento salvo permaneça incorretamente como proposta pendente devido a uma falha de associação.

### P0-4 — Revogação de acesso

Quando o profissional perde acesso ao atleta, não deve continuar recebendo conteúdo clínico protegido por meio do histórico conversacional, prévias, cards ou respostas antigas.

Revalidar a autorização em consultas, retomadas e execução de operações.

Aplicar as correções necessárias no backend e validar regressões.

Não ampliar este trabalho para uma reestruturação estética da gestão de conversas.

Se algum P0 não puder ser corrigido com segurança, manter as mutações clínicas pelo chat bloqueadas e reportar a dependência, em vez de disponibilizar um fluxo vulnerável.

---

## 5. Catálogo de capacidades conversacionais

Criar ou estender um catálogo de operações clínicas disponíveis ao CBB Intelligence.

Cada capacidade deverá possuir:

- Identificador estável.
- Descrição funcional.
- Esquema de entrada estruturado.
- Validações determinísticas.
- Permissões necessárias.
- Política de confirmação.
- Política de auditoria.
- Serviço de domínio responsável.
- Resultado estruturado.

### Capacidades deste handoff

- Identificar atleta.
- Consultar contexto clínico autorizado.
- Criar proposta de documento.
- Consultar proposta ativa.
- Alterar campos de proposta.
- Adicionar ou remover itens.
- Reorganizar conteúdo.
- Apresentar pré-visualização.
- Salvar sem assinar.
- Selecionar identidade de assinatura.
- Selecionar destinatário.
- Preparar autorização.
- Confirmar assinatura.
- Consultar execução de assinatura.
- Consultar finalização.
- Consultar entrega.
- Solicitar retentativa ou reenvio.
- Criar documento derivado.

Não disponibilizar uma ferramenta genérica que permita ao modelo executar qualquer comando arbitrário.

A ampliação futura para outras funcionalidades deverá ocorrer por capacidades explícitas e autorizadas.

---

## 6. Entendimento de linguagem natural

O CBB Intelligence deve compreender diferentes formas de expressão.

Exemplos equivalentes:

- "Crie uma receita."
- "Faça uma prescrição."
- "Prepare o receituário desse atleta."

Para alterações:

- "Mude a dose."
- "Altere a posologia do segundo medicamento."
- "Tire o último item."
- "Acrescente uma orientação."
- "Troque o exame solicitado."

Para assinatura:

- "Quero assinar."
- "Use minha outra identidade."
- "Mostre a versão final antes de assinar."
- "Pode preparar a assinatura."

Para entrega:

- "Envie para o atleta."
- "Mande a receita pelo WhatsApp."
- "Envie ao responsável."
- "Não quero enviar agora."

Para acompanhamento:

- "O documento já foi enviado?"
- "Qual foi o resultado da assinatura?"
- "Mostre os documentos pendentes."
- "Tente enviar novamente."

### Desambiguação

Quando houver mais de um atleta, documento, medicamento, identidade ou destinatário possível, solicitar esclarecimento.

Não selecionar entidades clínicas de maneira arbitrária.

Não executar operações sobre um atleta apenas por coincidência de nome.

O contexto conversacional pode ajudar a resolver referências, mas deve ser validado contra os identificadores e as autorizações atuais.

---

## 7. Criação dos documentos pelo chat

A criação deve utilizar o domínio clínico existente.

### Prescrição médica

Permitir:

- Adicionar medicamentos.
- Alterar medicamentos.
- Definir apresentação, dose, via e posologia.
- Acrescentar orientações.
- Remover itens.
- Corrigir informações.
- Revisar o documento completo.

### Solicitação de exames

Permitir:

- Adicionar exames.
- Remover exames.
- Alterar justificativas.
- Corrigir solicitações.
- Revisar o documento completo.

### Pedido cirúrgico

Permitir:

- Informar procedimento.
- Alterar justificativa.
- Corrigir conteúdo.
- Acrescentar informações existentes no modelo clínico.
- Revisar o documento completo.

Não criar campos fictícios ou preencher automaticamente informações clínicas ausentes.

Não inventar doses, diagnósticos, medicamentos, exames, identidades profissionais ou justificativas.

Quando informações necessárias estiverem ausentes, o agente deverá solicitar complementação.

Respeitar os modelos e contratos já existentes nos editores tradicionais.

---

## 8. Alteração conversacional de rascunhos

O profissional poderá modificar uma proposta por linguagem natural.

Exemplo:

"Altere a posologia do segundo medicamento para uma vez ao dia."

O sistema deverá:

1. Identificar a proposta ativa.
2. Identificar o item correto.
3. Interpretar a alteração.
4. Validar os campos.
5. Aplicar a alteração ao rascunho autorizado.
6. Preservar os demais campos.
7. Mostrar o resultado.
8. Invalidar confirmações anteriores.

Não recriar todo o documento a cada alteração.

Preferir operações estruturadas sobre campos e itens existentes.

Usar identificadores estáveis dos itens, não depender exclusivamente da posição textual quando os elementos puderem ter sido reordenados.

Se a instrução for ambígua, perguntar antes de modificar.

### Regras de integridade

Uma alteração não pode:

- Modificar inadvertidamente outro atleta.
- Remover informações não mencionadas.
- Sobrescrever alterações concorrentes.
- Editar versões finalizadas.
- Reutilizar uma confirmação de assinatura anterior.
- Perder dados se o usuário atualizar a página.

A proposta deve possuir estado persistente e recuperável.

---

## 9. Revisão documental integrada ao chat

Reutilizar o componente `DocumentPreview` introduzido nos handoffs anteriores.

A revisão deve aparecer dentro da experiência conversacional, preferencialmente como um card documental expansível ou painel integrado.

Não obrigar navegação para a interface tradicional.

A composição visual deve apresentar:

- Instituição.
- Tipo documental.
- Atleta.
- Profissional.
- Registro profissional apropriado.
- Conteúdo completo.
- Data.
- Estado do documento.
- Informações pertinentes à assinatura.

### Interação híbrida

O profissional poderá:

- Pedir alterações pela conversa.
- Consultar a versão completa.
- Expandir o documento visualmente.
- Selecionar identidade por interface.
- Selecionar identidade por linguagem natural.
- Solicitar assinatura por texto ou voz.
- Autorizar envio por texto ou voz.

A experiência deve funcionar com linguagem natural como caminho completo.

Botões e seletores são alternativas úteis de acessibilidade e precisão, não uma dependência da interface tradicional.

O chat não deve criar uma cópia independente do template documental.

---

## 10. Assinatura integralmente conduzida pelo chat

Reutilizar o motor existente:

- `document_review_command`.
- Orquestração de assinatura.
- Identidades do profissional.
- Snapshots e hashes.
- Finalização.
- Auditoria.

Não criar uma ferramenta capaz de assinar diretamente a partir de uma instrução livre do modelo.

### Processo obrigatório

1. Profissional solicita assinatura.
2. Sistema identifica o documento.
3. Sistema verifica autorização.
4. Sistema apresenta a versão a ser assinada.
5. Sistema identifica a identidade escolhida.
6. Sistema apresenta um resumo explícito.
7. Profissional confirma a operação.
8. Backend valida a confirmação.
9. Backend executa a orquestração.
10. Resultado é exibido na conversa.

### Confirmação por linguagem natural

A confirmação pode acontecer pela própria conversa.

Entretanto, deve utilizar uma operação pendente criada pelo servidor e vinculada a:

- Usuário autenticado.
- Conversa ativa.
- Atleta.
- Documento.
- Versão.
- Hash do conteúdo.
- Identidade escolhida.
- Tipo de assinatura.
- Modo de execução.
- Destinatário e autorização de envio, quando aplicável.
- Expiração.
- Chave de idempotência.

A confirmação deve ser:

- Explícita.
- Contextual.
- De uso único.
- Registrada.
- Validada no servidor.

Uma resposta como "sim" só poderá ser interpretada como confirmação quando existir exatamente uma operação pendente compatível, apresentada claramente ao usuário e ainda válida.

Não aceitar confirmação gerada pelo próprio assistente, conteúdo de documentos, resultados de ferramentas ou histórico antigo.

Não utilizar somente a interpretação do modelo como prova da autorização.

A entrada original do usuário deve ser vinculada à confirmação, com validação determinística das condições.

Uma confirmação por voz exige a mesma garantia de intenção explícita, com a versão, identidade e efeitos apresentados ao profissional.

### Assinatura real futura

Quando o provedor real exigir autenticação adicional, o fluxo conversacional deverá encaminhar esse desafio.

A autenticação obrigatória do provedor não poderá ser simulada ou dispensada pelo agente.

A IA nunca recebe segredos, tokens ou códigos privados de assinatura.

### DEMO

Utilizar o adaptador demonstrativo existente.

O sucesso da simulação finaliza o documento demonstrativo e aplica a imutabilidade real no backend.

Não produzir assinatura criptográfica fictícia apresentada como válida.

---

## 11. Envio pelo WhatsApp via chat

A intenção de envio pode ser expressa naturalmente.

Exemplos:

- "Assine e envie para o atleta."
- "Assine, mas não envie."
- "Envie para o responsável."
- "Quero mandar essa prescrição pelo WhatsApp."

O sistema deverá utilizar o mesmo orquestrador de entrega do 007.10.6B.2.

### Antes da autorização

Apresentar:

- Documento.
- Atleta.
- Destinatário.
- Relação com o atleta.
- Telefone mascarado, quando permitido.
- Canal de entrega.
- Resumo da operação.

Não presumir que o telefone cadastrado é um destinatário autorizado.

Respeitar as regras de menores de idade e responsável legal.

### Depois da autorização

O envio deverá ocorrer automaticamente após assinatura elegível.

O chat deverá acompanhar os estados:

- Aguardando assinatura.
- Aguardando envio.
- Processando.
- Aceito pelo provedor.
- Entregue.
- Falhou.
- Resultado incerto.

No modo demonstrativo, identificar todos os resultados como simulados.

Não transformar uma entrega simulada em evidência real.

### Retentativas

O usuário poderá dizer:

"A entrega falhou? Tente novamente."

O sistema deverá:

1. Identificar a solicitação.
2. Verificar autorização atual.
3. Verificar elegibilidade para retentativa.
4. Solicitar justificativa e confirmação quando exigidas pelo domínio.
5. Utilizar a infraestrutura de idempotência existente.
6. Mostrar o novo estado.

Não gerar outra assinatura para reenviar o documento.

---

## 12. Finalização e documentos derivados

Depois de finalizado:

- O conteúdo permanece somente leitura.
- O chat não pode alterar a versão original.
- Não existe reabertura silenciosa para edição.
- A finalização é verificada no backend.

Se o usuário disser:

"Corrija a prescrição que acabamos de assinar."

O CBB Intelligence deverá explicar que a versão finalizada não pode ser editada.

Deverá oferecer a criação de um documento derivado.

Após confirmação, poderá copiar o conteúdo permitido para um novo rascunho vinculado à origem.

Esse novo documento percorre novamente revisão, assinatura e eventual entrega.

Não cancelar automaticamente o documento anterior.

Não criar uma nova versão por engano quando o usuário estiver apenas consultando o documento.

---

## 13. Estado conversacional persistente

Uma jornada clínica pode durar vários minutos e várias mensagens.

O sistema deve preservar:

- Conversa.
- Atleta em contexto.
- Documento ativo.
- Proposta corrente.
- Versão.
- Alterações propostas.
- Revisão.
- Identidade selecionada.
- Destinatário selecionado.
- Operação pendente.
- Status de assinatura.
- Status de entrega.

Não depender exclusivamente do histórico textual do modelo.

Persistir o estado operacional em estruturas controladas pelo backend.

O histórico de mensagens ajuda a interpretar o contexto, mas não é a autoridade sobre o estado clínico.

### Mudança de contexto

Se o profissional mudar de atleta ou documento, não transportar silenciosamente autorizações e confirmações.

Se houver mais de uma proposta pendente, desambiguar.

Se a sessão for encerrada, revogada ou invalidada, operações pendentes não podem continuar executáveis.

Se houver concorrência entre abas ou dispositivos, aplicar controle de versão e idempotência.

O usuário poderá retomar uma conversa elegível sem perder seu rascunho, desde que preserve as permissões necessárias.

---

## 14. Texto e voz

A mesma jornada deve funcionar com texto e com os recursos de voz já existentes no CBB Intelligence.

Não construir uma arquitetura independente para voz.

O reconhecimento de fala é uma forma de entrada para a mesma interpretação de intenção.

Garantir que:

- O profissional possa criar documentos falando.
- Possa solicitar alterações falando.
- Possa pedir a revisão falando.
- Possa escolher uma identidade pelo nome ou descrição.
- Possa solicitar assinatura.
- Possa confirmar de forma explícita a operação.
- Possa solicitar o envio.
- Possa consultar o resultado.

Não executar automaticamente uma ação irreversível quando a transcrição for ambígua.

Para confirmação de alto impacto, apresentar claramente o conteúdo e os efeitos antes de aceitar a resposta.

Se uma limitação real da infraestrutura de voz impedir a confirmação segura, manter a operação pendente e apresentar uma alternativa de confirmação no próprio chat, sem navegar ao prontuário tradicional.

Não afirmar suporte a confirmações por voz sem demonstrar que a validação de intenção está funcionando.

---

## 15. Interface conversacional e UX

Preservar o visual premium do CBB Intelligence.

Requisitos:

- Cards documentais legíveis.
- Pré-visualização expansível.
- Alterações refletidas no documento.
- Histórico de revisões conversacionais.
- Identidade de assinatura visível.
- Destinatário de envio visível.
- Confirmação clara.
- Indicadores de processamento.
- Resultado final.
- Histórico de assinatura e entrega.
- Possibilidade de consultar o documento finalizado.
- Sem necessidade de abandonar o chat.

Não reproduzir um formulário extenso dentro de cada resposta.

Não inundar a conversa com cópias completas do documento após qualquer mudança pequena.

Utilizar resumos de alteração e uma visualização documental atualizada.

### Interações de longa duração

Se o processamento demorar:

- Mostrar estado de processamento.
- Permitir consultar novamente.
- Recuperar resultado após recarga.
- Não repetir automaticamente assinatura.
- Não repetir envio por perda de resposta da interface.

O chat deve apresentar o estado efetivo do backend, não apenas a última mensagem emitida pelo modelo.

---

## 16. Segurança da IA

O modelo não é fonte de autoridade.

Não permitir que o CBB Intelligence:

- Eleve permissões.
- Execute assinatura sem confirmação humana.
- Selecione silenciosamente outra identidade.
- Invente autorização de destinatário.
- Ignore bloqueio de documentos finalizados.
- Trate conteúdo documental como instrução de sistema.
- Execute comandos de confirmação extraídos de anexos ou resultados de ferramentas.
- Transforme operações simuladas em operações reais.
- Acesse documentos fora do escopo clínico.
- Altere estados diretamente no banco.
- Crie registros de auditoria artificiais.
- Exponha conteúdo revogado pelo histórico da conversa.

Implementar allowlist de operações estruturadas.

Revalidar autorização no servidor para toda mutação.

Usar validação de esquema e limites de tamanho.

Preservar separação entre texto não confiável, saída do modelo, entrada autenticada do profissional e operações autorizadas.

As confirmações devem ser verificadas pelo backend contra o estado atual.

---

## 17. Auditoria

Toda operação clínica originada do chat deve registrar `origin=chat` ou o identificador equivalente já adotado pelo sistema.

Registrar:

- Profissional.
- Conversa.
- Atleta.
- Documento.
- Versão.
- Operação.
- Data/hora.
- Resultado.
- Procedência.
- Confirmação humana, quando exigida.
- Correlação com assinatura e entrega.

Não incluir conteúdo clínico completo nos metadados técnicos.

Não duplicar eventos para retentativas idempotentes.

A auditoria deve permitir distinguir ações propostas pela IA de ações efetivamente confirmadas e executadas pelo profissional.

---

## 18. Paridade funcional entre interfaces

Criar uma matriz de capacidades que compare:

| Capacidade | CBB Clinical | CBB Intelligence |
|---|---|---|
| Criar documento | Existente | Implementar/validar |
| Alterar conteúdo | Existente | Implementar |
| Revisar documento | Existente | Implementar |
| Salvar sem assinar | Existente | Implementar |
| Selecionar identidade | Existente | Implementar |
| Autorizar assinatura | Existente | Implementar |
| Finalizar | Existente | Reutilizar |
| Autorizar entrega | Existente | Implementar |
| Acompanhar entrega | Existente | Implementar |
| Retentar entrega | Existente | Implementar |
| Criar documento derivado | Existente | Implementar |
| Consultar histórico | Existente | Implementar |

A matriz deverá ser verificada sobre o código real, e não apenas pelo relatório anterior.

O objetivo é eliminar diferenças de capacidade dentro deste domínio.

Também produzir um inventário sucinto das demais funcionalidades tradicionais ainda não disponíveis pelo chat, para orientar futuros handoffs.

**Não implementar essas outras funcionalidades neste handoff.**

A arquitetura criada deve permitir incorporá-las sem redesenhar o mecanismo de operações conversacionais.

---

## 19. Estratégia de implementação

Dividir o trabalho internamente em cortes verificáveis.

### Corte A — Segurança conversacional

- Corrigir os P0 relevantes do 007.10.4A.
- Validar autorização, encerramento e revogação.
- Bloquear mutações inseguras.

### Corte B — Infraestrutura de capacidades

- Catálogo de operações.
- Estado operacional persistente.
- Contratos estruturados.
- Confirmação segura.
- Integração com serviços existentes.

### Corte C — Criação e alterações

- Três documentos médicos.
- Alterações por linguagem natural.
- Desambiguação.
- Revisão.
- Persistência.

### Corte D — Assinatura e entrega

- Seleção de identidade.
- Confirmação conversacional.
- Orquestrador existente.
- Finalização.
- Entrega simulada.
- Retentativas.

### Corte E — UX e homologação

- Preview integrado ao chat.
- Texto e voz.
- Estados e histórico.
- Recuperação de sessão.
- Mobile.
- Acessibilidade.
- Testes.

Não realizar merge ou deploy automaticamente.

---

## 20. Política de testes otimizada

Aplicar integralmente o adendo de otimização de testes aprovado anteriormente.

**Não executar a suíte completa repetidamente a cada corte.**

Durante a implementação:

- Executar testes direcionados.
- Reutilizar testes existentes.
- Validar os módulos afetados.
- Evitar evidências redundantes.
- Usar logs resumidos.
- Investigar falhas com testes isolados.

Executar a suíte integral uma vez ao final da branch estável, repetindo somente quando houver justificativa técnica.

### Cobertura crítica

Priorizar testes sobre:

1. Criação dos três documentos pelo chat.
2. Alterações de itens e campos.
3. Preservação de dados não alterados.
4. Desambiguação de atleta e documento.
5. Revisão da versão exata.
6. Salvar sem assinar.
7. Seleção de identidade própria.
8. Rejeição de identidade alheia.
9. Assinatura sem confirmação rejeitada.
10. Confirmação natural explícita aceita quando válida.
11. Confirmação ambígua rejeitada.
12. Confirmação vencida rejeitada.
13. Confirmação antiga após alteração rejeitada.
14. Confirmação após arquivamento rejeitada.
15. Confirmação após revogação de acesso rejeitada.
16. Idempotência após resposta perdida.
17. Finalização e bloqueio de edição.
18. Criação de documento derivado.
19. Envio não solicitado.
20. Entrega simulada autorizada.
21. Entrega bloqueada sem destinatário elegível.
22. Retentativa de entrega.
23. Ausência de envio externo.
24. Isolamento entre DEMO e produção.
25. Resistência a prompt injection em conteúdo clínico.
26. Recuperação de estado após recarga.
27. Concorrência entre abas.
28. Fluxo com entrada por voz.
29. Acessibilidade.
30. Auditoria com origem correta.

Não criar obrigatoriamente 30 testes distintos. Reutilizar e agrupar casos quando possível, mantendo as garantias.

### Regressão de segurança

Os quatro P0 de conversas devem possuir testes demonstrando o bloqueio anteriormente inexistente.

Verificar que a interface tradicional continua funcionando com o mesmo backend.

---

## 21. Evidências de homologação

Produzir evidências reais de:

- Criação de prescrição por linguagem natural.
- Alteração de posologia.
- Revisão documental integrada ao chat.
- Seleção de identidade por conversa.
- Confirmação explícita.
- Assinatura simulada concluída.
- Finalização e somente leitura.
- Entrega simulada.
- Falha e retentativa.
- Documento derivado.
- Histórico consultado pelo chat.
- Fluxo de solicitação de exames.
- Fluxo de pedido cirúrgico.
- Jornada por voz.
- Tentativa de confirmação insegura bloqueada.
- Desktop e mobile.

Priorizar capturas representativas, sem repetir dezenas de imagens semelhantes.

Não usar mockups como evidência de implementação.

---

## 22. Critérios de aceite

O handoff estará pronto para homologação quando:

1. O profissional conseguir criar os três documentos inteiramente pelo chat.
2. Conseguir fazer alterações por linguagem natural.
3. Conseguir revisar o documento final sem sair da conversa.
4. Conseguir escolher a identidade de assinatura pelo chat.
5. Conseguir solicitar e confirmar assinatura na própria conversa.
6. A confirmação estar vinculada à versão exata, identidade e usuário.
7. Uma assinatura simulada bem-sucedida finalizar o documento.
8. A versão finalizada permanecer imutável.
9. O profissional conseguir solicitar envio pelo WhatsApp na conversa.
10. O sistema utilizar o motor existente e o adaptador demonstrativo.
11. O profissional acompanhar status e histórico pelo chat.
12. Falhas e retentativas funcionarem sem gerar outra assinatura.
13. Documentos finalizados exigirem novo documento derivado para correção.
14. Todos os quatro P0 relevantes das conversas estarem corrigidos e testados.
15. Nenhum modelo ou comando livre conseguir contornar autorizações.
16. Texto e voz seguirem a mesma jornada, respeitadas as garantias de confirmação.
17. A interface tradicional permanecer funcional.
18. Não existir motor clínico duplicado para o chat.
19. Nenhuma assinatura criptográfica ou mensagem WhatsApp real ser fabricada.
20. A suíte de testes direcionados e a regressão final apresentarem resultados documentados.

---

## 23. Entrega final do Codex

Apresentar:

1. Resumo executivo.
2. Branch e commits.
3. Arquitetura implementada.
4. Correções dos P0.
5. Capacidades conversacionais disponíveis.
6. Demonstração dos três documentos.
7. Fluxo de alteração por linguagem natural.
8. Protocolo de confirmação humana.
9. Integração com assinatura e finalização.
10. Integração com entrega.
11. Comportamento por voz.
12. Controles de autorização.
13. Auditoria.
14. Testes direcionados.
15. Resultado da suíte integral.
16. Evidências de UX.
17. Pendências e limitações.
18. Matriz de paridade entre interfaces.
19. Inventário de capacidades tradicionais ainda pendentes no chat.

Não fazer merge, push ou deploy sem homologação.

## Critério estratégico final

**O CBB Intelligence deve funcionar como uma interface operacional completa para os documentos médicos.**

O profissional pode criar, revisar, alterar, assinar, finalizar, enviar e consultar documentos pela linguagem natural.

A IA interpreta e conduz a jornada. O profissional permanece responsável pelas decisões clínicas e confirmações. O backend garante autorização, integridade, execução e rastreabilidade.

A interface tradicional e o chat utilizam os mesmos serviços.

A DEMO e a produção utilizam a mesma jornada, com adaptadores externos diferentes e evidências de execução claramente distinguíveis.

Essa arquitetura deverá servir como referência para levar progressivamente todas as demais funcionalidades do Prontuário CBB à interface conversacional.
