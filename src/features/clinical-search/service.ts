import "server-only";
import { supabaseServer } from "../../lib/supabase";
import {
  activityFilterSchema,
  activityScope,
  examNotice,
  type ActivityFilters,
  type ActivityResult,
  type ClinicalSearchBoard,
} from "./contract";
import { clinicalSearchIntent, parseClinicalSearch } from "./intent";
import { presentedAthletes } from "../chat/guards";

export async function queryClinicalActivity(
  filters: ActivityFilters,
  mode: "text" | "voice" = "text",
  origin: "human" | "agent" = "human",
  page = 1,
  athleteId?: string,
  sourcePage = 1,
) {
  const client = await supabaseServer();
  const { data, error } = await client
    .rpc("search_clinical_activity", {
      filters: {
        ...filters,
        page,
        ...(athleteId
          ? { athlete_id: athleteId, source_page: sourcePage }
          : {}),
      },
      mode,
      origin,
    })
    .abortSignal(AbortSignal.timeout(10000));
  if (error || !data || data.error)
    return {
      error:
        data?.error === "specialty"
          ? "Especialidade só está disponível para evoluções."
          : "Não foi possível concluir a busca clínica. Confira os filtros e tente novamente.",
    };
  return { data: data as ActivityResult };
}
export function activityAthletes(data: ActivityResult) {
  return presentedAthletes(
    data.items.map((item) => ({
      id: item.athlete_id,
      name: item.name,
      category: item.category,
      club: item.club,
      division: item.division,
      facts: [item.category, item.club, item.division, item.modality].filter(
        Boolean,
      ),
    })),
  );
}
export async function runClinicalSearch(
  filters: ActivityFilters,
  mode: "text" | "voice" = "text",
  origin: "human" | "agent" = "human",
) {
  const parsed = activityFilterSchema.safeParse(filters);
  if (!parsed.success)
    return {
      text: "Os filtros da busca clínica não são válidos.",
      board: null,
      athletes: [],
      summary: null,
    };
  const result = await queryClinicalActivity(parsed.data, mode, origin);
  if (!result.data)
    return { text: result.error, board: null, athletes: [], summary: null };
  const data = result.data;
  const board: ClinicalSearchBoard = { filters: data.filters, page: 1 };
  return {
    text: `${activityScope(data.filters)} ${data.total} ${data.total === 1 ? "atleta encontrado" : "atletas encontrados"}.${data.filters.kinds.some((k) => k === "exam_request" || k === "attachment_result") ? ` ${examNotice}` : ""}`,
    board,
    athletes: activityAthletes(data),
    summary: {
      total: data.total,
      page: data.page,
      filters: data.filters,
      items: data.items.map((item) => ({
        id: item.athlete_id,
        name: item.name,
        matched_records: item.matched_records,
        kinds: item.kinds,
        date: item.newest,
      })),
      note: "Correspondências de registros autorizados; pedidos e anexos não comprovam realização de exames. O conteúdo clínico e os arquivos não foram enviados.",
    },
  };
}
export async function clinicalSearchConversation(
  message: string,
  previous: ClinicalSearchBoard | null,
  mode: "text" | "voice" = "text",
) {
  if (!clinicalSearchIntent(message, previous)) return null;
  const client = await supabaseServer();
  const catalog = await client.rpc("catalog_list");
  if (catalog.error || !catalog.data)
    return {
      text: "Não foi possível consultar os filtros esportivos.",
      board: null,
      athletes: [],
      summary: null,
    };
  const parsed = parseClinicalSearch(message, previous, catalog.data);
  if (!parsed) return null;
  if (parsed.error)
    return { text: parsed.error, board: null, athletes: [], summary: null };
  return runClinicalSearch(parsed.filters!, mode);
}
