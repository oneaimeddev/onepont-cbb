"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentReviewPanel } from "./review-panel";
import { reviewCommand } from "./review-client";
import { DocumentEditorFrame, DocumentItemNavigation, DocumentTextarea, RemovalNotice, useDocumentItems, useEditorReview } from "./editor-controls";
import {
  emptyExamItem, emptyMedication, examSuggestions, examTypeLabels, lateralityLabels, prescriptionPending, priorityLabels, surgicalPending, examPending,
  type ExamContent, type ExamItem, type ExamType, type MedicationItem, type PrescriptionContent, type SurgicalContent,
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

function DraftForm({ athleteId, documentId, version, kind, content, returnTo, saved, dirty }: {
  athleteId: string;
  documentId: string;
  version: number;
  kind: "prescription" | "surgical_order" | "exam_request";
  content: PrescriptionContent | SurgicalContent | ExamContent;
  returnTo: string;
  saved: boolean;
  dirty: boolean;
}) {
  const scope=useEditorReview();
  const router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[chosen,setChosen]=useState('');
  const inFlight=useRef(false),workingVersion=useRef(version),reviewKey=useRef<string|null>(null),keyContent=useRef('');
  const currentContent=useRef(content);useLayoutEffect(()=>{currentContent.current=content;},[content]);
  async function act(review:boolean){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    const raw=JSON.stringify(content);
    try{
      if(keyContent.current!==raw){reviewKey.current=null;keyContent.current=raw;}
      reviewKey.current??=crypto.randomUUID();
      const result=await reviewCommand(review?'open':'draft',{athlete_id:athleteId,document_id:documentId,version:workingVersion.current,kind,content,idempotency_key:reviewKey.current});
      if(review){
        if(JSON.stringify(currentContent.current)!==raw){throw new Error('Os campos mudaram enquanto a revisão era aberta. Clique em Revisar e assinar novamente para conferir o conteúdo atual.');}
        scope.show(<DocumentReviewPanel initial={result.review} inventory={result.inventory} demoEnabled={result.demo_enabled} initialIdentity={chosen} onIdentityChange={setChosen} onBack={()=>{reviewKey.current=null;scope.back();}} onPersisted={scope.release}/>);
      }else{
        workingVersion.current=result.version;
        if(JSON.stringify(currentContent.current)!==raw){reviewKey.current=null;setNotice('A versão enviada foi salva. Há alterações posteriores neste formulário; revise ou salve novamente.');}
        else{scope.release();router.push(`/atletas/${athleteId}/documentos/${documentId}?salvo=rascunho`);router.refresh();}
      }
    }catch(e){setError((e as Error).message);if((e as {code?:string}).code==='expired')reviewKey.current=null;}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <div className="document-action-bar">
    <p className="document-save-state" aria-live="polite">{dirty?'Alterações não salvas. A revisão usará o conteúdo atual.':'Revise o documento ou mantenha-o como rascunho.'}</p>
    <input type="hidden" name="version" value={version}/>
    <input type="hidden" name="content" value={JSON.stringify(content)}/>
    <div className="document-actions"><button data-review-trigger type="button" className="button" disabled={busy} onClick={()=>void act(true)}>{busy?'Processando…':'Revisar e assinar'}</button><button type="button" className="outline" disabled={busy} onClick={()=>void act(false)}>Salvar rascunho</button></div>
    {saved&&<details open className="document-saved-utilities"><summary>Consultar versão salva</summary><Link className="outline" data-document-preview href={`${returnTo}?vista=previa`}>Pré-visualizar</Link></details>}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </div>;
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
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);
  const pending = prescriptionPending(content);
  const { root: itemsRootRef, addButton: addButtonRef, add, remove, undo, announcement, removed, activeId, select, reviewAll, setReviewAll } = useDocumentItems(content.items, (items) => setContent((current) => ({ ...current, items })), "Medicamento");

  function updateItem(id: string, patch: Partial<MedicationItem>) {
    setContent((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  }

  return (
    <DocumentEditorFrame dirty={dirty}>
    <div className="document-editor" ref={itemsRootRef}>
      <DocumentItemNavigation items={content.items} activeId={activeId} select={select} reviewAll={reviewAll} setReviewAll={setReviewAll} noun="Medicamento">
        <button ref={addButtonRef} type="button" className="outline document-add" onClick={() => add(emptyMedication())}>Adicionar medicamento</button>
      </DocumentItemNavigation>
      {content.items.map((item, index) => (
        <fieldset className="document-item" key={item.id} hidden={!reviewAll && item.id !== activeId}>
          <legend>Medicamento {index + 1}{item.name.trim() && <span> · {item.name}</span>}</legend>
          <div className="document-item-tools"><button type="button" className="document-remove" onClick={() => remove(item, index)} aria-label={`Remover medicamento ${index + 1}${item.name.trim() ? `: ${item.name}` : ""}`}>Remover medicamento {index + 1}</button></div>
          <div className="document-grid">
            <label className="is-wide">Nome do medicamento<input data-item-name={item.id} value={item.name} maxLength={160} onChange={(event) => updateItem(item.id, { name: event.target.value })} /></label>
            <label className="is-wide">Apresentação ou concentração<input value={item.presentation} maxLength={160} onChange={(event) => updateItem(item.id, { presentation: event.target.value })} /></label>
            <div className="document-dose is-wide">
            <label>Dose<input value={item.dose} maxLength={160} onChange={(event) => updateItem(item.id, { dose: event.target.value })} /></label>
            <label>Unidade<input value={item.dose_unit} maxLength={160} onChange={(event) => updateItem(item.id, { dose_unit: event.target.value })} /></label>
            </div>
            <label className="is-wide">Via de administração<input value={item.route} maxLength={160} onChange={(event) => updateItem(item.id, { route: event.target.value })} /></label>
            <label className="is-wide">Frequência<DocumentTextarea rows={2} value={item.schedule} maxLength={160} onChange={(event) => updateItem(item.id, { schedule: event.target.value })} /></label>
            <label>Duração<input value={item.duration} maxLength={160} onChange={(event) => updateItem(item.id, { duration: event.target.value })} /></label>
            <label>Quantidade<input value={item.quantity} maxLength={160} onChange={(event) => updateItem(item.id, { quantity: event.target.value })} /></label>
            <label className="is-wide">Instruções complementares<DocumentTextarea rows={2} maxLength={500} value={item.instructions} onChange={(event) => updateItem(item.id, { instructions: event.target.value })} /></label>
          </div>
        </fieldset>
      ))}
      <RemovalNotice announcement={announcement} name={removed?.item.name} undo={undo} />
      <label>Observações gerais<DocumentTextarea rows={3} maxLength={2000} value={content.notes} onChange={(event) => setContent((current) => ({ ...current, notes: event.target.value }))} /></label>
      <PendingList blocking={pending.blocking} groups={pending.groups} />
    </div>
    <DraftForm athleteId={athleteId} documentId={documentId} version={version} kind="prescription" content={content} returnTo={returnTo} saved={saved} dirty={dirty} />
    </DocumentEditorFrame>
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
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);
  const pending = surgicalPending(content);

  function update(patch: Partial<SurgicalContent>) {
    setContent((current) => ({ ...current, ...patch }));
  }

  return (
    <DocumentEditorFrame dirty={dirty}>
    <div className="document-editor">
      <section className="document-section"><h2>Procedimento e dados relacionados</h2>
      <div className="document-grid">
        <label className="is-wide">Procedimento proposto<input value={content.procedure} maxLength={200} onChange={(event) => update({ procedure: event.target.value })} /></label>
        <label>Região anatômica<input value={content.region} maxLength={120} onChange={(event) => update({ region: event.target.value })} /></label>
        <label>Lateralidade
          <select value={content.laterality} onChange={(event) => update({ laterality: event.target.value as SurgicalContent["laterality"] })}>
            {(Object.keys(lateralityLabels) as SurgicalContent["laterality"][]).map((value) => <option key={value || "empty"} value={value}>{lateralityLabels[value]}</option>)}
          </select>
        </label>
      </div></section>
      <section className="document-section"><h2>Contexto clínico</h2><div className="document-grid">
        <label className="is-wide">Indicação clínica<DocumentTextarea rows={3} maxLength={2000} value={content.indication} onChange={(event) => update({ indication: event.target.value })} /></label>
        <label className="is-wide">Diagnóstico ou hipótese diagnóstica<DocumentTextarea rows={2} maxLength={500} value={content.diagnosis} onChange={(event) => update({ diagnosis: event.target.value })} /></label>
      </div></section>
      <section className="document-section"><h2>Justificativa</h2><div className="document-grid">
        <label className="is-wide">Justificativa médica<DocumentTextarea rows={3} maxLength={2000} value={content.justification} onChange={(event) => update({ justification: event.target.value })} /></label>
        <label>Prioridade
          <select value={content.priority} onChange={(event) => update({ priority: event.target.value as SurgicalContent["priority"] })}>
            {(Object.keys(priorityLabels) as SurgicalContent["priority"][]).map((value) => <option key={value || "empty"} value={value}>{priorityLabels[value]}</option>)}
          </select>
        </label>
      </div></section>
      <section className="document-section"><h2>Informações complementares</h2><div className="document-grid">
        <label className="is-wide">Materiais ou necessidades específicas<DocumentTextarea rows={2} maxLength={1000} value={content.materials} onChange={(event) => update({ materials: event.target.value })} /></label>
        <label className="is-wide">Informações complementares<DocumentTextarea rows={3} maxLength={2000} value={content.additional} onChange={(event) => update({ additional: event.target.value })} /></label>
      </div></section>
      <PendingList blocking={pending.blocking} groups={pending.groups} />
    </div>
    <DraftForm athleteId={athleteId} documentId={documentId} version={version} kind="surgical_order" content={content} returnTo={returnTo} saved={saved} dirty={dirty} />
    </DocumentEditorFrame>
  );
}

export function ExamEditor({ athleteId, documentId, version, initial, returnTo, saved }: {
  athleteId: string;
  documentId: string;
  version: number;
  initial: ExamContent;
  returnTo: string;
  saved: boolean;
}) {
  const [content, setContent] = useState(initial);
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);
  const pending = examPending(content);
  const { root: itemsRootRef, addButton: addButtonRef, add, remove, undo, announcement, removed, activeId, select, reviewAll, setReviewAll } = useDocumentItems(content.items, (items) => setContent((current) => ({ ...current, items })), "Exame");

  function update(patch: Partial<ExamContent>) {
    setContent((current) => ({ ...current, ...patch }));
  }

  function updateItem(id: string, patch: Partial<ExamItem>) {
    setContent((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  }

  function rename(item: ExamItem, name: string) {
    const match = examSuggestions.find((entry) => entry.name.toLocaleLowerCase("pt-BR") === name.trim().toLocaleLowerCase("pt-BR"));
    updateItem(item.id, match && !item.exam_type ? { name, exam_type: match.exam_type } : { name });
  }

  return (
    <DocumentEditorFrame dirty={dirty}>
    <div className="document-editor" ref={itemsRootRef}>
      <div className="document-grid">
        <label>Data do atendimento ou solicitação
          <input type="date" value={content.occurred_at} onChange={(event) => update({ occurred_at: event.target.value })} />
        </label>
        <label>Prioridade
          <select value={content.priority} onChange={(event) => update({ priority: event.target.value as ExamContent["priority"] })}>
            {(Object.keys(priorityLabels) as ExamContent["priority"][]).map((value) => <option key={value || "empty"} value={value}>{priorityLabels[value]}</option>)}
          </select>
        </label>
      </div>
      <h2>Exames solicitados</h2>
      <DocumentItemNavigation items={content.items} activeId={activeId} select={select} reviewAll={reviewAll} setReviewAll={setReviewAll} noun="Exame">
        <button ref={addButtonRef} type="button" className="outline document-add" onClick={() => add(emptyExamItem())}>Adicionar exame</button>
      </DocumentItemNavigation>
      {content.items.map((item, index) => (
        <fieldset className="document-item" key={item.id} hidden={!reviewAll && item.id !== activeId}>
          <legend>Exame {index + 1}{item.name.trim() && <span> · {item.name}</span>}</legend>
          <div className="document-item-tools"><button type="button" className="document-remove" onClick={() => remove(item, index)} aria-label={`Remover exame ${index + 1}${item.name.trim() ? `: ${item.name}` : ""}`}>Remover exame {index + 1}</button></div>
          <div className="document-grid">
            <label className="is-wide">Nome do exame
              <input data-item-name={item.id} value={item.name} maxLength={160} list={`sugestoes-exame-${item.id}`} onChange={(event) => rename(item, event.target.value)} />
              <datalist id={`sugestoes-exame-${item.id}`}>
                {examSuggestions.map((entry) => <option key={entry.name} value={entry.name} />)}
              </datalist>
            </label>
            <label>Tipo
              <select value={item.exam_type} onChange={(event) => updateItem(item.id, { exam_type: event.target.value as ExamType })}>
                {(Object.keys(examTypeLabels) as ExamType[]).map((value) => <option key={value || "empty"} value={value}>{examTypeLabels[value]}</option>)}
              </select>
            </label>
            <label>Região anatômica<input value={item.region} maxLength={160} onChange={(event) => updateItem(item.id, { region: event.target.value })} /></label>
            <label>Lateralidade
              <select value={item.laterality} onChange={(event) => updateItem(item.id, { laterality: event.target.value as ExamItem["laterality"] })}>
                {(Object.keys(lateralityLabels) as ExamItem["laterality"][]).map((value) => <option key={value || "empty"} value={value}>{lateralityLabels[value]}</option>)}
              </select>
            </label>
            <label className="is-wide">Detalhes técnicos<DocumentTextarea rows={2} maxLength={500} value={item.technical_details} onChange={(event) => updateItem(item.id, { technical_details: event.target.value })} /></label>
            <label className="is-wide">Observações do exame<DocumentTextarea rows={2} maxLength={500} value={item.notes} onChange={(event) => updateItem(item.id, { notes: event.target.value })} /></label>
          </div>
        </fieldset>
      ))}
      <RemovalNotice announcement={announcement} name={removed?.item.name} undo={undo} />
      <section className="document-section"><h2>Contexto clínico e orientações</h2><div className="document-grid">
        <label className="is-wide">Indicação clínica<DocumentTextarea rows={3} maxLength={2000} value={content.indication} onChange={(event) => update({ indication: event.target.value })} /></label>
        <label className="is-wide">Justificativa<DocumentTextarea rows={3} maxLength={2000} value={content.justification} onChange={(event) => update({ justification: event.target.value })} /></label>
        <label className="is-wide">Hipótese diagnóstica<DocumentTextarea rows={2} maxLength={500} value={content.diagnosis} onChange={(event) => update({ diagnosis: event.target.value })} /></label>
        <label className="is-wide">Orientações complementares<DocumentTextarea rows={3} maxLength={2000} value={content.additional} onChange={(event) => update({ additional: event.target.value })} /></label>
      </div></section>
      <PendingList blocking={pending.blocking} groups={pending.groups} />
    </div>
    <DraftForm athleteId={athleteId} documentId={documentId} version={version} kind="exam_request" content={content} returnTo={returnTo} saved={saved} dirty={dirty} />
    </DocumentEditorFrame>
  );
}
