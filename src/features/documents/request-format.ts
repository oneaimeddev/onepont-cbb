// Exam and surgical requests in the usual Brazilian layout, built only from the professional's
// field values: exams grouped by type and numbered ("Solicito:"), each with region and side on
// the same line; clinical indication, diagnostic hypothesis and priority below. Empty fields are
// omitted, never invented.
import type { DocumentKind, ExamContent, ExamType, Laterality, Priority, SurgicalContent } from "./content.ts";

export type RequestLine = { number: number; title: string; details: string[] };
export type RequestGroup = { heading: string; lines: RequestLine[] };
export type RequestSection = { label: string; value: string };

const groupHeadings: Record<ExamType, string> = {
  laboratory: "EXAMES LABORATORIAIS",
  imaging: "EXAMES DE IMAGEM",
  other: "OUTROS EXAMES",
  "": "EXAMES",
};
const groupOrder: ExamType[] = ["laboratory", "imaging", "other", ""];

const sideText: Record<Laterality, string> = {
  "": "",
  left: "lado esquerdo",
  right: "lado direito",
  bilateral: "bilateral",
  not_applicable: "",
};

const priorityText: Record<Priority, string> = { "": "", elective: "Eletivo", priority: "Prioritário", urgent: "Urgente" };

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/** "Ressonância magnética — joelho, lado direito". */
export function requestTitle(name: string, region: string, laterality: Laterality, fallback: string) {
  const place = [clean(region), sideText[laterality]].filter(Boolean).join(", ");
  return [clean(name) || fallback, place].filter(Boolean).join(" — ");
}

export function examRequestFormat(content: ExamContent) {
  let number = 0;
  const groups: RequestGroup[] = [];
  for (const type of groupOrder) {
    const items = content.items.filter((item) => item.exam_type === type);
    if (!items.length) continue;
    groups.push({
      heading: groupHeadings[type],
      lines: items.map((item) => {
        number += 1;
        return {
          number,
          title: requestTitle(item.name, item.region, item.laterality, `Exame ${number}`),
          details: [clean(item.technical_details), clean(item.notes)].filter(Boolean),
        };
      }),
    });
  }
  // A single untyped group needs no heading of its own.
  if (groups.length === 1 && groups[0].heading === groupHeadings[""]) groups[0].heading = "";
  const sections: RequestSection[] = [
    { label: "Indicação clínica", value: content.indication.trim() },
    { label: "Hipótese diagnóstica", value: content.diagnosis.trim() },
    { label: "Justificativa", value: content.justification.trim() },
    { label: "Orientações ao paciente", value: content.additional.trim() },
  ].filter((section) => section.value);
  return { title: "SOLICITAÇÃO DE EXAMES", groups, sections, priority: priorityText[content.priority] };
}

export function surgicalRequestFormat(content: SurgicalContent) {
  const sections: RequestSection[] = [
    { label: "Diagnóstico / hipótese diagnóstica", value: content.diagnosis.trim() },
    { label: "Indicação clínica", value: content.indication.trim() },
    { label: "Justificativa", value: content.justification.trim() },
    { label: "Materiais especiais (OPME)", value: content.materials.trim() },
    { label: "Informações complementares", value: content.additional.trim() },
  ].filter((section) => section.value);
  return {
    title: "SOLICITAÇÃO DE PROCEDIMENTO CIRÚRGICO",
    procedure: requestTitle(content.procedure, content.region, content.laterality, "Procedimento não informado"),
    sections,
    priority: priorityText[content.priority],
  };
}

const longDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Closing date written out, as at the end of a medical document: "23 de novembro de 2026". */
export function requestDate(value: string) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-03:00`) : new Date(value);
  return Number.isNaN(day.getTime()) ? "" : longDate.format(day);
}

/** Title printed on the paper for each document type; certificates carry their own variant. */
export function paperTitle(kind: DocumentKind, letterTitle?: string) {
  if (letterTitle) return letterTitle;
  return { prescription: "RECEITUÁRIO", exam_request: "SOLICITAÇÃO DE EXAMES", surgical_order: "SOLICITAÇÃO DE PROCEDIMENTO CIRÚRGICO", certificate: "ATESTADO MÉDICO", referral: "ENCAMINHAMENTO" }[kind];
}
