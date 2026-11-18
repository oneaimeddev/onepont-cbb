import "server-only";
import { supabaseServer } from "../../lib/supabase";
import { foldName } from "./athlete-resolution";
import { athletesFromDirectory, uuidPattern, type PresentedAthlete } from "./guards";
import { buildAnalysis, collectHistory, historyItem, historyRequest, resolveHistoryScope, type HistoryAnalysis, type HistoryItem, type HistoryPage, type HistoryScope } from "./history-analysis";

const reply = {
  denied: "Não tenho acesso aos registros desse atleta.",
  none: "Não encontrei um atleta autorizado com esse nome.",
  choose: "Encontrei mais de um atleta. Escolha quem deve ser analisado.",
  missing: "Selecione o atleta ou diga o nome de quem deve ser analisado.",
  failed: "Não consegui consultar o histórico. Nada do que faltou entra na conclusão.",
  sources: "As fontes estão nos cartões da análise. Cada uma abre o registro original.",
  noSources: "Ainda não há uma análise nesta conversa.",
};

function pageFrom(value: unknown): HistoryPage | { error: "denied" | "invalid" | "failed" } {
  if (!value || typeof value !== "object") return { error: "failed" };
  const row = value as Record<string, unknown>;
  if (row.error === "denied" || row.error === "invalid") return { error: row.error };
  if (row.error) return { error: "failed" };
  const records = Array.isArray(row.records) ? row.records.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const parsed = historyItem({
      id: entry.id,
      kind: entry.kind,
      clinicalAt: typeof entry.clinical_at === "string" ? entry.clinical_at.slice(0, 10) : "",
      createdAt: typeof entry.created_at === "string" ? entry.created_at : "",
      updatedAt: typeof entry.updated_at === "string" ? entry.updated_at : "",
      specialty: entry.specialty,
      authorName: entry.author_name,
      status: entry.status,
      version: entry.version,
      title: entry.title,
    });
    return parsed ? [parsed] : [];
  }) : [];
  return {
    total: typeof row.total === "number" ? row.total : records.length,
    documentsIncluded: row.documents_included === true,
    athleteName: typeof row.athlete_name === "string" ? row.athlete_name : "",
    records,
  };
}

export function historyScope(value: unknown): HistoryScope | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const athleteId = typeof row.athleteId === "string" ? row.athleteId : "";
  const kinds = Array.isArray(row.kinds) ? row.kinds.flatMap((item) => item === "evolution" || item === "prescription" || item === "surgical_order" || item === "exam_request" ? [item] : []) : [];
  if (!uuidPattern.test(athleteId) || kinds.length === 0) return null;
  const from = typeof row.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.from) ? row.from : "";
  const to = typeof row.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.to) ? row.to : "";
  return {
    athleteId,
    athleteName: typeof row.athleteName === "string" ? row.athleteName.slice(0, 160) : "",
    from,
    to,
    unbounded: row.unbounded === true,
    periodLabel: typeof row.periodLabel === "string" ? row.periodLabel.slice(0, 120) : "",
    specialties: Array.isArray(row.specialties) ? row.specialties.flatMap((item) => typeof item === "string" ? [item.slice(0, 40)] : []).slice(0, 4) : [],
    kinds,
  };
}

export async function readLongitudinalHistory(input: {
  utterance: string;
  contextAthleteId: string | null;
  previous: HistoryScope | null;
  inputMode: "text" | "voice";
  channel: "chat" | "agent";
  signal?: AbortSignal;
  clock?: Date;
}): Promise<{ analysis: HistoryAnalysis | null; athletes: PresentedAthlete[]; text: string }> {
  const clock = input.clock ?? new Date();
  const asked = historyRequest(input.utterance, new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock));
  if (asked.command === "unknown") return { analysis: null, athletes: [], text: reply.missing };
  if (asked.command === "sources") return { analysis: null, athletes: [], text: input.previous ? reply.sources : reply.noSources };
  const client = await supabaseServer();
  let athlete: { id: string; name: string } | null = input.contextAthleteId && uuidPattern.test(input.contextAthleteId) ? { id: input.contextAthleteId, name: "" } : null;
  let athletes: PresentedAthlete[] = [];
  if (asked.name) {
    const { data, error } = await client.rpc("agent_athlete_directory", { filters: { q: asked.name, page: "1", page_size: "5" } });
    if (error || !data) return { analysis: null, athletes: [], text: reply.failed };
    athletes = athletesFromDirectory(data.athletes);
    const total = typeof data.total === "number" ? data.total : athletes.length;
    if (total === 0 || athletes.length === 0) return { analysis: null, athletes: [], text: reply.none };
    if (total !== 1 || athletes.length !== 1) return { analysis: null, athletes, text: reply.choose };
    athlete = { id: athletes[0].id, name: athletes[0].name };
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock);
  const scope = resolveHistoryScope(asked, input.previous, athlete, today);
  if (!scope) return { analysis: null, athletes: [], text: reply.missing };
  const filters = {
    from: scope.from,
    to: scope.to,
    kinds: scope.kinds.join(","),
    specialties: scope.specialties.map((item) => foldName(item).replace(/[^a-z]/g, "")).filter(Boolean).join(","),
    page_size: "20",
  };
  let denied = false;
  const collected = await collectHistory(async (page) => {
    if (input.signal?.aborted) return null;
    const { data, error } = input.channel === "agent"
      ? await client.rpc("agent_history_page", { target: scope.athleteId, filters: { ...filters, page: String(page) } })
      : await client.rpc("chat_history_page", { target: scope.athleteId, filters: { ...filters, page: String(page) }, mode: input.inputMode === "voice" ? "voice" : "text" });
    if (error) return null;
    const pageData = pageFrom(data);
    if ("error" in pageData) {
      if (pageData.error === "denied") denied = true;
      return null;
    }
    return pageData;
  }, input.signal);
  if (denied && collected.records.length === 0) return { analysis: null, athletes: [], text: reply.denied };
  const analysis = buildAnalysis(scope, collected, asked.asksChange, clock.toISOString());
  return { analysis, athletes: [], text: analysis.summary };
}

export function modelHistory(analysis: HistoryAnalysis) {
  const sources: { id: string; kind: HistoryItem["kind"]; clinicalAt: string }[] = [];
  for (const item of analysis.items) sources.push({ id: item.id, kind: item.kind, clinicalAt: item.clinicalAt });
  return {
    status: analysis.complete ? "complete" as const : "partial" as const,
    examined: analysis.examined,
    period: analysis.periodLabel,
    athleteId: analysis.athleteId,
    sources,
  };
}
