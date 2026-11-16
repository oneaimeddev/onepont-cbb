export type DocumentKind = "prescription" | "surgical_order";
export type DocumentStatus = "draft" | "ready_for_review";
export type Laterality = "" | "left" | "right" | "bilateral" | "not_applicable";
export type Priority = "" | "elective" | "priority" | "urgent";

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

export type DocumentContent = PrescriptionContent | SurgicalContent;

export const documentKinds = {
  prescription: { slug: "prescricao", title: "Prescrição", draftTitle: "Nova prescrição" },
  surgical_order: { slug: "cirurgia", title: "Pedido cirúrgico", draftTitle: "Novo pedido cirúrgico" },
} as const;

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

export function isPrescription(content: DocumentContent): content is PrescriptionContent {
  return "items" in content;
}
