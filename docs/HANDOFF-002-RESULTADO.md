# Entrega do Handoff 002

## Escopo implementado

P0 concluído com shell compartilhado, início conversacional, composer no rodapé,
navegação integrada e regressão de login/autorização validada.
P1 inclui estados indisponíveis úteis, responsividade e ponto de composição para
painel contextual. A existência de contexto real determinará sua utilização.

## Decisões de UX

- Sidebar única em todas as rotas autenticadas, com chat como primeira entrada.
- Identidade e sessão na navegação, com logout e nome do profissional.
- Boas-vindas alinhadas à área de trabalho e sugestões em uma lista compacta.
- Composer separado do conteúdo e alinhado ao rodapé da conversa.
- Atalhos levam às páginas correspondentes com indisponibilidade explícita.
- Navegação móvel em disclosure no fluxo, com Escape e retorno de foco.
- Painel contextual opcional, ausente quando não há conteúdo.
- Login reutiliza os tokens e a marca aprovados.

## Arquivos principais

| Arquivo | Mudança |
|---|---|
| src/components/workspace-shell.tsx | Sidebar compartilhada, navegação ativa e menu móvel |
| src/components/workspace-area.tsx | Composição do conteúdo e contexto opcional |
| src/features/chat/message-composer.tsx | Entrada e envio em estado indisponível |
| src/app/(workspace)/layout.tsx | Integração do perfil verificado com shell |
| src/app/(workspace)/page.tsx | Estado inicial da conversa e tarefas |
| src/app/(workspace)/[section]/page.tsx | Estado indisponível e retorno ao chat |
| src/app/globals.css | Layout responsivo sobre os tokens existentes |
| src/components/mode-navigation.tsx | Removido ao integrar os destinos na sidebar |
| tests/auth.spec.mjs | Fluxo móvel atualizado com verificações de navegação e composer |
| scripts/capture-ui.mjs | Capturas em quatro larguras e menu aberto |
| DESIGN.md e AGENTS.md | Arquitetura visual e orientação de escopo atualizadas |
| HANDOFF-002.md | Cópia do handoff fornecido |

## Validação

- npm run lint passou.
- npm run typecheck passou.
- npm run build passou.
- npm test passou, com cinco cenários.
- O teste móvel cobre abertura do menu, Escape, retorno de foco, troca de rota,
  menu fechado após navegação, indicação ativa, compositor desabilitado e logout.
- Os testes existentes cobrem API sem sessão, conta sem perfil, auditoria negada,
  leitura de perfil por RLS e bloqueio de elevação de permissão.
- Capturas de login, chat e prontuários em 1440, 768, 390 e 320 px.
- Capturas adicionais do menu em 390 e 320 px.
- Verificação automatizada de overflow horizontal no chat e nos prontuários
  nas quatro larguras.
- Inspeção visual de desktop e mobile. Contas temporárias removidas após a captura.

A versão anterior está em visual/after. As quatorze novas capturas estão
em visual/handoff-002. O login mantém a apresentação aprovada.

## Limitações e próximo handoff

O assistente, a busca clínica, os prontuários e as evoluções seguem indisponíveis.
Envio, Enter/Shift+Enter, streaming, retry, histórico e aprovação terão implementação
funcional quando os contratos e serviços reais existirem. DESIGN.md registra as
distinções entre informação, proposta, aprovação e execução.

O painel contextual está preparado por composição e CSS. Seu uso com dados reais
e controles específicos será validado com a integração do domínio.
As verificações de acessibilidade foram pontuais. Homologação ampla com leitores
de tela permanece pendente.

A próxima prioridade é implementar domínio, vínculos e auditoria transacional
conforme Fases B/C, seguida pelo agente com rascunho e aprovação da Fase D.
