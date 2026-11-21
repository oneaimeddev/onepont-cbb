"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { setUnsavedClinicalDraft } from "../clinical/unsaved";
import { discardClinicalDraft, finalizeClinicalDraft, saveClinicalDraft } from "./clinical-draft-actions";
import { draftSaveMessage, type ClinicalDraft } from "./clinical-draft";

function formatDay(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

const statusCopy: Record<ClinicalDraft["state"], string> = {
  proposal: "Proposta ainda não salva",
  saving: "Salvando…",
  saved: "Rascunho salvo",
  finalized: "Finalizada",
  error: "Não foi possível salvar",
  discarded: "Proposta descartada. Nenhum registro foi gravado.",
};

export function ClinicalDraftCard({ draft, canFinalize, mandatoryRestriction = false, onChange }: {
  draft: ClinicalDraft;
  canFinalize: boolean;
  mandatoryRestriction?: boolean;
  onChange: (next: ClinicalDraft) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = pending || draft.state === "saving";
  const open = draft.state === "proposal" || draft.state === "error";

  useEffect(() => {
    const unsaved = draft.state === "proposal" || draft.state === "saving" || draft.state === "error";
    setUnsavedClinicalDraft(unsaved);
  }, [draft.state]);

  function save() {
    const current = draft;
    onChange({ ...current, state: "saving", error: null });
    startTransition(async () => {
      const result = await saveClinicalDraft({
        confirm: "yes",
        athleteId: current.athleteId,
        requestId: current.requestId,
        title: current.title,
        body: current.body,
        occurredOn: current.occurredOn,
        restricted: current.restricted,
      });
      if (result.ok) {
        onChange({ ...current, state: "saved", recordId: result.id, error: null });
        return;
      }
      onChange({ ...current, state: "error", error: draftSaveMessage(result.error) });
    });
  }

  function finalize() {
    if (!accepted || !draft.recordId) return;
    const current = draft;
    startTransition(async () => {
      const result = await finalizeClinicalDraft({
        confirm: "yes",
        athleteId: current.athleteId,
        recordId: current.recordId ?? "",
      });
      if (result.ok) {
        onChange({ ...current, state: "finalized", recordId: result.id, error: null });
        return;
      }
      const message = result.error === "denied"
        ? "Você não tem permissão para finalizar esta evolução."
        : result.error === "unapproved"
          ? "A finalização precisa da sua confirmação."
          : "Não foi possível finalizar agora. Tente novamente.";
      onChange({ ...current, state: "saved", recordId: current.recordId, error: message });
    });
  }

  return (
    <section className="ia-draft" aria-label="Proposta de evolução" data-draft-state={draft.state} aria-busy={busy}>
      <header>
        <h3>{draft.state === "finalized" ? "Evolução finalizada" : draft.state === "saved" ? "Rascunho de evolução" : "Proposta de evolução"}</h3>
        <p className="ia-draft-status" aria-live="polite">{statusCopy[draft.state]}</p>
      </header>
      <dl>
        <div><dt>Atleta</dt><dd>{draft.athleteName}</dd></div>
        <div><dt>Profissional</dt><dd>{draft.professionalName}</dd></div>
        {draft.occurredOn || editing ? (
          <div>
            <dt>Data do atendimento</dt>
            <dd>
              {editing && open ? (
                <input type="date" value={draft.occurredOn ?? ""} aria-label="Data do atendimento" onChange={(event) => onChange({ ...draft, occurredOn: event.target.value || null, state: "proposal", error: null })} />
              ) : draft.occurredOn ? formatDay(draft.occurredOn) : "Não informada"}
            </dd>
          </div>
        ) : null}
      </dl>
      {draft.state === "discarded" ? null : editing && open ? (
        <div className="ia-draft-fields">
          <label>Título<input value={draft.title} maxLength={160} onChange={(event) => onChange({ ...draft, title: event.target.value, state: "proposal", error: null })} /></label>
          <label>Conteúdo<textarea value={draft.body} maxLength={20000} rows={8} onChange={(event) => onChange({ ...draft, body: event.target.value, state: "proposal", error: null })} /></label>
          {mandatoryRestriction ? <p>Evoluções de Psicologia têm sigilo obrigatório de conteúdo.</p> : <label className="check-label">
            <input type="checkbox" checked={draft.restricted} onChange={(event) => onChange({ ...draft, restricted: event.target.checked, state: "proposal", error: null })} />
            <span>Restringir o registro ao autor</span>
          </label>}
        </div>
      ) : (
        <div className="ia-draft-read">
          <p className="ia-draft-title">{draft.title}</p>
          {draft.body ? <p className="ia-draft-body">{draft.body}</p> : null}
          {mandatoryRestriction ? <p>Sigilo obrigatório de Psicologia</p> : draft.restricted ? <p>Restrito ao autor</p> : <p>Visível para a equipe de cuidado depois da finalização</p>}
        </div>
      )}
      {open && draft.missing.length > 0 ? (
        <div>
          <p>Informações não informadas no relato</p>
          <ul className="ia-draft-missing">
            {draft.missing.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {draft.state === "error" && draft.error ? <p role="alert">{draft.error}</p> : null}
      {draft.state === "saved" && draft.recordId ? (
        <p>A evolução foi gravada como rascunho e ainda não foi finalizada.</p>
      ) : null}
      {draft.state === "saved" && draft.error ? <p role="alert">{draft.error}</p> : null}
      {draft.state === "saved" && draft.recordId && canFinalize ? (
        <div className="ia-draft-finalize">
          <h4>Finalizar versão salva</h4>
          <p>A finalização encerra a edição deste rascunho.</p>
          <label className="check-label">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span>Revisei esta versão e confirmo a finalização para este atleta.</span>
          </label>
          <button type="button" onClick={finalize} disabled={!accepted || busy}>
            {pending ? "Finalizando…" : "Confirmar finalização"}
          </button>
        </div>
      ) : null}
      <div className="ia-draft-actions">
        {open ? (
          <>
            <button type="button" onClick={() => setEditing((value) => !value)} disabled={busy}>{editing ? "Concluir edição" : "Editar"}</button>
            <button type="button" className="ia-draft-save" onClick={save} disabled={busy}>Confirmar e salvar</button>
            <button type="button" onClick={() => { void discardClinicalDraft(draft.requestId); onChange({ ...draft, state: "discarded", error: null }); }} disabled={busy}>Descartar</button>
          </>
        ) : null}
        {(draft.state === "saved" || draft.state === "finalized") && draft.recordId ? (
          <Link
            href={draft.state === "finalized"
              ? `/atletas/${draft.athleteId}?aba=timeline&registro=${draft.recordId}#registro-${draft.recordId}`
              : `/atletas/${draft.athleteId}/evolucao?registro=${draft.recordId}`}
            prefetch={false}
          >
            {draft.state === "finalized" ? "Abrir evolução" : "Abrir no prontuário"}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
