import Link from "next/link";
import "./documents.css";
import { DocumentPreview } from "./preview";
import { ExamEditor, PrescriptionEditor, SurgicalEditor } from "./editors";
import { documentKinds, statusLabels, type DocumentContent, type DocumentKind, type DocumentStatus } from "./content";

export function documentNotice(erro?: string, salvo?: string) {
  if (erro === "conflito") return { tone: "alert" as const, text: "Este rascunho foi atualizado em outro envio. Os dados abaixo são a versão salva." };
  if (erro === "negado") return { tone: "alert" as const, text: "Não foi possível salvar. Confira se este rascunho ainda é seu." };
  if (erro === "invalido") return { tone: "alert" as const, text: "Não foi possível salvar. Confira o tamanho e o formato dos campos." };
  if (salvo === "revisao") return { tone: "status" as const, text: "Rascunho apresentado para revisão interna. Ele não foi emitido." };
  if (salvo === "pendente") return { tone: "status" as const, text: "Rascunho salvo. Ainda falta o essencial para apresentar a revisão." };
  if (salvo === "rascunho") return { tone: "status" as const, text: "Rascunho salvo." };
  return null;
}

export function DocumentScreen({
  athleteId, athleteName, documentId, kind, version, status, authorName, credential, content, createdAt, updatedAt, saved, preview, notice,
}: {
  athleteId: string;
  athleteName: string;
  documentId: string;
  kind: DocumentKind;
  version: number;
  status: DocumentStatus;
  authorName: string;
  credential: string | null;
  content: DocumentContent;
  createdAt: string;
  updatedAt: string;
  saved: boolean;
  preview: boolean;
  notice: { tone: "alert" | "status"; text: string } | null;
}) {
  const copy = documentKinds[kind];
  const base = `/atletas/${athleteId}`;
  const editorPath = saved ? `${base}/documentos/${documentId}` : `${base}/documentos/nova?tipo=${copy.slug}&documento=${documentId}`;
  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
      <Link className="back-link" href={preview ? editorPath : `${base}?aba=documentos`} prefetch={false}>{preview ? "Voltar ao editor" : "Voltar aos documentos"}</Link>
      <header className="document-mast">
        <div className="record-mast-top">
          <h1 className="athlete-name">{athleteName}</h1>
          <span className="pill pill-draft">{saved ? statusLabels[status] : "Não salvo"}</span>
        </div>
        <p className="document-type">{saved ? copy.title : copy.draftTitle}</p>
        <p>Médico responsável: {authorName}</p>
        <p>{credential ? `Identificação profissional: ${credential}` : "Identificação profissional não registrada neste rascunho."}</p>
      </header>
      {notice && <p role={notice.tone}>{notice.text}</p>}
      {preview && saved ? (
        <DocumentPreview document={{ document_type: kind, status, author_name: authorName, credential_label: credential, created_at: createdAt, updated_at: updatedAt, content }} athleteName={athleteName} />
      ) : kind === "prescription" && "notes" in content ? (
        <PrescriptionEditor key={`${documentId}:${version}`} athleteId={athleteId} documentId={documentId} version={version} initial={content} returnTo={editorPath} saved={saved} />
      ) : kind === "exam_request" && "occurred_at" in content ? (
        <ExamEditor key={`${documentId}:${version}`} athleteId={athleteId} documentId={documentId} version={version} initial={content} returnTo={editorPath} saved={saved} />
      ) : kind === "surgical_order" && "procedure" in content ? (
        <SurgicalEditor key={`${documentId}:${version}`} athleteId={athleteId} documentId={documentId} version={version} initial={content} returnTo={editorPath} saved={saved} />
      ) : null}
    </main>
  );
}
