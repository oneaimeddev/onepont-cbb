# HANDOFF 007.10.1 — Polimento do Chat e Home

**Projeto:** Prontuário CBB
**Natureza:** Refinamento pontual de UX
**Escopo fechado:** Cinco ajustes
**Referência visual:** Clinical Design North Star

## Objetivo

Melhorar a experiência inicial do CBB Intelligence com pequenos refinamentos de interação, estados visuais e personalidade, preservando todas as funcionalidades existentes.

Não realizar redesign geral ou mudanças na arquitetura do agente.

## 1. Indicador de processamento

Implementar indicador discreto com três pontos animados enquanto o agente prepara uma resposta.

Requisitos:

- Aparecer durante o processamento.
- Distinguir execução de ferramentas quando o estado estiver disponível.
- Desaparecer após resposta, erro ou cancelamento.
- Não duplicar indicadores.
- Não permanecer como mensagem histórica.
- Respeitar a preferência por movimento reduzido.

## 2. Ícone de microfone

Substituir o ícone de headset por um ícone de microfone no compositor.

Preservar o modo de voz contínuo já implementado.

Manter estados distintos para:

- Inativo.
- Ouvindo.
- Silenciado.
- Processando.

Garantir tooltips e nomes acessíveis.

## 3. Simplificação da Home

Remover os três botões de atalho:

- Buscar Atleta.
- Criar Evolução.
- Consultar Prontuário.

Preservar:

- Identidade visual CBB.
- Saudação centralizada.
- Compositor.
- Navegação lateral.
- Funcionalidades existentes por conversa ou interface tradicional.

Não criar novos cards ou atalhos para substituir os removidos.

## 4. Entrada inicial na aplicação

Após autenticação, apresentar a Home padrão do CBB Intelligence.

Não restaurar automaticamente a última conversa como tela ativa.

Preservar todas as conversas armazenadas, seus contextos e documentos.

A conversa anterior deve continuar acessível pelo histórico.

Não criar uma sessão de conversa vazia apenas porque o usuário acessou a Home.

## 5. Saudação animada e dinâmica

### Objetivo

Adicionar personalidade à Home utilizando uma saudação com efeito de digitação e frases alternativas.

A experiência deve ser sofisticada, discreta e coerente com a identidade editorial aprovada.

### 5.1 Efeito de digitação

Quando a Home for apresentada:

- Escolher uma saudação.
- Revelar o texto progressivamente, caractere por caractere.
- Utilizar velocidade aproximada de 40–60 ms por caractere.
- Permitir um cursor de digitação discreto, sem animação excessiva.
- Finalizar naturalmente a animação ao completar a frase.

Preservar Geist Serif, tipografia e tamanho aprovados.

Não introduzir mudanças bruscas de posicionamento ou altura durante a digitação.

### 5.2 Alternância das frases

Criar um catálogo local de aproximadamente 20 saudações.

Comportamento:

- Exibir uma frase por vez.
- Aguardar aproximadamente 12–15 segundos depois de concluída.
- Alternar para outra saudação, com transição suave.
- Evitar repetir consecutivamente a mesma frase.
- Permitir efeito de digitação também na nova frase.
- Não manter animações ativas fora da Home.

Não utilizar o LLM para gerar essas saudações.

Não realizar chamadas de API.

Não persistir as frases em banco de dados.

### 5.3 Frases sugeridas

Utilizar inicialmente estas 20 opções, revisando pontuação e comprimento quando necessário:

1. Como posso ajudar você hoje?
2. Por onde começamos hoje?
3. Sobre qual atleta vamos conversar?
4. O que você gostaria de consultar?
5. Como posso facilitar seu trabalho?
6. Vamos explorar um prontuário?
7. Posso ajudar com alguma evolução?
8. Qual informação você procura?
9. Vamos revisar um histórico clínico?
10. Como posso apoiar seu atendimento?
11. Quer consultar algum documento?
12. Vamos analisar a trajetória de um atleta?
13. O que precisamos investigar hoje?
14. Posso ajudar a organizar suas informações?
15. Qual atleta precisa da sua atenção?
16. Vamos preparar um novo registro?
17. Precisa encontrar alguma informação?
18. O que você gostaria de analisar?
19. Vamos continuar seu trabalho?
20. Como posso ajudar no acompanhamento?

As frases devem:

- Ser naturais em português brasileiro.
- Manter tom profissional e acolhedor.
- Ser curtas o suficiente para leitura confortável.
- Não prometer capacidades inexistentes.
- Não pressupor o nome ou a especialidade do usuário.
- Não incluir dados clínicos pessoais.

### 5.4 Pausa inteligente

A animação não pode atrapalhar a utilização do chat.

Pausar a alternância quando:

- O profissional começar a digitar no compositor.
- O compositor receber foco para entrada de mensagem.
- A aba do navegador deixar de estar visível.
- O usuário iniciar uma conversa.
- A Home deixar de estar montada.

Ao voltar, retomar de maneira natural, sem executar várias transições acumuladas.

Não deixar timers ou listeners órfãos.

### 5.5 Acessibilidade

- Respeitar `prefers-reduced-motion`.
- Com movimento reduzido, apresentar a frase completa imediatamente.
- Não anunciar cada caractere a leitores de tela.
- Não criar anúncios repetitivos a cada rotação.
- Garantir que a saudação tenha representação textual acessível.
- Evitar mudanças de layout e saltos visuais.
- Preservar contraste, hierarquia e legibilidade.

### 5.6 Responsividade

Validar a animação em desktop e mobile.

Frases maiores podem quebrar naturalmente em duas linhas, respeitando a composição editorial.

A altura da área de saudação deve evitar deslocamentos perceptíveis do compositor durante a troca.

Não reduzir excessivamente a fonte apenas para acomodar as frases.

## 6. Restrições gerais

- Não modificar RPCs.
- Não alterar ferramentas do agente.
- Não alterar modelos do Gemini.
- Não modificar permissões clínicas.
- Não alterar a confirmação de documentos.
- Não modificar o histórico persistido das conversas.
- Não criar nova infraestrutura de animação desnecessária.
- Não introduzir dependências pesadas para o efeito de digitação.
- Não realizar refatorações fora do escopo.

Preferir CSS e React, reutilizando padrões existentes.

## 7. Critérios de aceite

1. Indicador de processamento aparece e desaparece corretamente.
2. Ícone de microfone substitui headset.
3. Modo de voz permanece operacional.
4. Os três atalhos são removidos da Home.
5. Login abre a Home padrão.
6. Conversas anteriores continuam recuperáveis.
7. Saudação inicial apresenta efeito de digitação.
8. Existem aproximadamente 20 frases disponíveis.
9. As frases alternam sem repetição imediata.
10. A rotação pausa durante a interação do usuário.
11. Nenhuma animação permanece ativa durante uma conversa.
12. A preferência por movimento reduzido é respeitada.
13. Leitores de tela não recebem anúncios por caractere.
14. O layout não apresenta saltos relevantes.
15. Desktop e mobile mantêm a identidade visual aprovada.
16. Testes existentes continuam passando.

## 8. Entrega

Apresentar:

- Arquivos alterados.
- Capturas da Home.
- Demonstração ou teste da animação.
- Testes de acessibilidade.
- Validação desktop e mobile.
- Resultado de lint, typecheck, build e testes disponíveis.
- Limitações conhecidas.
- Estado da branch.

Não realizar merge sem validação.

**Critério final:** a Home do CBB Intelligence apresenta uma saudação dinâmica, elegante e natural, sem comprometer a produtividade, a acessibilidade ou as funcionalidades homologadas.
