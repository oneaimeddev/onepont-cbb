# 0024. Relatório de consulta detalhado ou sintético no chat

Pedido do responsável pelo produto em 23/11/2026.

## Decisão

Quando o profissional envia ao CBB Intelligence a transcrição ou o relato de uma consulta, digitado ou ditado, o agente usa `offerConsultationReport` em vez de redigir a evolução. A ferramenta confere o acesso ao atleta (`agent_clinical_draft_prepare`) e devolve um cartão no estado `choose`, que guarda a transcrição. O cartão oferece dois botões:

- **Relatório detalhado:** 11 seções numeradas: identificação, queixa principal, HDA, antecedentes, exame físico, hipóteses com CID-10, diferenciais por especialidade, exames (solicitados e a considerar), conduta, orientações, e retorno com pontos a confirmar.
- **Relatório sintético:** no máximo 1 página (cerca de 300 palavras), até 2 hipóteses, sem diferenciais extensos e exames em 2 a 4 linhas.

A escolha chama a ação de servidor `generateConsultationReport`, que valida a sessão, o perfil e o acesso ao atleta, gera o texto pelo modelo do agente (`src/features/clinical/consultation-report.ts`) e registra uma proposta com `clinical_draft_proposal_register`. O cartão vira a proposta de evolução de sempre: o profissional revisa, edita e confirma para salvar o rascunho. Depois, finaliza pelo fluxo existente.

## Prompt universal e persona

Todo relatório gerado (o do chat e a evolução da consulta gravada) usa o modelo definido pelo responsável pelo produto, em `src/features/clinical/consultation-prompt.ts`:

- **System:** "Você é um assistente clínico especializado. Gere um relatório direcionado a um(a) [profissão] do Clube Paineiras do Morumby. Foque especificamente em: [foco]. Escreva em português claro, técnico e prático, com no máximo 400 palavras, em seções curtas. Não repita informações irrelevantes para essa profissão." Abaixo dele vêm as salvaguardas clínicas e, no chat, as regras de objetividade e a estrutura do modo.
- **User:** "Paciente / Diagnóstico / Conteúdo clínico disponível / Elabore o relatório direcionado ao(à) [profissão]."

Personas e focos: médico(a) do esporte, enfermeiro(a), fisioterapeuta esportivo(a), nutricionista esportivo(a) e psicólogo(a) do esporte, com os focos do anexo. Para outras profissões, a persona é montada a partir do título do perfil. Medicina propõe hipóteses com CID-10. As demais profissões descrevem a avaliação da própria área e citam CID-10 só quando um diagnóstico médico constar no conteúdo.

O modo detalhado tem até 400 palavras. Cada seção cumpre uma finalidade sem repetir as outras e sem reproduzir o diálogo. Seções vazias recebem "Não abordado", e os dados relevantes que não foram tratados na consulta aparecem em tópicos curtos só na seção 11. O sintético tem até 250 palavras.

## Salvaguardas

Hipóteses, diferenciais e exames a considerar são marcados como sugestões para validação do profissional. Conduta, orientações e retorno registram só o que foi dito. Nada é gravado antes da confirmação no cartão. O cartão `choose`, como as demais propostas, fica apenas no navegador e não entra no histórico salvo.

## Limites

O campo de mensagem e o agente passaram a aceitar até 12.000 caracteres, o suficiente para cerca de 10 minutos de consulta transcrita. O histórico salvo continua guardando até 4.000 caracteres por mensagem, e o cartão leva a transcrição completa até a geração.
