import { foldName } from "../chat/athlete-resolution";
import {
  activityFilterSchema,
  type ActivityFilters,
  type ClinicalSearchBoard,
  type ActivityKind,
} from "./contract";
type Catalog = { categories: { name: string }[]; clubs: { name: string }[] };
export function clinicalSearchIntent(
  message: string,
  previous: ClinicalSearchBoard | null,
) {
  const text = foldName(message);
  const activity =
    /\b(exames?|prescric\w*|cirurg\w*|evoluc\w*|resultados?|laudos?|anex\w*)\b/.test(
      text,
    );
  const cohort = /\batletas\b|\bquem (teve|tem|possui|tiveram|tinha)\b/.test(
    text,
  );
  const follow =
    /\b(desses|dessas|destes|destas|agora filtre|agora mostre|agora somente|somente os|somente as|filtre|refine)\b/.test(
      text,
    );
  if (!((cohort && activity) || (follow && (previous || activity))))
    return null;
  return {
    text,
    follow,
    performed: /\brealizad\w*\b|\b(realizaram|fizeram|fez) exames?\b/.test(
      text,
    ),
  };
}
export function parseClinicalSearch(
  message: string,
  previous: ClinicalSearchBoard | null,
  catalog: Catalog,
) {
  const intent = clinicalSearchIntent(message, previous);
  if (!intent) return null;
  if (intent.performed)
    return {
      error:
        "A base registra solicitações e resultados/laudos anexados, mas não tem confirmação estruturada de realização. Deseja buscar solicitações ou resultados anexados?",
    };
  if (intent.follow && !previous)
    return {
      error:
        "Não há uma busca clínica transversal anterior para refinar. Informe o tipo de registro e o período desejado.",
    };
  const text = intent.text;
  const filters: ActivityFilters =
    intent.follow && previous
      ? { ...previous.filters }
      : { kinds: [], period: "all", sort: "newest" };
  const kinds: ActivityKind[] = [];
  if (/\bevoluc/.test(text) || /\bfisioterap/.test(text))
    kinds.push("evolution");
  if (/\bprescric/.test(text)) kinds.push("prescription");
  if (/\bcirurg/.test(text)) kinds.push("surgical_order");
  const attached = /\b(resultados?|laudos?|anexados?|anexos?)\b/.test(text);
  const requested = /\b(solicitad\w*|solicitac\w*|pedidos? de exame)\b/.test(
    text,
  );
  if (/\bexames?\b/.test(text) && !attached) kinds.push("exam_request");
  if (attached) kinds.push("attachment_result");
  if (/\bexames?\b/.test(text) && !attached && !requested)
    kinds.push("attachment_result");
  if (requested && !kinds.includes("exam_request")) kinds.push("exam_request");
  if (kinds.length) filters.kinds = [...new Set(kinds)];
  if (!filters.kinds.length)
    return {
      error:
        "Informe se deseja buscar evoluções, prescrições, pedidos cirúrgicos, solicitações ou resultados/laudos anexados.",
    };
  const count: Record<string, number> = {
    sete: 7,
    vinte: 20,
    trinta: 30,
    seis: 6,
  };
  const days = text.match(/\bultimos? (\d+|sete|vinte|trinta) dias?\b/);
  const months = text.match(/\bultimos? (\d+|seis) meses?\b/);
  const iso = [...message.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(
    (m) => m[1],
  );
  const br = [...message.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map(
    (m) => `${m[3]}-${m[2]}-${m[1]}`,
  );
  let period: ActivityFilters["period"] | undefined;
  if (/\bhoje\b/.test(text)) period = "today";
  else if (/\bontem\b/.test(text)) period = "yesterday";
  else if (/\beste mes\b|\bnesse mes\b/.test(text)) period = "this_month";
  else if (days) period = "last_days";
  else if (months) period = "last_months";
  else if (iso.length || br.length) period = "range";
  else if (/\b(todo o periodo|sem periodo|sem limite de data)\b/.test(text))
    period = "all";
  if (period) {
    delete filters.from;
    delete filters.to;
    delete filters.days;
    delete filters.months;
    filters.period = period;
    if (days) filters.days = count[days[1]] ?? Number(days[1]);
    if (months) filters.months = count[months[1]] ?? Number(months[1]);
    if (period === "range") {
      const dates = iso.length ? iso : br;
      if (dates.length !== 2)
        return {
          error:
            "Informe as duas datas do intervalo, com ano: AAAA-MM-DD ou DD/MM/AAAA.",
        };
      [filters.from, filters.to] = dates;
    }
  }
  if (/\bultimos?\b/.test(text) && /\b(dias|meses)\b/.test(text) && !period)
    return { error: "Informe o período em dias (até 365) ou meses (até 60)." };
  const category = catalog.categories.find((option) =>
    ` ${text} `.includes(` ${foldName(option.name)} `),
  );
  const sub = message.match(/\bsub[ -]?(\d{1,3})\b/i);
  if (category) filters.category = category.name;
  else if (sub) filters.category = `Sub-${sub[1]}`;
  const clubs = catalog.clubs.filter((option) =>
    ` ${text} `.includes(` ${foldName(option.name)} `),
  );
  if (clubs.length === 1) filters.club = clubs[0].name;
  else if (clubs.length > 1)
    return {
      error: "Foi citado mais de um clube/equipe. Informe uma opção por busca.",
    };
  else {
    const named = text
      .match(
        /\b(?:do clube|da equipe|do time|do|da) ([a-z0-9 ]+?)(?=\b(?:com|tem|tiveram|que|nos|hoje|ontem|ultimos)\b|$)/,
      )?.[1]
      ?.trim();
    if (
      named &&
      !/^(categoria|sub |mes|periodo|naipe|modalidade)/.test(named)
    ) {
      const matches = catalog.clubs.filter((option) =>
        foldName(option.name).split(" ").includes(named),
      );
      if (matches.length === 1) filters.club = matches[0].name;
      else if (matches.length > 1)
        return {
          error: "O nome do clube/equipe é ambíguo. Informe o nome completo.",
        };
      else filters.club = named;
    }
  }
  if (/\bfeminino\b/.test(text)) filters.division = "Feminino";
  if (/\bmasculino\b/.test(text)) filters.division = "Masculino";
  const modality = text.match(/\b(3x3|5x5)\b/);
  if (modality) filters.modality = modality[1];
  if (/\bfisioterap/.test(text)) filters.specialty = "Fisioterapia";
  else if (/\bmedicina\b/.test(text)) filters.specialty = "Medicina";
  else if (/\bnutricao\b/.test(text)) filters.specialty = "Nutrição";
  else if (/\bpsicologia\b/.test(text)) filters.specialty = "Psicologia";
  if (/\bsem (especialidade|filtro de especialidade)\b/.test(text))
    delete filters.specialty;
  if (
    filters.specialty &&
    (filters.kinds.length !== 1 || filters.kinds[0] !== "evolution")
  )
    return {
      error:
        "Especialidade é um filtro de evoluções. Peça para remover esse filtro antes de buscar outros tipos de registro.",
    };
  if (/\brascunhos?\b/.test(text)) filters.status = "draft";
  else if (/\bfinalizad\w*\b/.test(text)) filters.status = "finalized";
  else if (/\bem revisao\b/.test(text)) filters.status = "ready_for_review";
  if (/\bmais antigos\b/.test(text)) filters.sort = "oldest";
  else if (/\bpor nome\b|\bordem alfabetica\b/.test(text))
    filters.sort = "name";
  const parsed = activityFilterSchema.safeParse(filters);
  return parsed.success
    ? { filters: parsed.data }
    : {
        error:
          "Os filtros ou o período não são válidos. Use até 365 dias, 60 meses ou um intervalo com duas datas completas.",
      };
}
