import type { AttachmentBoard } from "./types";
export function attachmentIntent(message: string, hasRoster = false) {
  const text = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const subject =
    /\b(anexos?|arquivos?|laudos?)\b|imagem de acompanhamento|documentos?.*(enviad|adicionad|anex)/.test(
      text,
    );
  const opening = /\b(abr[aei]|abra|mostre|visualiz|veja|ver)\b/.test(text);
  const ordinal = text.match(
    /\b(primeiro|segundo|terceiro|quarto|quinto|[1-9]\d?)\b/,
  );
  if (!subject && !(hasRoster && opening && ordinal)) return null;
  const numbers: Record<string, number> = {
    primeiro: 1,
    segundo: 2,
    terceiro: 3,
    quarto: 4,
    quinto: 5,
  };
  return {
    open: opening && !/\b(quais|todos|liste|listar)\b/.test(text),
    ordinal: ordinal ? (numbers[ordinal[1]] ?? Number(ordinal[1])) : null,
    latest: /\b(ultimo|recente)\b/.test(text),
    category: /laudo|ressonancia|tomografia/.test(text)
      ? "imaging_report"
      : /laboratorial|hemograma/.test(text)
        ? "laboratory"
        : /imagem/.test(text)
          ? "clinical_image"
          : "",
  };
}
export function attachmentRoster(
  turns: { attachments?: AttachmentBoard | null }[],
  athlete: string | null,
) {
  const board = [...turns]
    .reverse()
    .find((turn) => turn.attachments?.athleteId === athlete)?.attachments;
  return board?.ids ?? [];
}

export type UploadRequest = { category: string; documentDate: string | null; title: string };

const uploadCategories: [RegExp, string][] = [
  [/\b(laboratori|hemograma|sangue|urina|bioquimic|glicemia|ferritina|vitamina|hormon|ck\b|cpk|lactato|perfil lipidico)/, "laboratory"],
  [/\b(laudo|ressonancia|tomografia|radiografia|raio[ -]?x|rx\b|ultrassom|ultrassonografia|ecografia|densitometria|cintilografia|exame de imagem)/, "imaging_report"],
  [/\b(foto|fotografia|imagem clinica|imagem da lesao|imagem de acompanhamento)/, "clinical_image"],
  [/\b(relatorio medico|relatorio)/, "medical_report"],
  [/\b(complementar|eletrocardiograma|ecg|ecocardiograma|ergometric|ergoespirometri|teste)/, "complementary"],
];

const examTitles: [RegExp, string][] = [
  [/hemograma/, "Hemograma"], [/ressonancia/, "Ressonância magnética"], [/tomografia/, "Tomografia"],
  [/radiografia|raio[ -]?x|\brx\b/, "Radiografia"], [/ultrassom|ultrassonografia|ecografia/, "Ultrassonografia"],
  [/densitometria/, "Densitometria"], [/eletrocardiograma|\becg\b/, "Eletrocardiograma"], [/ecocardiograma/, "Ecocardiograma"],
  [/ergoespirometri/, "Ergoespirometria"], [/ergometric/, "Teste ergométrico"], [/glicemia/, "Glicemia"], [/ferritina/, "Ferritina"],
  [/\bck\b|cpk/, "CK"], [/vitamina d/, "Vitamina D"], [/perfil lipidico/, "Perfil lipídico"],
];

/**
 * A request to attach a file to the athlete's record ("anexe o hemograma de 10/11/2026"). Listing
 * or opening existing attachments is not an upload request. Returns the fields to prefill.
 */
export function uploadRequest(message: string, today = new Date()): UploadRequest | null {
  const text = message.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (text.length > 240) return null;
  // The request starts with the action, optionally after a courtesy ("quero", "pode", "por favor").
  const lead = /^\W*(?:(?:por favor|favor|pode|poderia|preciso|quero|gostaria de|vamos|vou|me ajude a|ajude-me a|agora)\s+)*(?:anex|inclu|adicion|sub|envi|carreg|import|registr|guard|salv)/;
  if (!lead.test(text)) return null;
  if (/\b(quais|liste|listar|mostre|mostrar|abra|abrir|ver|veja|visualiz)/.test(text)) return null;
  const attachVerb = /\b(anex(ar|e|a|o|ei|amos)|anexa-lo|anexa-la)\b/.test(text);
  const otherVerb = /\b(inclu(ir|a|i)|adicion(ar|e|a)|sub(ir|a)|envi(ar|e|o)|carreg(ar|ue)|import(ar|e)|registr(ar|e)|guard(ar|e)|salv(ar|e))\b/.test(text);
  const fileSubject = /\b(anexo|arquivo|pdf|exame|laudo|resultado|imagem|foto|fotografia|documento)/.test(text);
  if (!attachVerb && !(otherVerb && fileSubject && /\b(prontuario|anexo|arquivo|pdf|cadastro|ficha)\b/.test(text))) return null;
  const category = uploadCategories.find(([pattern]) => pattern.test(text))?.[1] ?? "";
  const title = examTitles.find(([pattern]) => pattern.test(text))?.[1] ?? "";
  let documentDate: string | null = null;
  const date = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (date) {
    const day = Number(date[1]);
    const month = Number(date[2]);
    let year = date[3] ? Number(date[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    const value = new Date(Date.UTC(year, month - 1, day));
    if (value.getUTCMonth() === month - 1 && value.getUTCDate() === day && value <= today) {
      documentDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  } else if (/\bhoje\b/.test(text)) {
    documentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(today);
  }
  return { category, documentDate, title };
}
