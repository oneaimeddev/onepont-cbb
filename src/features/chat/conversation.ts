import { uuidPattern } from "./guards";
import { conversationSnapshot, turnsFrom, type ChatTurn } from "./transcript";

export type ConversationView = {
  sessionId: string | null;
  athleteId: string | null;
  messages: ChatTurn[];
  snapshot: string;
};

const emptyView: ConversationView = {
  sessionId: null,
  athleteId: null,
  messages: [],
  snapshot: conversationSnapshot([]),
};

export function parseConversation(value: unknown): ConversationView {
  if (!value || typeof value !== "object") return emptyView;
  const row = value as Record<string, unknown>;
  const session = row.session;
  if (!session || typeof session !== "object") return emptyView;
  const current = session as Record<string, unknown>;
  if (current.status !== "active" || typeof current.id !== "string" || !uuidPattern.test(current.id)) return emptyView;
  const athleteId = typeof current.athleteId === "string" && uuidPattern.test(current.athleteId) ? current.athleteId : null;
  const messages = turnsFrom(JSON.stringify({ v: 1, turns: Array.isArray(row.messages) ? row.messages : [] }));
  return { sessionId: current.id, athleteId, messages, snapshot: conversationSnapshot(messages) };
}

export async function postConversation(body: Record<string, unknown>) {
  const response = await fetch("/api/inteligencia/sessao", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return { ok: response.ok, payload };
}

export function sessionIdFrom(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const session = (payload as { session?: { id?: unknown } }).session;
  if (!session || typeof session.id !== "string" || !uuidPattern.test(session.id)) return null;
  return session.id;
}

export function conversationFailure(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return null;
  const code = (payload as { error?: unknown }).error;
  return typeof code === "string" ? code : null;
}

export type ConversationSummary = {
  id: string;
  preview: string;
  athleteName: string | null;
  lastActivityAt: string;
};

export function parseHistory(value: unknown): ConversationSummary[] {
  if (!value || typeof value !== "object") return [];
  const sessions = (value as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) return [];
  return sessions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !uuidPattern.test(row.id)) return [];
    if (typeof row.preview !== "string" || !row.preview.trim()) return [];
    const athleteName = typeof row.athleteName === "string" && row.athleteName.trim() ? row.athleteName.trim().slice(0, 160) : null;
    const lastActivityAt = typeof row.lastActivityAt === "string" ? row.lastActivityAt : "";
    return [{ id: row.id, preview: row.preview.trim().slice(0, 72), athleteName, lastActivityAt }];
  });
}
