"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { setUnsavedClinicalDraft } from "../clinical/unsaved";
import {
  documentKinds, emptyMedication, examTypeLabels, lateralityLabels, priorityLabels,
  type ExamContent, type Laterality, type MedicationItem, type PrescriptionContent, type Priority, type SurgicalContent,
} from "../documents/content";
import { discardDocumentDraft, saveDocumentDraft } from "./document-draft-actions";
import { documentMissing, documentSaveMessage, documentTitle, type DocumentDraft } from "./document-draft";

const statusCopy: Record<DocumentDraft["state"], string> = {
  proposal: "Proposta ainda não salva",
  saving: "Salvando…",
  saved: "Rascunho salvo",
  error: "Não foi possível salvar",
  discarded: "Proposta descartada. Nenhum documento foi gravado.",
};

function MedicationFields({ item, onChange }: { item: MedicationItem; onChange: (next: MedicationItem) => void }) {
  const fields: { key: keyof MedicationItem; label: string; max: number }[] = [
    { key: "name", label: "Medicamento", max: 160 },
    { key: "presentation", label: "Apresentação", max: 160 },
    { key: "dose", label: "Dose", max: 160 },
    { key: "dose_unit", label: "Unidade", max: 160 },
    { key: "route", label: "Via", max: 160 },
    { key: "schedule", label: "Frequência", max: 160 },
    { key: "duration", label: "Duração", max: 160 },
    { key: "quantity", label: "Quantidade", max: 160 },
  ];
  return (
    <div className="ia-draft-fields">
      {fields.map((field) => (
        <label key={field.key}>{field.label}
          <input value={item[field.key]} maxLength={field.max} onChange={(event) => onChange({ ...item, [field.key]: event.target.value })} />
        </label>
      ))}
      <label>Instruções
        <textarea value={item.instructions} maxLength={500} rows={3} onChange={(event) => onChange({ ...item, instructions: event.target.value })} />
      </label>
    </div>
  );
}

function PrescriptionRead({ content }: { content: PrescriptionContent }) {
  return (
    <div className="ia-draft-read">
      {content.items.map((item, index) => {
        const dose = [item.dose, item.dose_unit].filter((part) => part.trim()).join(" ");
        return (
          <section key={item.id} aria-label={`Medicamento ${index + 1}`}>
            <p className="ia-draft-title">{item.name.trim() || `Medicamento ${index + 1}`}</p>
            {item.presentation.trim() ? <p>Apresentação: {item.presentation}</p> : null}
            {dose ? <p>Dose: {dose}</p> : null}
            {item.route.trim() ? <p>Via: {item.route}</p> : null}
            {item.schedule.trim() ? <p>Frequência: {item.schedule}</p> : null}
            {item.duration.trim() ? <p>Duração: {item.duration}</p> : null}
            {item.quantity.trim() ? <p>Quantidade: {item.quantity}</p> : null}
            {item.instructions.trim() ? <p>Instruções: {item.instructions}</p> : null}
          </section>
        );
      })}
      {content.notes.trim() ? <p>Observações: {content.notes}</p> : null}
    </div>
  );
}

function ExamRead({ content }: { content: ExamContent }) {
  return (
    <div className="ia-draft-read">
      {content.items.map((item, index) => (
        <section key={item.id} aria-label={`Exame ${index + 1}`}>
          <p className="ia-draft-title">{item.name.trim() || `Exame ${index + 1}`}</p>
          {item.exam_type ? <p>Tipo: {examTypeLabels[item.exam_type]}</p> : null}
          {item.region.trim() ? <p>Região: {item.region}</p> : null}
          {item.laterality ? <p>Lateralidade: {lateralityLabels[item.laterality]}</p> : null}
          {item.technical_details.trim() ? <p>Detalhes técnicos: {item.technical_details}</p> : null}
          {item.notes.trim() ? <p>Observações: {item.notes}</p> : null}
        </section>
      ))}
      {content.justification.trim() ? <p>Justificativa: {content.justification}</p> : null}
      {content.indication.trim() ? <p>Indicação: {content.indication}</p> : null}
      {content.diagnosis.trim() ? <p>Hipótese diagnóstica: {content.diagnosis}</p> : null}
      {content.additional.trim() ? <p>Orientações: {content.additional}</p> : null}
    </div>
  );
}

function SurgicalRead({ content }: { content: SurgicalContent }) {
  return (
    <div className="ia-draft-read">
      <p className="ia-draft-title">{content.procedure.trim() || "Procedimento não informado"}</p>
      {content.region.trim() ? <p>Região: {content.region}</p> : null}
      {content.laterality ? <p>Lateralidade: {lateralityLabels[content.laterality]}</p> : null}
      {content.indication.trim() ? <p>Indicação: {content.indication}</p> : null}
      {content.diagnosis.trim() ? <p>Diagnóstico ou hipótese: {content.diagnosis}</p> : null}
      {content.justification.trim() ? <p>Justificativa: {content.justification}</p> : null}
      {content.priority ? <p>Prioridade: {priorityLabels[content.priority]}</p> : null}
      {content.materials.trim() ? <p>Materiais: {content.materials}</p> : null}
      {content.additional.trim() ? <p>Informações complementares: {content.additional}</p> : null}
    </div>
  );
}

export function DocumentDraftCard({ draft, onChange }: {
  draft: DocumentDraft;
  onChange: (next: DocumentDraft) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [blankItem] = useState(emptyMedication);
  const [pending, startTransition] = useTransition();
  const busy = pending || draft.state === "saving";
  const open = (draft.state === "proposal" || draft.state === "error") && draft.content !== null;
  const copy = documentKinds[draft.kind];
  const label = draft.kind === "prescription" ? "Proposta de prescrição" : draft.kind === "exam_request" ? "Proposta de solicitação de exames" : "Proposta de pedido cirúrgico";

  useEffect(() => {
    const unsaved = draft.state === "proposal" || draft.state === "saving" || draft.state === "error";
    setUnsavedClinicalDraft(unsaved);
  }, [draft.state]);

  function replace(content: DocumentDraft["content"]) {
    onChange({
      ...draft,
      content,
      title: documentTitle(draft.kind, content),
      missing: documentMissing(draft.kind, content),
      state: "proposal",
      error: null,
    });
  }

  function save() {
    if (!draft.content) return;
    const current = draft;
    onChange({ ...current, state: "saving", error: null });
    startTransition(async () => {
      const result = await saveDocumentDraft({ confirm: "yes", requestId: current.requestId, kind: current.kind, content: current.content! });
      if (result.ok) {
        onChange({ ...current, state: "saved", documentId: result.id, title: documentTitle(current.kind, current.content), error: null });
        return;
      }
      onChange({ ...current, state: "error", error: documentSaveMessage(result.error) });
    });
  }

  return (
    <section className="ia-draft" aria-label={label} data-draft-state={draft.state} aria-busy={busy}>
      <header>
        <h3>{draft.state === "saved" ? copy.title : copy.draftTitle}</h3>
        <p className="ia-draft-status" aria-live="polite">{statusCopy[draft.state]}</p>
      </header>
      <p className="ia-draft-banner">Rascunho — não assinado e não emitido.</p>
      <dl>
        <div><dt>Tipo</dt><dd>{copy.title}</dd></div>
        <div><dt>Atleta</dt><dd>{draft.athleteName}</dd></div>
        <div><dt>Médico responsável</dt><dd>{draft.professionalName}</dd></div>
        <div><dt>Identificação profissional</dt><dd>{draft.credentialLabel ?? "Não registrada neste rascunho"}</dd></div>
      </dl>
      {draft.state === "discarded" ? null : editing && open && draft.kind === "prescription" && draft.content && "notes" in draft.content ? (
        <div className="ia-draft-fields">
          {draft.content.items.map((item) => (
            <MedicationFields key={item.id} item={item} onChange={(next) => replace({ ...draft.content as PrescriptionContent, items: (draft.content as PrescriptionContent).items.map((entry) => entry.id === item.id ? next : entry) })} />
          ))}
          {draft.content.items.length === 0 ? (
            <MedicationFields item={blankItem} onChange={(next) => replace({ notes: draft.content && "notes" in draft.content ? draft.content.notes : "", items: [next] })} />
          ) : null}
          <label>Observações
            <textarea value={draft.content.notes} maxLength={2000} rows={3} onChange={(event) => replace({ ...(draft.content as PrescriptionContent), notes: event.target.value })} />
          </label>
        </div>
      ) : editing && open && draft.kind === "exam_request" && draft.content && "occurred_at" in draft.content ? (
        <div className="ia-draft-fields">
          {draft.content.items.map((item) => (
            <label key={item.id}>Exame
              <input value={item.name} maxLength={160} onChange={(event) => replace({ ...draft.content as ExamContent, items: (draft.content as ExamContent).items.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry) })} />
            </label>
          ))}
          <label>Justificativa
            <textarea value={draft.content.justification} maxLength={2000} rows={3} onChange={(event) => replace({ ...(draft.content as ExamContent), justification: event.target.value })} />
          </label>
          <label>Orientações
            <textarea value={draft.content.additional} maxLength={2000} rows={3} onChange={(event) => replace({ ...(draft.content as ExamContent), additional: event.target.value })} />
          </label>
        </div>
      ) : editing && open && draft.content && "procedure" in draft.content ? (
        <div className="ia-draft-fields">
          <label>Procedimento<input value={draft.content.procedure} maxLength={200} onChange={(event) => replace({ ...(draft.content as SurgicalContent), procedure: event.target.value })} /></label>
          <label>Região anatômica<input value={draft.content.region} maxLength={120} onChange={(event) => replace({ ...(draft.content as SurgicalContent), region: event.target.value })} /></label>
          <label>Lateralidade
            <select value={draft.content.laterality} onChange={(event) => replace({ ...(draft.content as SurgicalContent), laterality: event.target.value as Laterality })}>
              {(Object.keys(lateralityLabels) as Laterality[]).map((key) => <option key={key || "empty"} value={key}>{lateralityLabels[key]}</option>)}
            </select>
          </label>
          <label>Indicação clínica<textarea value={draft.content.indication} maxLength={2000} rows={3} onChange={(event) => replace({ ...(draft.content as SurgicalContent), indication: event.target.value })} /></label>
          <label>Diagnóstico ou hipótese<textarea value={draft.content.diagnosis} maxLength={500} rows={3} onChange={(event) => replace({ ...(draft.content as SurgicalContent), diagnosis: event.target.value })} /></label>
          <label>Justificativa<textarea value={draft.content.justification} maxLength={2000} rows={3} onChange={(event) => replace({ ...(draft.content as SurgicalContent), justification: event.target.value })} /></label>
          <label>Prioridade
            <select value={draft.content.priority} onChange={(event) => replace({ ...(draft.content as SurgicalContent), priority: event.target.value as Priority })}>
              {(Object.keys(priorityLabels) as Priority[]).map((key) => <option key={key || "empty"} value={key}>{priorityLabels[key]}</option>)}
            </select>
          </label>
          <label>Materiais<textarea value={draft.content.materials} maxLength={1000} rows={3} onChange={(event) => replace({ ...(draft.content as SurgicalContent), materials: event.target.value })} /></label>
          <label>Informações complementares<textarea value={draft.content.additional} maxLength={2000} rows={3} onChange={(event) => replace({ ...(draft.content as SurgicalContent), additional: event.target.value })} /></label>
        </div>
      ) : draft.kind === "exam_request" && draft.content && "occurred_at" in draft.content ? (
        <ExamRead content={draft.content} />
      ) : draft.kind === "prescription" && draft.content && "notes" in draft.content ? (
        <PrescriptionRead content={draft.content} />
      ) : draft.content && "procedure" in draft.content ? (
        <SurgicalRead content={draft.content} />
      ) : (
        <p className="ia-draft-title">{draft.title}</p>
      )}
      {open && draft.missing.length > 0 ? (
        <div>
          <p>Informações ainda não informadas</p>
          <ul className="ia-draft-missing">
            {draft.missing.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {draft.error ? <p role="alert">{draft.error}</p> : null}
      {draft.state === "saved" ? <p>O documento foi gravado como rascunho. Ele não foi emitido nem assinado.</p> : null}
      <div className="ia-draft-actions">
        {open ? (
          <>
            <button type="button" onClick={() => setEditing((value) => !value)} disabled={busy}>{editing ? "Concluir edição" : "Editar"}</button>
            <button type="button" className="ia-draft-save" onClick={save} disabled={busy}>Confirmar e salvar</button>
            <button type="button" onClick={() => { void discardDocumentDraft(draft.requestId); onChange({ ...draft, state: "discarded", error: null }); }} disabled={busy}>Descartar</button>
          </>
        ) : null}
        {draft.state === "saved" && draft.documentId ? (
          <Link href={`/atletas/${draft.athleteId}/documentos/${draft.documentId}`} prefetch={false}>Abrir no prontuário</Link>
        ) : null}
      </div>
    </section>
  );
}
