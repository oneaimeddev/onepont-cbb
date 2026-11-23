# 0024. Relatório de consulta detalhado ou sintético no chat

Pedido do responsável pelo produto em 23/11/2026.

## Decisão

Quando o profissional envia ao CBB Intelligence a transcrição ou o relato de uma consulta, digitado ou ditado, o agente usa `offerConsultationReport` em vez de redigir a evolução. A ferramenta confere o acesso ao atleta (`agent_clinical_draft_prepare`) e devolve um cartão no estado `choose`, que guarda a transcrição. O cartão oferece dois botões:

- **Relatório detalhado:** 11 seções numeradas: identificação, queixa principal, HDA, antecedentes, exame físico, hipóteses com CID-10, diferenciais por especialidade, exames (solicitados e a considerar), conduta, orientações, e retorno com pontos a confirmar.
- **Relatório sintético:** no máximo 1 página (cerca de 300 palavras), até 2 hipóteses, sem diferenciais extensos e exames em 2 a 4 linhas.

A escolha chama a ação de servidor `generateConsultationReport`, que valida a sessão, o perfil e o acesso ao atleta, gera o texto pelo modelo do agente (`src/features/clinical/consultation-report.ts`) e registra uma proposta com `clinical_draft_proposal_register`. O cartão vira a proposta de evolução de sempre: o profissional revisa, edita e confirma para salvar o rascunho. Depois, finaliza pelo fluxo existente.

## Prompt universal e persona

Todo relatório gerado (o do chat e a evolução da consulta gravada) usa o modelo definido pelo responsável pelo produto, em `src/features/clinical/consultation-prompt.ts`:

- **System:** "Você é um assistente clínico especializado. Gere um relatório direcionado a um(a) [profissão] da Confederação Brasileira de Basketball (CBB). Foque especificamente em: [foco]. Escreva em português claro, técnico e prático, com no máximo 400 palavras, em seções curtas. Não repita informações irrelevantes para essa profissão." Abaixo dele vêm as salvaguardas clínicas e, no chat, as regras de objetividade e a estrutura do modo.
- **User:** "Paciente / Diagnóstico / Conteúdo clínico disponível / Elabore o relatório direcionado ao(à) [profissão]." Sem diagnóstico documentado, o campo pede que ele seja indicado a partir do contexto clínico da consulta, como hipótese.

Personas e focos: médico(a) do esporte, enfermeiro(a), fisioterapeuta esportivo(a), nutricionista esportivo(a) e psicólogo(a) do esporte, com os focos do anexo. Para outras profissões, a persona é montada a partir do título do perfil. Medicina propõe hipóteses com CID-10. As demais profissões descrevem a avaliação da própria área e citam CID-10 só quando um diagnóstico médico constar no conteúdo.

O modo detalhado tem até 400 palavras. Cada seção cumpre uma finalidade sem repetir as outras e sem reproduzir o diálogo. Seções vazias recebem "Não abordado", e os dados relevantes que não foram tratados na consulta aparecem em tópicos curtos só na seção 11. O sintético tem até 250 palavras.

## Formato do relatório

O formato segue o relatório de referência aprovado pelo responsável pelo produto. O sistema monta o cabeçalho, sem passar pelo modelo:

- "RELATÓRIO [MÉDICO | DE ENFERMAGEM | FISIOTERAPÊUTICO | NUTRICIONAL | PSICOLÓGICO] - CONSULTA", com a data de geração no horário de Brasília e um separador;
- "1. IDENTIFICAÇÃO DO PACIENTE", com dados do cadastro do atleta: nome e idade, data de nascimento, ID CBB e categoria ou equipe. O documento de identidade continua oculto, como em todo o fluxo de leitura do cadastro.

O modelo escreve a partir da seção 2, com seções numeradas em maiúsculas, linhas "Campo: valor", itens com "•", diagnóstico no padrão "• Nome (termo técnico) — CID-10: código" e conduta em itens que começam com verbo no infinitivo.

- **Sintético:** 2. DATA DA CONSULTA, 3. QUEIXA PRINCIPAL, 4. RESUMO CLÍNICO, 5. DIAGNÓSTICO PRINCIPAL, 6. CONDUTA, 7. RETORNO.
- **Detalhado:** 2. DATA DA CONSULTA, 3. QUEIXA PRINCIPAL, 4. HISTÓRIA DA DOENÇA ATUAL, 5. EXAME FÍSICO, 6. HIPÓTESES DIAGNÓSTICAS, 7. DIAGNÓSTICOS DIFERENCIAIS, 8. EXAMES COMPLEMENTARES, 9. CONDUTA, 10. ORIENTAÇÕES, 11. RETORNO.

Lacunas relevantes aparecem numa frase sutil do resumo ou da HDA, sem seção própria. Com informação limitada, o relatório indica o diagnóstico mais provável, com CID-10 compatível com o grau de certeza, e propõe conduta e retorno em termos gerais, sem citar medicamentos, doses ou exames que não constem na consulta.

## Salvaguardas

Diagnóstico, conduta e retorno indicados a partir do contexto são propostas para validação do profissional. O relatório não inventa fatos: queixas, antecedentes, achados, resultados, datas, medicamentos ou doses que não constem na consulta. Nada é gravado antes da confirmação no cartão. O cartão `choose`, como as demais propostas, fica apenas no navegador e não entra no histórico salvo.

## Limites

O campo de mensagem e o agente passaram a aceitar até 12.000 caracteres, o suficiente para cerca de 10 minutos de consulta transcrita. O histórico salvo continua guardando até 4.000 caracteres por mensagem, e o cartão leva a transcrição completa até a geração.

## Áudio de consulta anexado

Uma consulta gravada em outro aparelho pode ser anexada ao chat pelo botão "Áudio da consulta", com um atleta em contexto. O fluxo:

1. **Preparo no navegador:** o arquivo (MP3, M4A, WAV, OGG ou WebM, até 200 MB e 90 minutos) é decodificado, convertido para 16 kHz mono e dividido em trechos de até 50 s, cortados nos silêncios. O arquivo não sai do aparelho e só os trechos são enviados.
2. **Transcrição:** os trechos vão a `POST /api/inteligencia/ditado?modo=consulta`, três por vez, com uma nova tentativa automática por trecho. Esse modo usa uma instrução própria para diálogo, com falas marcadas como "Profissional:" e "Atleta:", e tem limite próprio de 150 trechos a cada 10 minutos.
3. **Falha:** se um trecho falhar, os já transcritos são mantidos e "Tentar novamente" reenvia só os que faltam.
4. **Cartão:** a transcrição completa não passa pelo campo de mensagem. `offerConsultationFromAudio` confere o acesso ao atleta e abre direto o cartão de escolha do relatório.

O cartão aceita transcrições de até 60.000 caracteres, cerca de uma hora de fala.
