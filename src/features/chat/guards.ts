export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AthleteSearch = { ids: string[]; total: number };

export function decideAthleteAccess(
  requestedId: string,
  contextAthleteId: string | null,
  searches: AthleteSearch[],
): "allow" | "confirm" | "reject" {
  if (!uuidPattern.test(requestedId)) return "reject";
  if (contextAthleteId && requestedId === contextAthleteId) return "allow";
  const hits = searches.filter((search) => search.ids.includes(requestedId));
  if (hits.length === 0) return "reject";
  if (hits.some((search) => search.total === 1 && search.ids.length === 1)) return "allow";
  return "confirm";
}

export function athleteProfilePath(id: string) {
  if (!uuidPattern.test(id)) return null;
  return `/atletas/${id}`;
}

export type PresentedAthlete = { id: string; name: string; facts: string[] };

export function presentedAthletes(value: unknown): PresentedAthlete[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !uuidPattern.test(row.id)) return [];
    if (typeof row.name !== "string" || !row.name.trim()) return [];
    const facts = Array.isArray(row.facts) ? row.facts.filter((fact): fact is string => typeof fact === "string").slice(0, 4) : [];
    return [{ id: row.id, name: row.name.trim(), facts }];
  });
}

export function presentedNavigation(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.href !== "string") return null;
  const href = athleteProfilePath(row.id);
  if (!href || row.href !== href) return null;
  return { id: row.id, href, name: row.name.trim() };
}
