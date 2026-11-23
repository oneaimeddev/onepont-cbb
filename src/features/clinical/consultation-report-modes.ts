// Report modes offered in the chat after a consultation transcript is sent. The professional
// picks one; the report is generated for their profession and goes to the usual approval card.
export type ReportMode = "detailed" | "summary";

export const reportModes: Record<ReportMode, { label: string; title: string; description: string }> = {
  detailed: {
    label: "Relatório detalhado",
    title: "Relatório detalhado da consulta",
    description: "Estrutura completa em 11 seções, com hipóteses e CID-10, diferenciais por especialidade, exames, conduta, orientações e retorno.",
  },
  summary: {
    label: "Relatório sintético",
    title: "Relatório sintético da consulta",
    description: "No máximo 1 página, até 2 diagnósticos, sem diferenciais extensos e exames em 2 a 4 linhas.",
  },
};

export function isReportMode(value: unknown): value is ReportMode {
  return value === "detailed" || value === "summary";
}
