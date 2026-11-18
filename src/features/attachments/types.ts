export const attachmentCategories = {
  laboratory: "Exame laboratorial",
  imaging_report: "Laudo de imagem",
  clinical_image: "Imagem clínica",
  medical_report: "Relatório médico",
  complementary: "Documento complementar",
  other: "Outros",
} as const;
export type Attachment = {
  id: string;
  athlete_id: string;
  title: string;
  description: string;
  category: keyof typeof attachmentCategories;
  document_date: string | null;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  visibility: "author_only";
  created_at: string;
  updated_at: string;
  uploaded_by_name: string;
  record_id: string | null;
  document_id: string | null;
  version: number;
  can_edit?: boolean;
};
export type AttachmentPage = {
  items: Attachment[];
  total: number;
  page: number;
  can_upload: boolean;
};
export type ReferenceOption = { id: string; kind: string; title: string };
export type AttachmentBoard = {
  athleteId: string;
  ids: string[];
  openId?: string | null;
};
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function attachmentBoard(value: unknown): AttachmentBoard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.athleteId !== "string" ||
    !uuid.test(row.athleteId) ||
    !Array.isArray(row.ids)
  )
    return null;
  const ids = row.ids
    .filter((id): id is string => typeof id === "string" && uuid.test(id))
    .slice(0, 25);
  return {
    athleteId: row.athleteId,
    ids,
    openId:
      typeof row.openId === "string" && ids.includes(row.openId)
        ? row.openId
        : null,
  };
}
export const attachmentDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});
export function attachmentWhen(value: string | null) {
  return value
    ? attachmentDate.format(
        new Date(value.length === 10 ? value + "T12:00:00-03:00" : value),
      )
    : "Não informada";
}
