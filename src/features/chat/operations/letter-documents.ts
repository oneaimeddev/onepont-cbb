// Chat creation of certificates and referrals. The model proposes the fields, and every value is
// kept only when the professional said it in this message: free text must appear in the message,
// numbers and times must have been said, and the ICD-10 code needs an explicit authorization.
// Anything not grounded is left blank and listed as pending in the card.
import type { CertificateContent, Fitness, Priority, ReferralContent } from "../../documents/content";
import { foldName, nameMatches } from "../athlete-resolution";

const fold = (value: string) => foldName(value).replace(/[^\p{L}\p{N}/:]+/gu, " ").replace(/\s+/g, " ").trim();

/** True when the folded value appears in the folded message (at least two characters). */
function said(message: string, value: string) {
  const needle = fold(value);
  return needle.length >= 2 && ` ${fold(message)} `.includes(` ${needle} `);
}

function keep(message: string, value: string) {
  const clean = value.trim();
  return clean && said(message, clean) ? clean : "";
}

export function letterDocumentRequested(kind: "certificate" | "referral", message: string) {
  const plain = fold(message);
  if (/\b(nao|caso|talvez|altere|alterar|troque|mude|modifique)\b/.test(plain.split(/[;\n]/)[0])) return false;
  // A request may also be just the document name: "Atestado de 7 dias", "Encaminhamento para ortopedia".
  const startsWithName = kind === "certificate" ? /^atestado\b/.test(plain) : /^encaminhamento\b/.test(plain);
  const wants = startsWithName || /\b(crie|criar|prepare|preparar|elabore|elaborar|emita|emitir|faca|fazer|gere|gerar|quero|preciso|nova|novo|encaminhe|encaminhar|atestar|ateste)\b/.test(plain);
  const mentions = kind === "certificate" ? /\batestado\b|\bateste\b|\batestar\b/.test(plain) : /\bencaminh/.test(plain);
  return wants && mentions;
}

const numberWords: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, vinte: 20, trinta: 30, sessenta: 60, noventa: 90,
};

function saidNumber(message: string, value: number) {
  const plain = fold(message);
  if (new RegExp(`\\b${value}\\b`).test(plain)) return true;
  return Object.entries(numberWords).some(([word, number]) => number === value && new RegExp(`\\b${word}\\b`).test(plain));
}

function saidTime(message: string, value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = match[2];
  const plain = fold(message);
  const hours = [String(hour), String(hour).padStart(2, "0")];
  return hours.some((h) => plain.includes(`${h}:${minute}`) || (minute === "00" && new RegExp(`\\b${h} ?(h|hs|horas?)\\b`).test(plain))
    || new RegExp(`\\b${h} ?h ?${minute}\\b`).test(plain));
}

function saoPauloToday(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

/** A date is kept when the message says "hoje" for today's date or names its day and month. */
function saidDate(message: string, value: string, today: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const plain = fold(message);
  if (value === today && /\bhoje\b/.test(plain)) return true;
  const day = String(Number(match[3]));
  const month = String(Number(match[2]));
  return new RegExp(`\\b0?${day}/0?${month}\\b`).test(plain);
}

function certificateTypeFrom(message: string): CertificateContent["certificate_type"] {
  const plain = fold(message);
  const attendance = /\bcompare(ceu|cimento)|\bpresenca\b/.test(plain);
  const fitness = /\bapt[oa]s?\b|\baptidao\b|\binapt|\bliberad[oa]\b|\bliberacao\b/.test(plain);
  // "Atestado de 7 dias" is a leave certificate when nothing points to attendance or fitness.
  const leave = /\bafast|\brepouso\b|\bdispensa/.test(plain)
    || (!attendance && !fitness && /\b(\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta) dias?\b/.test(plain));
  const hits = [leave, attendance, fitness].filter(Boolean).length;
  if (hits !== 1) return "";
  return leave ? "leave" : attendance ? "attendance" : "fitness";
}

function fitnessFrom(message: string): Fitness {
  const plain = fold(message);
  if (/\binapt/.test(plain)) return "unfit";
  if (/\brestric/.test(plain)) return "fit_with_restrictions";
  if (/\bapt[oa]s?\b|\bliberad[oa]\b|\bliberacao\b/.test(plain)) return "fit";
  return "";
}

export function groundCertificate(proposed: Partial<CertificateContent>, message: string, now = new Date()): CertificateContent {
  const today = saoPauloToday(now);
  const type = certificateTypeFrom(message);
  const days = Number(proposed.leave_days ?? "");
  const cid = keep(message, proposed.cid ?? "");
  const date = (value: string | undefined) => (value && saidDate(message, value, today) ? value : "");
  const fitness = type === "fitness" ? fitnessFrom(message) : "";
  return {
    certificate_type: type,
    // The certificate is issued now: without another date in the message, the consultation is today's.
    occurred_at: date(proposed.occurred_at) || today,
    start_time: type === "attendance" && proposed.start_time && saidTime(message, proposed.start_time) ? proposed.start_time : "",
    end_time: type === "attendance" && proposed.end_time && saidTime(message, proposed.end_time) ? proposed.end_time : "",
    leave_days: type === "leave" && Number.isInteger(days) && days >= 1 && days <= 365 && saidNumber(message, days) ? String(days) : "",
    leave_start: type === "leave" ? date(proposed.leave_start) : "",
    activities: type === "attendance" ? "" : keep(message, proposed.activities ?? ""),
    fitness,
    restrictions: fitness === "fit_with_restrictions" ? keep(message, proposed.restrictions ?? "") : "",
    cid,
    cid_authorized: Boolean(cid) && /\bautoriz/.test(fold(message)),
    notes: keep(message, proposed.notes ?? ""),
  };
}

const priorityWords: [RegExp, Priority][] = [[/\burgent/, "urgent"], [/\bprioritari/, "priority"], [/\beletiv/, "elective"]];

export function groundReferral(proposed: Partial<ReferralContent>, message: string): ReferralContent {
  const plain = fold(message);
  return {
    specialty: keep(message, proposed.specialty ?? ""),
    professional: keep(message, proposed.professional ?? ""),
    reason: keep(message, proposed.reason ?? ""),
    clinical_summary: keep(message, proposed.clinical_summary ?? ""),
    diagnosis: keep(message, proposed.diagnosis ?? ""),
    cid: keep(message, proposed.cid ?? ""),
    exams: keep(message, proposed.exams ?? ""),
    treatment: keep(message, proposed.treatment ?? ""),
    request: keep(message, proposed.request ?? ""),
    priority: priorityWords.find(([pattern]) => pattern.test(plain))?.[1] ?? "",
  };
}

/**
 * The athlete named in the request must be the authorized one. In referrals "para" introduces the
 * destination, so only a name right after the verb is compared ("encaminhe a Lara para ortopedia").
 */
export function letterPatientMatches(kind: "certificate" | "referral", message: string, authorizedName: string) {
  const pattern = kind === "referral"
    ? /\bencaminh\w*\s+(?:(?:o|a)\s+)?(?:(?:atleta|paciente)\s+)?([\p{L}][\p{L}\p{M}' -]{1,80}?)\s+(?:para|ao|a|à)\b/iu
    : /\batestado\b[^.;\n]*?\b(?:para|d[oa])\s+(?:(?:o|a)\s+)?(?:(?:atleta|paciente)\s+)?([\p{L}][\p{L}\p{M}' -]{1,80}?)(?=\s+(?:de|por|com|a partir|hoje)\b|[.,;\n]|$)/iu;
  const name = pattern.exec(message)?.[1]?.trim();
  if (!name) return true;
  const plain = foldName(name);
  if (["ele", "ela", "em contexto", "selecionado", "selecionada"].includes(plain)) return true;
  if (/^(afastamento|comparecimento|aptidao|ortopedia|fisioterapia|cardiologia|nutricao|psicologia|medicina|avaliacao)\b/.test(plain)) return true;
  return nameMatches(authorizedName, name);
}
