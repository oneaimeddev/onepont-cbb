import {DocumentWorkflowView} from "../../../../../../features/documents/workflow-view";
import {getDocumentWorkflow} from "../../../../../../features/documents/workflow-server";
import { notFound } from "next/navigation";
import { getAthlete } from "../../../../../../features/athletes/data";
import { documentNotice, DocumentScreen } from "../../../../../../features/documents/screen";
import { openDocument } from "../../../../../../features/documents/data";

export default async function DocumentPage({ params, searchParams }: {
  params: Promise<{ id: string; documentId: string }>;
  searchParams: Promise<{ vista?: string; erro?: string; salvo?: string }>;
}) {
  const { id, documentId } = await params;
  const query = await searchParams;
  const [context, document] = await Promise.all([
    getAthlete(id, "profile"),
    openDocument(id, documentId),
  ]);
  if (!document) notFound();
  if(document.workflow?.locked || document.workflow?.lifecycle==="finalized")return <DocumentWorkflowView document={document} initial={await getDocumentWorkflow(document.id)}/>;
  return (
    <DocumentScreen
      athleteId={id}
      athleteName={context.athlete.social_name || context.athlete.full_name}
      documentId={document.id}
      kind={document.document_type}
      version={document.version}
      status={document.status}
      authorName={document.author_name}
      credential={document.credential_label}
      content={document.content}
      createdAt={document.created_at}
      updatedAt={document.updated_at}
      derivedFrom={document.workflow?.derivedFrom}
      saved
      preview={query.vista === "previa"}
      notice={documentNotice(query.erro, query.salvo)}
    />
  );
}
