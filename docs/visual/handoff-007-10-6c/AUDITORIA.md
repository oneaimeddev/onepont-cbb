# Auditoria cromática anterior à implementação — 007.10.6C

Baseline: `baseline/pre-paleta-2026-11-20`, commit `126ed085797d113680b3aa1689504acdb342d522`. Branch limpa criada a partir dela: `design/handoff-007-10-6c-cbb-palette`. Cortes A–E do 007.10.6B.3 preservados; a baseline passou em 351 testes antes deste handoff.

## Inventário e diagnóstico

O inventário integral de cores CSS foi produzido antes da edição e está em `color-inventory-before.json`. A inspeção de JSX/TS não encontrou cores hexadecimais de interface nesses arquivos. Valores fixos existem em CSS; não foi aplicada substituição global entre arquivos.

- Tokens canônicos em `src/app/globals.css`; overrides locais divergentes no workspace e tokens paralelos no Intelligence.
- Navy raiz `#102849`, navy do workspace/chat `#0A1731`. Verde raiz `#07803E`, workspace `#007132`. Amarelo `#F3D115`.
- Ações em azul fixo `#0079D5` / `#0069B5`, botão de busca e ações do chat em navy. Seleção em azul suave.
- Semântica independente já existente: sucesso `--green-soft/--green-ink`, rascunho/alerta `--yellow-soft/--yellow-ink`, erro `--danger/--danger-soft`, informação/voz azul, controles desabilitados neutros.
- Foco duplicado entre raiz, workspace, chat e fallback indefinido `--cbb-blue`. Consolidar no token existente `--focus`, sem alterar espessura/offset.
- Fundos claros e sidebar equilibrados: preservar. Geist Sans/Serif e escalas: preservar.
- A folha documental herda tokens da plataforma. Evitar alteração silenciosa de documentos: fixar exclusivamente cores anteriores no contexto `.document-sheet`, preservando o JSX, conteúdo, template, snapshot e hash.
- Azul da última palavra da saudação é preferência explícita anterior do usuário: preservar. Indicadores de informação/voz também continuam azuis.

## Evidências anteriores

Nove capturas: sete telas desktop 1440 px e duas amostras mobile 390 px; perfil profissional inspecionado sem captura adicional. Dez observações axe WCAG 2 A/AA e 2.1 AA sem violações nos escopos avaliados. Somente usuários/atletas/documentos fictícios de fixtures, removidos ao finalizar.

As capturas foram geradas em Chromium headless, sem abrir janela visível. Não foi realizada homologação manual em navegador visível.

## Decisão

Reutilizar `--cbb-*`; remover overrides de marca divergentes; centralizar estados de interação; separar marca e semântica; manter fundos existentes. Off-white é referência e verde vibrante é reservado, sem uso funcional. As mudanças ficam limitadas a três folhas CSS, infraestrutura de verificação e documentação.
