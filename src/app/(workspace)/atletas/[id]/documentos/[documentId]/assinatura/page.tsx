import {DocumentWorkflowView} from "../../../../../../../features/documents/workflow-view";
import {getDocumentWorkflow} from "../../../../../../../features/documents/workflow-server";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "../../../../../../../lib/supabase";
import { notFound } from "next/navigation";
import { openDocument } from "../../../../../../../features/documents/data";
import { getAthlete } from "../../../../../../../features/athletes/data";
import {
  signingCommand,
  signingDemoEnabled,
} from "../../../../../../../features/signing/server";
import { SigningJourney } from "../../../../../../../features/signing/journey";
export default async function SigningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; documentId: string }>;
  searchParams: Promise<{ preparacao?: string; tentativa?: string }>;
}) {
  const { id, documentId } = await params;
  const document = await openDocument(id, documentId);
  if (!document) notFound();
  if(document.workflow?.locked || document.workflow?.lifecycle==="finalized")return <DocumentWorkflowView document={document} initial={await getDocumentWorkflow(document.id)}/>;
  const context = await getAthlete(id, "profile");
  const query = await searchParams;
  const inventory = signingDemoEnabled() ? await signingCommand("list") : null;
  let prepared = null;
  if (inventory && !inventory.error && (query.tentativa || query.preparacao)) {
    prepared = query.tentativa
      ? await signingCommand("status", { attempt_id: query.tentativa })
      : await signingCommand("snapshot", { snapshot_id: query.preparacao });
    if (prepared.error && prepared.error !== "stale") notFound();
    if (!prepared.error && prepared.snapshot?.document_id !== documentId)
      notFound();
  }
  const history =
    inventory && !inventory.error
      ? await signingCommand("history", { document_id: documentId })
      : null;
  const client = await supabaseServer();
  const { data: opened, error: reviewError } =
    !prepared?.attempt && !prepared?.error
      ? await client.rpc("document_review_command", {
          action: "open",
          payload: {
            athlete_id: id,
            document_id: documentId,
            version: document.version,
            kind: document.document_type,
            content: document.content,
            idempotency_key: randomUUID(),
          },
        })
      : { data: null, error: null };
  const eligibility=opened?.review?await client.rpc('document_delivery_eligibility',{review_id:opened.review.id}):null;
  const { data: delivery } = prepared?.attempt
    ? await client.rpc("document_demo_delivery", {
        attempt: prepared.attempt.id,
      })
    : { data: null };
  return (
    <main
      id="conteudo"
      tabIndex={-1}
      className="traditional-content clinical-page"
    >
      {prepared?.error === "stale" ? (
        <>
          <h1>Revisão desatualizada</h1>
          <p>O documento mudou. Volte ao editor e revise o conteúdo atual.</p>
          <Link
            href={`/atletas/${id}/documentos/${documentId}`}
            prefetch={false}
          >
            Voltar e editar
          </Link>
        </>
      ) : reviewError || opened?.error ? (
        <>
          <h1>Revisar documento</h1>
          <p>Confira os campos essenciais no editor antes de continuar.</p>
          <Link
            href={`/atletas/${id}/documentos/${documentId}`}
            prefetch={false}
          >
            Voltar e editar
          </Link>
        </>
      ) : (
        <SigningJourney
          key={prepared?.attempt?.id ?? opened?.review?.id ?? documentId}
          document={document}
          athleteName={context.athlete.social_name || context.athlete.full_name}
          inventory={inventory?.error ? null : inventory}
          demoEnabled={!!inventory && !inventory.error}
          initialSnapshot={prepared?.snapshot ?? null}
          initialAttempt={prepared?.attempt ?? null}
          initialReview={opened?.review ?? null}
          initialDelivery={delivery?.error ? undefined : delivery}
          deliveryEligibility={eligibility?.data}
          history={history?.attempts ?? []}
        />
      )}
    </main>
  );
}
