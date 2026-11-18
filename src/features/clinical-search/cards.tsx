"use client";
import { useEffect, useRef, useState } from "react";
import { ClinicalReadings } from "../chat/clinical-reading";
import { AttachmentViewer } from "../attachments/viewer";
import { attachmentWhen } from "../attachments/types";
import {
  activityLabels,
  activityScope,
  dateBasisLabels,
  examNotice,
  type ActivityAthlete,
  type ActivityResult,
  type ActivitySource,
  type ClinicalSearchBoard,
} from "./contract";
import "./search.css";

async function requestActivity(
  board: ClinicalSearchBoard,
  signal: AbortSignal,
  athleteId?: string,
  sourcePage = 1,
): Promise<ActivityResult> {
  const response = await fetch("/api/inteligencia/atividade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...board,
      ...(athleteId ? { athleteId, sourcePage } : {}),
    }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("unavailable");
  return response.json();
}
const statuses: Record<string, string> = {
  draft: "Rascunho",
  ready_for_review: "Em revisão",
  finalized: "Finalizado",
  ready: "Anexo disponível",
};
function Sources({
  sources,
  onOpen,
}: {
  sources: ActivitySource[];
  onOpen: (source: ActivitySource) => void;
}) {
  return (
    <ol className="clinical-source-list">
      {sources.map((source) => (
        <li key={`${source.kind}:${source.id}`}>
          <div>
            <strong>{activityLabels[source.kind]}</strong>
            <p>{source.title}</p>
            <p>
              {dateBasisLabels[source.date_basis]}:{" "}
              <time dateTime={source.occurred_on}>
                {attachmentWhen(source.occurred_on)}
              </time>{" "}
              · {statuses[source.status] ?? source.status}
            </p>
            {source.kind === "attachment_result" && (
              <p>
                Upload: {attachmentWhen(source.created_on)}. Data de realização
                do exame não registrada.
              </p>
            )}
            {source.kind === "exam_request" &&
              source.created_on !== source.occurred_on && (
                <p>Criação do pedido: {attachmentWhen(source.created_on)}.</p>
              )}
            {source.specialty && <p>Especialidade: {source.specialty}</p>}
          </div>
          <button
            type="button"
            className="ia-more"
            onClick={() => onOpen(source)}
          >
            Abrir fonte
          </button>
        </li>
      ))}
    </ol>
  );
}
function AthleteSources({
  athlete,
  board,
  onOpen,
}: {
  athlete: ActivityAthlete;
  board: ClinicalSearchBoard;
  onOpen: (source: ActivitySource) => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActivityResult>();
  const [error, setError] = useState("");
  const key = JSON.stringify(board);
  useEffect(() => {
    const controller = new AbortController();
    void requestActivity(
      JSON.parse(key),
      controller.signal,
      athlete.athlete_id,
      page,
    )
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Não foi possível consultar as fontes. Confira seu acesso e tente novamente.",
          );
      });
    return () => controller.abort();
  }, [key, athlete.athlete_id, page]);
  const item = data?.items[0];
  return (
    <section
      className="clinical-source-detail"
      aria-label={`Registros correspondentes de ${athlete.name}`}
    >
      <h4>Registros que justificam a inclusão</h4>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Consultando fontes autorizadas…</p>}
      {data && !item && (
        <p>Nenhuma fonte desta referência está disponível para você.</p>
      )}
      {item && (
        <>
          <Sources sources={item.sources} onOpen={onOpen} />
          <nav
            className="clinical-search-pagination"
            aria-label="Paginação de fontes"
          >
            <button
              className="ia-more"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Fontes anteriores
            </button>
            <span>
              Página {page} de{" "}
              {Math.max(1, Math.ceil(item.matched_records / 5))}
            </span>
            <button
              className="ia-more"
              disabled={page * 5 >= item.matched_records}
              onClick={() => setPage((p) => p + 1)}
            >
              Próximas fontes
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
export function ClinicalSearchCards({
  board,
  onSelect,
  onResults,
  onPage,
}: {
  board: ClinicalSearchBoard;
  onSelect: (id: string) => void;
  onResults: (data: ActivityResult) => void;
  onPage: (page: number) => void;
}) {
  const [data, setData] = useState<ActivityResult>();
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [source, setSource] = useState<{
    source: ActivitySource;
    athlete: ActivityAthlete;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(board);
  const resultRef = useRef(onResults);
  useEffect(() => {
    resultRef.current = onResults;
  }, [onResults]);
  useEffect(() => {
    const controller = new AbortController();
    void requestActivity(JSON.parse(key), controller.signal)
      .then((result) => {
        setData(result);
        setError("");
        resultRef.current(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(
            "A busca clínica não respondeu. Tente novamente para consultar apenas os resultados autorizados.",
          );
          setData(undefined);
        }
      });
    return () => controller.abort();
  }, [key, retry]);
  const current = data?.filters ?? board.filters;
  return (
    <section className="clinical-search" aria-label="Busca clínica transversal">
      <p className="clinical-search-scope">{activityScope(current)}</p>
      {current.kinds.some(
        (kind) => kind === "exam_request" || kind === "attachment_result",
      ) && <p className="clinical-search-note">{examNotice}</p>}
      {current.kinds.some((kind) =>
        ["prescription", "surgical_order", "exam_request"].includes(kind),
      ) && (
        <p className="clinical-search-note">
          Os documentos médicos disponíveis são rascunhos; não equivalem a
          documentos emitidos ou assinados.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
          <button className="ia-more" onClick={() => setRetry((r) => r + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {!data && !error && (
        <p role="status">Buscando atividade clínica autorizada…</p>
      )}
      {data && (
        <>
          <p className="clinical-search-count" role="status">
            {data.total} {data.total === 1 ? "atleta" : "atletas"} ·{" "}
            {data.matched_records}{" "}
            {data.matched_records === 1
              ? "registro correspondente"
              : "registros correspondentes"}{" "}
            · Página {data.page} de {Math.max(1, Math.ceil(data.total / 5))}
          </p>
          {!data.items.length && (
            <p>
              Nenhum atleta autorizado corresponde aos filtros desta página.
            </p>
          )}
          <ul className="ia-cards clinical-search-cards">
            {data.items.map((athlete) => (
              <li
                className="ia-card clinical-search-card"
                key={athlete.athlete_id}
              >
                <header>
                  <h3>{athlete.name}</h3>
                  <p>
                    {[
                      athlete.category,
                      athlete.club,
                      athlete.division,
                      athlete.modality,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sem vínculo esportivo vigente informado"}
                  </p>
                </header>
                <p>
                  {Object.entries(athlete.kinds)
                    .map(
                      ([kind, count]) =>
                        `${activityLabels[kind as keyof typeof activityLabels]}: ${count}`,
                    )
                    .join(" · ")}
                </p>
                <Sources
                  sources={athlete.sources}
                  onOpen={(source) => setSource({ source, athlete })}
                />
                <div className="clinical-search-actions">
                  <button
                    className="ia-more"
                    onClick={() => onSelect(athlete.athlete_id)}
                  >
                    Colocar em contexto
                  </button>
                  <a
                    className="ia-open"
                    href={`/atletas/${athlete.athlete_id}`}
                  >
                    Abrir prontuário
                  </a>
                  {athlete.matched_records > 3 && (
                    <button
                      className="ia-more"
                      onClick={() =>
                        setExpanded((value) =>
                          value === athlete.athlete_id
                            ? null
                            : athlete.athlete_id,
                        )
                      }
                    >
                      {expanded === athlete.athlete_id
                        ? "Recolher registros"
                        : "Ver registros correspondentes"}
                    </button>
                  )}
                </div>
                {expanded === athlete.athlete_id && (
                  <AthleteSources
                    athlete={athlete}
                    board={board}
                    onOpen={(source) => setSource({ source, athlete })}
                  />
                )}
              </li>
            ))}
          </ul>
          <nav
            className="clinical-search-pagination"
            aria-label="Paginação da busca clínica"
          >
            <button
              className="ia-more"
              disabled={board.page === 1}
              onClick={() => {
                setExpanded(null);
                setSource(null);
                onPage(board.page - 1);
              }}
            >
              Atletas anteriores
            </button>
            <button
              className="ia-more"
              disabled={board.page * 5 >= data.total}
              onClick={() => {
                setExpanded(null);
                setSource(null);
                onPage(board.page + 1);
              }}
            >
              Próximos atletas
            </button>
          </nav>
        </>
      )}
      {source && (
        <section
          className="clinical-search-open"
          aria-label="Fonte da busca clínica"
        >
          <header>
            <h3>Fonte de {source.athlete.name}</h3>
            <button className="ia-more" onClick={() => setSource(null)}>
              Fechar fonte
            </button>
          </header>
          {source.source.kind === "attachment_result" ? (
            <AttachmentViewer
              id={source.source.id}
              base="/api/inteligencia/anexos"
              onClose={() => setSource(null)}
            />
          ) : (
            <ClinicalReadings
              key={source.source.id}
              board={{
                source:
                  source.source.kind === "evolution" ? "evolution" : "document",
                athleteId: source.athlete.athlete_id,
                total: 1,
                page: 1,
                pageSize: 1,
                kind:
                  source.source.kind === "evolution" ? "" : source.source.kind,
                status: "",
                items: [
                  {
                    id: source.source.id,
                    athleteId: source.athlete.athlete_id,
                    kind: source.source.kind,
                    open: true,
                  },
                ],
              }}
            />
          )}
        </section>
      )}
    </section>
  );
}
