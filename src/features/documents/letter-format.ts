// Text of medical certificates and referrals in the usual Brazilian wording, built only from the
// professional's field values. Missing values are shown as blanks to be filled, never invented.
import type { CertificateContent, Priority, ReferralContent } from "./content.ts";

export type Letter = {
  title: string;
  recipient: string | null;
  paragraphs: string[];
  sections: { label: string; value: string }[];
  closing: string | null;
};

const blank = "____";

const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** Cardinal in Portuguese words for 1–999, as written in certificates: "3 (três) dias". */
export function numberWords(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 999) return String(value);
  if (value === 100) return "cem";
  const parts: string[] = [];
  const h = Math.floor(value / 100);
  const rest = value % 100;
  if (h) parts.push(hundreds[h]);
  if (rest >= 20) {
    parts.push(rest % 10 ? `${tens[Math.floor(rest / 10)]} e ${units[rest % 10]}` : tens[Math.floor(rest / 10)]);
  } else if (rest) {
    parts.push(units[rest]);
  }
  return parts.join(" e ");
}

export function brazilianDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

const priorityText: Record<Priority, string> = { "": "", elective: "Eletiva", priority: "Prioritária", urgent: "Urgente" };

export function certificateLetter(content: CertificateContent, patient: string): Letter {
  const name = patient.trim() || blank;
  const date = brazilianDate(content.occurred_at) || blank;
  const activities = content.activities.trim().replace(/[.;\s]+$/, "");
  const paragraphs: string[] = [];
  let title = "ATESTADO MÉDICO";
  if (content.certificate_type === "leave") {
    const days = Number(content.leave_days);
    const period = Number.isInteger(days) && days > 0
      ? `${days} (${numberWords(days)}) ${days === 1 ? "dia" : "dias"}`
      : `${blank} dias`;
    const start = brazilianDate(content.leave_start) || date;
    paragraphs.push(`Atesto, para os devidos fins, que ${name} foi atendido(a) em ${date}, necessitando de afastamento de ${activities || "suas atividades"} por ${period}, a partir de ${start}.`);
  } else if (content.certificate_type === "attendance") {
    title = "ATESTADO DE COMPARECIMENTO";
    const period = content.end_time
      ? `das ${content.start_time || blank} às ${content.end_time}`
      : `a partir das ${content.start_time || blank}`;
    paragraphs.push(`Atesto, para os devidos fins, que ${name} esteve em atendimento em ${date}, ${period}.`);
  } else if (content.certificate_type === "fitness") {
    title = "ATESTADO DE APTIDÃO ESPORTIVA";
    const target = activities || "a prática de atividades esportivas";
    const conclusion = content.fitness === "fit" ? `encontra-se apto(a) para ${target}`
      : content.fitness === "fit_with_restrictions" ? `encontra-se apto(a) para ${target}, com as seguintes restrições: ${content.restrictions.trim().replace(/[.;\s]+$/, "") || blank}`
      : content.fitness === "unfit" ? `encontra-se temporariamente inapto(a) para ${target}`
      : `encontra-se ${blank} para ${target}`;
    paragraphs.push(`Atesto, para os devidos fins, que ${name} foi avaliado(a) em ${date} e ${conclusion}.`);
  } else {
    paragraphs.push(`Atesto, para os devidos fins, que ${name} foi atendido(a) em ${date}.`);
  }
  const sections: Letter["sections"] = [];
  if (content.cid.trim() && content.cid_authorized) {
    sections.push({ label: "CID-10", value: `${content.cid.trim()} (informado com autorização expressa do paciente)` });
  }
  if (content.notes.trim()) sections.push({ label: "Observações", value: content.notes.trim() });
  return { title, recipient: null, paragraphs, sections, closing: null };
}

export function referralLetter(content: ReferralContent, patient: string): Letter {
  const name = patient.trim() || blank;
  const specialty = content.specialty.trim() ? content.specialty.trim().charAt(0).toLocaleUpperCase("pt-BR") + content.specialty.trim().slice(1) : "";
  const professional = content.professional.trim();
  const request = content.request.trim() || "avaliação e conduta";
  const diagnosis = [content.diagnosis.trim(), content.cid.trim() ? `CID-10: ${content.cid.trim()}` : ""].filter(Boolean).join(" — ");
  const sections = [
    { label: "Motivo do encaminhamento", value: content.reason.trim() },
    { label: "Resumo clínico", value: content.clinical_summary.trim() },
    { label: "Hipótese diagnóstica", value: diagnosis },
    { label: "Exames realizados", value: content.exams.trim() },
    { label: "Tratamentos realizados", value: content.treatment.trim() },
    { label: "Prioridade", value: priorityText[content.priority] },
  ].filter((section) => section.value);
  return {
    title: "ENCAMINHAMENTO",
    recipient: professional
      ? `Ao(À) ${professional}${specialty ? ` — ${specialty}` : ""}`
      : `Ao serviço de ${specialty || blank}`,
    paragraphs: [`Encaminho o(a) paciente ${name} para ${request}.`],
    sections,
    closing: "Atenciosamente,",
  };
}
