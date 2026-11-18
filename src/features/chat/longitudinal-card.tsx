"use client";

import { useState } from "react";
import { ClinicalReadings } from "./clinical-reading";
import type { HistoryAnalysis, HistoryKind } from "./history-analysis";

const labels: Record<HistoryKind, string> = {
  evolution: "Evoluções",
  prescription: "Prescrições",
  surgical_order: "Pedidos cirúrgicos",
  exam_request: "Solicitações de exame",
};

function coverage(analysis: HistoryAnalysis) {
  if (analysis.complete && analysis.examined === 0) return "Cobertura completa: não há registro autorizado neste recorte.";
  if (analysis.complete) return "Cobertura completa dos registros autorizados neste recorte.";
  if (analysis.reason === "cancelled") return "A análise foi interrompida. O resultado está incompleto.";
  if (analysis.reason === "limit") return `Examinei ${analysis.examined} de ${analysis.total} registros autorizados. O restante não entra na conclusão.`;
  return "Uma parte da consulta falhou. O resultado está incompleto.";
}

function day(value: string) {
  return value.slice(0, 10);
}

export function LongitudinalCard({ analysis }: { analysis: HistoryAnalysis }) {
  const [shown, setShown] = useState(8);
  const visible = analysis.items.slice(0, shown);
  const board = {
    source: "evolution" as const,
    athleteId: analysis.athleteId,
    total: visible.length,
    page: 1,
    pageSize: Math.max(1, visible.length),
    kind: "" as const,
    status: "" as const,
    items: visible.map((item) => ({ id: item.id, athleteId: analysis.athleteId, kind: item.kind, open: false })),
  };
  const dated = analysis.items.filter((item) => item.updatedAt && day(item.updatedAt) !== day(item.clinicalAt)).slice(0, 3);
  return (
    <section className="ia-longitudinal" aria-label="Análise longitudinal">
      <p className="ia-kicker">Análise longitudinal</p>
      <h3>{analysis.athleteName}</h3>
      <p>{analysis.periodLabel}</p>
      <p>{coverage(analysis)}</p>
      <p className="ia-longitudinal-counts">
        {analysis.kinds.map((kind) => kind !== "evolution" && !analysis.documentsIncluded ? null : (
          <span key={kind}>{labels[kind]}: {analysis.counts[kind]}</span>
        ))}
      </p>
      <p>{analysis.summary}</p>
      {analysis.documentsIncluded ? null : <p>Documentos médicos não entram nesta consulta.</p>}
      {analysis.notices.map((notice) => <p key={notice}>{notice}</p>)}
      {dated.length > 0 ? (
        <p>A data clínica e a atualização diferem em {dated.map((item) => `${labels[item.kind]} (${day(item.clinicalAt)} / ${day(item.updatedAt)})`).join(", ")}.</p>
      ) : null}
      {analysis.gaps.length > 0 ? (
        <details>
          <summary>Lacunas do período</summary>
          <ul>
            {analysis.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </details>
      ) : null}
      <p>Sequência no tempo não indica causa. Ausência de registro não significa que o fato não aconteceu.</p>
      {visible.length > 0 ? <ClinicalReadings board={board} /> : null}
      {shown < analysis.items.length ? (
        <button type="button" className="ia-more" onClick={() => setShown((current) => current + 8)}>Ver mais registros</button>
      ) : null}
    </section>
  );
}
