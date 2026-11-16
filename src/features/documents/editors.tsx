"use client";

import Link from "next/link";
import { useState } from "react";
import { SubmitButton } from "../../components/submit-button";
import { saveDocument } from "./actions";
import {
  emptyMedication, lateralityLabels, prescriptionPending, priorityLabels, surgicalPending,
  type MedicationItem, type PrescriptionContent, type SurgicalContent,
} from "./content";

function PendingList({ blocking, groups }: { blocking: string[]; groups: { title: string; fields: string[] }[] }) {
  if (!blocking.length && !groups.length) return <p role="status">Os campos essenciais deste rascunho estão preenchidos.</p>;
  return (
    <div>
      {blocking.map((item) => <p key={item} role="status">{item}</p>)}
      {groups.length > 0 && (
        <>
          <p>Campos ainda não preenchidos:</p>
          <ul className="document-pending">
            {groups.map((group) => <li key={group.title}>{group.title}: {group.fields.join(", ")}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function DraftForm({ athleteId, documentId, version, kind, content, returnTo, saved }: {
  athleteId: string;
  documentId: string;
  version: number;
  kind: "prescription" | "surgical_order";
  content: PrescriptionContent | SurgicalContent;
  returnTo: string;
  saved: boolean;
}) {
  return (
    <>
      <form action={saveDocument} className="document-actions">
        <input type="hidden" name="athlete" value={athleteId} />
        <input type="hidden" name="document" value={documentId} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="return" value={returnTo} />
        <input type="hidden" name="content" value={JSON.stringify(content)} />
        <SubmitButton name="intent" value="save" pendingLabel="Salvando…">Salvar rascunho</SubmitButton>
        <SubmitButton name="intent" value="review" className="outline" pendingLabel="Salvando…">Apresentar para revisão</SubmitButton>
        {saved && <Link className="outline" href={`${returnTo}?vista=previa`}>Pré-visualizar</Link>}
      </form>
    </>
  );
}

export function PrescriptionEditor({ athleteId, documentId, version, initial, returnTo, saved }: {
  athleteId: string;
  documentId: string;
  version: number;
  initial: PrescriptionContent;
  returnTo: string;
  saved: boolean;
}) {
  const [content, setContent] = useState(initial);
  const pending = prescriptionPending(content);

  function updateItem(id: string, patch: Partial<MedicationItem>) {
    setContent((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  }

  return (
    <div className="document-editor">
      {content.items.map((item, index) => (
        <fieldset className="document-item" key={item.id}>
          <legend>Medicamento {index + 1}</legend>
          <div className="document-grid">
            <label className="is-wide">Nome do medicamento<input value={item.name} maxLength={160} onChange={(event) => updateItem(item.id, { name: event.target.value })} /></label>
            <label className="is-wide">Apresentação ou concentração<input value={item.presentation} maxLength={160} onChange={(event) => updateItem(item.id, { presentation: event.target.value })} /></label>
            <label>Dose<input value={item.dose} maxLength={160} onChange={(event) => updateItem(item.id, { dose: event.target.value })} /></label>
            <label>Unidade<input value={item.dose_unit} maxLength={160} onChange={(event) => updateItem(item.id, { dose_unit: event.target.value })} /></label>
            <label>Via de administração<input value={item.route} maxLength={160} onChange={(event) => updateItem(item.id, { route: event.target.value })} /></label>
            <label>Frequência<input value={item.schedule} maxLength={160} onChange={(event) => updateItem(item.id, { schedule: event.target.value })} /></label>
            <label>Duração<input value={item.duration} maxLength={160} onChange={(event) => updateItem(item.id, { duration: event.target.value })} /></label>
            <label>Quantidade<input value={item.quantity} maxLength={160} onChange={(event) => updateItem(item.id, { quantity: event.target.value })} /></label>
            <label className="is-wide">Instruções complementares<textarea rows={2} maxLength={500} value={item.instructions} onChange={(event) => updateItem(item.id, { instructions: event.target.value })} /></label>
          </div>
          <button type="button" className="outline" onClick={() => setContent((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }))}>Remover medicamento {index + 1}</button>
        </fieldset>
      ))}
      <button type="button" className="outline" onClick={() => setContent((current) => ({ ...current, items: [...current.items, emptyMedication()] }))}>Adicionar medicamento</button>
      <label>Observações gerais<textarea rows={3} maxLength={2000} value={content.notes} onChange={(event) => setContent((current) => ({ ...current, notes: event.target.value }))} /></label>
      <PendingList blocking={pending.blocking} groups={pending.groups} />
      <DraftForm athleteId={athleteId} documentId={documentId} version={version} kind="prescription" content={content} returnTo={returnTo} saved={saved} />
    </div>
  );
}

export function SurgicalEditor({ athleteId, documentId, version, initial, returnTo, saved }: {
  athleteId: string;
  documentId: string;
  version: number;
  initial: SurgicalContent;
  returnTo: string;
  saved: boolean;
}) {
  const [content, setContent] = useState(initial);
  const pending = surgicalPending(content);

  function update(patch: Partial<SurgicalContent>) {
    setContent((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="document-editor">
      <div className="document-grid">
        <label className="is-wide">Procedimento proposto<input value={content.procedure} maxLength={200} onChange={(event) => update({ procedure: event.target.value })} /></label>
        <label>Região anatômica<input value={content.region} maxLength={120} onChange={(event) => update({ region: event.target.value })} /></label>
        <label>Lateralidade
          <select value={content.laterality} onChange={(event) => update({ laterality: event.target.value as SurgicalContent["laterality"] })}>
            {(Object.keys(lateralityLabels) as SurgicalContent["laterality"][]).map((value) => <option key={value || "empty"} value={value}>{lateralityLabels[value]}</option>)}
          </select>
        </label>
        <label className="is-wide">Indicação clínica<textarea rows={3} maxLength={2000} value={content.indication} onChange={(event) => update({ indication: event.target.value })} /></label>
        <label className="is-wide">Diagnóstico ou hipótese diagnóstica<textarea rows={2} maxLength={500} value={content.diagnosis} onChange={(event) => update({ diagnosis: event.target.value })} /></label>
        <label className="is-wide">Justificativa médica<textarea rows={3} maxLength={2000} value={content.justification} onChange={(event) => update({ justification: event.target.value })} /></label>
        <label>Prioridade
          <select value={content.priority} onChange={(event) => update({ priority: event.target.value as SurgicalContent["priority"] })}>
            {(Object.keys(priorityLabels) as SurgicalContent["priority"][]).map((value) => <option key={value || "empty"} value={value}>{priorityLabels[value]}</option>)}
          </select>
        </label>
        <label className="is-wide">Materiais ou necessidades específicas<textarea rows={2} maxLength={1000} value={content.materials} onChange={(event) => update({ materials: event.target.value })} /></label>
        <label className="is-wide">Informações complementares<textarea rows={3} maxLength={2000} value={content.additional} onChange={(event) => update({ additional: event.target.value })} /></label>
      </div>
      <PendingList blocking={pending.blocking} groups={pending.groups} />
      <DraftForm athleteId={athleteId} documentId={documentId} version={version} kind="surgical_order" content={content} returnTo={returnTo} saved={saved} />
    </div>
  );
}
