import Link from "next/link";
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
  return (
    <main
      id="conteudo"
      tabIndex={-1}
      className="traditional-content clinical-page"
    >
      <Link
        className="back-link"
        href={`/atletas/${id}/documentos/${documentId}`}
        prefetch={false}
      >
        Voltar ao documento
      </Link>
      {prepared?.error === "stale" ? (
        <>
          <h1>Preparação desatualizada</h1>
          <p>
            O documento mudou após a preparação. Retorne ao editor para revisar
            e preparar a versão atual.
          </p>
        </>
      ) : inventory && !inventory.error ? (
        <SigningJourney
          key={prepared?.attempt?.id ?? prepared?.snapshot?.id ?? documentId}
          document={document}
          athleteName={context.athlete.social_name || context.athlete.full_name}
          inventory={inventory}
          initialSnapshot={prepared?.snapshot ?? null}
          initialAttempt={prepared?.attempt ?? null}
          history={history?.attempts ?? []}
        />
      ) : (
        <>
          <h1>Assinatura digital indisponível</h1>
          <p>
            Não há conector de produção configurado. O simulador está
            desabilitado neste ambiente. O documento continua como rascunho ou
            revisão interna, sem assinatura.
          </p>
        </>
      )}
    </main>
  );
}
