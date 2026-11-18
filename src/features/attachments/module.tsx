"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/icon";
import { AttachmentUpload } from "./upload";
import { AttachmentViewer } from "./viewer";
import {
  attachmentCategories,
  attachmentWhen,
  type AttachmentPage,
  type AttachmentBoard,
} from "./types";
import "./attachments.css";

export function AttachmentModule({ athleteId }: { athleteId: string }) {
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [data, setData] = useState<AttachmentPage>();
  const [error, setError] = useState("");
  const [upload, setUpload] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      athlete: athleteId,
      page: String(page),
      category,
      q: search,
      sort,
    });
    void fetch(`/api/anexos?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setError("");
        setData(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(undefined);
          setError(
            "Não foi possível consultar os anexos autorizados. Tente novamente.",
          );
        }
      });
    return () => controller.abort();
  }, [athleteId, page, category, search, sort, revision]);
  return (
    <section className="attachment-module" aria-labelledby="attachments-title">
      <header className="attachment-heading">
        <div>
          <h2 id="attachments-title">Documentos e Anexos</h2>
          <p>Arquivos clínicos do atleta disponíveis para você.</p>
        </div>
        {data?.can_upload && (
          <button className="button" onClick={() => setUpload(true)}>
            <Icon name="plus" size={18} />
            Adicionar documento
          </button>
        )}
      </header>
      {notice && <p role="status">{notice}</p>}
      <form
        className="attachment-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(query);
        }}
      >
        <label>
          Buscar anexo
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={160}
            autoComplete="off"
          />
        </label>
        <label>
          Categoria
          <select
            aria-label="Categoria"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as categorias</option>
            {Object.entries(attachmentCategories).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ordenar por
          <select
            aria-label="Ordenar por"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Upload mais recente</option>
            <option value="clinical">Data clínica</option>
            <option value="oldest">Upload mais antigo</option>
          </select>
        </label>
        <button className="outline">Buscar</button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
          <button className="outline" onClick={refresh}>
            Tentar novamente
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Carregando anexos…</p>}
      {data && (
        <>
          <p>
            {data.total}{" "}
            {data.total === 1 ? "arquivo disponível" : "arquivos disponíveis"}
          </p>
          {data.items.length ? (
            <ul className="attachment-list">
              {data.items.map((item) => (
                <li key={item.id}>
                  <Icon name="clip" size={20} />
                  <div>
                    <button
                      className="attachment-title"
                      onClick={() => setView(item.id)}
                    >
                      {item.title}
                    </button>
                    <p>
                      {attachmentCategories[item.category]} ·{" "}
                      {item.mime_type === "application/pdf" ? "PDF" : "Imagem"}{" "}
                      · Data clínica: {attachmentWhen(item.document_date)}
                    </p>
                    <small>
                      Enviado em {attachmentWhen(item.created_at)} · Restrito ao
                      autor
                    </small>
                    {(item.record_id || item.document_id) && (
                      <p>
                        Associado a{" "}
                        {item.record_id
                          ? "uma evolução"
                          : "um documento clínico"}
                      </p>
                    )}
                  </div>
                  <button className="outline" onClick={() => setView(item.id)}>
                    Visualizar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="attachment-empty">
              Nenhum anexo disponível para os filtros e permissões atuais.
            </p>
          )}
          <nav className="pagination" aria-label="Paginação de anexos">
            <button
              className="outline"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {Math.max(1, Math.ceil(data.total / 25))}
            </span>
            <button
              className="outline"
              disabled={page * 25 >= data.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Próxima
            </button>
          </nav>
        </>
      )}
      <button
        className="ghost-link"
        onClick={() => {
          void fetch("/api/anexos?cleanup=1", { method: "POST" })
            .then((r) => {
              if (!r.ok) throw new Error();
              setError("");
              refresh();
            })
            .catch(() =>
              setError(
                "Não foi possível recuperar os envios. Tente novamente.",
              ),
            );
        }}
      >
        Recuperar envios interrompidos
      </button>
      {upload && (
        <AttachmentUpload
          athleteId={athleteId}
          onClose={() => {
            setUpload(false);
            refresh();
          }}
          onSaved={(id, _athlete, reused) => {
            setNotice(
              reused
                ? "Este arquivo já estava anexado. Os metadados existentes foram preservados."
                : "Documento anexado ao prontuário.",
            );
            setUpload(false);
            refresh();
            setView(id);
          }}
        />
      )}
      {view && (
        <AttachmentViewer
          id={view}
          onClose={() => setView(null)}
          onChanged={refresh}
        />
      )}
    </section>
  );
}
export function AttachmentCards({ board }: { board: AttachmentBoard }) {
  const [data, setData] = useState<AttachmentPage>();
  const [error, setError] = useState("");
  const [view, setView] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ athlete: board.athleteId });
    for (const id of board.ids) params.append("id", id);
    if (!board.ids.length) return;
    void fetch(`/api/inteligencia/anexos?${params}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((page: AttachmentPage) => {
        setData(page);
        if (board.openId && page.items.some((item) => item.id === board.openId))
          setView(board.openId);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError("Anexos indisponíveis. Confira as permissões atuais.");
      });
    return () => abort.abort();
  }, [board, revision]);
  return (
    <section
      className="attachment-module attachment-chat"
      aria-label="Anexos da conversa"
    >
      <p>
        Metadados dos arquivos anexados. O conteúdo não foi analisado pela IA.
      </p>
      {error && <p role="alert">{error}</p>}
      {board.ids.length > 0 && !data && !error && (
        <p role="status">Consultando anexos autorizados…</p>
      )}
      {(!board.ids.length || data?.items.length === 0) && (
        <p>Nenhum dos anexos desta referência está disponível para você.</p>
      )}
      <ul className="attachment-list">
        {data?.items.map((item) => (
          <li key={item.id}>
            <Icon name="clip" size={18} />
            <div>
              <strong>{item.title}</strong>
              <p>
                {attachmentCategories[item.category]} ·{" "}
                {attachmentWhen(item.document_date)} · Restrito ao autor
              </p>
            </div>
            <button className="outline" onClick={() => setView(item.id)}>
              Visualizar anexo
            </button>
          </li>
        ))}
      </ul>
      {view && (
        <AttachmentViewer
          id={view}
          base="/api/inteligencia/anexos"
          onClose={() => setView(null)}
          onChanged={refresh}
        />
      )}
    </section>
  );
}
