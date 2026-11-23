"use client";

import Link from "next/link";
import { DocumentJourney, useDocumentJourney } from "./document-journey";
import { useEffect, useRef, useState, useTransition } from "react";
import { DocumentPreview } from "../documents/preview";
import type { ReviewMaterial } from "../documents/review-types";
import "../documents/documents.css";
import { PrescriptionSheet } from "../documents/prescription-sheet";
import { LetterSheet } from "../documents/letter-sheet";
import { DocumentPaper } from "../documents/document-paper";
import { ExamSheet, SurgicalSheet } from "../documents/request-sheets";
import { paperTitle } from "../documents/request-format";
import { certificateLetter, referralLetter, type Letter } from "../documents/letter-format";
import { setUnsavedClinicalDraft } from "../clinical/unsaved";
import {
  certificateTypeLabels, documentKinds, emptyMedication, fitnessLabels, isCertificate, isExamRequest, isPrescription, isReferral, lateralityLabels, priorityLabels,
  type CertificateContent, type CertificateType, type DocumentKind, type ExamContent, type Fitness, type ReferralContent, type Laterality, type MedicationItem, type PrescriptionContent, type Priority, type SurgicalContent,
} from "../documents/content";
import { discardDocumentDraft, saveDocumentDraft, reviewDocumentDraft } from "./document-draft-actions";
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

const proposalLabels: Record<DocumentKind, string> = {
  prescription: "Proposta de prescrição",
  exam_request: "Proposta de solicitação de exames",
  surgical_order: "Proposta de pedido cirúrgico",
  certificate: "Proposta de atestado",
  referral: "Proposta de encaminhamento",
};

function CertificateFields({ content, onChange }: { content: CertificateContent; onChange: (next: CertificateContent) => void }) {
  const set = (patch: Partial<CertificateContent>) => onChange({ ...content, ...patch });
  return (
    <div className="ia-draft-fields">
      <label>Modalidade
        <select value={content.certificate_type} onChange={(event) => set({ certificate_type: event.target.value as CertificateType })}>
          {(Object.keys(certificateTypeLabels) as CertificateType[]).map((key) => <option key={key || "empty"} value={key}>{key ? certificateTypeLabels[key] : "Escolha a modalidade"}</option>)}
        </select>
      </label>
      <label>Data do atendimento<input type="date" value={content.occurred_at} onChange={(event) => set({ occurred_at: event.target.value })} /></label>
      {content.certificate_type === "leave" ? <>
        <label>Dias de afastamento<input inputMode="numeric" value={content.leave_days} maxLength={3} onChange={(event) => set({ leave_days: event.target.value.replace(/\D/g, "").slice(0, 3) })} /></label>
        <label>Início do afastamento<input type="date" value={content.leave_start} onChange={(event) => set({ leave_start: event.target.value })} /></label>
      </> : null}
      {content.certificate_type === "attendance" ? <>
        <label>Horário de chegada<input type="time" value={content.start_time} onChange={(event) => set({ start_time: event.target.value })} /></label>
        <label>Horário de saída<input type="time" value={content.end_time} onChange={(event) => set({ end_time: event.target.value })} /></label>
      </> : null}
      {content.certificate_type === "fitness" ? (
        <label>Conclusão
          <select value={content.fitness} onChange={(event) => set({ fitness: event.target.value as Fitness })}>
            {(Object.keys(fitnessLabels) as Fitness[]).map((key) => <option key={key || "empty"} value={key}>{fitnessLabels[key]}</option>)}
          </select>
        </label>
      ) : null}
      {content.certificate_type === "leave" || content.certificate_type === "fitness" ? (
        <label>{content.certificate_type === "leave" ? "Atividades afastadas" : "Atividade avaliada"}<input value={content.activities} maxLength={500} onChange={(event) => set({ activities: event.target.value })} /></label>
      ) : null}
      {content.fitness === "fit_with_restrictions" ? <label>Restrições<textarea value={content.restrictions} maxLength={1000} rows={3} onChange={(event) => set({ restrictions: event.target.value })} /></label> : null}
      <label>CID-10 (opcional)<input value={content.cid} maxLength={20} onChange={(event) => set({ cid: event.target.value })} /></label>
      <label className="check-label"><input type="checkbox" checked={content.cid_authorized} onChange={(event) => set({ cid_authorized: event.target.checked })} /><span>O paciente autorizou a inclusão do CID</span></label>
      <label>Observações<textarea value={content.notes} maxLength={2000} rows={3} onChange={(event) => set({ notes: event.target.value })} /></label>
    </div>
  );
}

function ReferralFields({ content, onChange }: { content: ReferralContent; onChange: (next: ReferralContent) => void }) {
  const set = (patch: Partial<ReferralContent>) => onChange({ ...content, ...patch });
  const text = (key: keyof Omit<ReferralContent, "priority">, label: string, max: number, rows = 0) => (
    <label key={key}>{label}{rows
      ? <textarea value={content[key]} maxLength={max} rows={rows} onChange={(event) => set({ [key]: event.target.value } as Partial<ReferralContent>)} />
      : <input value={content[key]} maxLength={max} onChange={(event) => set({ [key]: event.target.value } as Partial<ReferralContent>)} />}</label>
  );
  return (
    <div className="ia-draft-fields">
      {text("specialty", "Especialidade ou serviço", 160)}
      {text("professional", "Profissional de destino (opcional)", 160)}
      {text("reason", "Motivo do encaminhamento", 2000, 2)}
      {text("clinical_summary", "Resumo clínico", 2000, 3)}
      {text("diagnosis", "Hipótese diagnóstica", 500, 2)}
      {text("cid", "CID-10", 20)}
      {text("exams", "Exames realizados", 2000, 2)}
      {text("treatment", "Tratamentos realizados", 2000, 2)}
      {text("request", "Solicitação ao profissional de destino", 1000, 2)}
      <label>Prioridade
        <select value={content.priority} onChange={(event) => set({ priority: event.target.value as Priority })}>
          {(Object.keys(priorityLabels) as Priority[]).map((key) => <option key={key || "empty"} value={key}>{priorityLabels[key]}</option>)}
        </select>
      </label>
    </div>
  );
}

function PrescriptionRead({ content, patient }: { content: PrescriptionContent; patient: string }) {
  return (
    <div className="ia-draft-read">
      <DocumentPaper compact title={paperTitle("prescription")} patient={patient}>
        <PrescriptionSheet items={content.items} notes={content.notes} />
      </DocumentPaper>
    </div>
  );
}

function ExamRead({ content, patient }: { content: ExamContent; patient: string }) {
  return (
    <div className="ia-draft-read">
      <DocumentPaper compact title={paperTitle("exam_request")} patient={patient}>
        <ExamSheet content={content} />
      </DocumentPaper>
    </div>
  );
}

function SurgicalRead({ content, patient }: { content: SurgicalContent; patient: string }) {
  return (
    <div className="ia-draft-read">
      <DocumentPaper compact title={paperTitle("surgical_order")} patient={patient}>
        <SurgicalSheet content={content} />
      </DocumentPaper>
    </div>
  );
}

function LetterRead({ letter, patient }: { letter: Letter; patient: string }) {
  return (
    <div className="ia-draft-read">
      <DocumentPaper compact title={letter.title} patient={patient}>
        <LetterSheet letter={letter} />
      </DocumentPaper>
    </div>
  );
}

export function DocumentDraftCard({ draft, onChange, onSelect, onSend, selected = false, sending = false }: {
  draft: DocumentDraft;
  onChange: (next: DocumentDraft) => void;
  onSelect?: () => void;
  onSend?: (message: string) => void;
  selected?: boolean;
  sending?: boolean;
}) {
  const journey = useDocumentJourney(draft);
  const currentJourneyDocument = journey.view?.document;
  useEffect(() => {
    if (!currentJourneyDocument || draft.locallyEdited || draft.state === "saving" || draft.state === "discarded" || currentJourneyDocument.version !== draft.version || currentJourneyDocument.contentHash !== draft.contentHash) return;
    const newlySaved = currentJourneyDocument.state === "saved" && draft.state !== "saved";
    const lockChanged = draft.state === "saved" && currentJourneyDocument.state === "saved" && currentJourneyDocument.documentId === draft.documentId && currentJourneyDocument.readOnlyReason !== draft.readOnlyReason && draft.readOnlyReason !== "finalized";
    if (newlySaved || lockChanged) onChange(currentJourneyDocument);
  }, [currentJourneyDocument, draft.locallyEdited, draft.version, draft.contentHash, draft.documentId, draft.readOnlyReason, draft.state, onChange]);
  const finalized = journey.view?.workflow?.workflow.finalization;
  const challenge = journey.view?.state?.challenge;
  const journeyMaterial = finalized ? journey.view?.workflow?.material : challenge?.phase === 'pending' ? journey.view?.state?.review.material : null;
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [preview, setPreview] = useState<{ source: string; material: ReviewMaterial } | null>(null);
  const operationRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const source = JSON.stringify([draft.version, draft.contentHash, draft.content]);
  const activePreview = journeyMaterial ?? (!draft.readOnlyReason && !draft.locallyEdited ? preview?.source === source ? preview.material : draft.preview : null);
  function operationKey(intent: string) {
    const fingerprint = `${intent}:${source}`;
    if (operationRef.current?.fingerprint !== fingerprint) operationRef.current = { fingerprint, key: crypto.randomUUID() };
    return operationRef.current.key;
  }
  const [blankItem] = useState(emptyMedication);
  const [pending, startTransition] = useTransition();
  const busy = pending || draft.state === "saving";
  const open = !draft.readOnlyReason && (draft.state === "proposal" || draft.state === "error") && draft.content !== null;
  const copy = documentKinds[draft.kind];
  const label = proposalLabels[draft.kind];

  useEffect(() => {
    const unsaved = !draft.readOnlyReason && (draft.state === "proposal" || draft.state === "saving" || draft.state === "error");
    setUnsavedClinicalDraft(unsaved);
  }, [draft.state, draft.readOnlyReason]);

  function replace(content: DocumentDraft["content"]) {
    onChange({
      ...draft,
      locallyEdited: true,
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
      const result = await saveDocumentDraft({ confirm: "yes", requestId: current.requestId, kind: current.kind, content: current.content!, version: current.version, contentHash: current.contentHash, idempotencyKey: operationKey("save") });
      if (result.ok) {
        onChange(result.document ?? { ...current, state: "saved", documentId: result.id, title: documentTitle(current.kind, current.content), error: null });
        return;
      }
      onChange({ ...current, state: "error", error: documentSaveMessage(result.error) });
    });
  }

  return (
    <section className="ia-draft" aria-label={label} data-draft-state={draft.state} aria-busy={busy}>
      <header>
        <h3>{draft.state === "saved" ? copy.title : copy.draftTitle}</h3>
        <p className="ia-draft-status" aria-live="polite">{draft.readOnlyReason ? "Somente consulta" : statusCopy[draft.state]}</p>
      </header>
      <p className="ia-draft-banner">{draft.readOnlyReason ? "Documento somente para consulta. Acompanhe assinatura e entrega neste cartão." : "Rascunho — não assinado e não emitido."}</p>
      <dl>
        <div><dt>Tipo</dt><dd>{copy.title}</dd></div>
        <div><dt>Atleta</dt><dd>{draft.athleteName}</dd></div>
        <div><dt>Médico responsável</dt><dd>{draft.professionalName}</dd></div>
        <div><dt>Identificação profissional</dt><dd>{draft.credentialLabel ?? "Não registrada neste rascunho"}</dd></div>
      </dl>
      {draft.state === "discarded" ? null : activePreview && !editing ? <details className="ia-document-preview" open onToggle={(event) => setPreviewExpanded(event.currentTarget.open)}><summary>Visualizar documento completo</summary><DocumentPreview document={activePreview} athleteName={activePreview.athlete_name} review finalized={finalized ? {provenance: finalized.provenance, verified: journey.view?.workflow?.workflow.signature?.cryptographicallyVerified ?? false} : undefined} /></details> : editing && open && draft.kind === "prescription" && draft.content && isPrescription(draft.content) ? (
        <div className="ia-draft-fields">
          {draft.content.items.map((item) => (
            <MedicationFields key={item.id} item={item} onChange={(next) => replace({ ...draft.content as PrescriptionContent, items: (draft.content as PrescriptionContent).items.map((entry) => entry.id === item.id ? next : entry) })} />
          ))}
          {draft.content.items.length === 0 ? (
            <MedicationFields item={blankItem} onChange={(next) => replace({ notes: draft.content && isPrescription(draft.content) ? draft.content.notes : "", items: [next] })} />
          ) : null}
          <label>Observações
            <textarea value={draft.content.notes} maxLength={2000} rows={3} onChange={(event) => replace({ ...(draft.content as PrescriptionContent), notes: event.target.value })} />
          </label>
        </div>
      ) : editing && open && draft.kind === "exam_request" && draft.content && isExamRequest(draft.content) ? (
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
      ) : editing && open && draft.kind === "certificate" && draft.content && isCertificate(draft.content) ? (
        <CertificateFields content={draft.content} onChange={replace} />
      ) : editing && open && draft.kind === "referral" && draft.content && isReferral(draft.content) ? (
        <ReferralFields content={draft.content} onChange={replace} />
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
      ) : draft.kind === "exam_request" && draft.content && isExamRequest(draft.content) ? (
        <ExamRead content={draft.content} patient={draft.athleteName} />
      ) : draft.kind === "certificate" && draft.content && isCertificate(draft.content) ? (
        <LetterRead letter={certificateLetter(draft.content, draft.athleteName)} patient={draft.athleteName} />
      ) : draft.kind === "referral" && draft.content && isReferral(draft.content) ? (
        <LetterRead letter={referralLetter(draft.content, draft.athleteName)} patient={draft.athleteName} />
      ) : draft.kind === "prescription" && draft.content && isPrescription(draft.content) ? (
        <PrescriptionRead content={draft.content} patient={draft.athleteName} />
      ) : draft.content && "procedure" in draft.content ? (
        <SurgicalRead content={draft.content} patient={draft.athleteName} />
      ) : (
        <p className="ia-draft-title">{draft.title}</p>
      )}
      <DocumentJourney journey={journey} onSend={onSend} disabled={sending || busy || editing || !!draft.locallyEdited || (!!journeyMaterial && !previewExpanded)} />
      {open && !activePreview && draft.missing.length > 0 ? (
        <div>
          <p>Informações ainda não informadas</p>
          <ul className="ia-draft-missing">
            {draft.missing.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {draft.error ? <p role="alert">{draft.error}</p> : null}
      {draft.state === "saved" && !draft.readOnlyReason ? <p>O documento foi gravado como rascunho. Ele não foi emitido nem assinado.</p> : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      <div className="ia-draft-actions">
        {onSelect && draft.state !== "discarded" ? <button type="button" aria-pressed={selected} disabled={busy} onClick={() => { onSelect(); setFeedback("Documento escolhido para a próxima solicitação nesta conversa."); }}>{selected ? "Documento selecionado" : "Usar nesta conversa"}</button> : null}
        {!draft.readOnlyReason && draft.state !== "discarded" && draft.content ? <>
          <button type="button" disabled={busy} onClick={() => startTransition(async () => {
            const r = await reviewDocumentDraft({ requestId: draft.requestId, kind: draft.kind, content: draft.content!, version: draft.version, contentHash: draft.contentHash, idempotencyKey: operationKey("review") });
            if (r.document) onChange(r.document);
            if (r.error) { setFeedback(r.error === "incomplete" ? "Informe os campos obrigatórios antes da revisão documental." : documentSaveMessage(r.error)); return; }
            if (r.review) { setPreview({ source: JSON.stringify([r.document?.version, r.document?.contentHash, r.document?.content]), material: r.review.material }); setEditing(false); setFeedback("Revisão atualizada. O documento continua sem assinatura e sem emissão."); }
          })}>Revisar documento</button>
        </> : null}
        {open ? (
          <>
            <button type="button" onClick={() => setEditing((value) => !value)} disabled={busy}>{editing ? "Concluir edição" : "Editar"}</button>
            <button type="button" className="ia-draft-save" onClick={save} disabled={busy}>Confirmar e salvar</button>
            <button type="button" onClick={() => startTransition(async () => { const r = await discardDocumentDraft(draft.requestId); if (r.ok) onChange({ ...draft, state: "discarded", error: null }); else setFeedback("Não foi possível descartar a proposta. Tente novamente."); })} disabled={busy}>Descartar</button>
          </>
        ) : null}
        {draft.state === "saved" && draft.documentId ? (
          <Link href={`/atletas/${draft.athleteId}/documentos/${draft.documentId}`} prefetch={false}>Abrir no prontuário</Link>
        ) : null}
      </div>
    </section>
  );
}
