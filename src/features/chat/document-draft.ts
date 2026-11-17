import {
  documentKinds, examPending, prescriptionPending, surgicalPending,
  type DocumentContent, type DocumentKind, type ExamContent, type ExamItem, type ExamType, type Laterality, type MedicationItem, type PrescriptionContent, type Priority, type SurgicalContent,
} from "../documents/content";
import { uuidPattern } from "./guards";

export type DocumentDraftState = "proposal" | "saving" | "saved" | "error" | "discarded";

export type DocumentDraft = {
  requestId: string;
  athleteId: string;
  athleteName: string;
  professionalName: string;
  credentialLabel: string | null;
  kind: DocumentKind;
  title: string;
  content: DocumentContent | null;
  missing: string[];
  state: DocumentDraftState;
  documentId: string | null;
  error: string | null;
  contentHash: string | null;
  version: number | null;
};

const states = new Set<DocumentDraftState>(["proposal", "saved", "error", "discarded"]);
const lateralities = new Set<Laterality>(["", "left", "right", "bilateral", "not_applicable"]);
const priorities = new Set<Priority>(["", "elective", "priority", "urgent"]);
const examTypes = new Set<ExamType>(["", "laboratory", "imaging", "other"]);

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function medication(value: unknown): MedicationItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !uuidPattern.test(row.id)) return null;
  return {
    id: row.id,
    name: clip(row.name, 160),
    presentation: clip(row.presentation, 160),
    dose: clip(row.dose, 160),
    dose_unit: clip(row.dose_unit, 160),
    route: clip(row.route, 160),
    schedule: clip(row.schedule, 160),
    duration: clip(row.duration, 160),
    quantity: clip(row.quantity, 160),
    instructions: clip(row.instructions, 500),
  };
}

export function presentedPrescription(value: unknown): PrescriptionContent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.items) || row.items.length > 12) return null;
  const items = row.items.flatMap((item) => {
    const next = medication(item);
    return next ? [next] : [];
  });
  if (items.length !== row.items.length) return null;
  return { notes: clip(row.notes, 2000), items };
}

export function presentedSurgical(value: unknown): SurgicalContent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const laterality = clip(row.laterality, 20) as Laterality;
  const priority = clip(row.priority, 20) as Priority;
  if (!lateralities.has(laterality) || !priorities.has(priority)) return null;
  return {
    procedure: clip(row.procedure, 200),
    region: clip(row.region, 120),
    laterality,
    indication: clip(row.indication, 2000),
    diagnosis: clip(row.diagnosis, 500),
    justification: clip(row.justification, 2000),
    priority,
    additional: clip(row.additional, 2000),
    materials: clip(row.materials, 1000),
  };
}

function examItem(value: unknown): ExamItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !uuidPattern.test(row.id)) return null;
  const examType = clip(row.exam_type, 20) as ExamType;
  const laterality = clip(row.laterality, 20) as Laterality;
  if (!examTypes.has(examType) || !lateralities.has(laterality)) return null;
  return {
    id: row.id,
    name: clip(row.name, 160),
    exam_type: examType,
    region: clip(row.region, 160),
    laterality,
    technical_details: clip(row.technical_details, 500),
    notes: clip(row.notes, 500),
  };
}

export function presentedExam(value: unknown): ExamContent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.items) || row.items.length > 12) return null;
  const items = row.items.flatMap((item) => {
    const next = examItem(item);
    return next ? [next] : [];
  });
  if (items.length !== row.items.length) return null;
  const priority = clip(row.priority, 20) as Priority;
  const occurred = clip(row.occurred_at, 10);
  if (!priorities.has(priority) || (occurred !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(occurred))) return null;
  return {
    occurred_at: occurred,
    indication: clip(row.indication, 2000),
    justification: clip(row.justification, 2000),
    diagnosis: clip(row.diagnosis, 500),
    priority,
    additional: clip(row.additional, 2000),
    items,
  };
}

export function documentTitle(kind: DocumentKind, content: DocumentContent | null) {
  if (kind === "prescription" && content && "notes" in content) {
    return content.items.find((item) => item.name.trim())?.name.trim() || documentKinds.prescription.title;
  }
  if (kind === "exam_request" && content && "occurred_at" in content) {
    return content.items.find((item) => item.name.trim())?.name.trim() || documentKinds.exam_request.title;
  }
  if (kind === "surgical_order" && content && "procedure" in content && content.procedure.trim()) return content.procedure.trim();
  return documentKinds[kind].title;
}

export function documentMissing(kind: DocumentKind, content: DocumentContent | null) {
  if (!content) return [];
  if (kind === "prescription" && "notes" in content) {
    const pending = prescriptionPending(content);
    return [...pending.blocking, ...pending.groups.flatMap((group) => group.fields.map((field) => `${group.title}: ${field}`))].slice(0, 12);
  }
  if (kind === "exam_request" && "occurred_at" in content) {
    const pending = examPending(content);
    return [...pending.blocking, ...pending.groups.flatMap((group) => group.fields.map((field) => `${group.title}: ${field}`))].slice(0, 12);
  }
  if (kind === "surgical_order" && "procedure" in content) {
    const pending = surgicalPending(content);
    return [...pending.blocking, ...pending.groups.flatMap((group) => group.fields)].slice(0, 12);
  }
  return [];
}

export function presentedDocument(value: unknown): DocumentDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const state = row.state === "saving" ? "proposal" : row.state;
  if (typeof state !== "string" || !states.has(state as DocumentDraftState)) return null;
  if (row.kind !== "prescription" && row.kind !== "surgical_order" && row.kind !== "exam_request") return null;
  if (typeof row.requestId !== "string" || !uuidPattern.test(row.requestId)) return null;
  if (typeof row.athleteId !== "string" || !uuidPattern.test(row.athleteId)) return null;
  const athleteName = clip(row.athleteName, 160);
  const professionalName = clip(row.professionalName, 160);
  if (!athleteName || !professionalName) return null;
  const content = row.kind === "prescription" ? presentedPrescription(row.content) : row.kind === "exam_request" ? presentedExam(row.content) : presentedSurgical(row.content);
  const title = clip(row.title, 160) || (content ? documentTitle(row.kind, content) : "");
  if (!title) return null;
  if ((state === "proposal" || state === "error") && !content) return null;
  const documentId = typeof row.documentId === "string" && uuidPattern.test(row.documentId) ? row.documentId : null;
  if (state === "saved" && !documentId) return null;
  const contentHash = typeof row.contentHash === "string" && /^[0-9a-f]{32}$/.test(row.contentHash) ? row.contentHash : null;
  const version = typeof row.version === "number" && Number.isInteger(row.version) && row.version > 0 && row.version < 1000 ? row.version : null;
  const missing = Array.isArray(row.missing)
    ? row.missing.flatMap((item) => {
      const next = clip(item, 160);
      return next ? [next] : [];
    }).slice(0, 12)
    : content ? documentMissing(row.kind, content) : [];
  return {
    requestId: row.requestId,
    athleteId: row.athleteId,
    athleteName,
    professionalName,
    credentialLabel: clip(row.credentialLabel, 80) || null,
    kind: row.kind,
    title,
    content,
    missing,
    state: state as DocumentDraftState,
    documentId,
    error: state === "error" || state === "saved" ? clip(row.error, 200) || null : null,
    contentHash,
    version,
  };
}

export function storedDocument(document: DocumentDraft): DocumentDraft | null {
  if (document.state !== "saved" || !document.documentId) return null;
  return {
    ...document,
    content: null,
    missing: [],
    error: null,
    contentHash: null,
    credentialLabel: null,
    title: document.title.slice(0, 160),
  };
}

export function documentSaveMessage(code: string) {
  if (code === "unapproved") return "A gravação precisa da sua confirmação.";
  if (code === "denied") return "Você não tem permissão para gravar este documento.";
  if (code === "reused") return "Esta confirmação não corresponde ao documento revisado.";
  if (code === "invalid") return "Não foi possível validar o documento. Confira os campos e tente de novo.";
  if (code === "ambiguous") return "A frase não identifica um único documento. Confirme no cartão.";
  if (code === "modified") return "A proposta foi alterada. Salve pelo cartão para gravar esta versão.";
  return "Não foi possível salvar agora. Tente novamente.";
}

function plain(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function lateralityFrom(value: string): Laterality {
  const word = plain(value);
  if (word === "left" || word === "esquerda" || word === "esquerdo") return "left";
  if (word === "right" || word === "direita" || word === "direito") return "right";
  if (word === "bilateral") return "bilateral";
  if (word === "not_applicable" || word === "nao se aplica") return "not_applicable";
  return "";
}

export function examTypeFrom(value: string): ExamType {
  const word = plain(value);
  if (word === "laboratory" || word === "laboratorial" || word === "laboratorio") return "laboratory";
  if (word === "imaging" || word === "imagem") return "imaging";
  if (word === "other" || word === "outro") return "other";
  return "";
}

export function priorityFrom(value: string): Priority {
  const word = plain(value);
  if (word === "elective" || word === "eletiva") return "elective";
  if (word === "priority" || word === "prioritaria") return "priority";
  if (word === "urgent" || word === "urgente") return "urgent";
  return "";
}

function field(value: string | undefined, max: number) {
  return (value ?? "").trim().slice(0, max);
}

export function prescriptionPayload(notes: string, items: Array<{
  name: string;
  presentation?: string;
  dose?: string;
  dose_unit?: string;
  route?: string;
  schedule?: string;
  duration?: string;
  quantity?: string;
  instructions?: string;
}>): PrescriptionContent {
  return {
    notes: notes.trim().slice(0, 2000),
    items: items.slice(0, 12).map((item) => ({
      id: crypto.randomUUID(),
      name: field(item.name, 160),
      presentation: field(item.presentation, 160),
      dose: field(item.dose, 160),
      dose_unit: field(item.dose_unit, 160),
      route: field(item.route, 160),
      schedule: field(item.schedule, 160),
      duration: field(item.duration, 160),
      quantity: field(item.quantity, 160),
      instructions: field(item.instructions, 500),
    })),
  };
}

export function mergeExamContent(stored: ExamContent, incoming: ExamContent): ExamContent {
  const seen = new Set(stored.items.map((item) => item.name.trim().toLocaleLowerCase("pt-BR")).filter(Boolean));
  return {
    occurred_at: incoming.occurred_at || stored.occurred_at,
    indication: incoming.indication || stored.indication,
    justification: incoming.justification || stored.justification,
    diagnosis: incoming.diagnosis || stored.diagnosis,
    priority: incoming.priority || stored.priority,
    additional: incoming.additional || stored.additional,
    items: [...stored.items, ...incoming.items.filter((item) => item.name.trim() && !seen.has(item.name.trim().toLocaleLowerCase("pt-BR")))].slice(0, 12),
  };
}

export function examPayload(input: {
  occurredOn?: string;
  indication?: string;
  justification?: string;
  diagnosis?: string;
  priority?: string;
  additional?: string;
  items: Array<{
    name: string;
    examType?: string;
    region?: string;
    laterality?: string;
    technicalDetails?: string;
    notes?: string;
  }>;
}): ExamContent {
  const occurred = field(input.occurredOn, 10);
  return {
    occurred_at: /^\d{4}-\d{2}-\d{2}$/.test(occurred) ? occurred : "",
    indication: field(input.indication, 2000),
    justification: field(input.justification, 2000),
    diagnosis: field(input.diagnosis, 500),
    priority: priorityFrom(input.priority ?? ""),
    additional: field(input.additional, 2000),
    items: input.items.slice(0, 12).map((item) => ({
      id: crypto.randomUUID(),
      name: field(item.name, 160),
      exam_type: examTypeFrom(item.examType ?? ""),
      region: field(item.region, 160),
      laterality: lateralityFrom(item.laterality ?? ""),
      technical_details: field(item.technicalDetails, 500),
      notes: field(item.notes, 500),
    })),
  };
}

export function surgicalPayload(input: {
  procedure?: string;
  region?: string;
  laterality?: string;
  indication?: string;
  diagnosis?: string;
  justification?: string;
  priority?: string;
  additional?: string;
  materials?: string;
}): SurgicalContent {
  return {
    procedure: field(input.procedure, 200),
    region: field(input.region, 120),
    laterality: lateralityFrom(input.laterality ?? ""),
    indication: field(input.indication, 2000),
    diagnosis: field(input.diagnosis, 500),
    justification: field(input.justification, 2000),
    priority: priorityFrom(input.priority ?? ""),
    additional: field(input.additional, 2000),
    materials: field(input.materials, 1000),
  };
}
