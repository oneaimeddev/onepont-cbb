# 0024. Relatório de consulta detalhado ou sintético no chat

Pedido do responsável pelo produto em 23/11/2026.

## Decisão

Quando o profissional envia ao CBB Intelligence a transcrição ou o relato de uma consulta, digitado ou ditado, o agente usa `offerConsultationReport` em vez de redigir a evolução. A ferramenta confere o acesso ao atleta (`agent_clinical_draft_prepare`) e devolve um cartão no estado `choose`, que guarda a transcrição. O cartão oferece dois botões:

- **Relatório detalhado:** 11 seções numeradas: identificação, queixa principal, HDA, antecedentes, exame físico, hipóteses com CID-10, diferenciais por especialidade, exames (solicitados e a considerar), conduta, orientações, e retorno com pontos a confirmar.
- **Relatório sintético:** no máximo 1 página (cerca de 300 palavras), até 2 hipóteses, sem diferenciais extensos e exames em 2 a 4 linhas.

A escolha chama a ação de servidor `generateConsultationReport`, que valida a sessão, o perfil e o acesso ao atleta, gera o texto pelo modelo do agente (`src/features/clinical/consultation-report.ts`) e registra uma proposta com `clinical_draft_proposal_register`. O cartão vira a proposta de evolução de sempre: o profissional revisa, edita e confirma para salvar o rascunho. Depois, finaliza pelo fluxo existente.

## Perfil profissional

O prompt usa a profissão do perfil autenticado. Medicina propõe hipóteses com CID-10 e diferenciais clínicos. As demais profissões descrevem a avaliação da própria área, citam CID-10 só quando um diagnóstico médico constar na transcrição e apontam o que pede avaliação de outras especialidades. Para profissões fora das cinco especialidades da consulta por voz, o foco é descrito de forma neutra a partir da profissão.

## Salvaguardas

Hipóteses, diferenciais e exames a considerar são marcados como sugestões para validação do profissional. Conduta, orientações e retorno registram só o que foi dito. Nada é gravado antes da confirmação no cartão. O cartão `choose`, como as demais propostas, fica apenas no navegador e não entra no histórico salvo.

## Limites

O campo de mensagem e o agente passaram a aceitar até 12.000 caracteres, o suficiente para cerca de 10 minutos de consulta transcrita. O histórico salvo continua guardando até 4.000 caracteres por mensagem, e o cartão leva a transcrição completa até a geração.
