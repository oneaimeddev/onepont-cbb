"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { deliveryLabel, signatureLabel } from "./workflow-types";
import { EmptyState } from "../../components/empty-state";
import type { DocumentSummary } from "./data";
import { documentKinds, documentMenu, statusLabels } from "./content";
import { updateProfileQuery } from "../athletes/profile-dates";
const date = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
export function ProfileDocumentList({
  documents,
  base,
}: {
  documents: DocumentSummary[];
  base: string;
}) {
  const query = useSearchParams();
  const kind = Object.keys(documentKinds).includes(
    query.get("tipo_documento") ?? "",
  )
    ? query.get("tipo_documento")!
    : "";
  const sort = ["oldest", "type"].includes(query.get("ordem_documentos") ?? "")
    ? query.get("ordem_documentos")!
    : "newest";
  const items = documents
    .filter((d) => !kind || d.document_type === kind)
    .toSorted((a, b) => {
      if (sort === "type") {
        const n = documentKinds[a.document_type].title.localeCompare(
          documentKinds[b.document_type].title,
          "pt-BR",
        );
        if (n) return n;
      }
      const n = a.updated_at.localeCompare(b.updated_at);
      return (sort === "oldest" ? n : -n) || a.id.localeCompare(b.id);
    });
  return (
    <>
      <form
        className="profile-filters"
        aria-label="Filtrar documentos médicos"
        onSubmit={(e) => e.preventDefault()}
      >
        <label>
          Tipo de documento
          <select
            name="tipo_documento"
            aria-label="Tipo de documento"
            value={kind}
            onChange={(e) =>
              updateProfileQuery({ tipo_documento: e.target.value })
            }
          >
            <option value="">Todos os tipos</option>
            {documentMenu.map(({ kind: id }) => (
              <option key={id} value={id}>
                {documentKinds[id].title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ordenar documentos
          <select
            name="ordem_documentos"
            aria-label="Ordenar documentos"
            value={sort}
            onChange={(e) =>
              updateProfileQuery({ ordem_documentos: e.target.value })
            }
          >
            <option value="newest">Atualização mais recente</option>
            <option value="oldest">Atualização mais antiga</option>
            <option value="type">Tipo de documento</option>
          </select>
        </label>
      </form>
      <p role="status">
        {items.length} de {documents.length} documentos médicos disponíveis para
        você
        {kind
          ? ` · Filtro: ${documentKinds[kind as keyof typeof documentKinds].title}`
          : ""}
        .
      </p>
      {items.length ? (
        <ol className="clinical-list profile-document-list">
          {items.map((document) => (
            <li key={document.id}>
              <Link href={`${base}/documentos/${document.id}`} prefetch={false}>
                {documentKinds[document.document_type].title}
              </Link>
              <p>
                <span className="pill pill-draft">
                  {document.workflow?.lifecycle === "finalized"
                    ? "Finalizado"
                    : document.workflow?.locked
                      ? "Versão em processamento"
                      : statusLabels[document.status]}
                </span>{" "}
                · Versão {document.version}
                {document.workflow?.signature && (
                  <>
                    {" "}
                    · <span>{signatureLabel(document.workflow.signature)}</span>
                  </>
                )}
                {!!document.workflow?.deliveries.length && (
                  <>
                    {" "}
                    ·{" "}
                    <span>
                      {deliveryLabel(
                        document.workflow.deliveries[0].state,
                        document.workflow.deliveries[0].provenance,
                      )}
                    </span>
                  </>
                )}
              </p>
              <p>
                {document.author_name && <>{document.author_name} · </>}
                Atualizado em{" "}
                <time dateTime={document.updated_at}>
                  {date.format(new Date(document.updated_at))}
                </time>
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon="records"
          title={
            documents.length
              ? "Nenhum documento corresponde ao tipo selecionado."
              : "Nenhum rascunho deste atleta."
          }
        >
          <p>
            {documents.length
              ? "Selecione outro tipo para consultar seus rascunhos autorizados."
              : "Prepare uma prescrição, um pedido cirúrgico ou uma solicitação de exames pelas ações acima. O rascunho permanece vinculado a você e a este atleta."}
          </p>
        </EmptyState>
      )}
    </>
  );
}
