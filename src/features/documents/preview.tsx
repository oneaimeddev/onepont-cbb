import { eventDate } from "../athletes/data";
import {
  documentKinds, examTypeLabels, isExamRequest, isPrescription, lateralityLabels, prescriptionPending, priorityLabels, statusLabels, surgicalPending, examPending,
  type DocumentContent, type DocumentKind, type DocumentStatus,
} from "./content";

export type PreviewDocument = {
  document_type: DocumentKind;
  status: DocumentStatus;
  author_name: string;
  credential_label: string | null;
  created_at: string;
  updated_at: string;
  content: DocumentContent;
};

function Pending({ groups }: { groups: { title: string; fields: string[] }[] }) {
  if (!groups.length) return null;
  return (
    <section className="document-medication" aria-label="Campos ainda não preenchidos">
      <h2>Campos ainda não preenchidos</h2>
      <ul className="document-pending">
        {groups.map((group) => <li key={group.title}>{group.title}: {group.fields.join(", ")}</li>)}
      </ul>
    </section>
  );
}

export function DocumentPreview({ document, athleteName }: { document: PreviewDocument; athleteName: string }) {
  const kind = documentKinds[document.document_type];
  return (
    <article className="document-sheet" aria-label="Pré-visualização do rascunho">
      <p className="document-save-state">Pré-visualização da última versão salva.</p>
      <p className="document-banner">RASCUNHO — NÃO ASSINADO / NÃO EMITIDO</p>
      <header>
        <p className="document-type">{kind.title}</p>
        <h1 className="athlete-name">{athleteName}</h1>
        {document.status === "ready_for_review" && <p>Apresentado para revisão interna. Continua sem emissão.</p>}
      </header>
      <dl className="document-facts">
        <div><dt>Médico responsável</dt><dd>{document.author_name}</dd></div>
        <div><dt>Identificação profissional</dt><dd>{document.credential_label ?? "Não registrada neste rascunho"}</dd></div>
        <div><dt>Estado</dt><dd>{statusLabels[document.status]}</dd></div>
        <div><dt>Atualizado</dt><dd><time dateTime={document.updated_at}>{eventDate.format(new Date(document.updated_at))}</time></dd></div>
      </dl>
      {isPrescription(document.content) ? (
        <div>
          {document.content.items.map((item, index) => {
            const dose = [item.dose, item.dose_unit].filter((part) => part.trim()).join(" ");
            return (
              <section className="document-medication" key={item.id} aria-label={`Medicamento ${index + 1}`}>
                <h2>{item.name.trim() || `Medicamento ${index + 1}`}</h2>
                {item.presentation.trim() && <p>Apresentação: {item.presentation}</p>}
                {dose && <p>Dose: {dose}</p>}
                {item.route.trim() && <p>Via: {item.route}</p>}
                {item.schedule.trim() && <p>Frequência: {item.schedule}</p>}
                {item.duration.trim() && <p>Duração: {item.duration}</p>}
                {item.quantity.trim() && <p>Quantidade: {item.quantity}</p>}
                {item.instructions.trim() && <p>Instruções: {item.instructions}</p>}
              </section>
            );
          })}
          {document.content.notes.trim() && (
            <section className="document-medication">
              <h2>Observações</h2>
              <p>{document.content.notes}</p>
            </section>
          )}
          <Pending groups={prescriptionPending(document.content).groups} />
        </div>
      ) : isExamRequest(document.content) ? (
        <div>
          {document.content.occurred_at ? <p>Data do atendimento: {document.content.occurred_at}</p> : null}
          {document.content.items.map((item, index) => (
            <section className="document-medication" key={item.id} aria-label={`Exame ${index + 1}`}>
              <h2>{item.name.trim() || `Exame ${index + 1}`}</h2>
              {item.exam_type ? <p>Tipo: {examTypeLabels[item.exam_type]}</p> : null}
              {item.region.trim() ? <p>Região: {item.region}</p> : null}
              {item.laterality ? <p>Lateralidade: {lateralityLabels[item.laterality]}</p> : null}
              {item.technical_details.trim() ? <p>Detalhes técnicos: {item.technical_details}</p> : null}
              {item.notes.trim() ? <p>Observações: {item.notes}</p> : null}
            </section>
          ))}
          {document.content.indication.trim() ? <p>Indicação: {document.content.indication}</p> : null}
          {document.content.justification.trim() ? <p>Justificativa: {document.content.justification}</p> : null}
          {document.content.diagnosis.trim() ? <p>Hipótese diagnóstica: {document.content.diagnosis}</p> : null}
          {document.content.priority ? <p>Prioridade: {priorityLabels[document.content.priority]}</p> : null}
          {document.content.additional.trim() ? <p>Orientações: {document.content.additional}</p> : null}
          <Pending groups={examPending(document.content).groups} />
        </div>
      ) : (
        <div>
          <section className="document-medication">
            <h2>Procedimento proposto</h2>
            <p>{document.content.procedure.trim() || "Não informado"}</p>
            {document.content.region.trim() && <p>Região: {document.content.region}</p>}
            {document.content.laterality && <p>Lateralidade: {lateralityLabels[document.content.laterality]}</p>}
            {document.content.indication.trim() && <p>Indicação: {document.content.indication}</p>}
            {document.content.diagnosis.trim() && <p>Diagnóstico ou hipótese: {document.content.diagnosis}</p>}
            {document.content.justification.trim() && <p>Justificativa: {document.content.justification}</p>}
            {document.content.priority && <p>Prioridade: {priorityLabels[document.content.priority]}</p>}
            {document.content.materials.trim() && <p>Materiais: {document.content.materials}</p>}
            {document.content.additional.trim() && <p>Informações complementares: {document.content.additional}</p>}
          </section>
          <Pending groups={surgicalPending(document.content).groups} />
        </div>
      )}
      <p>Criado em <time dateTime={document.created_at}>{eventDate.format(new Date(document.created_at))}</time>. Este documento não foi emitido nem assinado.</p>
    </article>
  );
}
