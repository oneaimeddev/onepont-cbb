// Formats a prescription the way Brazilian prescriptions are usually written: items grouped by
// route under "USO ORAL", "USO TÓPICO"…, each numbered with drug, strength and form on one line
// (total quantity on the right) and the directions in running text on the next line.
// Only the professional's own field values are used; nothing clinical is added.

export type PrescriptionFields = {
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

export type PrescriptionLine = { number: number; title: string; quantity: string; directions: string };
export type PrescriptionGroup = { heading: string; lines: PrescriptionLine[] };

const routes: [RegExp, string, string][] = [
  [/^(via\s+)?(oral|vo)\b/i, "USO ORAL", "Tomar"],
  [/sublingual/i, "USO SUBLINGUAL", "Colocar sob a língua"],
  [/t[oó]pic|cut[aâ]ne|d[eé]rmic/i, "USO TÓPICO", "Aplicar"],
  [/intramuscular|^(via\s+)?im$/i, "USO INTRAMUSCULAR", "Aplicar"],
  [/endovenos|intravenos|^(via\s+)?(ev|iv)$/i, "USO ENDOVENOSO", "Aplicar"],
  [/subcut[aâ]ne|^(via\s+)?sc$/i, "USO SUBCUTÂNEO", "Aplicar"],
  [/inalat/i, "USO INALATÓRIO", "Inalar"],
  [/oft[aá]lm|ocular/i, "USO OFTÁLMICO", "Pingar"],
  [/nasal/i, "USO NASAL", "Aplicar"],
  [/otol[oó]g|auricular/i, "USO OTOLÓGICO", "Pingar"],
  [/retal/i, "USO RETAL", "Aplicar"],
  [/vaginal/i, "USO VAGINAL", "Aplicar"],
];

export const missingRouteHeading = "VIA NÃO INFORMADA";

function routeUse(route: string) {
  const value = route.trim();
  if (!value) return { heading: missingRouteHeading, verb: "" };
  const known = routes.find(([pattern]) => pattern.test(value));
  if (known) return { heading: known[1], verb: known[2] };
  return { heading: `USO ${value.replace(/^via\s+/i, "").toLocaleUpperCase("pt-BR")}`, verb: "Administrar" };
}

function sentence(text: string) {
  const value = text.trim().replace(/\s+/g, " ");
  if (!value) return "";
  const capital = value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

function durationPhrase(duration: string) {
  const value = duration.trim();
  if (!value) return "";
  return /^\d/.test(value) ? `por ${value}` : value;
}

/** Directions in running text: "Tomar 1 comprimido de 8 em 8 horas, por 3 dias. Se dor." */
export function prescriptionDirections(item: PrescriptionFields) {
  const { verb } = routeUse(item.route);
  const dose = [item.dose, item.dose_unit].map((part) => part.trim()).filter(Boolean).join(" ");
  const head = [dose ? [verb, dose].filter(Boolean).join(" ") : "", item.schedule.trim()].filter(Boolean).join(" ");
  const regimen = [head, durationPhrase(item.duration)].filter(Boolean).join(", ");
  return [sentence(regimen), sentence(item.instructions)].filter(Boolean).join(" ");
}

export function prescriptionGroups(items: readonly PrescriptionFields[]): PrescriptionGroup[] {
  const groups = new Map<string, PrescriptionFields[]>();
  for (const item of items) {
    const { heading } = routeUse(item.route);
    groups.set(heading, [...(groups.get(heading) ?? []), item]);
  }
  let number = 0;
  return [...groups].map(([heading, grouped]) => ({
    heading,
    lines: grouped.map((item) => {
      number += 1;
      return {
        number,
        title: [item.name.trim() || `Medicamento ${number}`, item.presentation.trim()].filter(Boolean).join(" "),
        quantity: item.quantity.trim(),
        directions: prescriptionDirections(item),
      };
    }),
  }));
}
