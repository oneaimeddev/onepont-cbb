export type DocumentKind = "prescription" | "surgical_order" | "exam_request" | "certificate" | "referral";
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

// Medical certificate (CFM Resolutions 1.658/2002 and 1.851/2008): leave, attendance or sports
// fitness. The ICD-10 code is printed only with the patient's explicit authorization.
export type CertificateType = "" | "leave" | "attendance" | "fitness";
export type Fitness = "" | "fit" | "fit_with_restrictions" | "unfit";

export type CertificateContent = {
  certificate_type: CertificateType;
  occurred_at: string;
  start_time: string;
  end_time: string;
  leave_days: string;
  leave_start: string;
  activities: string;
  fitness: Fitness;
  restrictions: string;
  cid: string;
  cid_authorized: boolean;
  notes: string;
};

// Referral letter: destination, reason, clinical summary, hypothesis, exams, treatments and request.
export type ReferralContent = {
  specialty: string;
  professional: string;
  reason: string;
  clinical_summary: string;
  diagnosis: string;
  cid: string;
  exams: string;
  treatment: string;
  request: string;
  priority: Priority;
};

export type DocumentContent = PrescriptionContent | SurgicalContent | ExamContent | CertificateContent | ReferralContent;

export const documentKinds = {
  prescription: { slug: "prescricao", title: "Prescrição", draftTitle: "Nova prescrição" },
  surgical_order: { slug: "cirurgia", title: "Pedido cirúrgico", draftTitle: "Novo pedido cirúrgico" },
  exam_request: { slug: "exames", title: "Solicitação de exames", draftTitle: "Nova solicitação de exames" },
  certificate: { slug: "atestado", title: "Atestado", draftTitle: "Novo atestado" },
  referral: { slug: "encaminhamento", title: "Encaminhamento", draftTitle: "Novo encaminhamento" },
} as const;

/** Order of the creation menu: prescription and exams first, then the other medical documents. */
export const documentMenu: { kind: DocumentKind; group: "main" | "documents" }[] = [
  { kind: "prescription", group: "main" },
  { kind: "exam_request", group: "main" },
  { kind: "certificate", group: "documents" },
  { kind: "referral", group: "documents" },
  { kind: "surgical_order", group: "documents" },
];

export const certificateTypeLabels: Record<CertificateType, string> = {
  "": "Não informado",
  leave: "Afastamento",
  attendance: "Comparecimento",
  fitness: "Aptidão esportiva",
};

export const fitnessLabels: Record<Fitness, string> = {
  "": "Não informada",
  fit: "Apto(a)",
  fit_with_restrictions: "Apto(a) com restrições",
  unfit: "Inapto(a) temporariamente",
};

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
  if (slug === "atestado") return "certificate";
  if (slug === "encaminhamento") return "referral";
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

export function emptyCertificate(): CertificateContent {
  return {
    certificate_type: "", occurred_at: "", start_time: "", end_time: "", leave_days: "", leave_start: "",
    activities: "", fitness: "", restrictions: "", cid: "", cid_authorized: false, notes: "",
  };
}

export function emptyReferral(): ReferralContent {
  return { specialty: "", professional: "", reason: "", clinical_summary: "", diagnosis: "", cid: "", exams: "", treatment: "", request: "", priority: "" };
}

export function emptyContent(kind: DocumentKind): DocumentContent {
  if (kind === "prescription") return emptyPrescription();
  if (kind === "exam_request") return emptyExam();
  if (kind === "certificate") return emptyCertificate();
  if (kind === "referral") return emptyReferral();
  return emptySurgical();
}

/** Mirrors clinical.document_pending / document_ready for certificates. */
export function certificatePending(content: CertificateContent) {
  const blocking: string[] = [];
  const fields: string[] = [];
  if (!content.certificate_type) blocking.push("Escolha a modalidade do atestado.");
  if (!content.occurred_at) blocking.push("Informe a data do atendimento.");
  if (content.certificate_type === "leave") {
    if (!content.leave_days) blocking.push("Informe os dias de afastamento.");
    if (!content.leave_start) fields.push("Início do afastamento");
    if (!content.activities.trim()) fields.push("Atividades afastadas");
  }
  if (content.certificate_type === "attendance") {
    if (!content.start_time) blocking.push("Informe o horário de chegada.");
    if (!content.end_time) fields.push("Horário de saída");
  }
  if (content.certificate_type === "fitness") {
    if (!content.fitness) blocking.push("Informe a conclusão da avaliação.");
    if (!content.activities.trim()) fields.push("Atividade avaliada");
    if (content.fitness === "fit_with_restrictions" && !content.restrictions.trim()) fields.push("Restrições");
  }
  if (content.cid.trim() && !content.cid_authorized) blocking.push("O CID só pode constar com autorização expressa do paciente.");
  return { blocking, groups: fields.length ? [{ title: "Atestado", fields }] : [] };
}

const referralLabels: { key: keyof Omit<ReferralContent, "priority">; label: string }[] = [
  { key: "clinical_summary", label: "Resumo clínico" },
  { key: "diagnosis", label: "Hipótese diagnóstica" },
  { key: "request", label: "Solicitação ao profissional de destino" },
];

export function referralPending(content: ReferralContent) {
  const blocking: string[] = [];
  if (!content.specialty.trim()) blocking.push("Informe a especialidade ou o serviço de destino.");
  if (!content.reason.trim()) blocking.push("Informe o motivo do encaminhamento.");
  const fields = referralLabels.filter((entry) => !content[entry.key].trim()).map((entry) => entry.label);
  if (!content.priority) fields.push("Prioridade");
  return { blocking, groups: fields.length ? [{ title: "Encaminhamento", fields }] : [] };
}

export function isCertificate(content: DocumentContent): content is CertificateContent {
  return "certificate_type" in content;
}

export function isReferral(content: DocumentContent): content is ReferralContent {
  return "specialty" in content && "reason" in content;
}

export function isPrescription(content: DocumentContent): content is PrescriptionContent {
  return "notes" in content && "items" in content;
}

export function isExamRequest(content: DocumentContent): content is ExamContent {
  return "occurred_at" in content && "items" in content;
}
