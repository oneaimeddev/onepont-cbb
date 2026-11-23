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

export const directoryPageSize = 5;

export type PresentedAthlete = {
  id: string;
  name: string;
  facts: string[];
  category?: string;
  division?: string;
  club?: string;
};

export type DirectoryFilters = {
  q?: string;
  category?: string;
  division?: string;
  modality?: string;
  club?: string;
  gender?: string;
  status?: "active" | "inactive";
};

export type PresentedSearch = {
  total: number;
  page: number;
  pageSize: number;
  filters: DirectoryFilters;
};

export const genders = ["feminino", "masculino", "nao_binario", "outro"] as const;

const filterLimits = { q: 160, category: 80, division: 80, modality: 40, club: 120, gender: 20, status: 20 } as const;

function boundedInteger(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function label(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const next = value.trim().slice(0, max);
  return next || undefined;
}

export function athleteCardLine(athlete: PresentedAthlete) {
  const parts = [athlete.category, athlete.division, athlete.club].filter((item): item is string => Boolean(item));
  return parts.length > 0 ? parts.join(" · ") : athlete.facts.join(" · ");
}

export function compactDirectoryReply(total: number, shown: number) {
  const count = Math.max(0, Math.trunc(total));
  const visible = Math.min(count, Math.max(0, Math.trunc(shown)));
  if (count === 0) return "Não encontrei atletas autorizados para essa busca.";
  if (count === 1) return "Encontrei 1 atleta autorizado.";
  if (visible >= count) return `Encontrei ${count} atletas autorizados.`;
  return `Encontrei ${count} atletas autorizados. Os primeiros ${visible} aparecem abaixo.`;
}

export function directoryFilters(value: unknown): DirectoryFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const filters: DirectoryFilters = {};
  for (const key of Object.keys(row)) {
    if (!(key in filterLimits)) return null;
  }
  for (const key of Object.keys(filterLimits) as (keyof typeof filterLimits)[]) {
    const item = row[key];
    if (item == null || item === "") continue;
    if (typeof item !== "string") return null;
    const trimmed = item.trim().slice(0, filterLimits[key]);
    if (!trimmed) continue;
    if (key === "status") {
      if (trimmed !== "active" && trimmed !== "inactive") return null;
      filters.status = trimmed;
    } else if (key === "gender") {
      if (!genders.includes(trimmed as (typeof genders)[number])) return null;
      filters.gender = trimmed;
    } else {
      filters[key] = trimmed;
    }
  }
  return filters;
}

export function presentedSearch(value: unknown): PresentedSearch | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const total = boundedInteger(row.total, 0, 100000);
  const page = boundedInteger(row.page, 1, 40);
  const pageSize = boundedInteger(row.pageSize, 1, 25);
  const filters = directoryFilters(row.filters);
  if (total === null || page === null || pageSize === null || !filters) return null;
  return { total, page, pageSize, filters };
}

export function presentedAthletes(value: unknown): PresentedAthlete[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !uuidPattern.test(row.id) || seen.has(row.id)) return [];
    if (typeof row.name !== "string" || !row.name.trim()) return [];
    seen.add(row.id);
    const facts = Array.isArray(row.facts) ? row.facts.filter((fact): fact is string => typeof fact === "string").slice(0, 4) : [];
    return [{
      id: row.id,
      name: row.name.trim(),
      facts,
      category: label(row.category, 80),
      division: label(row.division, 80),
      club: label(row.club, 120),
    }];
  });
}

export function athletesFromDirectory(value: unknown): PresentedAthlete[] {
  if (!Array.isArray(value)) return [];
  return presentedAthletes(value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const social = label(row.social_name, 160);
    const full = label(row.full_name, 160);
    const name = social || full;
    if (!name || typeof row.id !== "string") return [];
    const sport = Array.isArray(row.sports) ? row.sports[0] as Record<string, unknown> | undefined : undefined;
    const category = label(sport?.category, 80);
    const division = label(sport?.division, 80);
    const modality = label(sport?.modality, 40);
    const club = label(sport?.club, 120) ?? label(row.team, 120);
    const facts = [category, division, modality, club].filter((item): item is string => Boolean(item)).slice(0, 4);
    return [{ id: row.id, name, facts, category, division, club }];
  }));
}

export function presentedContext(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !uuidPattern.test(row.id) || typeof row.name !== "string" || !row.name.trim()) return null;
  return { id: row.id, name: row.name.trim() };
}

export function presentedNavigation(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.href !== "string") return null;
  const href = athleteProfilePath(row.id);
  if (!href) return null;
  const target = row.href;
  const capturePath = href + "/evolucao?modo=voz";
  const reviewPrefix = capturePath + "&consulta=";
  const recordPrefix = href + "/evolucao?registro=";
  const valid = target === href || target === href + "?aba=cadastro" || target === capturePath
    || [reviewPrefix, recordPrefix].some((prefix) => target.startsWith(prefix)
      && uuidPattern.test(target.slice(prefix.length)));
  return valid ? { id: row.id, href: target, name: row.name.trim() } : null;
}
