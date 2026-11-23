import { foldName, nameMatches } from "./athlete-resolution";
import { uuidPattern } from "./guards";
import { documentKinds, type DocumentKind } from "../documents/content";

function asDocumentKind(value: unknown): DocumentKind | null {
  return typeof value === "string" && Object.hasOwn(documentKinds, value) ? value as DocumentKind : null;
}

export type ReadingKind = DocumentKind | "evolution";
export type ReadingSource = "document" | "evolution";

export type ReadingRef = {
  id: string;
  athleteId: string;
  kind: ReadingKind;
  open: boolean;
};

export type ReadingBoard = {
  source: ReadingSource;
  athleteId: string;
  total: number;
  page: number;
  pageSize: number;
  kind: DocumentKind | "";
  status: "draft" | "ready_for_review" | "";
  items: ReadingRef[];
};

export type DocumentSlot = {
  id: string;
  kind: DocumentKind;
  label: string;
  status: "draft" | "ready_for_review";
  updatedAt: string;
};

export type DocumentQuery = {
  ordinal?: number;
  kind?: DocumentKind;
  months?: number;
  latest?: boolean;
  reference?: "previous" | "created";
  name?: string;
};

export type DocumentRequest = {
  command: "list" | "read" | "unknown";
  query: DocumentQuery;
};

const ordinals: Record<string, number> = {
  primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3,
  quarto: 4, quarta: 4, quinto: 5, quinta: 5,
};

export function examFollowUp(utterance: string) {
  return /\b(adicione|adicionar|inclua|incluir|tambem|justificativa|orient)/.test(foldName(utterance));
}

export function documentRequest(utterance: string): DocumentRequest {
  const text = foldName(utterance);
  const ordinal = ordinals[text.split(" ").find((word) => ordinals[word]) ?? ""] ;
  const latest = /\bultim[oa]\b/.test(text);
  const created = /acabamos de (salvar|criar)/.test(text) || /\brecem\b/.test(text);
  const previous = /\b(dele|dela)\b/.test(text) || /\b(esse|essa|este|esta|desse|dessa)\b(?! atleta)/.test(text);
  const prescription = /\bprescric/.test(text);
  const exam = /\bexames?\b|\bhemograma\b|\bressonancia\b|\bradiografia\b|\bultrasson|\bsolicitac/.test(text);
  const certificate = /\batestados?\b/.test(text);
  const referral = /\bencaminhamentos?\b/.test(text);
  const surgical = /\bcirurg/.test(text) || (!exam && !certificate && !referral && /\bpedidos?\b/.test(text));
  const named = [prescription, surgical, exam, certificate, referral].filter(Boolean).length;
  const kind: DocumentKind | undefined = named === 1
    ? prescription ? "prescription" : surgical ? "surgical_order" : exam ? "exam_request" : certificate ? "certificate" : "referral"
    : undefined;
  const months = /\bultim[oa]s? (tres|3) meses\b/.test(text) ? 3 : undefined;
  const plural = /\b(documentos|prescricoes|pedidos|exames|atestados|encaminhamentos)\b/.test(text);
  const asksList = /\b(quais|liste|listar|lista|busque|buscar)\b/.test(text);
  const asksRead = /\b(abra|abrir|abre|leia|ler|traga|trazer)\b/.test(text) || /\bquero ler\b/.test(text) || /\bjustificativa\b/.test(text);
  let command: DocumentRequest["command"] = "unknown";
  if (asksRead || latest || ordinal || created || (previous && (kind || /\b(documento|pedido|prescricao|atestado|encaminhamento)\b/.test(text)))) command = "read";
  else if ((asksList || (/\b(mostre|mostra|mostrar)\b/.test(text) && plural)) && !ordinal && !latest) command = "list";
  else if (/\b(mostre|mostra|mostrar)\b/.test(text) && kind) command = "read";
  return {
    command,
    query: {
      ordinal: ordinal || undefined,
      kind,
      latest: latest || undefined,
      months,
      reference: created ? "created" : previous ? "previous" : undefined,
    },
  };
}

export function documentChoice(slots: (DocumentSlot | null)[], query: DocumentQuery):
  | { status: "one"; document: DocumentSlot }
  | { status: "many"; documents: DocumentSlot[] }
  | { status: "none" } {
  if (query.ordinal) {
    const slot = slots[query.ordinal - 1] ?? null;
    if (!slot || (query.kind && slot.kind !== query.kind)) return { status: "none" };
    return { status: "one", document: slot };
  }
  const present = slots.flatMap((slot) => slot ? [slot] : []);
  const filtered = present.filter((slot) => {
    if (query.kind && slot.kind !== query.kind) return false;
    if (query.name && !nameMatches(slot.label, query.name)) return false;
    return true;
  });
  if (query.latest) {
    const slot = filtered[0];
    return slot ? { status: "one", document: slot } : { status: "none" };
  }
  if (filtered.length === 1) return { status: "one", document: filtered[0] };
  if (filtered.length === 0) return { status: "none" };
  return { status: "many", documents: filtered };
}

export function modelDocumentSummary(slot: Pick<DocumentSlot, "id" | "kind" | "status" | "updatedAt">) {
  return { id: slot.id, kind: slot.kind, status: slot.status, updatedAt: slot.updatedAt };
}

export function presentedDocumentRoster(turns: { role: string; readings: ReadingBoard | null }[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role === "assistant" && turn.readings && turn.readings.items.length > 0) {
      return turn.readings.items.map((item) => item.id).slice(0, 20);
    }
  }
  return [];
}

export function createdDocumentIds(turns: { document: { state: string; documentId: string | null } | null }[]) {
  const ids: string[] = [];
  for (const turn of turns) {
    const id = turn.document?.state === "saved" ? turn.document.documentId : null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(-8);
}

function boardNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function presentedReadings(value: unknown): ReadingBoard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.source !== "document" && row.source !== "evolution") return null;
  if (typeof row.athleteId !== "string" || !uuidPattern.test(row.athleteId)) return null;
  if (!Array.isArray(row.items)) return null;
  const items = row.items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== "string" || !uuidPattern.test(entry.id)) return [];
    if (typeof entry.athleteId !== "string" || !uuidPattern.test(entry.athleteId)) return [];
    const kind: ReadingKind | null = entry.kind === "evolution" ? "evolution" : asDocumentKind(entry.kind);
    if (!kind) return [];
    if (row.source === "document" && kind === "evolution") return [];
    if (row.source === "evolution" && kind !== "evolution") return [];
    const ref: ReadingRef = { id: entry.id, athleteId: entry.athleteId, kind, open: entry.open === true };
    return [ref];
  }).slice(0, 8);
  if (items.length === 0) return null;
  const kind = asDocumentKind(row.kind) ?? "";
  const status = row.status === "draft" || row.status === "ready_for_review" ? row.status : "";
  return {
    source: row.source,
    athleteId: row.athleteId,
    total: boardNumber(row.total, items.length, 100000, items.length),
    page: boardNumber(row.page, 1, 40, 1),
    pageSize: boardNumber(row.pageSize, 1, 8, 5),
    kind,
    status,
    items,
  };
}
