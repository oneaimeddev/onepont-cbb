import "server-only";
import { clinicalSafeguards, professionalFocus, reportUserPrompt, universalSystemPrompt } from "./consultation-prompt";
import type { ReportMode } from "./consultation-report-modes";

// Objective writing for both modes: each section has one purpose and says it once.
const objectivity = [
  "Seja objetivo: cada seção tem uma finalidade e diz apenas o que lhe cabe. Não repita em uma seção o que já está em outra.",
  "Sintetize em linguagem clínica. Não reproduza falas, o diálogo nem a ordem da conversa.",
  "Inclua só o que é relevante para a sua profissão e para o caso.",
  "Quando um dado relevante para o caso não foi abordado na consulta, aponte-o de forma sutil em uma única linha, sem justificar.",
].join("\n");

const structures: Record<ReportMode, string> = {
  detailed: [
    "Modo detalhado: anamnese completa, limpa e estruturada, em até 400 palavras, com estas 11 seções numeradas, nesta ordem:",
    "1. Identificação: atleta, especialidade e data do atendimento, se informada, em uma linha.",
    "2. Queixa principal: em uma frase.",
    "3. História da doença atual: início, mecanismo, evolução e fatores de melhora e piora.",
    "4. Antecedentes relevantes.",
    "5. Exame físico: achados descritos na consulta.",
    "6. Hipóteses diagnósticas com CID-10.",
    "7. Diferenciais por especialidade: cada um com o achado que o sustenta, em uma linha.",
    "8. Exames: solicitados na consulta e a considerar, separados.",
    "9. Conduta: o que foi decidido.",
    "10. Orientações ao atleta.",
    "11. Retorno e pontos a confirmar: retorno combinado e, em tópicos curtos, os dados relevantes não abordados.",
    "Seção sem informação: escreva apenas Não abordado. Liste o que faltou somente na seção 11.",
  ].join("\n"),
  summary: [
    "Modo sintético: no máximo 1 página, até 250 palavras.",
    "Seções, nesta ordem: Identificação (uma linha); Queixa e história (resumo); Exame físico relevante; Diagnóstico (no máximo 2 hipóteses, com CID-10 quando aplicável); Exames (de 2 a 4 linhas); Conduta e orientações; Retorno.",
    "Sem diferenciais extensos: se um for indispensável, cite-o em uma frase dentro de Diagnóstico. Omita seções sem informação.",
  ].join("\n"),
};

function personaRules(specialty: string | null) {
  if (specialty === "Medicina") {
    return "Como médico(a), proponha hipóteses com o código CID-10 correspondente e diferenciais clínicos, indicando quando outra especialidade deve avaliar.";
  }
  return "Formule as hipóteses como avaliação da sua área (diagnóstico fisioterapêutico, nutricional, psicológico, de enfermagem ou funcional). Cite CID-10 somente quando um diagnóstico médico constar no conteúdo. Nos diferenciais, aponte o que merece avaliação médica ou de outras especialidades, sem diagnosticar fora da sua área.";
}

export function buildConsultationReport(mode: ReportMode, input: {
  athlete: string;
  profession: string;
  transcript: string;
  diagnosis?: string;
}) {
  const persona = professionalFocus(input.profession);
  return {
    system: [
      universalSystemPrompt(persona.role, persona.focus),
      clinicalSafeguards,
      personaRules(persona.specialty),
      objectivity,
      structures[mode],
    ].join("\n"),
    prompt: reportUserPrompt({
      patient: input.athlete,
      diagnosis: input.diagnosis,
      content: `transcrição da consulta enviada pelo profissional.\n${input.transcript}`,
      role: persona.role,
    }),
  };
}

/** Removes Markdown the model may still emit, keeping plain section lines for the record. */
export function plainReport(text: string) {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
