# Revisão do frontend

## Diagnóstico anterior

| Problema | Gravidade | Impacto | Esforço |
|---|---|---|---|
| Marca provisória e paleta sem relação com o ativo enviado | Alta | Identidade institucional | Baixo |
| Ausência de indicação do modo ativo | Média | Orientação entre chat e UI | Baixo |
| Submissão sem feedback de espera | Média | Incerteza no login e logout | Baixo |
| Tipografia e hierarquia pouco diferenciadas | Média | Leitura e consistência | Médio |
| Ausência de atalho ao conteúdo | Média | Navegação por teclado | Baixo |
| Login com layout genérico | Baixa | Reconhecimento do produto | Médio |

## Entrega

Escudo fornecido integrado, paleta medida e tons de interface documentados.
Barlow local, tokens compartilhados e login responsivo.
Navegação selecionada, sidebar consistente, atalhos mais compactos.
Feedback de envio, foco visível, alvos de toque e link ao conteúdo.
Na inspeção móvel foi corrigida uma regra CSS que atingia o texto do botão Sair.
Autenticação e autorização foram verificadas pelos testes existentes.

## Evidências

Doze capturas mostram login, chat e prontuários em desktop e celular, antes e
depois. Consulte visual/before e visual/after nesta pasta.

Lint, TypeScript e build passaram. Os cinco testes de integração passaram
contra Supabase local, com contas fictícias temporárias removidas ao final.

## Limites e próximos passos

- Os módulos clínicos e o agente ainda aguardam as próximas fases do handoff.
- A avaliação de teclado e contraste desta entrega é pontual. A homologação
  completa WCAG 2.2 AA e com leitores de tela permanece pendente.
- Confirmar com a CBB a versão do escudo fornecido e os tons derivados.
- Confirmar a licença da skill web-design-guidelines.
- Ao implementar busca e prontuário, priorizar estados vazios, erro recuperável,
  listas legíveis e contexto do atleta.
- Ao implementar o agente, priorizar rascunho revisável, aprovação e autoria.

Verificações adicionais concluídas no Chromium

- Ordem de foco no login por Tab, incluindo e-mail, senha e botão.
- Mensagem de erro após credenciais inválidas.
- Ausência de overflow horizontal no chat e prontuários nas duas larguras.
- Contraste calculado de branco sobre verde de ação, 5,04:1.
- Contraste de texto secundário sobre fundo claro, 5,58:1.
- Contraste de texto principal sobre branco, 14,20:1.
