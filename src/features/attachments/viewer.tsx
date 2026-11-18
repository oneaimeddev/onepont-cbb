"use client";
/* Images use authenticated local Blob URLs; no external optimizer receives clinical files. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { attachmentCategories, attachmentWhen, type Attachment } from "./types";

function PdfCanvas({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let doc: PDFDocumentProxy | undefined;
    let task: { destroy: () => Promise<void> } | undefined;
    void (async () => {
      try {
        const response = await fetch(url, {
          signal: abort.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("denied");
        const lib = await import("pdfjs-dist");
        lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
        const loader = lib.getDocument({
          data: new Uint8Array(await response.arrayBuffer()),
          enableXfa: false,
          useSystemFonts: true,
        });
        task = loader;
        doc = await loader.promise;
        if (abort.signal.aborted) {
          await task.destroy();
          return;
        }
        setPdf(doc);
      } catch {
        if (!abort.signal.aborted)
          setError(
            "Não foi possível abrir o PDF. Verifique o acesso ou utilize o download autorizado.",
          );
      }
    })();
    return () => {
      abort.abort();
      void task?.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | undefined;
    void (async () => {
      try {
        const sheet = await pdf.getPage(page);
        if (cancelled || !canvas.current) return;
        setRendering(true);
        const viewport = sheet.getViewport({ scale: zoom * 1.35 });
        const node = canvas.current;
        node.width = viewport.width;
        node.height = viewport.height;
        task = sheet.render({ canvas: node, viewport });
        await task.promise;
      } catch {
        if (!cancelled) setError("Não foi possível renderizar esta página.");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom]);
  return (
    <div className="attachment-pdf">
      {error && <p role="alert">{error}</p>}
      {!pdf && !error && <p role="status">Carregando PDF…</p>}
      {pdf && (
        <>
          <div className="attachment-toolbar">
            <button
              className="outline"
              disabled={page === 1 || rendering}
              onClick={() => setPage((p) => p - 1)}
            >
              Página anterior
            </button>
            <span aria-live="polite">
              Página {page} de {pdf.numPages}
            </span>
            <button
              className="outline"
              disabled={page === pdf.numPages || rendering}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima página
            </button>
            <label>
              Zoom
              <select
                aria-label="Zoom"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                <option value={0.75}>75%</option>
                <option value={1}>100%</option>
                <option value={1.5}>150%</option>
                <option value={2}>200%</option>
              </select>
            </label>
          </div>
          <canvas
            ref={canvas}
            style={{ width: `${zoom * 100}%` }}
            aria-label={`Página ${page} do documento PDF`}
            role="img"
          />
        </>
      )}
    </div>
  );
}
export function AttachmentViewer({
  id,
  base = "/api/anexos",
  onClose,
  onChanged,
}: {
  id: string;
  base?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [item, setItem] = useState<Attachment>();
  const [error, setError] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [edit, setEdit] = useState(false);
  const [pending, setPending] = useState(false);
  const [references, setReferences] = useState<
    { id: string; kind: string; title: string }[]
  >([]);
  useEffect(() => {
    dialog.current?.showModal();
    const abort = new AbortController();
    let objectUrl = "";
    void (async () => {
      try {
        const response = await fetch(`${base}/${id}`, {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) throw new Error();
        const data: Attachment = await response.json();
        setItem(data);
        if (data.mime_type !== "application/pdf") {
          const image = await fetch(`${base}/${id}?file=1`, {
            cache: "no-store",
            signal: abort.signal,
          });
          if (!image.ok) throw new Error();
          objectUrl = URL.createObjectURL(await image.blob());
          setFileUrl(objectUrl);
        }
      } catch {
        if (!abort.signal.aborted)
          setError(
            "Anexo indisponível. Verifique seu acesso e tente novamente.",
          );
      }
    })();
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, base]);
  async function save(form: FormData) {
    if (!item) return;
    setPending(true);
    setError("");
    const reference = String(form.get("reference") ?? "");
    const chosen = references.find((r) => `${r.kind}:${r.id}` === reference);
    try {
      const response = await fetch(`${base}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: item.version,
          payload: {
            title: form.get("title"),
            description: form.get("description"),
            category: form.get("category"),
            document_date: form.get("document_date"),
            record_id: chosen?.kind === "evolution" ? chosen.id : "",
            document_id: chosen && chosen.kind !== "evolution" ? chosen.id : "",
          },
        }),
      });
      if (!response.ok) throw new Error();
      setEdit(false);
      onChanged?.();
      const fresh = await fetch(`${base}/${id}`, { cache: "no-store" });
      if (!fresh.ok) throw new Error();
      setItem(await fresh.json());
    } catch {
      setError(
        "Não foi possível salvar. Confira os campos, as permissões e possíveis alterações feitas em outra aba.",
      );
    } finally {
      setPending(false);
    }
  }
  async function retire() {
    if (
      !item ||
      !window.confirm(
        "Retirar este anexo de uso? O arquivo será preservado para retenção e auditoria.",
      )
    )
      return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${base}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: item.version, retire: true }),
      });
      if (!response.ok) {
        const body = await response.json();
        setError(
          body.error === "retention"
            ? "Este anexo está associado a um registro finalizado e não pode ser retirado de uso."
            : "Não foi possível retirar o anexo de uso.",
        );
        return;
      }
      onChanged?.();
      onClose();
    } catch {
      setError(
        "Conexão interrompida. Consulte a listagem antes de repetir a retirada de uso.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="attachment-viewer"
      aria-labelledby="attachment-viewer-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <header className="attachment-heading">
        <h2 id="attachment-viewer-title">
          {item?.title ?? "Visualizar anexo"}
        </h2>
        <button className="outline" onClick={onClose}>
          Fechar visualização
        </button>
      </header>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {item && (
        <>
          <dl className="attachment-details">
            <div>
              <dt>Categoria</dt>
              <dd>{attachmentCategories[item.category]}</dd>
            </div>
            <div>
              <dt>Data clínica</dt>
              <dd>{attachmentWhen(item.document_date)}</dd>
            </div>
            <div>
              <dt>Enviado em</dt>
              <dd>{attachmentWhen(item.created_at)}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{item.uploaded_by_name}</dd>
            </div>
            <div>
              <dt>Arquivo</dt>
              <dd>
                {item.original_filename} · {(item.size_bytes / 1024).toFixed(1)}{" "}
                KB
              </dd>
            </div>
            <div>
              <dt>Visibilidade</dt>
              <dd>Restrito ao autor</dd>
            </div>
          </dl>
          {item.description && <p>{item.description}</p>}
          {item.record_id && (
            <p>
              <a
                href={`/atletas/${item.athlete_id}?aba=timeline&registro=${item.record_id}`}
              >
                Abrir evolução associada
              </a>
            </p>
          )}
          {item.document_id && (
            <p>
              <a
                href={`/atletas/${item.athlete_id}/documentos/${item.document_id}`}
              >
                Abrir documento associado
              </a>
            </p>
          )}
          <div className="attachment-toolbar">
            <a className="outline" href={`${base}/${id}?download=1`}>
              Baixar arquivo
            </a>
            {item.can_edit && (
              <>
                <button
                  className="outline"
                  disabled={pending}
                  onClick={() => {
                    void fetch(`${base}?athlete=${item.athlete_id}&options=1`, {
                      cache: "no-store",
                    })
                      .then(async (r) => {
                        if (!r.ok) throw new Error();
                        return r.json();
                      })
                      .then((data) => {
                        setReferences(data.references ?? []);
                        setEdit(true);
                      })
                      .catch(() =>
                        setError("Não foi possível carregar as associações."),
                      );
                  }}
                >
                  Editar metadados
                </button>
                <button
                  className="outline"
                  disabled={pending}
                  onClick={() => void retire()}
                >
                  Retirar de uso
                </button>
              </>
            )}
          </div>
          {edit && (
            <form className="attachment-fields" action={save}>
              <label>
                Título
                <input
                  name="title"
                  defaultValue={item.title}
                  required
                  maxLength={160}
                />
              </label>
              <label>
                Categoria
                <select
                  aria-label="Categoria"
                  name="category"
                  defaultValue={item.category}
                >
                  {Object.entries(attachmentCategories).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data clínica
                <input
                  name="document_date"
                  type="date"
                  defaultValue={item.document_date ?? ""}
                />
              </label>
              <label>
                Descrição
                <textarea
                  name="description"
                  maxLength={2000}
                  defaultValue={item.description}
                />
              </label>
              <label>
                Associação clínica
                <select
                  aria-label="Associação clínica (opcional)"
                  name="reference"
                  defaultValue={
                    references.find(
                      (r) => r.id === (item.record_id ?? item.document_id),
                    )
                      ? `${references.find((r) => r.id === (item.record_id ?? item.document_id))!.kind}:${item.record_id ?? item.document_id}`
                      : ""
                  }
                >
                  <option value="">Sem associação</option>
                  {references.map((r) => (
                    <option key={r.id} value={`${r.kind}:${r.id}`}>
                      {r.kind === "evolution"
                        ? "Evolução"
                        : r.kind === "exam_request"
                          ? "Solicitação de exames"
                          : r.kind === "prescription"
                            ? "Prescrição"
                            : "Pedido cirúrgico"}
                      : {r.title}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button" disabled={pending}>
                Salvar metadados
              </button>
              <button
                className="outline"
                type="button"
                onClick={() => setEdit(false)}
              >
                Cancelar edição
              </button>
            </form>
          )}
          {!edit &&
            (item.mime_type === "application/pdf" ? (
              <PdfCanvas url={`${base}/${id}?file=1`} />
            ) : fileUrl ? (
              <div className="attachment-image">
                <img src={fileUrl} alt={item.title} width={900} height={900} />
              </div>
            ) : (
              <p role="status">Carregando imagem…</p>
            ))}
          <p className="field-hint">
            Arquivo anexado pelo profissional. A visualização não valida o
            conteúdo clínico nem comprova a realização de um exame.
          </p>
        </>
      )}
    </dialog>
  );
}
