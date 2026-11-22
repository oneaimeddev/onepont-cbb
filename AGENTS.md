# Prontuário CBB

Leia HANDOFF-001.md para escopo e DESIGN.md para a identidade visual.
A fundação implementada é a Fase A. HANDOFF-002.md orienta a evolução do workspace visual. Use exclusivamente dados fictícios.

- Valide sessão e permissões no servidor e no banco.
- Mantenha a aprovação humana e a origem das ações ao implementar operações clínicas.
- Use o escudo fornecido em public/brand/cbb.png com proporções preservadas.
- Reutilize os tokens e componentes existentes.
- Execute lint, typecheck, build e os testes pertinentes após mudanças.
- Para decisões visuais, consulte frontend-design. Para acessibilidade, web-design-guidelines.
- Para gargalos React, consulte vercel-react-best-practices. Para APIs de componentes, vercel-composition-patterns.
- Impeccable e webapp-testing estão disponíveis para tarefas específicas. Use o Playwright JS existente nas verificações deste projeto.
- Consulte docs/SKILLS.md para procedência e aplicação das skills. Carregue apenas as relevantes.

## Publicação do Beta

- A versão oficial é sempre a `main` do GitHub `oneaimeddev/onepont-cbb`.
- Pode trabalhar e testar em branches. Para publicar, integrar as alterações na `main`, validar e enviar a `main` ao GitHub. Pull request é opcional.
- A Vercel publica automaticamente a `main`; outras branches não devem gerar publicação automática. Preservar a regra de `vercel.json` e o filtro de branch do projeto Vercel.
- Não substituir esse fluxo por deploy direto da máquina, promoção de outra branch ou alteração manual do endereço oficial, salvo instrução explícita do responsável para uma exceção.
- Ao concluir uma publicação, conferir que o commit ativo na URL do Beta corresponde à `main` enviada. Dados e segredos de ambientes diferentes permanecem separados.
