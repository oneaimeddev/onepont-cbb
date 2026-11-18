# HANDOFF 007.9B — Refinamento do Perfil Longitudinal do Atleta

**Projeto:** Prontuário CBB
**Prioridade:** P0 — Preparação para apresentação de 23/11/2026
**Base:** Relatório de auditoria 007.9A, entregue em 18/11/2026
**Objetivo:** Corrigir os problemas identificados na auditoria, preservando a identidade visual e as funcionalidades clínicas homologadas.

## 1. Diretriz

O Handoff 007.9A confirmou que a direção visual Clinical Design North Star está presente na aplicação.

Não realizar redesign geral.

Não alterar a arquitetura clínica ou o modelo de permissões sem necessidade.

Implementar melhorias de orientação, consulta, organização e continuidade.

Usar o relatório 007.9A, suas capturas e evidências como referência obrigatória.

## 2. Etapa 007.9B.1 — Correções de UX

### UX-01 — Navegação para evolução recente

Corrigir o link das evoluções recentes para abrir diretamente o registro correspondente na linha do tempo.

Requisitos:

- Navegar ao registro autorizado correto.
- Expandir automaticamente seu conteúdo.
- Posicionar a visualização adequadamente.
- Preservar foco e acessibilidade.
- Manter compatibilidade com os parâmetros de navegação existentes.
- Não expor registros sem autorização.

### UX-02 — Navegação mobile

Corrigir o comportamento das abas do perfil em telas pequenas.

Requisitos:

- Garantir que a aba ativa fique visível.
- Preservar todas as seções disponíveis.
- Indicar a existência de outras abas.
- Evitar rolagem horizontal da página.
- Manter navegação por teclado.
- Testar especialmente 320 e 390 pixels.

Não substituir a navegação desktop desnecessariamente.

### UX-03 — Alterações não salvas

Implementar proteção contra perda silenciosa de alterações cadastrais.

Requisitos:

- Identificar alterações pendentes.
- Alertar ao trocar de seção com dados não salvos.
- Permitir continuar editando ou descartar alterações.
- Tratar navegação para outra rota e recarregamento conforme as capacidades do navegador.
- Exibir sucesso somente após confirmação do backend.
- Não implementar salvamento clínico automático.

Preservar a autorização e as operações atuais de edição.

### UX-04 — Nomenclatura de documentos

Diferenciar claramente:

- **Documentos médicos:** prescrições, pedidos cirúrgicos e solicitações de exames.
- **Anexos clínicos:** PDFs, imagens, laudos e outros arquivos enviados.

Renomear a ação de upload para **Adicionar anexo**.

Preservar estados e avisos de documento não assinado ou não emitido.

Não alterar tipos internos, dados ou RPCs apenas para renomear elementos visuais.

### UX-08 — Indicador de confidencialidade

Quando a própria autora consultar um registro restrito, apresentar um indicador discreto de visibilidade.

Exemplo: "Restrito ao autor".

Não apresentar placeholders, ícones, títulos ou contagens de registros restritos a profissionais não autorizados.

Não alterar a política de confidencialidade.

## 3. Validação intermediária

Após concluir 007.9B.1:

- Executar testes funcionais.
- Verificar desktop e mobile.
- Testar navegação por teclado.
- Testar descarte de alterações.
- Verificar acesso negado aos registros restritos.
- Apresentar capturas reais.

Prosseguir para a segunda etapa somente após estabilizar essas correções.

## 4. Etapa 007.9B.2 — Organização e legibilidade

### UX-05 — Dados cadastrais

Reorganizar a seção de cadastro para priorizar consulta.

Estruturar as informações em grupos claros:

- Identificação.
- Informações pessoais.
- Contatos e responsáveis.
- Dados esportivos.
- Histórico de vínculos.

Requisitos:

- Exibir os dados autorizados sem exigir entrar em edição.
- Manter edição explícita e contextual.
- Preservar a fotografia.
- Permitir acionar telefone e e-mail quando apropriado.
- Evitar formulários extensos sempre abertos.
- Tornar claro quais campos podem ser alterados na tela atual.
- Preservar múltiplas categorias e vínculos históricos.

Não implementar novos contratos de edição de contatos ou responsáveis sem escopo específico.

Não revelar dados pessoais a perfis não autorizados.

### UX-06 — Linha do tempo longitudinal

Melhorar a navegação de históricos extensos.

Adicionar filtros sobre os registros autorizados:

- Período.
- Especialidade.
- Estado da evolução.

Requisitos:

- Preservar a organização cronológica.
- Manter agrupamento por mês.
- Permitir limpar filtros.
- Exibir filtros ativos.
- Informar quantos registros visíveis correspondem ao filtro.
- Preservar acesso direto a uma evolução específica.
- Permitir expandir registros individualmente.
- Evitar renderização visual excessiva quando houver muitos resultados.

Nesta etapa, utilizar os dados já autorizados e disponíveis na interface, quando isso for suficiente.

Não criar paginação de banco ou alterar RPCs apenas para implementar filtros visuais.

Não incluir documentos privados de outras especialidades.

### UX-07 — Listagem de documentos médicos

Melhorar a identificação dos documentos sem exigir abri-los.

Apresentar, conforme dados autorizados já disponíveis:

- Tipo.
- Data relevante.
- Estado.
- Versão, quando útil.
- Identificação visual consistente.

Adicionar filtros por tipo e ordenação clara.

Não introduzir prévias clínicas de conteúdo sem contrato de autorização específico.

Preservar os editores e fluxos atuais.

## 5. Refinamentos P2

Incorporar os achados UX-09, UX-10 e UX-11 nos componentes já alterados.

### Atividades recentes

- Usar o título "Evoluções recentes" quando a seção apresentar exclusivamente evoluções.
- Exibir datas completas e compreensíveis.
- Oferecer ação "Ver todas as evoluções".

### Interações

- Melhorar o indicador de expandir/recolher.
- Tornar mais compreensível o acesso ao CBB Intelligence.
- Preservar acessibilidade e foco.

### Estados vazios

- Orientar o próximo passo disponível.
- Apresentar ações apenas quando autorizadas.
- Não afirmar ausência total de registros quando o profissional possui visibilidade limitada.

## 6. Preservação da experiência

Manter:

- Clinical Design North Star.
- Identidade oficial CBB.
- Geist Serif nos títulos editoriais.
- Geist Sans no conteúdo operacional.
- Masthead esportivo do atleta.
- Contexto lateral.
- Linha do tempo longitudinal.
- Responsividade e acessibilidade.

Não adicionar grandes cards decorativos para preencher espaços vazios.

Não transformar o perfil em um dashboard administrativo.

## 7. Segurança e regressões

Preservar integralmente:

- Autenticação.
- Permissões por profissional.
- Autorização de acesso ao atleta.
- Restrições por especialidade.
- Sigilo de evoluções e documentos.
- Auditoria.
- Evoluções.
- Prescrições.
- Pedidos cirúrgicos.
- Solicitações de exames.
- Anexos.
- Navegação para o CBB Intelligence.
- Histórico de vínculos esportivos.

Não alterar o backend clínico sem necessidade demonstrada.

## 8. Critérios de aceite

Validar:

1. Link recente abre evolução correta e expandida.
2. Aba ativa permanece visível em telas pequenas.
3. Dados cadastrais não são perdidos silenciosamente.
4. Documentos médicos e anexos possuem nomenclatura inequívoca.
5. Indicador de restrição aparece somente para quem já pode acessar o registro.
6. Dados pessoais e esportivos são facilmente consultáveis.
7. Contatos estão acessíveis sem percorrer um formulário extenso.
8. Histórico pode ser filtrado por período.
9. Histórico pode ser filtrado por especialidade.
10. Histórico pode ser filtrado por estado.
11. Documentos médicos podem ser distinguidos e filtrados.
12. Ações do perfil continuam funcionais.
13. Estados vazios orientam corretamente.
14. Experiência mobile é adequada.
15. Nenhum registro restrito é exposto indevidamente.
16. Integração com CBB Intelligence permanece funcional.

Repetir os cenários fictícios da auditoria 007.9A.

## 9. Execução e entrega

Trabalhar incrementalmente.

Não realizar alterações fora do escopo.

Ao concluir, apresentar:

- Alterações realizadas por achado UX.
- Capturas de antes e depois.
- Testes executados.
- Resultados de acessibilidade.
- Verificação de permissões.
- Limitações conhecidas.
- Estado da branch e commits.

Executar lint, typecheck, build e testes automatizados.

Não realizar merge sem validação.

**Critério final:** o perfil longitudinal do atleta deve oferecer consulta e navegação eficientes, com organização clara dos dados e ações, preservando o design aprovado e a segurança clínica existente.
