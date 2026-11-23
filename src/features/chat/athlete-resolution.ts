import type { PresentedAthlete } from "./guards";

export type AthleteCommand = "list" | "select" | "open" | "read" | "clear" | "unknown";

const stops = new Set(["de", "do", "da", "dos", "das", "o", "a", "os", "as", "atleta", "atletas"]);

export function foldName(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function nameMatches(value: string, query: string) {
  const needle = foldName(query);
  if (!needle) return true;
  const tokens = needle.split(" ").filter((token) => token.length >= 2 && !stops.has(token));
  if (tokens.length === 0) return false;
  const words = foldName(value).split(" ").filter(Boolean);
  let index = 0;
  for (const token of tokens) {
    let found = false;
    while (index < words.length) {
      const word = words[index];
      index += 1;
      if (word.startsWith(token)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

export function athleteCommand(utterance: string): AthleteCommand {
  const text = foldName(utterance);
  // A long clinical account (a consultation) is not an athlete command, even if it says "histórico".
  if (text.length > 280) return "unknown";
  if (/\b(encerre|encerrar|tire|tira|remova|remover|limpe|limpar)\b/.test(text) && text.includes("contexto")) return "clear";
  if (/\b(abra|abrir|abre)\b/.test(text) && text.includes("prontuario")) return "open";
  if (/\b(busque|busca|buscar|liste|listar|procure|procura|procurar|quais)\b/.test(text)) return "list";
  if (/\blista\b/.test(text) && !/\b(?:da|na|a|essa|esta|nesta|nessa) lista\b/.test(text)) return "list";
  if (/\b(coloque|coloca|colocar|ponha|poe|selecione|seleciona|selecionar|traga|trazer)\b/.test(text)) return "select";
  if (/\b(mostre|mostra|mostrar|informacoes|historico|dados)\b/.test(text)) return "read";
  return "unknown";
}

export type RosterQuery = {
  ordinal?: number;
  reference?: "previous";
  name?: string;
  club?: string;
  category?: string;
  division?: string;
};

export function rosterChoice(slots: (PresentedAthlete | null)[], query: RosterQuery):
  | { status: "one"; athlete: PresentedAthlete }
  | { status: "many"; athletes: PresentedAthlete[] }
  | { status: "none" } {
  if (query.ordinal) {
    const athlete = slots[query.ordinal - 1] ?? null;
    return athlete ? { status: "one", athlete } : { status: "none" };
  }
  const present = slots.flatMap((athlete) => athlete ? [athlete] : []);
  const filtered = present.filter((athlete) => {
    if (query.name && !nameMatches(athlete.name, query.name)) return false;
    if (query.club && !nameMatches(athlete.club ?? "", query.club)) return false;
    if (query.category && foldName(athlete.category ?? "") !== foldName(query.category)) return false;
    if (query.division && foldName(athlete.division ?? "") !== foldName(query.division)) return false;
    return true;
  });
  const narrowed = query.name || query.club || query.category || query.division;
  if (!narrowed && query.reference === "previous") {
    if (present.length === 1) return { status: "one", athlete: present[0] };
    if (present.length === 0) return { status: "none" };
    return { status: "many", athletes: present };
  }
  if (filtered.length === 1) return { status: "one", athlete: filtered[0] };
  if (filtered.length === 0) return { status: "none" };
  return { status: "many", athletes: filtered };
}

export function presentedRoster(turns: { role: string; athletes: { id: string }[] }[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role === "assistant" && turn.athletes.length > 0) return turn.athletes.map((athlete) => athlete.id).slice(0, 40);
  }
  return [];
}

export function rosterPrompt(athletes: (PresentedAthlete | null)[]) {
  const lines = athletes.flatMap((athlete, index) => {
    if (!athlete) return [];
    const place = [athlete.club, athlete.category, athlete.division].filter(Boolean).join(", ");
    return [`${index + 1}. ${athlete.name}${place ? ` (${place})` : ""}`];
  });
  if (lines.length === 0) return "";
  return `Lista recém-apresentada nesta conversa, nesta ordem:\n${lines.join("\n")}\nO ordinal 1 é o primeiro. Não use atletas de outra conversa.`;
}
