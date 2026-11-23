import { PrescriptionSheet } from "./prescription-sheet";
import { LetterSheet } from "./letter-sheet";
import { DocumentPaper } from "./document-paper";
import { ExamSheet, SurgicalSheet } from "./request-sheets";
import { paperTitle } from "./request-format";
import { certificateLetter, referralLetter } from "./letter-format";
const eventDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
import {
  certificatePending, isCertificate, isExamRequest, isPrescription, isReferral, referralPending, prescriptionPending, statusLabels, surgicalPending, examPending,
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

export function DocumentPreview({ document, athleteName, review = false, finalized, processing = false }: { document: PreviewDocument; athleteName: string; review?: boolean; finalized?: {provenance:"simulated"|"verified";verified:boolean}; processing?:boolean }) {
  const content = document.content;
  const letter = isCertificate(content) ? certificateLetter(content, athleteName) : isReferral(content) ? referralLetter(content, athleteName) : null;
  const pending = isPrescription(content) ? prescriptionPending(content).groups
    : isExamRequest(content) ? examPending(content).groups
    : isCertificate(content) ? certificatePending(content).groups
    : isReferral(content) ? referralPending(content).groups
    : surgicalPending(content).groups;
  const state = finalized ? "Finalizado" : processing ? "Em processamento" : statusLabels[document.status];
  return (
    <article className="document-sheet" aria-label={finalized ? "Documento finalizado" : "Pré-visualização do rascunho"}>
      <p className="document-save-state">{review ? "Representação documental do conteúdo revisado. O PDF de produção ainda não está disponível." : "Pré-visualização da última versão salva."}</p>
      <p className="document-banner">{finalized ? finalized.provenance === "simulated" ? "FINALIZADO · ASSINATURA SIMULADA" : finalized.verified ? "FINALIZADO · ASSINATURA VALIDADA" : "FINALIZADO · VALIDAÇÃO INDISPONÍVEL" : processing ? "VERSÃO EM PROCESSAMENTO — AINDA NÃO FINALIZADA" : "RASCUNHO — NÃO ASSINADO / NÃO EMITIDO"}</p>
      <p className="document-meta">
        {state} · {review ? "Data do documento" : "Atualizado"} <time dateTime={review ? document.created_at : document.updated_at}>{review ? new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(document.created_at)) : eventDate.format(new Date(document.updated_at))}</time>
        {!finalized && document.status === "ready_for_review" ? " · Apresentado para revisão interna, ainda sem emissão." : ""}
      </p>
      <DocumentPaper
        title={paperTitle(document.document_type, letter?.title)}
        patient={athleteName}
        date={document.created_at}
        author={document.author_name}
        credential={document.credential_label}
      >
        {isPrescription(content) ? <PrescriptionSheet items={content.items} notes={content.notes} />
          : isExamRequest(content) ? <ExamSheet content={content} />
          : isCertificate(content) || isReferral(content) ? (letter ? <LetterSheet letter={letter} /> : null)
          : <SurgicalSheet content={content} />}
      </DocumentPaper>
      <Pending groups={pending} />
      {review && <section className="document-future-signature" aria-label="Assinatura digital futura"><h2>Assinatura digital</h2><p>{finalized ? finalized.provenance === "simulated" ? "Assinatura simulada concluída. Não há assinatura digital válida." : finalized.verified ? "Assinatura validada, com evidências no histórico." : "Validação criptográfica indisponível." : "Este documento ainda não foi assinado. A demonstração não produz assinatura digital válida."}</p>{document.credential_label && <p>A identificação profissional cadastrada não comprova verificação de conselho.</p>}</section>}
      {review ? <p>{finalized ? "Versão finalizada, preservada e somente para leitura." : "Documento em revisão. Este documento não foi emitido nem assinado."}</p> : <p>Criado em <time dateTime={document.created_at}>{eventDate.format(new Date(document.created_at))}</time>. Este documento não foi emitido nem assinado.</p>}
    </article>
  );
}
