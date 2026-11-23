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

- A versão oficial é sempre a `main` do GitHub `oneaimeddev/onepont-cbb`, publicada pela Vercel em https://prontuario-cbb-beta.vercel.app (Production).
- Homologação: a branch `homologacao` é publicada pela Vercel como Preview em https://prontuario-cbb-beta-git-homologacao-one-ai-dev.vercel.app, ligada a um projeto Supabase de homologação separado, só com dados fictícios. Ver docs/HOMOLOGACAO.md.
- Fluxo: trabalhar em branches; levar a alteração para `homologacao`, aplicar as migrações no projeto de homologação e validar no link de preview. Só depois da aprovação do responsável, integrar na `main`, aplicar as migrações na produção e enviar a `main` ao GitHub. Pull request é opcional.
- Somente `main` (Production) e `homologacao` (Preview) geram publicação automática. Preservar essa regra de `vercel.json` e o filtro de branch do projeto Vercel; outras branches não publicam.
- Não substituir esse fluxo por deploy direto da máquina, promoção de outra branch ou alteração manual do endereço oficial, salvo instrução explícita do responsável para uma exceção.
- Ao concluir uma publicação, conferir que o commit ativo na URL correspondente (preview ou Beta) é o enviado. Dados e segredos de homologação e produção permanecem separados: variáveis de Preview só para a branch `homologacao`, de Production só para a `main`.
