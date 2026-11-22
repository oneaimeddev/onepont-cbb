import { createHash } from "node:crypto";
import type { DocumentContent, DocumentKind } from "../../documents/content";
import { foldName, nameMatches } from "../athlete-resolution";

const label = {
  presentation: "apresenta[çc][ãa]o",
  dose: "dose|dosagem",
  dose_unit: "unidade(?: da dose)?",
  route: "via",
  schedule: "frequ[êe]ncia|hor[áa]rio",
  duration: "dura[çc][ãa]o",
  quantity: "quantidade",
  instructions: "instru[çc][õo]es|orienta[çc][õo]es de uso|posologia",
  notes: "observa[çc][õo]es|notas",
  exam_type: "tipo(?: de exame)?",
  region: "regi[ãa]o(?: anat[ôo]mica)?",
  laterality: "lateralidade",
  technical_details: "detalhes t[ée]cnicos",
  occurred_at: "data(?: do atendimento)?",
  indication: "indica[çc][ãa]o",
  justification: "justificativa",
  diagnosis: "diagn[óo]stico",
  priority: "prioridade",
  additional: "orienta[çc][õo]es gerais|complementos",
  procedure: "procedimento",
  materials: "materiais",
} satisfies Record<string, string>;
type Field = keyof typeof label;
const medications: Field[] = [
  "presentation",
  "dose",
  "dose_unit",
  "route",
  "schedule",
  "duration",
  "quantity",
  "instructions",
];
const exams: Field[] = [
  "exam_type",
  "region",
  "laterality",
  "technical_details",
  "notes",
];
const rootFields: Record<DocumentKind, Field[]> = {
  prescription: ["notes"],
  exam_request: [
    "occurred_at",
    "indication",
    "justification",
    "diagnosis",
    "priority",
    "additional",
  ],
  surgical_order: [
    "procedure",
    "region",
    "laterality",
    "indication",
    "diagnosis",
    "justification",
    "priority",
    "materials",
    "additional",
  ],
};
const enums: Partial<Record<Field, Record<string, string>>> = {
  priority: {
    elective: "elective",
    eletivo: "elective",
    eletiva: "elective",
    priority: "priority",
    prioritario: "priority",
    prioritaria: "priority",
    urgent: "urgent",
    urgente: "urgent",
  },
  laterality: {
    left: "left",
    esquerda: "left",
    esquerdo: "left",
    right: "right",
    direita: "right",
    direito: "right",
    bilateral: "bilateral",
    not_applicable: "not_applicable",
    "nao se aplica": "not_applicable",
  },
  exam_type: {
    laboratory: "laboratory",
    laboratorial: "laboratory",
    laboratorio: "laboratory",
    imaging: "imaging",
    imagem: "imaging",
    other: "other",
    outro: "other",
  },
};
const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/gu, " ");
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Keep the full wording of a single dictated exam, including qualifiers.
export function dictatedExam(message: string) {
  const match = message.trim().match(
    /^(?:(?:por favor[,\s]+)?(?:solicite|peça|quero (?:pedir|solicitar)|(?:faça|crie|prepare) (?:um pedido|uma solicitação) de exames?(?: com)?|prepare uma solicitação de)\s+)(?:(?:um|uma)\s+)?([^.!?;:\n,]+)\.?$/iu,
  );
  const name = match?.[1].trim();
  if (!name || name.length > 160) return null;
  const folded = foldName(name);
  if (!/^(ressonancia|hemograma|radiografia|raio x|ultrassom|ultrassonografia|tomografia|eletrocardiograma|exame de)\b/.test(folded))
    return null;
  if (/\b(para|e|ou|mas|nao|talvez|se|depois|salve|assine|envie|prescricao|cirurgia)\b/.test(folded))
    return null;
  // A possessive may identify another athlete. Only accept known anatomy
  // after these prepositions in the shortcut for the athlete in context.
  const possessives = [...folded.matchAll(/\b(?:do|da|dos|das)\s+(\w+)/g)];
  if (possessives.some(([, word]) =>
    !/^(joelho|joelhos|ombro|ombros|tornozelo|tornozelos|quadril|coluna|mao|pe|punho|cotovelo|abdome|cranio|torax)$/.test(word),
  )) return null;
  return name;
}

export function documentCreationRequested(kind: DocumentKind, message: string) {
  if (kind === "exam_request" && dictatedExam(message)) return true;
  const header = foldName(
    message.split(/(?:^|[;\n])\s*(?:medicamento|exame|procedimento)\s*:/iu)[0],
  );
  if (
    /\b(nao|se|caso|talvez|altere|alterar|adicione|adicionar|inclua|incluir|troque|mude|modifique|complemente|acrescente)\b/.test(
      header,
    )
  )
    return false;
  const wants =
    /\b(crie|criar|prepare|preparar|elabore|elaborar|quero|nova|novo)\b/.test(
      header,
    );
  const mentions =
    kind === "prescription"
      ? /\b(prescricao|receita)\b/.test(header)
      : kind === "exam_request"
        ? /\b(solicitacao|pedido) de exames?\b/.test(header)
        : /\bpedido cirurgico\b/.test(header);
  const types = [
    /\b(prescricao|receita)\b/,
    /\b(solicitacao|pedido) de exames?\b/,
    /\bpedido cirurgico\b/,
  ].filter((pattern) => pattern.test(header));
  return wants && mentions && types.length === 1;
}

// Target identity comes from authorized backend metadata, never from a model name.
export function creationPatientMatches(
  message: string,
  authorizedName: string,
) {
  const header = message.split(
    /(?:^|[;\n])\s*(?:medicamento|exame|procedimento|indica[çc][ãa]o|justificativa|observa[çc][õo]es)\s*:/iu,
  )[0];
  const explicit = header.match(
    /\b(?:para\s+(?:[oa]\s+)?|d[oa]\s+)(?:(?:atleta|paciente)\s+)?(.+?)(?=\s+(?:com|contendo|usando)\b|[.;\n]|$)/iu,
  );
  if (!explicit) return true;
  const name = explicit[1].trim();
  if (
    ["em contexto", "selecionado", "selecionada", "ele", "ela"].includes(
      foldName(name),
    )
  )
    return true;
  return nameMatches(authorizedName, name);
}

export function stableCreationItemId(
  key: string,
  athleteId: string,
  kind: DocumentKind,
  index: number,
) {
  const hash = createHash("sha256")
    .update(`${key}:${athleteId}:${kind}:${index}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const sourceLabel = (kind: DocumentKind, field: Field) =>
  kind === "prescription" && field === "notes"
    ? "observa[çc][õo]es(?: gerais)?|notas(?: gerais)?|orienta[çc][õo]es gerais"
    : label[field];
function roleValue(source: string, field: Field, pattern = label[field]) {
  const values = [
    ...source.matchAll(
      new RegExp(`(?:^|[;\\n])\\s*(?:${pattern})\\s*:\\s*([^;\\n]*)`, "giu"),
    ),
  ].map((m) => m[1].trim());
  if (!values.length) return { value: "", valid: true };
  if (new Set(values.map(normalized)).size !== 1)
    return { value: "", valid: false };
  const raw = values[0];
  if (!raw) return { value: "", valid: true };
  const map = enums[field];
  const value = map ? (map[raw] ?? map[foldName(raw)]) : raw;
  const limit =
    ["indication", "justification", "additional"].includes(field) ||
    field === "notes"
      ? 2000
      : field === "procedure"
        ? 200
        : field === "materials"
          ? 1000
          : ["instructions", "technical_details", "diagnosis"].includes(field)
            ? 500
            : field === "occurred_at"
              ? 10
              : ["laterality", "priority"].includes(field)
                ? 20
                : 160;
  return {
    value: value ?? "",
    valid: value !== undefined && raw.length <= limit,
  };
}
function literalName(message: string, candidate: string) {
  if (!candidate.trim()) return null;
  const matches = [
    ...message.matchAll(
      new RegExp(
        `(?<![\\p{L}\\p{N}])${escaped(candidate.trim()).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`,
        "giu",
      ),
    ),
  ];
  if (matches.length !== 1) return null;
  const match = matches[0],
    before = foldName(
      message.slice(Math.max(0, match.index! - 80), match.index),
    );
  if (/\b(nao|evite|sem)(?: [a-z0-9]+){0,5}$/.test(before)) return null;
  const after = message.slice(match.index! + match[0].length).trimStart();
  if (after && !/^[.;\n]/u.test(after)) return null;
  return { value: match[0], index: match.index! };
}
function negatedName(message: string, name: string) {
  return new RegExp(
    `\\b(?:nao|não|evite|sem)\\s+(?:(?:usar|use|prescrever|prescreva|incluir|inclua|administrar|administre|o|a|medicamento|exame)\\s*:?\\s*){0,4}${escaped(name.normalize("NFC"))}(?![\\p{L}\\p{N}])`,
    "iu",
  ).test(message.normalize("NFC"));
}
type Grounded =
  | { ok: true; content: DocumentContent }
  | { ok: false; fields: string[] };

// The model routes an intent; clinical values are proved against this request's
// ORIGINAL human text. Prior assistant replies/records are never evidence.
// Structured item labels prevent a dose for item B being applied to item A.
export function groundDocumentCreation(
  kind: DocumentKind,
  content: DocumentContent,
  message: string,
  itemId: (index: number) => string,
): Grounded {
  if (!documentCreationRequested(kind, message))
    return { ok: false, fields: ["creation_request"] };
  const dictated = kind === "exam_request" ? dictatedExam(message) : null;
  if (dictated && "occurred_at" in content && "items" in content) {
    return {
      ok: true,
      content: {
        occurred_at: "", indication: "", justification: "", diagnosis: "",
        priority: "", additional: "",
        items: [{
          id: itemId(0), name: dictated, exam_type: "", region: "",
          laterality: "", technical_details: "", notes: "",
        }],
      },
    };
  }
  const errors: string[] = [];
  const output = structuredClone(content) as unknown as Record<string, unknown>;
  const put = (
    target: Record<string, unknown>,
    field: Field,
    source: string,
    path: string,
  ) => {
    const found = roleValue(source, field, sourceLabel(kind, field));
    const candidate =
      typeof target[field] === "string" ? (target[field] as string) : "";
    if (
      !found.valid ||
      (candidate && normalized(candidate) !== normalized(found.value))
    )
      errors.push(path);
    if (
      kind === "surgical_order" &&
      field === "region" &&
      found.value.length > 120
    )
      errors.push(path);
    target[field] = found.value;
  };
  for (const field of rootFields[kind]) put(output, field, message, field);
  if (kind === "surgical_order" && !String(output.procedure ?? "").trim())
    errors.push("procedure");
  if (kind !== "surgical_order") {
    if (!("items" in content)) return { ok: false, fields: ["items"] };
    const itemFields = kind === "prescription" ? medications : exams;
    const markers = [
      ...message.matchAll(
        /(?:^|[;\n])\s*(medicamento|exame)\s*:\s*([^;\n]+)/giu,
      ),
    ];
    if (
      markers.some(
        (m) =>
          normalized(m[1]) !==
          (kind === "prescription" ? "medicamento" : "exame"),
      )
    )
      errors.push("mixed_item_kinds");
    const relevant = markers.filter(
      (m) =>
        normalized(m[1]) ===
        (kind === "prescription" ? "medicamento" : "exame"),
    );
    const candidates = content.items;
    if (!candidates.length) errors.push("item_names");
    if (
      new Set(candidates.map((i) => normalized(i.name))).size !==
      candidates.length
    )
      return { ok: false, fields: ["distinct_item_names"] };
    if (relevant.length && relevant.length !== candidates.length)
      errors.push("item_count");
    const ordered: {
      item: Record<string, unknown>;
      source: string;
      name: string;
      index: number;
    }[] = [];
    for (const item of candidates) {
      if (negatedName(message, item.name)) {
        errors.push("negated_item");
        continue;
      }
      if (relevant.length) {
        const headers = relevant.filter(
          (m) => normalized(m[2]) === normalized(item.name),
        );
        if (headers.length !== 1) {
          errors.push("item_name");
          continue;
        }
        const header = headers[0],
          at = markers.indexOf(header),
          start = header.index! + header[0].length;
        const source = message.slice(
          start,
          markers[at + 1]?.index ?? message.length,
        );
        if (header[2].trim().length > 160 || header[2].includes(":"))
          errors.push("item_name_format");
        const allowed = [...itemFields, ...rootFields[kind]]
          .map((field) => sourceLabel(kind, field))
          .join("|");
        if (
          source
            .split(/[;\n]/u)
            .some(
              (part) =>
                part.trim() &&
                !new RegExp(`^\\s*(?:${allowed})\\s*:`, "iu").test(part),
            )
        )
          errors.push("item_unlabelled_text");
        ordered.push({
          item: structuredClone(item) as unknown as Record<string, unknown>,
          source,
          name: header[2].trim(),
          index: header.index!,
        });
      } else {
        const actual = literalName(message, item.name);
        const prefix = actual ? foldName(message.slice(0, actual.index)) : "";
        const namedAsItem =
          /\b(?:com|contendo|usando)(?: [oa])?(?: medicamento| exame)?$|\b(?:medicamento|exame)$/.test(
            prefix,
          ) &&
          !/^(medicamento|exame|atleta|paciente|prescricao|receita|documento|cirurgia)$/.test(
            foldName(item.name),
          );
        if (
          !actual ||
          !namedAsItem ||
          itemFields.some(
            (f) => (item as unknown as Record<string, unknown>)[f],
          ) ||
          itemFields.some((f) => roleValue(message, f).value)
        ) {
          errors.push("item_fields_require_label");
          continue;
        }
        ordered.push({
          item: structuredClone(item) as unknown as Record<string, unknown>,
          source: "",
          name: actual.value,
          index: actual.index,
        });
      }
    }
    ordered.sort((a, b) => a.index - b.index);
    output.items = ordered.map(({ item, source, name }, index) => {
      item.id = itemId(index);
      item.name = name;
      for (const field of itemFields)
        put(item, field, source, `item.${index + 1}.${field}`);
      // Native item fields have smaller limits than some root fields.
      if (
        String(item.notes ?? "").length > 500 ||
        String(item.region ?? "").length > 160
      )
        errors.push(`item.${index + 1}.length`);
      return item;
    });
  }
  return errors.length
    ? { ok: false, fields: [...new Set(errors)] }
    : { ok: true, content: output as unknown as DocumentContent };
}
