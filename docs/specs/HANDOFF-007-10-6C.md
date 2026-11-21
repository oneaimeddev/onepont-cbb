# HANDOFF 007.10.6C — Refinamento Cromático e Identidade Institucional CBB

**Projeto:** Prontuário CBB  
**Natureza:** Refinamento visual e design system  
**Prioridade:** P1 — Preparação do primeiro release  
**Baseline:** Última implementação concluída do Handoff 007.10.6B.3  
**Diretriz:** Clinical Design North Star  
**Escopo:** Alterações cromáticas controladas, sem redesign estrutural.

---

## 1. Objetivo

A identidade visual atual do Prontuário CBB foi aprovada e deve ser preservada.

O projeto possui uma linguagem visual premium, com:

- Composição editorial.
- Fundos claros.
- Tipografia consistente.
- Hierarquia de informações.
- Cards discretos.
- Navegação organizada.
- Formulários clínicos bem estruturados.
- CBB Intelligence integrado visualmente.

Entretanto, queremos fortalecer a identificação institucional da Confederação Brasileira de Basquete.

A decisão aprovada é incorporar as cores oficiais da CBB de maneira discreta, mantendo a experiência clínica sofisticada.

**Não reconstruir o design. Não fazer redesign das páginas. Não alterar a arquitetura de navegação.**

A entrega deve parecer um refinamento natural do produto existente.

## 2. Paleta institucional aprovada

Utilizar como referência a identidade visual oficial da CBB.

### Cores

| Cor | Código | Utilização |
|---|---|---|
| Azul-marinho | `#161D34` | Elementos institucionais, títulos e superfícies escuras existentes |
| Verde institucional | `#3D7039` | Ações principais e componentes interativos |
| Amarelo | `#E0C42D` | Acentos pontuais e detalhes de marca |
| Verde vibrante | `#12B106` | Exclusivamente elementos oficiais da identidade visual |
| Off-white | `#F8F8F5` | Referência neutra para superfícies, preservando os fundos existentes quando adequados |

O verde vibrante não deverá ser utilizado em:

- Botões.
- Menus.
- Links.
- Inputs.
- Etiquetas clínicas.
- Indicadores de sucesso.
- Textos funcionais.

Sua presença deve ficar restrita ao escudo/logotipo oficial e a eventuais elementos gráficos estritamente institucionais já aprovados.

### Hierarquia cromática

Preferir:

1. Neutros e superfícies claras.
2. Azul-marinho institucional.
3. Verde sóbrio para interação.
4. Amarelo em pequenos detalhes.

Não usar verde e amarelo como grandes preenchimentos decorativos.

Evitar estética de aplicativo esportivo ou de campanha publicitária.

O produto continua sendo uma ferramenta clínica.

## 3. Preservações obrigatórias

Não modificar:

- Estrutura das páginas.
- Sidebar e organização dos menus.
- Tipografia atual.
- Escala tipográfica.
- Espaçamentos.
- Bordas e raios.
- Layout dos cards.
- Formulários clínicos.
- Tabelas e listas.
- Navegação.
- Comportamento responsivo.
- Fluxos de assinatura.
- Fluxos de entrega.
- Funcionalidades do CBB Intelligence.
- APIs, contratos e backend.
- Permissões e auditoria.

Não converter automaticamente uma sidebar clara em escura.

Se a sidebar atual estiver visualmente equilibrada, preservar seu tratamento e aplicar apenas os ajustes cromáticos necessários.

A identidade institucional deve ser reforçada sem comprometer a composição existente.

## 4. Preparação e auditoria visual

Antes de alterar código:

1. Inspecionar o workspace e a branch atual.
2. Confirmar que os cortes A–E do 007.10.6B.3 estão preservados.
3. Identificar a estrutura de tokens CSS.
4. Mapear cores institucionais e semânticas.
5. Identificar valores hexadecimais fixos utilizados nos componentes.
6. Analisar o contraste dos principais elementos.
7. Capturar o estado atual das telas representativas.
8. Criar branch dedicada para o refinamento.

Não iniciar por substituição global de valores hexadecimais.

Não fazer alterações sobre uma baseline incompleta ou sem preservar mudanças não commitadas.

### Referências

Inspecionar principalmente:

- Home.
- Diretório de atletas.
- Perfil do atleta.
- Evoluções e documentos médicos.
- Editores e revisão documental.
- Detalhe de documento finalizado.
- CBB Intelligence.
- Perfil profissional.
- Componentes compartilhados.

## 5. Implementação por tokens

Centralizar a identidade cromática em tokens reutilizáveis.

Preferir a infraestrutura já existente.

Exemplos conceituais:

```css
--brand-navy: #161D34;
--brand-green: #3D7039;
--brand-yellow: #E0C42D;
--brand-green-vibrant: #12B106;
```

Os nomes definitivos devem respeitar a convenção existente no projeto.

Não criar uma segunda camada redundante de variáveis se o design system já possui tokens equivalentes.

### Separação fundamental

Manter separados:

**Tokens de marca**

- Identidade.
- Destaques.
- Ações e navegação.

**Tokens semânticos**

- Sucesso.
- Erro.
- Alerta.
- Informação.
- Desabilitado.
- Foco e acessibilidade.

Um indicador de sucesso não deve se tornar verde institucional apenas porque essa é a cor de marca.

Não utilizar amarelo institucional indiscriminadamente como cor de alerta.

## 6. Aplicação por componente

### 6.1 Navegação

Incorporar a identidade CBB de forma discreta.

Revisar:

- Item selecionado.
- Indicadores de navegação.
- Estados hover.
- Ícones ativos.
- Identificação institucional.

Evitar grandes superfícies amarelas.

Preservar a organização existente.

### 6.2 Botões

Aplicar o verde institucional às ações primárias quando visualmente apropriado.

Garantir:

- Contraste adequado.
- Hover.
- Active.
- Focus-visible.
- Disabled.
- Loading.

Não trocar automaticamente todos os botões por verde.

Botões destrutivos devem manter tratamento semântico próprio.

Ações secundárias devem preservar sua hierarquia.

### 6.3 Inputs e formulários

Refinar discretamente:

- Foco.
- Seleção.
- Checkbox.
- Radio button.
- Controles segmentados.
- Estados selecionados.

Preservar a legibilidade e os estados de validação.

### 6.4 Cards e tabelas

Manter a composição atual.

Permitir pequenos acentos institucionais onde agregarem valor.

Não adicionar faixas decorativas, gradientes ou fundos coloridos indiscriminadamente.

### 6.5 Etiquetas clínicas

Preservar a distinção entre:

- Rascunho.
- Em revisão.
- Finalizado.
- Assinatura simulada.
- Assinado.
- Envio pendente.
- Entrega simulada.
- Entregue.
- Falha.

Não criar ambiguidade entre cor institucional e estado clínico.

### 6.6 CBB Intelligence

O chat deve receber a mesma identidade institucional.

Revisar:

- Identificação visual do assistente.
- Campos de entrada.
- Botões de ação.
- Indicadores de processamento.
- Cards de propostas clínicas.
- Revisão documental.
- Confirmações.
- Histórico de assinatura e entrega.

Não redesenhar o chat.

Não alterar sua lógica conversacional ou seus contratos.

Preservar a apresentação dos documentos, inclusive os novos estados introduzidos no 007.10.6B.3.

### 6.7 Documentos médicos

Preservar a identidade CBB nas representações documentais.

Não alterar conteúdo clínico ou snapshots.

Não modificar hashes ou versões já finalizadas.

Não introduzir mudanças de template que afetem a integridade documental.

Se algum ajuste cromático alcançar uma representação utilizada no snapshot ou na assinatura, verificar as implicações e evitar mudanças silenciosas nos contratos existentes.

## 7. Acessibilidade

Validar WCAG AA nos componentes modificados.

Priorizar:

- Contraste de textos.
- Contraste de botões.
- Estados de foco.
- Indicadores de seleção.
- Uso independente de cor para comunicar status.
- Legibilidade de etiquetas.

O amarelo `#E0C42D` não deve receber texto branco sem comprovação de contraste adequado.

Não assumir que uma combinação é acessível apenas porque utiliza cores oficiais.

Realizar cálculos de contraste e corrigir combinações inadequadas.

## 8. Estratégia de testes otimizada

Aplicar a política de otimização de recursos já aprovada.

Este é um handoff visual.

Não executar indiscriminadamente todas as suítes clínicas a cada alteração.

Priorizar:

1. Validação dos tokens.
2. Contraste.
3. Componentes alterados.
4. Regressão visual representativa.
5. Responsividade.
6. Acessibilidade.
7. Ausência de problemas de compilação.

Executar lint, typecheck e build.

Executar testes funcionais direcionados caso alguma alteração possa afetar comportamento.

Não criar novos testes clínicos sem mudança funcional correspondente.

## 9. Evidências de homologação

Produzir comparação real antes/depois das telas:

- Home.
- Diretório de atletas.
- Perfil do atleta.
- Editor de prescrição.
- Revisão documental.
- Documento finalizado.
- CBB Intelligence.

Utilizar dados fictícios.

Capturar desktop 1440px e amostras mobile 390px.

Não produzir dezenas de capturas redundantes.

A comparação deve facilitar a avaliação da mudança cromática, não demonstrar uma reconstrução visual.

## 10. Critérios de aceite

O handoff estará concluído quando:

1. A plataforma incorporar a identidade CBB de forma mais reconhecível.
2. Azul-marinho, verde e amarelo forem utilizados de acordo com a hierarquia aprovada.
3. O verde vibrante não for aplicado aos componentes funcionais.
4. A linguagem visual premium atual estiver preservada.
5. Não houver mudanças estruturais.
6. Formulários e documentos permanecerem legíveis.
7. Acessibilidade e contraste forem preservados.
8. Estados clínicos continuarem semanticamente distintos.
9. O CBB Intelligence estiver visualmente consistente com o restante do sistema.
10. Nenhuma funcionalidade clínica sofrer regressão.
11. Os testes direcionados e verificações técnicas forem aprovados.
12. Houver evidências reais de antes/depois.

## 11. Entrega final

Apresentar:

- Resumo da intervenção.
- Branch e commits.
- Tokens existentes e novos.
- Componentes alterados.
- Comparações visuais.
- Verificações de contraste.
- Resultados dos testes.
- Problemas encontrados.
- Pendências.
- Riscos e limitações.

Não fazer merge, push ou deploy sem homologação.

## Diretriz final

**O profissional deve reconhecer a identidade da CBB sem perceber que o sistema passou por um redesign.**

Preservar tudo aquilo que já funciona visualmente.

Alterar somente o necessário para fortalecer coesão institucional, consistência cromática e qualidade de interface.

O resultado esperado é um Prontuário CBB mais reconhecível, sofisticado e coerente com sua instituição, mantendo integralmente a experiência clínica existente.
