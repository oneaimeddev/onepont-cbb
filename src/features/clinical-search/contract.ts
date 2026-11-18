import { z } from "zod";
export const activityLabels = {
  evolution: "Evolução clínica",
  prescription: "Prescrição médica",
  surgical_order: "Pedido cirúrgico",
  exam_request: "Solicitação de exame",
  attachment_result: "Resultado/laudo anexado",
} as const;
export type ActivityKind = keyof typeof activityLabels;
export const activityFilterSchema = z
  .object({
    kinds: z
      .array(
        z.enum([
          "evolution",
          "prescription",
          "surgical_order",
          "exam_request",
          "attachment_result",
        ]),
      )
      .min(1)
      .max(5),
    period: z
      .enum([
        "all",
        "today",
        "yesterday",
        "last_days",
        "this_month",
        "last_months",
        "range",
      ])
      .default("all"),
    days: z.number().int().min(1).max(365).optional(),
    months: z.number().int().min(1).max(60).optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    category: z.string().trim().max(120).optional(),
    club: z.string().trim().max(120).optional(),
    division: z.string().trim().max(80).optional(),
    modality: z.string().trim().max(40).optional(),
    specialty: z.string().trim().max(80).optional(),
    status: z
      .enum(["", "draft", "ready_for_review", "finalized", "ready"])
      .optional(),
    sort: z.enum(["newest", "oldest", "name"]).default("newest"),
  })
  .strict();
export type ActivityFilters = z.infer<typeof activityFilterSchema>;
export type ClinicalSearchBoard = { filters: ActivityFilters; page: number };
export type ActivitySource = {
  id: string;
  kind: ActivityKind;
  title: string;
  occurred_on: string;
  date_basis: "clinical" | "created" | "document" | "upload";
  created_on: string | null;
  document_on: string | null;
  status: string;
  specialty: string;
};
export type ActivityAthlete = {
  athlete_id: string;
  name: string;
  category: string | null;
  club: string | null;
  division: string | null;
  modality: string | null;
  matched_records: number;
  newest: string;
  oldest: string;
  kinds: Partial<Record<ActivityKind, number>>;
  sources: ActivitySource[];
};
export type ActivityResult = {
  filters: ActivityFilters;
  today: string;
  timezone: string;
  total: number;
  matched_records: number;
  page: number;
  page_size: 5;
  source_page: number;
  items: ActivityAthlete[];
};
const boardSchema = z
  .object({
    filters: activityFilterSchema,
    page: z.number().int().min(1).max(20000),
  })
  .strict();
export function clinicalSearchBoard(
  value: unknown,
): ClinicalSearchBoard | null {
  const parsed = boardSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function previousClinicalSearch(
  turns: { role: string; clinicalSearch?: ClinicalSearchBoard | null }[],
) {
  return (
    [...turns].reverse().find((turn) => turn.role === "assistant")
      ?.clinicalSearch ?? null
  );
}
export function activityScope(filters: ActivityFilters) {
  const types = filters.kinds
    .map((kind) => activityLabels[kind].toLocaleLowerCase("pt-BR"))
    .join("; ");
  const sports = [
    filters.category && `categoria ${filters.category}`,
    filters.club && `clube/equipe ${filters.club}`,
    filters.division,
    filters.modality,
    filters.specialty && `especialidade ${filters.specialty}`,
    filters.status && `status ${filters.status}`,
  ]
    .filter(Boolean)
    .join(", ");
  return `Atletas autorizados com ${types}${filters.from && filters.to ? `, de ${filters.from} a ${filters.to}` : ""}${sports ? `. Filtros: ${sports}` : ""}.`;
}
export const dateBasisLabels = {
  clinical: "Data clínica registrada",
  created: "Data de criação",
  document: "Data do documento anexado",
  upload: "Data de upload (data do documento ausente)",
};
export const examNotice =
  "Solicitações e resultados/laudos anexados são categorias distintas. Nenhuma delas, isoladamente, confirma que o exame foi realizado. O conteúdo dos anexos não foi interpretado.";
