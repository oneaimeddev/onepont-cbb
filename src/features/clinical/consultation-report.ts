import "server-only";
import { clinicalSafeguards, professionalFocus, reportUserPrompt, universalSystemPrompt } from "./consultation-prompt";
import type { ReportMode } from "./consultation-report-modes";

// Report layout modelled on the reference report approved by the product owner:
//
//   RELATÓRIO MÉDICO - CONSULTA
//   Data de Geração: 18/11/2026, 19:32:02
//   ────────────────────────────────
//   1. IDENTIFICAÇÃO DO PACIENTE      (built from the athlete record, never by the model)
//   2. DATA DA CONSULTA
//   3. QUEIXA PRINCIPAL
//   ...numbered UPPERCASE sections, "Campo: valor" lines, "•" bullets,
//   "• Diagnóstico (termo técnico) — CID-10: código", conduct bullets starting with a verb.

export const reportSeparator = "────────────────────────────────────────────────";

const writing = [
  "Formato obrigatório: texto simples, sem Markdown. Cada seção começa por uma linha com número e título em maiúsculas, como 3. QUEIXA PRINCIPAL, seguida do conteúdo nas linhas abaixo. Deixe uma linha em branco entre seções.",
  "Comece pela seção 2. A identificação do paciente, o título e a data de geração já são inseridos pelo sistema: não os repita.",
  "Itens de lista começam com • e um espaço. Diagnósticos seguem o padrão: • Nome do diagnóstico (termo técnico) — CID-10: código.",
  "Conduta e orientações são itens curtos que começam com verbo no infinitivo (Prescrever, Recomendar, Solicitar, Encaminhar, Orientar, Reavaliar).",
  "Quando a consulta não informar a data, escreva Não informada.",
  "Escreva o resumo como um parágrafo clínico consolidado, sob a perspectiva da sua profissão. Se dados importantes para o caso não foram informados (mecanismo, antecedentes, achados de exame), registre isso de forma sutil em uma única frase dentro do resumo, sem criar seção para lacunas.",
  "Com informação clínica limitada, indique o diagnóstico mais provável a partir do contexto, com o CID-10 compatível com o nível de certeza (por exemplo, um código sintomático), e proponha conduta e retorno coerentes com o quadro, em termos gerais. Não cite nomes de medicamentos, doses ou exames específicos de resultado que não constem no conteúdo; use categorias (por exemplo, analgesia, exames de imagem).",
  "Seja objetivo: cada seção diz apenas o que lhe cabe, sem repetir outra seção e sem reproduzir falas ou a ordem da conversa.",
].join("\n");

const structures: Record<ReportMode, string> = {
  summary: [
    "Modo sintético: no máximo 1 página, até 250 palavras, com exatamente estas seções:",
    "2. DATA DA CONSULTA",
    "3. QUEIXA PRINCIPAL: uma frase curta.",
    "4. RESUMO CLÍNICO: um parágrafo.",
    "5. DIAGNÓSTICO PRINCIPAL: no máximo 2 itens, com CID-10 quando aplicável à sua área. Sem diferenciais extensos.",
    "6. CONDUTA: de 3 a 5 itens; exames entram aqui, em 2 a 4 linhas no total.",
    "7. RETORNO: uma frase.",
  ].join("\n"),
  detailed: [
    "Modo detalhado: até 400 palavras, com exatamente estas seções:",
    "2. DATA DA CONSULTA",
    "3. QUEIXA PRINCIPAL: uma frase curta.",
    "4. HISTÓRIA DA DOENÇA ATUAL: um parágrafo consolidado com início, mecanismo, evolução, fatores de melhora e piora e antecedentes relevantes.",
    "5. EXAME FÍSICO: achados descritos; se não houver, Não descrito na consulta.",
    "6. HIPÓTESES DIAGNÓSTICAS: itens com CID-10, da mais à menos provável.",
    "7. DIAGNÓSTICOS DIFERENCIAIS: itens curtos por especialidade, cada um com o achado ou a dúvida que o justifica.",
    "8. EXAMES COMPLEMENTARES: itens; separe os solicitados na consulta dos indicados para investigação.",
    "9. CONDUTA: itens.",
    "10. ORIENTAÇÕES: itens dirigidos ao atleta.",
    "11. RETORNO: uma ou duas frases, com o critério de reavaliação.",
  ].join("\n"),
};

function personaRules(specialty: string | null) {
  if (specialty === "Medicina") {
    return "Como médico(a), indique diagnósticos com o CID-10 correspondente e diferenciais clínicos, apontando quando outra especialidade deve avaliar.";
  }
  return "Descreva o diagnóstico da sua área (fisioterapêutico, nutricional, psicológico, de enfermagem ou funcional). Cite CID-10 somente quando um diagnóstico médico constar no conteúdo. Nos diferenciais, aponte o que merece avaliação médica ou de outras especialidades, sem diagnosticar fora da sua área. Adapte os títulos de diagnóstico ao padrão da sua profissão mantendo a numeração.";
}

export function buildConsultationReport(mode: ReportMode, input: {
  patient: string;
  profession: string;
  transcript: string;
  diagnosis?: string;
}) {
  const persona = professionalFocus(input.profession);
  return {
    heading: `${persona.heading} - CONSULTA`,
    system: [
      universalSystemPrompt(persona.role, persona.focus),
      clinicalSafeguards,
      personaRules(persona.specialty),
      writing,
      structures[mode],
    ].join("\n"),
    prompt: reportUserPrompt({
      patient: input.patient,
      diagnosis: input.diagnosis,
      content: `transcrição da consulta enviada pelo profissional.\n${input.transcript}`,
      role: persona.role,
    }),
  };
}

/** Identification block filled from the athlete record; values that are absent are stated as such. */
export function identificationSection(athlete: { name: string; birthDate: string | null; cbbId: string | null; category: string | null; team: string | null }, today: Date) {
  let age = "";
  let birth = "Não informada";
  if (athlete.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(athlete.birthDate)) {
    const [year, month, day] = athlete.birthDate.split("-").map(Number);
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(today).split("-").map(Number);
    const years = local[0] - year - (local[1] < month || (local[1] === month && local[2] < day) ? 1 : 0);
    if (years >= 0 && years < 130) age = ` (${years} ${years === 1 ? "ano" : "anos"})`;
    birth = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  }
  return [
    "1. IDENTIFICAÇÃO DO PACIENTE",
    `Nome: ${athlete.name}${age}`,
    `Data de nascimento: ${birth}`,
    `ID CBB: ${athlete.cbbId?.trim() || "Não informado"}`,
    ...(athlete.category || athlete.team ? [`Categoria/Equipe: ${[athlete.category, athlete.team].filter(Boolean).join(" · ")}`] : []),
  ].join("\n");
}

/** Generation timestamp in Brasília time, as in the reference report. */
export function generatedAt(today: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(today);
}

/** Normalises the model output to the reference layout: plain text, • bullets, no Markdown. */
export function plainReport(text: string) {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^1\. IDENTIFICAÇÃO[\s\S]*?(?=^2\. )/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
