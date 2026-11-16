export type RecordStatus = "final" | "draft";
export type RecordVisibility = "team" | "author";

export type ClinicalEntry = {
  id: string;
  iso: string;
  day: string;
  monthId: string;
  monthLabel: string;
  title: string;
  author: string;
  specialty: string;
  status: RecordStatus;
  visibility: RecordVisibility;
  body: string;
};

export const athlete = {
  name: "Lara Benedetti Nogueira",
  portrait: "/design-lab/lara-benedetti.jpg",
  portraitWidth: 864,
  portraitHeight: 1152,
  line: "Convocada para a seleção adulta feminina.",
  facts: [
    ["Posição", "Ala-armadora"],
    ["Categoria", "Adulto feminino"],
    ["Clube", "União Basquete Campinas"],
    ["Nascimento", "14 mar 1998"],
  ],
} as const;

export const season = {
  title: "Temporada 2026–2027",
  facts: [
    ["Clube", "União Basquete Campinas"],
    ["Naipe", "Feminino"],
    ["Modalidade", "Basquete 5x5"],
    ["Vigência", "Desde 1º mar 2026"],
  ],
  previous: {
    title: "Temporada 2025–2026",
    facts: [
      ["Clube", "Litoral Basquete"],
      ["Naipe", "Feminino"],
      ["Convocação", "Não convocada"],
      ["Vigência", "Mar 2025 a fev 2026"],
    ],
  },
} as const;

export const professionals = [
  { name: "Helena Vargas", specialty: "Medicina esportiva", relation: "você" },
  { name: "Paulo Mendes Ribeiro", specialty: "Fisioterapia", relation: "acesso ativo" },
  { name: "Camila Duarte", specialty: "Nutrição esportiva", relation: "acesso ativo" },
  { name: "Beatriz Holm", specialty: "Psicologia", relation: "acesso ativo" },
] as const;

export const history: ClinicalEntry[] = [
  {
    id: "retorno-tornozelo",
    iso: "2026-11-12",
    day: "12",
    monthId: "2026-11",
    monthLabel: "Novembro de 2026",
    title: "Retorno da entorse de tornozelo esquerdo",
    author: "Helena Vargas",
    specialty: "Medicina esportiva",
    status: "final",
    visibility: "team",
    body: "Marcha sem dor em linha reta. Edema residual discreto. Mantida a restrição de contato por sete dias. A fisioterapia segue com a progressão de salto.",
  },
  {
    id: "propriocepcao",
    iso: "2026-11-04",
    day: "4",
    monthId: "2026-11",
    monthLabel: "Novembro de 2026",
    title: "Força e propriocepção do tornozelo",
    author: "Paulo Mendes Ribeiro",
    specialty: "Fisioterapia",
    status: "final",
    visibility: "team",
    body: "Apoio unipodal estável por 30 segundos. Iniciados saltos bipodais em solo estável, sem dor durante a sessão.",
  },
  {
    id: "plano-alimentar",
    iso: "2026-10-28",
    day: "28",
    monthId: "2026-10",
    monthLabel: "Outubro de 2026",
    title: "Plano alimentar de dias com dois treinos",
    author: "Camila Duarte",
    specialty: "Nutrição esportiva",
    status: "final",
    visibility: "team",
    body: "Reorganização das refeições nos dias de carga dupla. Nenhuma suplementação nova neste ciclo.",
  },
  {
    id: "psicologia",
    iso: "2026-10-15",
    day: "15",
    monthId: "2026-10",
    monthLabel: "Outubro de 2026",
    title: "Acompanhamento psicológico",
    author: "Beatriz Holm",
    specialty: "Psicologia",
    status: "final",
    visibility: "author",
    body: "O conteúdo permanece com Beatriz Holm e não é exibido aos demais profissionais.",
  },
  {
    id: "pre-participacao",
    iso: "2026-10-02",
    day: "2",
    monthId: "2026-10",
    monthLabel: "Outubro de 2026",
    title: "Exame clínico de pré-participação",
    author: "Helena Vargas",
    specialty: "Medicina esportiva",
    status: "final",
    visibility: "team",
    body: "Exame de pré-temporada sem achado que impeça a atividade. Entorse à direita em 2024, sem instabilidade no teste de hoje.",
  },
  {
    id: "joelho-rascunho",
    iso: "2026-09-18",
    day: "18",
    monthId: "2026-09",
    monthLabel: "Setembro de 2026",
    title: "Dor anterior no joelho após saltos",
    author: "Helena Vargas",
    specialty: "Medicina esportiva",
    status: "draft",
    visibility: "author",
    body: "Queixa após o treino de saltos. Sem derrame aparente. O exame ainda está incompleto e o registro não foi finalizado.",
  },
];

export function groupByMonth(entries: ClinicalEntry[]) {
  const groups: { id: string; label: string; entries: ClinicalEntry[] }[] = [];
  for (const entry of entries) {
    const current = groups.at(-1);
    if (!current || current.id !== entry.monthId) {
      groups.push({ id: entry.monthId, label: entry.monthLabel, entries: [entry] });
    } else {
      current.entries.push(entry);
    }
  }
  return groups;
}
