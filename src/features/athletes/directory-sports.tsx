import type { SportLink } from "./data";

const keys = ["category", "division", "modality", "club", "national_team"] as const;
const labels = { category: "Categoria", division: "Naipe", modality: "Modalidade", club: "Clube de origem", national_team: "Convocação" };
type Sport = Pick<SportLink, "category" | "division" | "modality" | "club" | "national_team" | "season">;
const identity = (sport: Sport) => JSON.stringify(keys.map((key) => sport[key] ?? "").concat(String(sport.season)));

export function DirectorySports({ sports = [], category, team, filters }: { sports?: Sport[]; category: string | null; team: string | null; filters: Record<string, string> }) {
  if (!sports.length) {
    if (!category && !team) return null;
    return <span className="directory-sports"><span className="directory-sport-note">Informação esportiva legada</span><span className="directory-facts">{category && <span>{category}</span>}{team && <span>{team}</span>}</span></span>;
  }
  // Stable presentation only: never filter/reorder the athletes returned by the RPC.
  const ordered = [...sports].sort((a, b) => identity(a).localeCompare(identity(b), "pt-BR"));
  const active = keys.filter((key) => Boolean(filters[key]));
  // Literal equality is sufficient evidence of a match. Fuzzy/normalized RPC matching
  // is deliberately NOT duplicated here; ambiguous cases show every authorized link.
  const exact = active.length ? ordered.filter((sport) => active.every((key) => sport[key] === filters[key])) : [];
  const shown = active.length ? (exact.length === 1 ? exact : ordered) : ordered.slice(0, 1);
  const other = sports.length - shown.length;
  return <span className="directory-sports">
    {sports.length > 1 && other === 0 && <span className="directory-sport-note">{sports.length} vínculos vigentes</span>}
    {shown.map((sport, index) => <span className="directory-facts" key={`${identity(sport)}:${index}`}>
      {keys.filter((key) => sport[key]).map((key) => <span key={key}><span className="sr-only">{labels[key]}: </span>{sport[key]}</span>)}
    </span>)}
    {other > 0 && <span className="directory-sport-note">Mais {other} {other === 1 ? "vínculo vigente" : "vínculos vigentes"}</span>}
  </span>;
}
