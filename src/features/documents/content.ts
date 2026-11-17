export type DocumentKind = "prescription" | "surgical_order" | "exam_request";
export type DocumentStatus = "draft" | "ready_for_review";
export type Laterality = "" | "left" | "right" | "bilateral" | "not_applicable";
export type Priority = "" | "elective" | "priority" | "urgent";
export type ExamType = "" | "laboratory" | "imaging" | "other";

export type MedicationItem = {
  id: string;
  name: string;
  presentation: string;
  dose: string;
  dose_unit: string;
  route: string;
  schedule: string;
  duration: string;
  quantity: string;
  instructions: string;
};

export type PrescriptionContent = { notes: string; items: MedicationItem[] };

export type SurgicalContent = {
  procedure: string;
  region: string;
  laterality: Laterality;
  indication: string;
  diagnosis: string;
  justification: string;
  priority: Priority;
  additional: string;
  materials: string;
};

export type ExamItem = {
  id: string;
  name: string;
  exam_type: ExamType;
  region: string;
  laterality: Laterality;
  technical_details: string;
  notes: string;
};

export type ExamContent = {
  occurred_at: string;
  indication: string;
  justification: string;
  diagnosis: string;
  priority: Priority;
  additional: string;
  items: ExamItem[];
};

export type DocumentContent = PrescriptionContent | SurgicalContent | ExamContent;

export const documentKinds = {
  prescription: { slug: "prescricao", title: "Prescrição", draftTitle: "Nova prescrição" },
  surgical_order: { slug: "cirurgia", title: "Pedido cirúrgico", draftTitle: "Novo pedido cirúrgico" },
  exam_request: { slug: "exames", title: "Solicitação de exames", draftTitle: "Nova solicitação de exames" },
} as const;

export const examTypeLabels: Record<ExamType, string> = {
  "": "Não informado",
  laboratory: "Laboratorial",
  imaging: "Imagem",
  other: "Outro",
};

export const examSuggestions: { name: string; exam_type: ExamType }[] = [
  { name: "Hemograma completo", exam_type: "laboratory" },
  { name: "Ressonância magnética", exam_type: "imaging" },
  { name: "Radiografia", exam_type: "imaging" },
  { name: "Ultrassonografia", exam_type: "imaging" },
];

export const statusLabels: Record<DocumentStatus, string> = {
  draft: "Rascunho",
  ready_for_review: "Em revisão",
};

export const lateralityLabels: Record<Laterality, string> = {
  "": "Não informada",
  left: "Esquerda",
  right: "Direita",
  bilateral: "Bilateral",
  not_applicable: "Não se aplica",
};

export const priorityLabels: Record<Priority, string> = {
  "": "Não informada",
  elective: "Eletiva",
  priority: "Prioritária",
  urgent: "Urgente",
};

const medicationLabels = {
  name: "Nome",
  presentation: "Apresentação",
  dose: "Dose",
  dose_unit: "Unidade",
  route: "Via",
  schedule: "Frequência",
  duration: "Duração",
  quantity: "Quantidade",
  instructions: "Instruções",
} as const;

export function kindFromSlug(slug: string): DocumentKind | null {
  if (slug === "prescricao") return "prescription";
  if (slug === "cirurgia") return "surgical_order";
  if (slug === "exames") return "exam_request";
  return null;
}

export function emptyMedication(): MedicationItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    presentation: "",
    dose: "",
    dose_unit: "",
    route: "",
    schedule: "",
    duration: "",
    quantity: "",
    instructions: "",
  };
}

export function emptyPrescription(): PrescriptionContent {
  return { notes: "", items: [emptyMedication()] };
}

export function emptySurgical(): SurgicalContent {
  return {
    procedure: "",
    region: "",
    laterality: "",
    indication: "",
    diagnosis: "",
    justification: "",
    priority: "",
    additional: "",
    materials: "",
  };
}

export type PendingGroup = { title: string; fields: string[] };

export function prescriptionPending(content: PrescriptionContent) {
  const groups: PendingGroup[] = [];
  const blocking: string[] = [];
  if (!content.items.some((item) => item.name.trim())) blocking.push("Informe o nome de ao menos um medicamento.");
  content.items.forEach((item, index) => {
    const fields = (Object.keys(medicationLabels) as (keyof typeof medicationLabels)[])
      .filter((key) => !item[key].trim())
      .map((key) => medicationLabels[key]);
    if (fields.length) groups.push({ title: `Medicamento ${index + 1}`, fields });
  });
  if (!content.notes.trim()) groups.push({ title: "Observações", fields: ["Observações gerais"] });
  return { blocking, groups };
}

const surgicalLabels: { key: keyof SurgicalContent; label: string }[] = [
  { key: "procedure", label: "Procedimento" },
  { key: "region", label: "Região anatômica" },
  { key: "laterality", label: "Lateralidade" },
  { key: "indication", label: "Indicação clínica" },
  { key: "diagnosis", label: "Diagnóstico ou hipótese" },
  { key: "justification", label: "Justificativa" },
  { key: "priority", label: "Prioridade" },
  { key: "materials", label: "Materiais" },
  { key: "additional", label: "Informações complementares" },
];

export function surgicalPending(content: SurgicalContent) {
  const blocking: string[] = [];
  if (!content.procedure.trim()) blocking.push("Informe o procedimento proposto.");
  if (!content.justification.trim()) blocking.push("Informe a justificativa médica.");
  const fields = surgicalLabels.filter((entry) => !content[entry.key].trim()).map((entry) => entry.label);
  return { blocking, groups: fields.length ? [{ title: "Pedido", fields }] : [] };
}

export function emptyExamItem(): ExamItem {
  return { id: crypto.randomUUID(), name: "", exam_type: "", region: "", laterality: "", technical_details: "", notes: "" };
}

export function emptyExam(): ExamContent {
  return { occurred_at: "", indication: "", justification: "", diagnosis: "", priority: "", additional: "", items: [emptyExamItem()] };
}

const examLabels: { key: keyof Omit<ExamContent, "items">; label: string }[] = [
  { key: "occurred_at", label: "Data do atendimento" },
  { key: "indication", label: "Indicação clínica" },
  { key: "justification", label: "Justificativa" },
  { key: "diagnosis", label: "Hipótese diagnóstica" },
  { key: "priority", label: "Prioridade" },
  { key: "additional", label: "Orientações complementares" },
];

const examItemLabels: { key: keyof Omit<ExamItem, "id">; label: string }[] = [
  { key: "name", label: "Nome do exame" },
  { key: "exam_type", label: "Tipo" },
  { key: "region", label: "Região anatômica" },
  { key: "laterality", label: "Lateralidade" },
  { key: "technical_details", label: "Detalhes técnicos" },
  { key: "notes", label: "Observações" },
];

export function examPending(content: ExamContent) {
  const blocking: string[] = [];
  if (!content.items.some((item) => item.name.trim())) blocking.push("Informe o nome de ao menos um exame.");
  const groups: PendingGroup[] = [];
  content.items.forEach((item, index) => {
    const fields = examItemLabels.filter((entry) => !item[entry.key].trim()).map((entry) => entry.label);
    if (fields.length) groups.push({ title: `Exame ${index + 1}`, fields });
  });
  const header = examLabels.filter((entry) => !content[entry.key].trim()).map((entry) => entry.label);
  if (header.length) groups.push({ title: "Solicitação", fields: header });
  return { blocking, groups };
}

export function isPrescription(content: DocumentContent): content is PrescriptionContent {
  return "notes" in content && "items" in content;
}

export function isExamRequest(content: DocumentContent): content is ExamContent {
  return "occurred_at" in content && "items" in content;
}
