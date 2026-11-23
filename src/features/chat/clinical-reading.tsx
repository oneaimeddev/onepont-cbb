"use client";

import { useEffect, useState } from "react";
import { documentKinds, examTypeLabels, lateralityLabels, priorityLabels, type CertificateContent, type ExamType, type Laterality, type Priority, type ReferralContent } from "../documents/content";
import { PrescriptionSheet } from "../documents/prescription-sheet";
import { LetterSheet } from "../documents/letter-sheet";
import { certificateLetter, referralLetter } from "../documents/letter-format";
import { isDocumentKind, presentedCertificate, presentedReferral } from "./document-draft";
import type { ReadingBoard, ReadingKind } from "./document-resolution";
import { ClinicalText } from "../../components/clinical-text";

type MedicationView = {
  name: string;
  presentation: string;
  dose: string;
  doseUnit: string;
  route: string;
  schedule: string;
  duration: string;
  quantity: string;
  instructions: string;
};

type ExamView = {
  name: string;
  examType: ExamType | "";
  region: string;
  laterality: Laterality | "";
  technicalDetails: string;
  notes: string;
};

type ReadingView = {
  letter: CertificateContent | ReferralContent | null;
  patientName: string;
  id: string;
  kind: ReadingKind;
  title: string;
  authorName: string;
  credentialLabel: string | null;
  statusLabel: string;
  unsigned: boolean;
  occurredAt: string;
  notes: string;
  medications: MedicationView[];
  exams: ExamView[];
  procedure: string;
  region: string;
  laterality: Laterality | "";
  indication: string;
  diagnosis: string;
  justification: string;
  priority: Priority | "";
  additional: string;
  materials: string;
  specialty: string;
  body: string;
  restricted: boolean;
  truncated: boolean;
};

const emptyView: ReadingView = {
  letter: null, patientName: "",
  id: "", kind: "prescription", title: "", authorName: "", credentialLabel: null, statusLabel: "", unsigned: false,
  occurredAt: "", notes: "", medications: [], exams: [], procedure: "", region: "", laterality: "", indication: "", diagnosis: "",
  justification: "", priority: "", additional: "", materials: "", specialty: "", body: "", restricted: false, truncated: false,
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function medication(value: unknown): MedicationView | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = text(row.name, 160);
  if (!name) return null;
  return {
    name,
    presentation: text(row.presentation, 160),
    dose: text(row.dose, 160),
    doseUnit: text(row.dose_unit, 160),
    route: text(row.route, 160),
    schedule: text(row.schedule, 160),
    duration: text(row.duration, 160),
    quantity: text(row.quantity, 160),
    instructions: text(row.instructions, 500),
  };
}

export function readingView(value: unknown): ReadingView | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.unavailable === true) return null;
  if (row.kind !== "evolution" && !isDocumentKind(row.kind)) return null;
  if (typeof row.id !== "string") return null;
  const laterality = text(row.laterality, 20) as Laterality;
  const priority = text(row.priority, 20) as Priority;
  const exams = Array.isArray(row.exams) ? row.exams.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const name = text(entry.name, 160);
    if (!name) return [];
    const examType: ExamType | "" = entry.exam_type === "laboratory" || entry.exam_type === "imaging" || entry.exam_type === "other" ? entry.exam_type : "";
    const side = text(entry.laterality, 20);
    const laterality: ExamView["laterality"] = side === "left" || side === "right" || side === "bilateral" || side === "not_applicable" ? side : "";
    return [{
      name,
      examType,
      region: text(entry.region, 160),
      laterality,
      technicalDetails: text(entry.technical_details, 500),
      notes: text(entry.notes, 500),
    }];
  }).slice(0, 12) : [];
  const medications = Array.isArray(row.medications) ? row.medications.flatMap((item) => {
    const next = medication(item);
    return next ? [next] : [];
  }).slice(0, 12) : [];
  return {
    ...emptyView,
    letter: row.kind === "certificate" ? presentedCertificate(row.letter) : row.kind === "referral" ? presentedReferral(row.letter) : null,
    patientName: text(row.patientName, 160),
    id: row.id,
    kind: row.kind,
    title: text(row.title, 160),
    authorName: text(row.authorName, 160),
    credentialLabel: text(row.credentialLabel, 80) || null,
    statusLabel: text(row.statusLabel, 80),
    unsigned: row.unsigned === true,
    occurredAt: text(row.occurredAt, 40),
    notes: text(row.notes, 2000),
    medications,
    exams,
    procedure: text(row.procedure, 200),
    region: text(row.region, 120),
    laterality: laterality in lateralityLabels ? laterality : "",
    indication: text(row.indication, 2000),
    diagnosis: text(row.diagnosis, 500),
    justification: text(row.justification, 2000),
    priority: priority in priorityLabels ? priority : "",
    additional: text(row.additional, 2000),
    materials: text(row.materials, 1000),
    specialty: text(row.specialty, 80),
    body: text(row.body, 4000),
    restricted: row.restricted === true,
    truncated: row.truncated === true,
  };
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}

function typeLabel(kind: ReadingKind) {
  if (kind === "evolution") return "Evolução";
  return documentKinds[kind].title;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}


export function ClinicalReadings({ board, onMore, morePending }: {
  board: ReadingBoard;
  onMore?: () => void;
  morePending?: boolean;
}) {
  const [views, setViews] = useState<Record<string, ReadingView | "missing">>({});
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(board.items.map((item) => [item.id, item.open])));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const items = board.items.map((item) => ({ id: item.id, kind: item.kind, detail: open[item.id] === true }));
    void fetch("/api/inteligencia/leituras", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ athleteId: board.athleteId, items }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { readings?: unknown };
      if (!Array.isArray(payload.readings)) throw new Error("unavailable");
      const next: Record<string, ReadingView | "missing"> = {};
      for (const item of board.items) next[item.id] = "missing";
      for (const entry of payload.readings) {
        const view = readingView(entry);
        if (view) next[view.id] = view;
      }
      setViews(next);
      setReady(true);
      setFailed(false);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!(error instanceof Error)) throw error;
      setFailed(true);
    });
    return () => controller.abort();
  }, [board.athleteId, board.items, open]);

  const visible = board.items.filter((item) => views[item.id] !== "missing");
  const canMore = Boolean(onMore) && board.items.length < board.total && board.page < 40;

  return (
    <div className="ia-readings">
      {failed ? <p role="alert">Não foi possível consultar os documentos autorizados.</p> : null}
      {!ready && !failed ? <p className="ia-reading-loading" aria-busy="true">Carregando documentos autorizados.</p> : null}
      <ul className="ia-reading-list">
        {visible.map((item) => {
          const view = views[item.id];
          if (!view || view === "missing") return null;
          const expanded = open[item.id] === true;
          const title = view.title || typeLabel(item.kind);
          const panelId = `leitura-${item.id}`;
          return (
            <li key={item.id} className="ia-reading-card">
              <div className="ia-reading-head">
                <p className="ia-reading-kicker">{typeLabel(item.kind)}</p>
                <h3>{title}</h3>
                <p className="ia-reading-meta">
                  {view.occurredAt ? <span>{formatWhen(view.occurredAt)}</span> : null}
                  {view.authorName ? <span>{view.authorName}{view.credentialLabel ? ` · ${view.credentialLabel}` : ""}</span> : null}
                </p>
                <p className="ia-reading-status">{view.unsigned ? "Rascunho não assinado" : view.statusLabel}</p>
              </div>
              <button
                type="button"
                className="ia-reading-toggle"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen((current) => ({ ...current, [item.id]: !expanded }))}
              >
                {expanded ? "Recolher" : "Ler"}
              </button>
              {expanded ? (
                <div id={panelId} className="ia-reading-body">
                  {item.kind === "prescription" ? (
                    <>
                      <PrescriptionSheet
                        items={view.medications.map((medicationItem) => ({ ...medicationItem, dose_unit: medicationItem.doseUnit }))}
                        notes={view.notes}
                      />
                    </>
                  ) : null}
                  {item.kind === "exam_request" ? (
                    <>
                      {view.exams.map((exam, index) => (
                        <section key={`${exam.name}-${index}`}>
                          <h4>{view.exams.length > 1 ? `Exame ${index + 1}` : "Exame"}</h4>
                          <dl>
                            <Field label="Nome" value={exam.name} />
                            <Field label="Tipo" value={exam.examType ? examTypeLabels[exam.examType] : ""} />
                            <Field label="Região anatômica" value={exam.region} />
                            <Field label="Lateralidade" value={exam.laterality ? lateralityLabels[exam.laterality] : ""} />
                            <Field label="Detalhes técnicos" value={exam.technicalDetails} />
                            <Field label="Observações" value={exam.notes} />
                          </dl>
                        </section>
                      ))}
                      <dl>
                        <Field label="Indicação clínica" value={view.indication} />
                        <Field label="Justificativa" value={view.justification} />
                        <Field label="Hipótese diagnóstica" value={view.diagnosis} />
                        <Field label="Prioridade" value={view.priority ? priorityLabels[view.priority] : ""} />
                        <Field label="Orientações" value={view.additional} />
                      </dl>
                    </>
                  ) : null}
                  {view.letter && (item.kind === "certificate" || item.kind === "referral") ? (
                    <LetterSheet letter={"certificate_type" in view.letter ? certificateLetter(view.letter, view.patientName) : referralLetter(view.letter, view.patientName)} />
                  ) : null}
                  {item.kind === "surgical_order" ? (
                    <dl>
                      <Field label="Procedimento" value={view.procedure} />
                      <Field label="Região anatômica" value={view.region} />
                      <Field label="Lateralidade" value={view.laterality ? lateralityLabels[view.laterality] : ""} />
                      <Field label="Indicação clínica" value={view.indication} />
                      <Field label="Diagnóstico ou hipótese" value={view.diagnosis} />
                      <Field label="Justificativa" value={view.justification} />
                      <Field label="Prioridade" value={view.priority ? priorityLabels[view.priority] : ""} />
                      <Field label="Informações complementares" value={view.additional} />
                      <Field label="Materiais" value={view.materials} />
                    </dl>
                  ) : null}
                  {item.kind === "evolution" ? (
                    <dl>
                      <Field label="Especialidade" value={view.specialty} />
                      {view.body ? <div><dt>Registro</dt><dd className="clinical-reading-body"><ClinicalText text={view.body} /></dd></div> : null}
                      {view.truncated ? <div><dt>Continuação</dt><dd>O restante permanece no prontuário.</dd></div> : null}
                      {view.restricted ? <div><dt>Visibilidade</dt><dd>Restrito ao autor</dd></div> : null}
                    </dl>
                  ) : null}
                  <p className="ia-reading-origin">Conteúdo recuperado do registro. Não foi reescrito pelo assistente.</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canMore ? (
        <button type="button" className="ia-more" onClick={onMore} disabled={morePending} aria-busy={morePending}>
          {morePending ? "Carregando…" : "Ver mais"}
        </button>
      ) : null}
    </div>
  );
}
