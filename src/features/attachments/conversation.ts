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

const uploadCategoryIds = ["laboratory", "imaging_report", "clinical_image", "medical_report", "complementary", "other"];

/** The attachment form prefill sent by the assistant, validated before opening the form. */
export function presentedUpload(value: unknown): UploadRequest | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim().slice(0, 160) : "";
  const category = typeof row.category === "string" && uploadCategoryIds.includes(row.category) ? row.category : "";
  const documentDate = typeof row.documentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.documentDate) ? row.documentDate : null;
  return { title, category, documentDate };
}
