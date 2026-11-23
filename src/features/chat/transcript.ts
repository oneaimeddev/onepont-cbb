import { presentedReplies } from "./platform-guide";
import { clinicalSearchBoard, type ClinicalSearchBoard } from "../clinical-search/contract";
import { attachmentBoard, type AttachmentBoard } from "../attachments/types";
import { presentedDraft, type ClinicalDraft } from "./clinical-draft";
import { presentedDocument, storedDocument, type DocumentDraft } from "./document-draft";
import { presentedReadings, type ReadingBoard } from "./document-resolution";
import { presentedAnalysis, type HistoryAnalysis } from "./history-analysis";
import { presentedAthletes, presentedNavigation, presentedSearch, type PresentedAthlete, type PresentedSearch } from "./guards";

const storageKey = "cbb-intelligence-turns:v1";
const scrollKey = "cbb-intelligence-scroll:v1";
const maxTurns = 40;
const emptySnapshot = JSON.stringify({ v: 1, turns: [] });
let activeInDocument = false;
let followServer = true;
let memorySnapshot = emptySnapshot;
let serverSnapshot = emptySnapshot;

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  athletes: PresentedAthlete[];
  navigation: { id: string; href: string; name: string } | null;
  search: PresentedSearch | null;
  draft: ClinicalDraft | null;
  document: DocumentDraft | null;
  readings: ReadingBoard | null;
  attachments?: AttachmentBoard | null;
  clinicalSearch?: ClinicalSearchBoard | null;
  analysis: HistoryAnalysis | null;
  /** Quick replies offered by the assistant, shown as buttons under its latest message. */
  replies?: string[];
};

export function turnCarriesContent(turn: Pick<ChatTurn, "text" | "athletes" | "navigation" | "draft" | "document" | "readings" | "analysis">) {
  return Boolean(turn.text.trim() || turn.athletes.length > 0 || turn.navigation || turn.draft || turn.document || turn.readings || turn.analysis);
}

export function conversationTurn(turn: ChatTurn) {
  const draft = !turn.draft || (turn.draft.state !== "saved" && turn.draft.state !== "finalized") || !turn.draft.recordId
    ? null
    : { ...turn.draft, body: "", missing: [], error: null };
  const document = turn.document ? storedDocument(turn.document) : null;
  return { ...turn, draft, document, analysis: presentedAnalysis(turn.analysis) };
}

// Async callbacks from a card moved/replaced by a newer reply cannot resurrect
// the old card or overwrite a newer displayed revision.
export function updateDocumentTurn(turns: ChatTurn[], turnId: string, document: DocumentDraft, text: string | null) {
  const current = turns.find((turn) => turn.id === turnId)?.document;
  if (!current || current.requestId !== document.requestId || (current.version ?? 0) > (document.version ?? 0)) return turns;
  return turns.map((turn) => turn.id === turnId ? { ...turn, document, text: text ?? turn.text } : turn);
}

function storedTurn(value: unknown): ChatTurn | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if ((row.role !== "user" && row.role !== "assistant") || typeof row.id !== "string" || typeof row.text !== "string") return null;
  const text = row.text.slice(0, 4000);
  const athletes = presentedAthletes(row.athletes).slice(0, 100);
  const navigation = presentedNavigation(row.navigation);
  const search = presentedSearch(row.search);
  const draft = row.role === "assistant" ? presentedDraft(row.draft) : null;
  const document = row.role === "assistant" ? presentedDocument(row.document) : null;
  const readings = row.role === "assistant" ? presentedReadings(row.readings) : null;
  const analysis = row.role === "assistant" ? presentedAnalysis(row.analysis) : null;
  if (row.role === "user" && !text.trim()) return null;
  return { clinicalSearch: row.role === "assistant" ? clinicalSearchBoard(row.clinicalSearch) : null, attachments: row.role === "assistant" ? attachmentBoard(row.attachments) : null, id: row.id.slice(0, 80), role: row.role, text, athletes, navigation, search, draft, document, readings, analysis, replies: row.role === "assistant" ? presentedReplies(row.replies) : [] };
}

export function turnsFrom(raw: string): ChatTurn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; turns?: unknown };
    if (parsed.v !== 1 || !Array.isArray(parsed.turns)) return [];
    return parsed.turns.flatMap((item) => {
      const turn = storedTurn(item);
      return turn ? [turn] : [];
    }).slice(-maxTurns);
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

export function loadTurns(): ChatTurn[] {
  if (!followServer) return turnsFrom(memorySnapshot);
  return turnsFrom(serverSnapshot);
}

const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

export function subscribeTurns(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function transcriptIsActive() {
  return activeInDocument;
}

export function transcriptFollowsServer() {
  return followServer;
}

export function discardInactiveTranscript() {
  if (activeInDocument) return;
  try {
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(scrollKey);
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}

export function conversationSnapshot(turns: ChatTurn[]) {
  const stored = turns.slice(-maxTurns).flatMap((turn) => {
    const next = storedTurn(turn);
    return next ? [next] : [];
  });
  return stored.length === 0 ? emptySnapshot : JSON.stringify({ v: 1, turns: stored });
}

export function rememberServerSnapshot(value: string) {
  serverSnapshot = value || emptySnapshot;
}

export function readConversationSnapshot(propSnapshot: string) {
  return followServer ? propSnapshot || emptySnapshot : memorySnapshot;
}

export function adoptStoredTranscript() {
  let raw = "";
  try {
    raw = sessionStorage.getItem(storageKey) ?? "";
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
  const turns = turnsFrom(raw);
  followServer = false;
  activeInDocument = turns.some((turn) => turn.role === "user");
  memorySnapshot = conversationSnapshot(turns);
  publish();
}

export function replaceTurns(turns: ChatTurn[]) {
  saveTurns(turns);
  publish();
}

export function saveTurns(turns: ChatTurn[]) {
  const snapshot = conversationSnapshot(turns);
  const stored = turnsFrom(snapshot);
  followServer = false;
  activeInDocument = stored.length > 0;
  memorySnapshot = snapshot;
  try {
    if (stored.length === 0) {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(scrollKey);
      return;
    }
    sessionStorage.setItem(storageKey, snapshot);
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}

export function loadScroll() {
  try {
    const raw = sessionStorage.getItem(scrollKey);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("cbb-intelligence-adopt", () => {
    adoptStoredTranscript();
  });
}

export function saveScroll(value: number) {
  try {
    sessionStorage.setItem(scrollKey, String(Math.max(0, Math.round(value))));
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}
