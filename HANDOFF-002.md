# HANDOFF 002 — Conversational Clinical Workspace

**Projeto:** Prontuário CBB  
**Categoria:** Product Experience / UX Architecture / Frontend  
**Prioridade:** Alta  
**Objetivo:** Transformar a interface existente em um workspace clínico conversacional moderno.

## 1. Contexto

O Prontuário CBB é uma plataforma de trabalho para profissionais de saúde que acompanham atletas de basquete.

O produto possui dois modelos de interação:

1. **Chat First:** o usuário interage com um agente de IA usando linguagem natural.
2. **Interface tradicional:** o usuário executa operações por meio de navegação, listas, formulários e outras interfaces estruturadas.

Esses modelos não devem parecer aplicações independentes. Eles devem coexistir dentro de uma experiência de trabalho integrada.

O produto já possui uma implementação inicial de frontend e passou por um refinamento utilizando skills especializadas.

Entretanto, o resultado ainda apresenta problemas importantes de arquitetura visual e percepção de modernidade.

### Diagnóstico da interface atual

**Tela de chat**
- Parece uma landing page interna.
- Apresenta excesso de espaço vazio.
- O campo de mensagem parece um formulário comum.
- Não comunica uma experiência conversacional contínua.
- As ações rápidas parecem botões isolados.
- Não existe uma estrutura visual clara para contexto e continuidade da conversa.

**Modo tradicional**
- Parece um sistema administrativo simplificado.
- A sidebar possui pouca estrutura.
- A área principal não comunica uma plataforma de trabalho sofisticada.
- A identidade visual não está suficientemente integrada ao chat.

**Login**
- Possui identidade institucional relativamente bem definida.
- Entretanto, a linguagem visual não está completamente alinhada ao produto autenticado.

### Objetivo de transformação

Evoluir de:

"Um sistema tradicional com uma página de chat."

Para:

**"Um workspace clínico inteligente no qual a conversa é a principal forma de trabalhar, e as interfaces estruturadas complementam a experiência."**

---

## 2. Responsabilidade do agente

Atue como uma equipe formada por:

- Principal Product Designer.
- Senior UX Architect.
- Design Systems Engineer.
- Principal Frontend Engineer.

Utilize as skills de frontend e design já instaladas no projeto, especialmente as de direção visual, crítica de UX, composição de componentes, acessibilidade e engenharia React, caso aplicáveis à stack existente.

Antes de modificar código:

1. Inspecione a implementação atual.
2. Consulte o `AGENTS.md` e o `DESIGN.md`.
3. Identifique os componentes reutilizáveis.
4. Verifique o estado real das funcionalidades existentes.
5. Preserve as decisões aprovadas anteriormente.

Não reinicie o Design System. Evolua a partir dele.

---

## 3. North Star de experiência

O Prontuário CBB deve transmitir cinco características:

**Profissional:** uma ferramenta adequada ao trabalho clínico diário.

**Conversacional:** a interação em linguagem natural deve ser central e intuitiva.

**Contextual:** informações do atleta e do prontuário devem aparecer quando forem relevantes.

**Inteligente:** a IA deve facilitar operações reais, não funcionar como elemento decorativo.

**Institucional:** a identidade oficial da CBB deve estar presente com discrição e consistência.

A interface deve ser sofisticada, mas não extravagante.

O resultado deve parecer um produto SaaS especializado, projetado por uma equipe experiente.

---

## 4. Redesenhar a estrutura principal — App Shell

Implementar uma estrutura-base compartilhada entre Chat e Interface Tradicional.

### 4.1 Sidebar esquerda

A navegação principal deve utilizar uma sidebar consistente.

Considere organizar:

- Identidade do Prontuário CBB.
- Acesso ao workspace conversacional.
- Buscar atletas.
- Prontuários.
- Nova evolução.
- Histórico de conversas, quando existir persistência real.
- Informações da sessão e do profissional autenticado.

A sidebar deve:

- Ser visualmente discreta.
- Possuir estados ativos bem definidos.
- Utilizar ícones funcionais quando úteis.
- Suportar recolhimento quando fizer sentido.
- Adaptar-se a telas menores.
- Evitar excesso de agrupamentos ou elementos decorativos.

Não adicionar funcionalidades inexistentes apenas para preencher espaço.

### 4.2 Área principal

A área principal deve se adaptar à tarefa atual.

**No Chat:**
- Conversação e entrada de mensagens.
- Resultados estruturados quando necessários.
- Ações contextuais.

**Na interface tradicional:**
- Listas.
- Prontuários.
- Formulários.
- Detalhes de atletas.
- Operações clínicas.

A identidade, a tipografia, o espaçamento e os componentes devem permanecer consistentes.

### 4.3 Painel contextual à direita

Prever um painel contextual opcional.

Ele poderá apresentar, conforme a funcionalidade estiver disponível:

- Atleta selecionado.
- Dados resumidos do atleta.
- Prontuário em contexto.
- Informações relevantes para a tarefa.
- Ações pendentes de aprovação.
- Detalhes de auditoria relacionados à operação.

**Importante:** esse painel não deve aparecer vazio por padrão.

Sua abertura deve depender de contexto real e necessidade operacional.

Evitar uma interface permanentemente dividida em três colunas se isso prejudicar o espaço da conversa.

---

## 5. Redesenhar a experiência de Chat

Esta é a principal prioridade visual do handoff.

### 5.1 Estado inicial

A tela inicial deve comunicar imediatamente que o chat é o centro de trabalho.

Substituir a aparência atual de formulário centralizado por um workspace conversacional.

A composição deve apresentar:

- Boas-vindas discretas e profissionais.
- Campo de composição visualmente destacado.
- Sugestões contextuais de tarefas.
- Hierarquia clara.
- Distribuição equilibrada do espaço.
- Elementos visuais consistentes com o restante do sistema.

Evitar hero sections grandes, slogans comerciais e elementos típicos de landing pages.

### 5.2 Composer de mensagens

Projetar um componente de entrada de mensagens que comunique interação conversacional.

Quando o chat estiver funcional, ele deverá oferecer:

- Entrada de texto.
- Botão de envio.
- Comportamento apropriado para Enter e Shift+Enter.
- Estado de processamento.
- Feedback de erro.
- Tratamento de mensagens longas.
- Expansão controlada conforme o conteúdo.

O composer deve permanecer em uma posição previsível, preferencialmente próximo ao rodapé da área de conversação.

Não utilizar um textarea grande e isolado no centro da página como solução definitiva.

### 5.3 Conversa em andamento

Preparar a arquitetura visual para:

- Mensagens do profissional.
- Respostas do agente.
- Resultados estruturados.
- Indicadores de processamento.
- Erros recuperáveis.
- Confirmações de ações.
- Referências e fontes quando disponíveis.
- Solicitações de aprovação humana.

Diferenciar visualmente:

**Informação gerada pela IA**  
**Ação proposta pela IA**  
**Ação aprovada pelo usuário**  
**Ação efetivamente executada**

Essa diferenciação é essencial para um sistema clínico auditável.

### 5.4 Sugestões de tarefas

Refinar as ações atualmente apresentadas:

- Buscar atleta.
- Nova evolução.
- Prontuários.

Elas devem funcionar como entradas naturais para fluxos de trabalho, e não como botões decorativos.

Quando a ação possuir implementação real, navegar para o fluxo correspondente ou executá-lo de acordo com o contrato existente.

Quando não possuir, apresentar uma indisponibilidade honesta.

### 5.5 Limitação atual do chat

A implementação existente informa que o chat estará disponível em uma fase futura.

**Não simular uma IA funcional.**

Não criar mensagens clínicas fictícias apresentadas como reais.

Não introduzir um backend falso, chamadas artificiais ou uma lógica de agente improvisada para demonstrar a interface.

É permitido preparar os componentes visuais e seus estados, mas o usuário deve conseguir distinguir claramente o que está disponível daquilo que ainda não foi implementado.

O redesenho deve permitir ativar o chat futuramente sem precisar reconstruir sua interface.

---

## 6. Interface tradicional integrada

A interface tradicional não deve ser tratada como um produto secundário.

Ela deve reutilizar o mesmo App Shell, os mesmos padrões de navegação e os componentes compartilhados.

### Diretrizes

- Cabeçalhos claros e objetivos.
- Busca e filtros próximos aos dados.
- Tabelas adequadas à densidade informacional.
- Formulários estruturados e legíveis.
- Estados vazios úteis.
- Ações primárias facilmente identificáveis.
- Redução de elementos visuais desnecessários.

As páginas devem possuir uma hierarquia operacional evidente.

### Relação com o Chat

Quando houver contexto disponível, prever transições naturais entre interfaces.

Exemplos conceituais:

- Consultar um atleta na interface e iniciar uma conversa sobre ele.
- Receber uma sugestão do agente e abrir o formulário correspondente.
- Revisar uma evolução proposta pela IA em uma interface estruturada.

Não implementar fluxos sem contratos ou regras de negócio definidas.

Neste handoff, priorizar a coerência da navegação e a preparação da estrutura para essas integrações.

---

## 7. Direção visual

A aparência deve comunicar modernidade por meio de qualidade de composição e interação, e não por efeitos decorativos.

### Recomendações

**Tipografia**
- Hierarquia clara.
- Boa legibilidade.
- Pouca variação desnecessária.
- Tamanhos adequados para trabalho prolongado.

**Cores**
- Utilizar a identidade oficial CBB.
- Usar cores institucionais como acentos funcionais.
- Superfícies neutras e confortáveis.
- Contraste apropriado para leitura clínica.

**Componentes**
- Botões discretos.
- Campos de entrada refinados.
- Bordas consistentes.
- Estados de foco perceptíveis.
- Elevação moderada quando necessária.
- Composição visual coesa.

**Layout**
- Proporções equilibradas.
- Larguras máximas apropriadas à leitura.
- Navegação previsível.
- Densidade informacional moderada.
- Uso inteligente dos espaços disponíveis.

### Anti-AI-Slop

Evitar:

- Gradientes decorativos.
- Excesso de cards.
- Sombras grandes.
- Glassmorphism.
- Ícones excessivos.
- Badges desnecessários.
- Grandes áreas vazias sem função.
- Componentes repetitivos sem hierarquia.
- Efeitos de animação sem propósito.
- Layouts genéricos de dashboard.
- Copiar a aparência visual do ChatGPT, Linear ou qualquer outro produto.

O objetivo é adotar a qualidade das experiências modernas, mantendo uma linguagem própria.

---

## 8. Login e consistência

Preservar a identidade institucional da tela de login.

Refinar, quando necessário:

- Tipografia.
- Proporções.
- Formulários.
- Espaçamento.
- Estados de interação.
- Responsividade.

Garantir que a linguagem visual da tela de login seja reconhecível no restante da aplicação.

Não transformar a tela de autenticação em uma landing page comercial.

---

## 9. Responsividade e acessibilidade

Validar a experiência em desktop e mobile.

### Desktop
- Sidebar funcional.
- Área central com bom aproveitamento de espaço.
- Composer bem posicionado.
- Painel contextual sob demanda.

### Mobile
- Navegação compacta.
- Conversa como área prioritária.
- Composer acessível.
- Painel contextual adaptado a espaços reduzidos.
- Sem overflow horizontal indevido.

Garantir navegação por teclado, indicadores de foco, contraste adequado, semântica acessível e tratamento apropriado de estados.

---

## 10. Execução incremental

O projeto possui uma versão demonstrável prevista para **17/11/2026**.

Evite uma grande refatoração que comprometa a entrega.

Priorize nesta ordem:

**P0 — Obrigatório**
1. Consolidar o App Shell.
2. Redesenhar a tela inicial conversacional.
3. Refinar o composer e seu estado indisponível, conforme as capacidades existentes.
4. Integrar a navegação entre Chat e Interface Tradicional.
5. Preservar login, autorização e fluxos existentes.

**P1 — Se houver capacidade sem comprometer a demo**
1. Refinar componentes compartilhados.
2. Melhorar estados vazios.
3. Implementar a estrutura visual do painel contextual.
4. Refinar responsividade.

**P2 — Evolução posterior**
1. Animações e microinterações avançadas.
2. Personalizações visuais.
3. Experiências conversacionais complexas ainda sem backend.
4. Polimento estético secundário.

Caso o escopo exceda a capacidade da entrega, conclua P0 e documente o restante.

---

## 11. Restrições

- Não reescrever o frontend integralmente.
- Não substituir bibliotecas existentes sem justificativa.
- Não introduzir dados clínicos fictícios como reais.
- Não simular capacidades de IA inexistentes.
- Não alterar contratos de API desnecessariamente.
- Não modificar regras clínicas.
- Não comprometer autenticação ou autorização.
- Não remover a auditoria.
- Não criar navegação para funcionalidades inexistentes sem tratar explicitamente seu estado.
- Não alterar outros handoffs em andamento sem verificar possíveis conflitos.
- Não usar componentes meramente decorativos para preencher espaço.

---

## 12. Critérios de aceite

O handoff estará concluído quando:

1. A interface apresentar uma linguagem visual consistente.
2. O Chat comunicar uma experiência conversacional, e não um formulário isolado.
3. O composer possuir posicionamento e estados adequados.
4. A navegação entre Chat e Interface Tradicional estiver integrada.
5. A identidade CBB permanecer preservada.
6. Os principais estados vazios e indisponíveis estiverem claros.
7. As funcionalidades existentes continuarem funcionando.
8. As interfaces prioritárias forem avaliadas em diferentes larguras de tela.
9. Não houver regressões conhecidas nos fluxos críticos.
10. O resultado demonstrar uma melhoria perceptível na qualidade do workspace.

---

## 13. Validação visual obrigatória

Utilize as capturas de tela existentes como referência do estado anterior, quando disponíveis.

Execute a aplicação e inspecione visualmente:

- Login.
- Home conversacional.
- Navegação tradicional.
- Estados vazios.
- Responsividade.

Produza novas capturas de tela após as alterações.

Avalie criticamente:

- A interface parece uma plataforma profissional?
- O Chat é visualmente o centro da experiência?
- Existe consistência entre as páginas?
- Há espaço vazio sem função?
- Existem elementos decorativos desnecessários?
- A hierarquia está evidente?
- O produto tem identidade própria?

Se o resultado ainda parecer um template genérico, refine antes de concluir, respeitando os limites de escopo e prazo.

---

## 14. Entrega esperada

Apresente ao final:

1. Resumo das decisões de UX.
2. Arquitetura visual adotada.
3. Componentes criados ou modificados.
4. Telas refinadas.
5. Capturas de tela comparativas.
6. Validações e testes executados.
7. Limitações e pendências.
8. Recomendações para o próximo handoff.

**Resultado desejado:** o Prontuário CBB deve parecer uma plataforma de trabalho clínico moderna, inteligente e integrada, com uma experiência conversacional verdadeiramente central, sem perder clareza operacional, identidade institucional ou segurança.