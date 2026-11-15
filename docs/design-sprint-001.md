# Design sprint 001

A Home CBB Intelligence foi aprovada e passou a ser a entrada autenticada do produto, em `/`.

## O que entrou

Faixa de ícones com o escudo oficial, saudação, título e campo no centro. As ações rápidas abrem as rotas que já existiam: atletas, evolução e prontuários. A conta mostra o profissional autenticado, a auditoria só aparece para quem tem permissão, e a saída continua no servidor.

O título usa Geist Serif Regular. Navegação, saudação, campo, ações e textos operacionais usam Geist Sans. O assistente segue indisponível: mensagem, anexo, voz e envio não disparam ação.

O contexto `/?atleta=` continua abrindo o atleta autorizado, com os mesmos vínculos para perfil, evolução e timeline.

## O que ficou de fora

A Proposta B (Athlete OS), o laboratório em `/design-lab` e as comparações com Manrope e Plus Jakarta Sans não entram no produto. As demais rotas — atletas, prontuário, evolução e auditoria — permanecem no shell anterior, com autenticação, permissões e auditoria inalteradas.
