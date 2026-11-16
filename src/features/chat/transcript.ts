import { presentedAthletes, presentedNavigation, type PresentedAthlete } from "./guards";

const storageKey = "cbb-intelligence-turns:v1";
const scrollKey = "cbb-intelligence-scroll:v1";
const maxTurns = 40;

export type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  athletes: PresentedAthlete[];
  navigation: { id: string; href: string; name: string } | null;
};

function storedTurn(value: unknown): ChatTurn | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if ((row.role !== "user" && row.role !== "assistant") || typeof row.id !== "string" || typeof row.text !== "string") return null;
  const text = row.text.slice(0, 4000);
  const athletes = presentedAthletes(row.athletes).slice(0, 25);
  const navigation = presentedNavigation(row.navigation);
  if (row.role === "user" && !text.trim()) return null;
  return { id: row.id.slice(0, 80), role: row.role, text, athletes, navigation };
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
  try {
    return turnsFrom(sessionStorage.getItem(storageKey) ?? "");
  } catch (error) {
    if (error instanceof DOMException) return [];
    throw error;
  }
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

export function turnSnapshot() {
  try {
    return sessionStorage.getItem(storageKey) ?? "";
  } catch (error) {
    if (error instanceof DOMException) return "";
    throw error;
  }
}

export function turnServerSnapshot() {
  return "";
}

export function replaceTurns(turns: ChatTurn[]) {
  saveTurns(turns);
  publish();
}

export function saveTurns(turns: ChatTurn[]) {
  try {
    if (turns.length === 0) {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(scrollKey);
      return;
    }
    const stored = turns.slice(-maxTurns).flatMap((turn) => {
      const next = storedTurn(turn);
      return next ? [next] : [];
    });
    sessionStorage.setItem(storageKey, JSON.stringify({ v: 1, turns: stored }));
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

export function saveScroll(value: number) {
  try {
    sessionStorage.setItem(scrollKey, String(Math.max(0, Math.round(value))));
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}
