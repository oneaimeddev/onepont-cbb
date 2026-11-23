"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { attachmentCategories, type ReferenceOption } from "./types";
import { registerPendingAttachment } from "./pending";

export function AttachmentUpload({
  athleteId,
  base = "/api/anexos",
  ensureSession,
  onSelect,
  onClose,
  onSaved,
  onPending,
  initial,
}: {
  athleteId: string | null;
  /** Fields suggested from a chat request; the professional reviews them before sending. */
  initial?: { title?: string; category?: string; documentDate?: string | null };
  base?: string;
  ensureSession?: (target: string) => Promise<string>;
  onSelect?: (id: string) => void;
  onClose: () => void;
  onSaved: (id: string, athlete: string, reused?: boolean) => void;
  onPending?: (pending: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const [target, setTarget] = useState(athleteId);
  const [name, setName] = useState("");
  const [references, setReferences] = useState<ReferenceOption[]>([]);
  const [file, setFile] = useState<File>();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<
    { id: string; full_name: string; social_name: string | null }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [limit, setLimit] = useState(20);
  const locked = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      cancelled.current = true;
      xhr.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    void fetch(`${base}?athlete=${target}&options=1`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setName(data.athlete_name);
        setReferences(data.references);
        if (data.max_mb) setLimit(data.max_mb);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Este atleta não está disponível para anexos. Confira sua permissão de escrita clínica.",
          );
      });
    return () => controller.abort();
  }, [target, base]);
  const discardRef = useRef(onClose);
  useEffect(() => {
    discardRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    onPending?.(Boolean(file));
    if (!file) return;
    const unregister = registerPendingAttachment(target, () => {
      cancelled.current = true;
      xhr.current?.abort();
      discardRef.current();
    });
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      unregister();
      onPending?.(false);
      window.removeEventListener("beforeunload", warn);
    };
  }, [file, target, onPending]);
  function close() {
    if (
      (file || busy) &&
      !window.confirm(
        "Descartar o envio deste arquivo? Se a confirmação já terminou, ele continuará no prontuário do atleta confirmado.",
      )
    )
      return;
    cancelled.current = true;
    xhr.current?.abort();
    onClose();
  }
  async function search() {
    setError("");
    try {
      const r = await fetch("/api/inteligencia/busca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: { q: query }, page: 1 }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setMatches(
        (data.athletes ?? []).map(
          (a: {
            id: string;
            name?: string;
            full_name?: string;
            social_name?: string | null;
          }) => ({
            id: a.id,
            full_name: a.full_name ?? a.name ?? "Atleta",
            social_name: a.social_name ?? null,
          }),
        ),
      );
    } catch {
      setError("Não foi possível buscar atletas. Tente novamente.");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !file || !target || !name) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setProgress(0);
    const body = new FormData(event.currentTarget);
    body.set("id", id);
    body.set("athlete_id", target);
    body.set("file", file);
    const selected = references.find(
      (r) => `${r.kind}:${r.id}` === body.get("reference"),
    );
    body.set("record_id", selected?.kind === "evolution" ? selected.id : "");
    body.set(
      "document_id",
      selected && selected.kind !== "evolution" ? selected.id : "",
    );
    body.delete("reference");
    body.delete("confirm");
    try {
      if (ensureSession) body.set("session_id", await ensureSession(target));
      if (cancelled.current)
        throw new Error("Envio descartado antes da transferência.");
      const result = await new Promise<{ id: string; reused?: boolean }>(
        (resolve, reject) => {
          const transfer = new XMLHttpRequest();
          xhr.current = transfer;
          transfer.open("POST", ensureSession ? `${base}/upload` : base);
          transfer.responseType = "json";
          transfer.upload.onprogress = (e) => {
            if (e.lengthComputable)
              setProgress(Math.round((e.loaded / e.total) * 100));
          };
          transfer.onload = () =>
            transfer.status >= 200 &&
            transfer.status < 300 &&
            transfer.response?.status === "ready"
              ? resolve(transfer.response)
              : reject(
                  new Error(
                    transfer.response?.error ??
                      "O envio não foi confirmado. Tente novamente com o mesmo arquivo.",
                  ),
                );
          transfer.onerror = () =>
            reject(
              new Error(
                "Conexão interrompida. Tente novamente com o mesmo arquivo para consultar o resultado e evitar duplicação.",
              ),
            );
          transfer.onabort = () =>
            reject(
              new Error(
                "Envio interrompido. Consulte a listagem antes de tentar novamente.",
              ),
            );
          transfer.send(body);
        },
      );
      onSaved(result.id, target, result.reused);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível confirmar o upload.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="attachment-upload"
      aria-labelledby="attachment-upload-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="attachment-heading">
        <h2 id="attachment-upload-title">Adicionar anexo</h2>
        <button className="outline" type="button" onClick={close}>
          Fechar
        </button>
      </header>
      {!target ? (
        <div className="attachment-fields">
          <p>
            Selecione um atleta autorizado para confirmar o destino do arquivo.
          </p>
          <label>
            Buscar atleta
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              maxLength={160}
            />
          </label>
          <button
            className="outline"
            disabled={!query.trim()}
            onClick={() => void search()}
          >
            Buscar atleta
          </button>
          <ul className="clinical-list">
            {matches.map((athlete) => (
              <li key={athlete.id}>
                <button
                  className="outline"
                  onClick={() => {
                    setName("");
                    setError("");
                    setTarget(athlete.id);
                    onSelect?.(athlete.id);
                  }}
                >
                  {athlete.social_name || athlete.full_name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="attachment-destination">
            {name ? (
              <>
                <strong>{name}</strong>
                <span>
                  O documento será vinculado a este atleta e ficará restrito a
                  você.
                </span>
              </>
            ) : (
              "Validando atleta destinatário…"
            )}
          </p>
          <form
            className="attachment-fields"
            onSubmit={(event) => void submit(event)}
          >
            <label>
              Arquivo PDF ou imagem
              <input
                name="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                required
                disabled={busy || !name}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  setId(crypto.randomUUID());
                  setFile(selected);
                  setError("");
                }}
              />
            </label>
            <p className="field-hint">
              PDF, JPG/JPEG, PNG e WebP. Até {limit} MB por arquivo. Use
              exclusivamente arquivos fictícios na demonstração.
            </p>
            {file && (
              <p>
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                {file.type || "Tipo será validado no envio"}
              </p>
            )}
            <label>
              Título
              <input
                name="title"
                defaultValue={initial?.title ?? ""}
                required
                maxLength={160}
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <label>
              Categoria
              <select
                aria-label="Categoria"
                name="category"
                defaultValue={initial?.category ?? ""}
                required
                disabled={busy}
              >
                <option value="">Selecionar categoria</option>
                {Object.entries(attachmentCategories).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data clínica (opcional)
              <input
                name="document_date"
                defaultValue={initial?.documentDate ?? ""}
                type="date"
                min="1900-01-01"
                disabled={busy}
              />
            </label>
            <label>
              Descrição (opcional)
              <textarea name="description" maxLength={2000} disabled={busy} />
            </label>
            <label>
              Associação clínica (opcional)
              <select
                aria-label="Associação clínica (opcional)"
                name="reference"
                disabled={busy}
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
            <p className="field-hint">
              Associar não comprova a realização do exame nem altera o registro
              original. O upload não envia o arquivo à IA.
            </p>
            <label className="attachment-confirm">
              <input type="checkbox" name="confirm" required disabled={busy} />
              Confirmo o atleta destinatário e o envio deste documento ao
              prontuário.
            </label>
            {busy && (
              <div role="status">
                <p>
                  {progress < 100
                    ? `Enviando arquivo: ${progress}%`
                    : "Arquivo enviado. Confirmando o armazenamento…"}
                </p>
                <progress
                  aria-label="Progresso do upload"
                  value={progress < 100 ? progress : undefined}
                  max={100}
                />
              </div>
            )}
            <div className="attachment-toolbar">
              <button
                className="button"
                disabled={
                  !file || !name || busy || file.size > limit * 1024 * 1024
                }
              >
                {busy ? "Confirmando…" : "Confirmar upload"}
              </button>
              {busy && (
                <button
                  type="button"
                  className="outline"
                  onClick={() => xhr.current?.abort()}
                >
                  Interromper envio
                </button>
              )}
            </div>
          </form>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
