import { uuidPattern } from "./guards";

export type ClinicalDraftState = "proposal" | "saving" | "saved" | "finalized" | "error" | "discarded";

export type ClinicalDraft = {
  requestId: string;
  athleteId: string;
  athleteName: string;
  professionalName: string;
  occurredOn: string | null;
  title: string;
  body: string;
  missing: string[];
  restricted: boolean;
  state: ClinicalDraftState;
  recordId: string | null;
  error: string | null;
  contentHash: string | null;
  version: number | null;
};

const states = new Set<ClinicalDraftState>(["proposal", "saved", "finalized", "error", "discarded"]);

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function presentedDraft(value: unknown): ClinicalDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const state = row.state === "saving" ? "proposal" : row.state;
  if (typeof state !== "string" || !states.has(state as ClinicalDraftState)) return null;
  if (typeof row.requestId !== "string" || !uuidPattern.test(row.requestId)) return null;
  if (typeof row.athleteId !== "string" || !uuidPattern.test(row.athleteId)) return null;
  const athleteName = clip(row.athleteName, 160);
  const professionalName = clip(row.professionalName, 160);
  const title = clip(row.title, 160);
  if (!athleteName || !professionalName || !title) return null;
  const body = typeof row.body === "string" ? row.body.slice(0, 20000) : "";
  if ((state === "proposal" || state === "error") && !body.trim()) return null;
  let occurredOn: string | null = null;
  if (typeof row.occurredOn === "string" && row.occurredOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.occurredOn)) return null;
    occurredOn = row.occurredOn;
  }
  const missing = Array.isArray(row.missing)
    ? row.missing.flatMap((item) => {
      const next = clip(item, 160);
      return next ? [next] : [];
    }).slice(0, 8)
    : [];
  const recordId = typeof row.recordId === "string" && uuidPattern.test(row.recordId) ? row.recordId : null;
  if ((state === "saved" || state === "finalized") && !recordId) return null;
  const error = clip(row.error, 200) || null;
  const contentHash = typeof row.contentHash === "string" && /^[0-9a-f]{32}$/.test(row.contentHash) ? row.contentHash : null;
  const version = typeof row.version === "number" && Number.isInteger(row.version) && row.version > 0 && row.version < 1000 ? row.version : null;
  return {
    requestId: row.requestId,
    athleteId: row.athleteId,
    athleteName,
    professionalName,
    occurredOn,
    title,
    body,
    missing,
    restricted: row.restricted !== false,
    state: state as ClinicalDraftState,
    recordId,
    error: state === "error" || state === "saved" ? error : null,
    contentHash,
    version,
  };
}

export function draftSaveMessage(code: string) {
  if (code === "unapproved") return "A gravação precisa da sua confirmação.";
  if (code === "denied") return "Você não tem permissão para gravar esta evolução.";
  if (code === "reused") return "Esta confirmação não corresponde ao conteúdo revisado.";
  if (code === "invalid") return "Não foi possível validar a proposta. Confira o título, o texto e a data.";
  if (code === "ambiguous") return "A frase não identifica uma única proposta. Confirme no cartão.";
  if (code === "modified") return "A proposta foi alterada. Salve pelo cartão para gravar esta versão.";
  return "Não foi possível salvar agora. Tente novamente.";
}
