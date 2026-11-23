import { foldName } from "./athlete-resolution";
import { uuidPattern } from "./guards";

export type HistoryKind = "evolution" | "prescription" | "surgical_order" | "exam_request";
export type HistoryReason = "complete" | "empty" | "limit" | "failed" | "cancelled";

export type HistoryItem = {
  id: string;
  kind: HistoryKind;
  clinicalAt: string;
  createdAt: string;
  updatedAt: string;
  specialty: string;
  authorName: string;
  status: string;
  version: number;
  title: string;
  revised: boolean;
};

export type HistoryScope = {
  athleteId: string;
  athleteName: string;
  from: string;
  to: string;
  unbounded: boolean;
  periodLabel: string;
  specialties: string[];
  kinds: HistoryKind[];
};

export type HistoryAnalysis = HistoryScope & {
  complete: boolean;
  reason: HistoryReason;
  examined: number;
  total: number;
  documentsIncluded: boolean;
  counts: Record<HistoryKind, number>;
  gaps: string[];
  notices: string[];
  summary: string;
  items: HistoryItem[];
  analyzedAt: string;
  asksChange: boolean;
};

export type HistoryAsk = {
  command: "analyze" | "follow" | "sources" | "unknown";
  months: number | null;
  unbounded: boolean;
  from: string;
  to: string;
  specialties: string[];
  kinds: HistoryKind[] | null;
  name: string;
  context: boolean;
  asksChange: boolean;
};

export type HistoryPage = {
  total: number;
  documentsIncluded: boolean;
  athleteName: string;
  records: HistoryItem[];
};

const kinds: HistoryKind[] = ["evolution", "prescription", "surgical_order", "exam_request"];
const monthNames = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nameStops = new Set([
  "ultimos", "ultimo", "ultima", "tres", "seis", "doze", "ano", "anos", "meses", "mes", "historico", "clinico", "clinica",
  "joelho", "direito", "esquerdo", "esquerda", "recuperacao", "periodo", "atleta", "atletas", "exame", "exames",
  "prescricao", "prescricoes", "fisioterapia", "medicina", "comeco", "final", "todo", "toda", "tratamento", "tratamentos",
  "lesao", "lesoes", "registro", "registros", "evolucao", "evolucoes", "pedido", "pedidos", "fonte", "fontes",
  "que", "como", "qual", "quais", "quando", "onde", "essa", "esse", "este", "esta", "para", "com", "sem", "nos", "nas",
  "pelo", "pela", "mais", "recente", "somente", "agora", "foram", "teve", "ultima", "ultimas", "informacao", "solicitacao",
  "uma", "umas", "uns", "ele", "ela", "eles", "elas", "dele", "dela", "paciente", "consulta", "queda", "dor", "ombro", "tornozelo",
  ...monthNames,
]);

function dateParts(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function saoPauloDate(clock: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock);
}

function shiftMonths(iso: string, delta: number) {
  const parts = dateParts(iso);
  if (!parts) return iso;
  const cursor = new Date(Date.UTC(parts.year, parts.month - 1 + delta, 1));
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(parts.day, last);
  return new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), day)).toISOString().slice(0, 10);
}

function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function displayDate(iso: string) {
  const parts = dateParts(iso);
  if (!parts) return iso;
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

function monthRange(start: number, end: number, today: string) {
  const parts = dateParts(today);
  if (!parts) return { from: "", to: "" };
  let startYear = parts.year;
  let endYear = parts.year;
  if (end < start) startYear -= 1;
  let to = lastDay(endYear, end);
  if (to > today) {
    startYear -= 1;
    endYear -= 1;
    to = lastDay(endYear, end);
  }
  return { from: `${startYear}-${String(start).padStart(2, "0")}-01`, to };
}

export function historyRequest(utterance: string, today = saoPauloDate(new Date())): HistoryAsk {
  const text = foldName(utterance);
  const sources = /\bde onde veio\b/.test(text) || /\bquais fontes\b/.test(text) || /\bquais registros sustentam\b/.test(text) || /\bfontes sustentam\b/.test(text);
  // "histórico" alone is common in clinical narratives ("histórico de lesão"): it only asks for the
  // longitudinal analysis when it is the object of a request.
  const asksHistory = /\b(analise|analisar)\b/.test(text)
    || /^(o )?historico\b/.test(text)
    || /\b(mostre|mostra|mostrar|veja|ver|consulte|consultar|traga|trazer|abra|abrir|resuma|resumir|resumo|leia|ler|qual e|como esta)\b(?:\s+\S+){0,4}\s+historico\b/.test(text);
  const fresh = asksHistory || /\bcomo evoluiu\b/.test(text) || /\bhouve mudanc/.test(text) || /\bdivergenc/.test(text) || /\bquais lesoes\b/.test(text) || /\bcompare as evolucoes\b/.test(text) || /\bquais tratamentos\b/.test(text) || /\bforam registrados\b/.test(text);
  const follow = /\bfoque\b/.test(text) || /\bamplie\b/.test(text) || /\be quanto\b/.test(text) || /\bnesse periodo\b/.test(text) || /\bo que aconteceu entre\b/.test(text) || /\bcompare o comeco\b/.test(text) || /\bcompare o final\b/.test(text);
  // A long clinical account (a consultation, a dictated case) is not a history command unless it
  // explicitly asks for an analysis; it goes to the assistant as a normal message.
  const narrative = text.length > 280 && !/\b(analise|analisar)\b/.test(text);
  const command = narrative ? "unknown" : sources ? "sources" : fresh ? "analyze" : follow ? "follow" : "unknown";
  const unbounded = /\btodo o historico\b/.test(text) || /\bhistorico completo\b/.test(text) || /\bhistorico autorizado\b/.test(text);
  const months = /\bultim[oa]s? (tres|3) meses\b/.test(text) ? 3 : /\bultim[oa]s? (seis|6) meses\b/.test(text) ? 6 : /\bultim[oa]s? (doze|12) meses\b/.test(text) || /\bultim[oa] ano\b/.test(text) ? 12 : null;
  const start = monthNames.findIndex((name) => new RegExp(`\\bentre ${name}\\b`).test(text));
  const end = monthNames.findIndex((name) => new RegExp(`\\be ${name}\\b`).test(text));
  const range = start >= 0 && end >= 0 ? monthRange(start + 1, end + 1, today) : { from: "", to: "" };
  const specialties = [/\bfisioterap/.test(text) ? "Fisioterapia" : "", /\bmedic/.test(text) ? "Medicina" : ""].filter(Boolean);
  const askedKinds: HistoryKind[] = [];
  if (/\bprescric/.test(text)) askedKinds.push("prescription");
  if (/\bcirurg/.test(text)) askedKinds.push("surgical_order");
  if (/\bexame/.test(text)) askedKinds.push("exam_request");
  const named = text.matchAll(/\b(?:da|do|o|a)\s+([a-z]{3,})\b/g);
  let name = "";
  for (const match of named) {
    if (!nameStops.has(match[1]) && !monthNames.includes(match[1])) {
      name = match[1];
      break;
    }
  }
  return {
    command,
    months: unbounded ? null : months,
    unbounded,
    from: unbounded ? "" : range.from,
    to: unbounded ? "" : range.to,
    specialties,
    kinds: askedKinds.length > 0 ? askedKinds : null,
    name,
    context: /\b(deste atleta|desta atleta|desse atleta|dessa atleta|dele|dela)\b/.test(text),
    asksChange: /\b(divergenc|houve mudanc|mudancas nas queixas)\b/.test(text),
  };
}

export function periodFrom(ask: Pick<HistoryAsk, "months" | "unbounded" | "from" | "to">, previous: HistoryScope | null, command: HistoryAsk["command"], today: string) {
  if (ask.unbounded) return { from: "", to: "", unbounded: true, periodLabel: "todo o histórico autorizado" };
  if (ask.from && ask.to) return { from: ask.from, to: ask.to, unbounded: false, periodLabel: `de ${displayDate(ask.from)} a ${displayDate(ask.to)}` };
  const months = ask.months ?? (command === "follow" && previous && !previous.unbounded ? null : command === "follow" && previous?.unbounded ? null : 12);
  if (months === null && previous) {
    return { from: previous.from, to: previous.to, unbounded: previous.unbounded, periodLabel: previous.periodLabel };
  }
  const count = months ?? 12;
  const from = shiftMonths(today, -count);
  return { from, to: today, unbounded: false, periodLabel: `últimos ${count} meses, de ${displayDate(from)} a ${displayDate(today)}` };
}

export function resolveHistoryScope(ask: HistoryAsk, previous: HistoryScope | null, athlete: { id: string; name: string } | null, today: string): HistoryScope | null {
  if (ask.command !== "analyze" && ask.command !== "follow") return null;
  const owner = ask.name || ask.context || !previous ? athlete : { id: previous.athleteId, name: previous.athleteName };
  if (!owner || !uuidPattern.test(owner.id)) return null;
  const period = periodFrom(ask, ask.command === "follow" ? previous : null, ask.command, today);
  let specialties = ask.specialties;
  let selected = ask.kinds;
  if (previous && (ask.command === "follow" || ask.unbounded)) {
    if (specialties.length === 0) specialties = previous.specialties;
    if (selected === null) selected = previous.kinds;
  }
  if (ask.specialties.length > 0) {
    specialties = ask.specialties;
    selected = ["evolution"];
  }
  if (ask.kinds && ask.kinds.every((kind) => kind !== "evolution")) specialties = [];
  const nextKinds = selected && selected.length > 0 ? selected : kinds;
  return { athleteId: owner.id, athleteName: owner.name.trim().slice(0, 160), ...period, specialties, kinds: nextKinds };
}

export function historyGaps(scope: Pick<HistoryScope, "from" | "to" | "unbounded">, dates: string[]) {
  if (scope.unbounded || !scope.from || !scope.to) return [];
  const seen = new Set(dates.map((value) => value.slice(0, 7)));
  const gaps: string[] = [];
  let cursor = `${scope.from.slice(0, 7)}-01`;
  const end = scope.to.slice(0, 7);
  while (cursor.slice(0, 7) <= end && gaps.length < 12) {
    const key = cursor.slice(0, 7);
    if (!seen.has(key)) {
      const month = monthNames[Number(key.slice(5, 7)) - 1] ?? key;
      gaps.push(`Não há registro autorizado em ${month} de ${key.slice(0, 4)}.`);
    }
    cursor = shiftMonths(cursor, 1);
  }
  return gaps;
}

export function historySummary(input: { athleteName: string; periodLabel: string; examined: number; complete: boolean }) {
  if (input.examined === 0) return `Não há registro autorizado para ${input.athleteName} em ${input.periodLabel}. Isso não significa que nada aconteceu.`;
  const coverage = input.complete ? "A consulta percorreu os registros autorizados desse recorte." : "A consulta não examinou todos os registros autorizados. O que ficou de fora não entra na conclusão.";
  return `Examinei ${input.examined} registros autorizados de ${input.athleteName} em ${input.periodLabel}. ${coverage}`;
}

export function historyNotices(counts: Record<HistoryKind, number>, items: HistoryItem[], asksChange: boolean) {
  const notices = [];
  if (counts.prescription > 0) notices.push("Prescrição registrada não mostra que o medicamento foi utilizado.");
  if (counts.exam_request > 0) notices.push("Solicitação de exame não é um resultado.");
  if (counts.surgical_order > 0) notices.push("Pedido cirúrgico não é uma cirurgia realizada.");
  if (items.some((item) => item.status === "draft")) notices.push("Rascunhos aparecem identificados como rascunho. Eles não são documentos emitidos.");
  if (asksChange) notices.push("Nenhuma divergência foi concluída automaticamente. A sequência dos registros não indica causa.");
  return notices;
}

export async function collectHistory(load: (page: number) => Promise<HistoryPage | null>, signal?: AbortSignal) {
  const seen = new Map<string, HistoryItem>();
  const order: string[] = [];
  let total = 0;
  let documentsIncluded = false;
  let athleteName = "";
  const finish = (complete: boolean, reason: HistoryReason) => ({
    complete,
    reason,
    total,
    documentsIncluded,
    athleteName,
    records: order.flatMap((id) => {
      const item = seen.get(id);
      return item ? [item] : [];
    }),
  });
  for (let page = 1; page <= 10; page += 1) {
    if (signal?.aborted) return finish(false, "cancelled");
    const batch = await load(page);
    if (!batch) return finish(false, signal?.aborted ? "cancelled" : "failed");
    total = batch.total;
    documentsIncluded = batch.documentsIncluded;
    athleteName = batch.athleteName || athleteName;
    const before = seen.size;
    for (const record of batch.records) {
      if (!uuidPattern.test(record.id) || !kinds.includes(record.kind)) continue;
      const previous = seen.get(record.id);
      if (!previous) order.push(record.id);
      seen.set(record.id, { ...record, revised: previous ? previous.revised || previous.version !== record.version : record.revised });
    }
    if (seen.size >= total || batch.records.length === 0) return finish(seen.size >= total, seen.size >= total ? "complete" : "failed");
    if (seen.size === before) return finish(false, "failed");
    if (seen.size >= 200) return finish(false, "limit");
  }
  return finish(seen.size >= total, seen.size >= total ? "complete" : "limit");
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function kindOf(value: unknown): HistoryKind | null {
  return value === "evolution" || value === "prescription" || value === "surgical_order" || value === "exam_request" ? value : null;
}

export function historyItem(value: unknown): HistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id, 80);
  const kind = kindOf(row.kind);
  if (!uuidPattern.test(id) || !kind) return null;
  const version = typeof row.version === "number" && Number.isInteger(row.version) ? row.version : 0;
  return {
    id,
    kind,
    clinicalAt: text(row.clinicalAt, 10),
    createdAt: text(row.createdAt, 40),
    updatedAt: text(row.updatedAt, 40),
    specialty: text(row.specialty, 80),
    authorName: text(row.authorName, 160),
    status: text(row.status, 40),
    version,
    title: text(row.title, 160),
    revised: row.revised === true,
  };
}

export function presentedAnalysis(value: unknown): HistoryAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const athleteId = text(row.athleteId, 80);
  const reason = row.reason === "complete" || row.reason === "empty" || row.reason === "limit" || row.reason === "failed" || row.reason === "cancelled" ? row.reason : null;
  const selected = Array.isArray(row.kinds) ? row.kinds.flatMap((item) => { const kind = kindOf(item); return kind ? [kind] : []; }) : [];
  if (!uuidPattern.test(athleteId) || !reason || selected.length === 0) return null;
  const items = (Array.isArray(row.items) ? row.items : []).slice(0, 200).flatMap((item) => {
    const parsed = historyItem(item);
    return parsed ? [{ ...parsed, title: "" }] : [];
  });
  const counts = { evolution: 0, prescription: 0, surgical_order: 0, exam_request: 0 };
  const rawCounts = row.counts && typeof row.counts === "object" ? row.counts as Record<string, unknown> : {};
  for (const kind of kinds) {
    const count = rawCounts[kind];
    counts[kind] = typeof count === "number" && count >= 0 && count <= 100000 ? Math.floor(count) : items.filter((item) => item.kind === kind).length;
  }
  const examined = typeof row.examined === "number" && row.examined >= 0 ? Math.min(200, Math.floor(row.examined)) : items.length;
  const total = typeof row.total === "number" && row.total >= 0 ? Math.min(100000, Math.floor(row.total)) : examined;
  const complete = row.complete === true && (reason === "complete" || reason === "empty");
  return {
    athleteId,
    athleteName: text(row.athleteName, 160),
    from: /^\d{4}-\d{2}-\d{2}$/.test(text(row.from, 10)) ? text(row.from, 10) : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(text(row.to, 10)) ? text(row.to, 10) : "",
    unbounded: row.unbounded === true,
    periodLabel: text(row.periodLabel, 120),
    specialties: Array.isArray(row.specialties) ? row.specialties.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, 40)] : []).slice(0, 4) : [],
    kinds: selected,
    complete,
    reason: complete && examined === 0 ? "empty" : reason,
    examined,
    total,
    documentsIncluded: row.documentsIncluded === true,
    counts,
    gaps: Array.isArray(row.gaps) ? row.gaps.flatMap((item) => typeof item === "string" ? [item.slice(0, 160)] : []).slice(0, 12) : [],
    notices: Array.isArray(row.notices) ? row.notices.flatMap((item) => typeof item === "string" ? [item.slice(0, 240)] : []).slice(0, 8) : [],
    summary: text(row.summary, 500),
    items,
    analyzedAt: text(row.analyzedAt, 40),
    asksChange: row.asksChange === true,
  };
}

export function buildAnalysis(scope: HistoryScope, collected: Awaited<ReturnType<typeof collectHistory>>, asksChange: boolean, analyzedAt: string): HistoryAnalysis {
  const items = collected.records.map((item) => ({ ...item, title: item.title.slice(0, 160) }));
  const counts = { evolution: 0, prescription: 0, surgical_order: 0, exam_request: 0 };
  for (const item of items) counts[item.kind] += 1;
  const complete = collected.complete;
  const reason: HistoryReason = !complete ? collected.reason : items.length === 0 ? "empty" : "complete";
  const gaps = complete ? historyGaps(scope, items.map((item) => item.clinicalAt)) : [];
  return {
    ...scope,
    athleteName: collected.athleteName || scope.athleteName,
    complete,
    reason,
    examined: items.length,
    total: collected.total,
    documentsIncluded: collected.documentsIncluded,
    counts,
    gaps,
    notices: historyNotices(counts, items, asksChange),
    summary: historySummary({ athleteName: collected.athleteName || scope.athleteName, periodLabel: scope.periodLabel, examined: items.length, complete }),
    items,
    analyzedAt,
    asksChange,
  };
}
