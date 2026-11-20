import { z } from "zod";
import type { DocumentDraft } from "../document-draft";
import { foldName } from "../athlete-resolution";

export const displayedProposalSchema = z
  .object({
    requestId: z.string().uuid(),
    athleteId: z.string().uuid(),
    kind: z.enum(["prescription", "exam_request", "surgical_order"]),
    version: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{32}$/),
    dirty: z.boolean().optional(),
  })
  .strict();
export type DisplayedProposal = z.infer<typeof displayedProposalSchema>;
export type ProposalPatch =
  | {
      operation: "set_field" | "append_field";
      field: string;
      value: string;
      itemId?: string;
    }
  | { operation: "remove_item"; itemId: string }
  | { operation: "add_item"; item: { id: string; name: string } };

export function proposalSaveIntent(message: string) {
  // Only the directive before clinical values is considered. A quoted save
  // instruction in a note is not consent to save the document.
  const header = foldName(message.split(/\s+para\s+|[:;\n]/iu)[0]);
  if (
    /\b(evolucao|anexo|cadastro)\b/.test(header) ||
    !/\b(salve|salvar|salvamento|grave|gravar|confirmar|confirme)\b/.test(
      header,
    )
  )
    return null;
  const kinds = [
    /\b(prescricao|receita)\b/.test(header) ? "prescription" : null,
    /\bexames?\b/.test(header) ? "exam_request" : null,
    /\bcirurgico\b/.test(header) ? "surgical_order" : null,
  ].filter(Boolean) as DisplayedProposal["kind"][];
  return {
    action: "save" as const,
    kind: kinds.length === 1 ? kinds[0] : null,
    mixed: kinds.length > 1,
  };
}

export function proposalIntent(message: string) {
  const s = foldName(message);
  if (/\b(evolucao|anexo|cadastro|filtro)\b/.test(s.split(/\s+para\s+|:/)[0]))
    return null;
  const edit =
    /\b(altere|alterar|troque|trocar|substitua|remova|remover|retire|exclua|adicione|adicionar|inclua|incluir|acrescente)\b/.test(
      s,
    );
  // Named patients, historical references and document ordinals remain with the
  // existing entity resolver; they must not silently resolve to the active card.
  const read =
    /^(mostre|revise|revisar|reveja|visualize|abra|leia) (?:(?:a|o|esta|essa|este|esse|minha|meu) )?(?:prescricao|receita|documento|pedido(?: cirurgico)?|solicitacao de exames|proposta|rascunho)(?: atual)?$/.test(
      s,
    );
  if (!edit && !read) return null;
  const kinds = [
    /\b(prescricao|receita|medicamento)\b/.test(s) ? "prescription" : null,
    /\bexames?\b/.test(s) ? "exam_request" : null,
    /\b(cirurgico|cirurgia|procedimento)\b/.test(s) ? "surgical_order" : null,
  ].filter(Boolean) as DisplayedProposal["kind"][];
  return {
    action: edit ? ("edit" as const) : ("review" as const),
    kind: kinds.length === 1 ? kinds[0] : null,
    mixed: kinds.length > 1,
  };
}

const ordinals = [
  "primeiro",
  "segundo",
  "terceiro",
  "quarto",
  "quinto",
  "sexto",
  "setimo",
  "oitavo",
  "nono",
  "decimo",
  "decimo primeiro",
  "decimo segundo",
];
function itemFrom(descriptor: string, items: { id: string; name: string }[]) {
  const s = foldName(descriptor);
  const named = items.filter(
    (item) => item.name && ` ${s} `.includes(` ${foldName(item.name)} `),
  );
  if (named.length === 1) return named[0];
  if (named.length > 1) return null;
  const numeric = s.match(
    /(?:item|medicamento|exame)\s+(\d{1,2})\b|\b(\d{1,2})(?:o|a|º|ª)?\s+(?:item|medicamento|exame)\b/,
  );
  if (numeric) return items[Number(numeric[1] ?? numeric[2]) - 1] ?? null;
  if (/\bdecimo (terceiro|quarto|quinto|sexto|setimo|oitavo|nono)\b/.test(s))
    return null;
  const positions: number[] = [];
  let remaining = s;
  for (let i = ordinals.length - 1; i >= 0; i--) {
    const pattern = new RegExp(`\\b${ordinals[i]}\\b`);
    if (pattern.test(remaining)) {
      positions.push(i);
      remaining = remaining.replace(pattern, " ");
    }
  }
  if (positions.length)
    return positions.length === 1 ? (items[positions[0]] ?? null) : null;
  if (/\b(?:medicamento|exame|item)\s+\S+/.test(s)) return null;
  return items.length === 1 ? items[0] : null;
}
const fields: [RegExp, string][] = [
  [/\bunidade\b/, "dose_unit"],
  [/\bdose\b/, "dose"],
  [/\bapresentacao\b/, "presentation"],
  [/\bvia\b/, "route"],
  [/\b(frequencia|horario)\b/, "schedule"],
  [/\bduracao\b/, "duration"],
  [/\bquantidade\b/, "quantity"],
  [/\b(instrucao|instrucoes|orientacao|orientacoes)\b/, "instructions"],
  [/\bjustificativa\b/, "justification"],
  [/\bindicacao\b/, "indication"],
  [/\bdiagnostico\b/, "diagnosis"],
  [/\bprioridade\b/, "priority"],
  [/\blateralidade\b/, "laterality"],
  [/\bregiao\b/, "region"],
  [/\bmateriais\b/, "materials"],
  [/\bprocedimento\b/, "procedure"],
  [/\bdetalhes tecnicos\b/, "technical_details"],
  [/\b(observacao|observacoes|nota|notas)\b/, "notes"],
  [/\bnome\b/, "name"],
];
function unknownTarget(
  descriptor: string,
  document: DocumentDraft,
  field?: RegExp,
) {
  let s = foldName(descriptor);
  if (
    /\b(atleta|paciente|outro|outra|anterior)\b/.test(s) ||
    /\b(?:primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|\d+) (?:prescricao|receita|solicitacao|pedido|documento)\b|\b(?:prescricao|receita|solicitacao|pedido|documento) (?:numero )?\d+\b/.test(
      s,
    )
  )
    return true;
  const content = document.content;
  const names =
    content && "items" in content
      ? content.items.map((i) => i.name)
      : content && "procedure" in content
        ? [content.procedure]
        : [];
  for (const name of names)
    if (foldName(name)) s = s.split(foldName(name)).join(" ");
  if (field) s = s.replace(field, " ");
  for (const ordinal of [...ordinals].reverse())
    s = s.replace(new RegExp(`\\b${ordinal}\\b`, "g"), " ");
  s = s
    .replace(
      /\b(?:a|o|as|os|do|da|dos|das|de|em|no|na|nos|nas|com|e|uso|geral|gerais|adicional|adicionais|clinica|clinico|anatomica|cientifico|completo|completa|medicamento|medicamentos|exame|exames|item|itens|prescricao|receita|solicitacao|pedido|cirurgico|documento|proposta|rascunho|\d{1,2})\b/g,
      " ",
    )
    .trim();
  return s.length > 0;
}
const enumValues: Record<string, Record<string, string>> = {
  laterality: {
    esquerda: "left",
    esquerdo: "left",
    direita: "right",
    direito: "right",
    bilateral: "bilateral",
    "nao se aplica": "not_applicable",
  },
  priority: {
    eletiva: "elective",
    eletivo: "elective",
    prioritario: "priority",
    prioritaria: "priority",
    urgente: "urgent",
  },
};

// Only literal values in the ORIGINAL utterance become patches. There is no
// clinical completion, positional mutation or assistant-generated confirmation.
export function resolveProposalEdit(
  message: string,
  document: DocumentDraft,
  newId = () => crypto.randomUUID(),
): { changes: ProposalPatch[] } | { clarification: string } {
  if (!document.content)
    return { clarification: "Abra a proposta atual antes de alterá-la." };
  if (/\?|^\s*(não|nao|se\b|caso\b|talvez\b)/iu.test(message))
    return {
      clarification:
        "Informe uma alteração direta, com o item, o campo e o novo valor.",
    };
  const parts = message.split(
    /(?:;\s*|\s+e\s+)(?=(?:altere|troque|substitua|remova|retire|exclua|adicione|inclua|acrescente)\b)/iu,
  );
  if (parts.length > 10)
    return { clarification: "Faça até dez alterações por mensagem." };
  if (
    parts.length > 1 &&
    parts.some((part) =>
      /^(remova|retire|exclua)\b|^(adicione|inclua|acrescente)\s+(?:(?:um|o)\s+)?(?:medicamento|exame)\b/iu.test(
        part,
      ),
    )
  )
    return {
      clarification:
        "Inclua ou remova o item primeiro. Depois confira as posições atualizadas antes de pedir outra alteração.",
    };
  const changes: ProposalPatch[] = [];
  const items = "items" in document.content ? document.content.items : null;
  for (const part of parts) {
    const add = part.match(
      /^(?:adicione|inclua|acrescente)\s+(?:(?:um|o)\s+)?(?:medicamento|exame)\s+(?:chamado\s+|com o nome\s+|:\s*)(.+)$/iu,
    );
    if (add && items) {
      if (!add[1].trim() || add[1].length > 160)
        return {
          clarification:
            "Informe somente o nome do novo item, com até 160 caracteres. Os demais campos serão pedidos separadamente.",
        };
      changes.push({
        operation: "add_item",
        item: { id: newId(), name: add[1].trim() },
      });
      continue;
    }
    const remove = part.match(/^(?:remova|retire|exclua)\s+(.+)$/iu);
    if (remove && items) {
      if (unknownTarget(remove[1], document))
        return {
          clarification:
            "Confirme o documento no cartão e indique apenas a posição ou o nome do item exibido. Não vou presumir outro atleta ou documento.",
        };
      if (
        !/\b(medicamento|exame|item)\b/.test(foldName(remove[1])) &&
        !items.some((item) => foldName(item.name) === foldName(remove[1]))
      )
        return {
          clarification:
            "Para remover um item, informe medicamento ou exame e sua posição ou nome. Para limpar um campo, use o editor do cartão.",
        };
      const item = itemFrom(remove[1], items);
      if (!item)
        return {
          clarification:
            "Qual item deseja remover? Informe a posição ou o nome completo exibido na proposta.",
        };
      changes.push({ operation: "remove_item", itemId: item.id });
      continue;
    }
    const set = part.match(
      /^(altere|troque|substitua|acrescente|adicione|inclua)\s+(.+?)(?:\s+(?:para|por)\s+|:\s*)(.+)$/iu,
    );
    if (!set)
      return {
        clarification:
          "Informe o campo e o novo valor. Por exemplo: “Altere a dose do segundo medicamento para VALOR DEMO”.",
      };
    const descriptor = foldName(set[2]);
    const matching = fields.filter(([pattern]) => pattern.test(descriptor));
    if (matching.length !== 1)
      return {
        clarification:
          "Qual campo deseja alterar? Informe um campo e um valor por alteração, sem combinar dose, via ou frequência.",
      };
    if (unknownTarget(set[2], document, matching[0][0]))
      return {
        clarification:
          "Confirme o documento no cartão e indique o campo e o item exibidos. Há uma referência adicional que não consigo resolver com segurança.",
      };
    let field = matching[0][1],
      value = set[3].trim();
    const root =
      !items ||
      /\b(geral|gerais)\b/.test(descriptor) ||
      ["justification", "indication", "diagnosis", "priority"].includes(field);
    if (
      field === "instructions" &&
      (document.kind === "surgical_order" ||
        root ||
        (document.kind === "exam_request" &&
          /\bsolicitacao\b/.test(descriptor)))
    )
      field = document.kind === "prescription" ? "notes" : "additional";
    if (!root && document.kind === "prescription" && field === "notes")
      field = "instructions";
    if (!root && document.kind === "exam_request" && field === "instructions")
      field = "notes";
    if (root && field === "notes" && document.kind !== "prescription")
      field = "additional";
    if (enumValues[field]) {
      const mapped = enumValues[field][foldName(value)];
      if (!mapped)
        return {
          clarification: `Informe um valor explícito e reconhecido para ${field === "priority" ? "prioridade" : "lateralidade"}.`,
        };
      value = mapped;
    }
    const operation = /^(acrescente|adicione|inclua)$/iu.test(set[1])
      ? ("append_field" as const)
      : ("set_field" as const);
    if (
      operation === "append_field" &&
      ![
        "notes",
        "instructions",
        "additional",
        "indication",
        "justification",
        "diagnosis",
        "materials",
        "technical_details",
      ].includes(field)
    )
      return {
        clarification:
          "Para substituir esse campo, use “Altere” e informe o novo valor completo.",
      };
    if (root) changes.push({ operation, field, value });
    else {
      const item = itemFrom(descriptor, items!);
      if (!item)
        return {
          clarification:
            "Qual item deseja alterar? Informe a posição ou o nome completo exibido na proposta.",
        };
      const medication = items!.find((entry) => entry.id === item.id);
      if (
        document.kind === "prescription" &&
        medication &&
        "dose_unit" in medication
      ) {
        const previousDose = changes.findLast(
          (change) =>
            "field" in change &&
            change.field === "dose" &&
            change.itemId === item.id &&
            change.operation === "set_field",
        );
        const effectiveDose =
          previousDose && "value" in previousDose
            ? previousDose.value
            : medication.dose;
        if (
          (field === "dose" &&
            medication.dose_unit.trim() &&
            !/^[0-9][0-9\s.,+\/–—-]*$/u.test(value)) ||
          (field === "dose_unit" &&
            effectiveDose.trim() &&
            !/^[0-9][0-9\s.,+\/–—-]*$/u.test(effectiveDose))
        )
          return {
            clarification:
              "Dose e unidade são campos separados. Informe a dose numérica e a unidade explicitamente, ou revise ambos no editor do cartão.",
          };
      }
      changes.push({ operation, field, value, itemId: item.id });
    }
  }
  return { changes };
}
