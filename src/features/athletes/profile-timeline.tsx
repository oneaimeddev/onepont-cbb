"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "../../components/empty-state";
import type { AthleteWorkspace } from "./data";
import { RecordTarget } from "./record-target";
import {
  groupsOf,
  recordWhen,
  updateProfileQuery,
  profileFilterDate,
} from "./profile-dates";
import { ClinicalText } from "../../components/clinical-text";
type RecordEntry = NonNullable<AthleteWorkspace["records"]>[number];

/** Medical document shown in the timeline next to the evolutions, opened in its read-only view. */
export type TimelineDocument = {
  id: string;
  title: string;
  status: string;
  finalized: boolean;
  author: string;
  occurred_at: string;
};

type TimelineEntry = { kind: "record"; occurred_at: string; record: RecordEntry } | { kind: "document"; occurred_at: string; document: TimelineDocument };

function DocumentRow({ document, base }: { document: TimelineDocument; base: string }) {
  return (
    <li id={`documento-${document.id}`} className="timeline-document">
      <div className="timeline-head">
        <time className="timeline-day" dateTime={document.occurred_at}>
          {recordWhen(document.occurred_at).day}
        </time>
        <p className="timeline-document-title"><span className="timeline-document-kind">Documento médico</span> {document.title}</p>
        <p className="timeline-byline">
          {document.author}
          {" · "}
          <Link className="clinical-link" prefetch={false} href={`${base}/documentos/${document.id}?vista=previa`}>
            Ver documento
          </Link>
        </p>
        <span className={document.finalized ? "pill pill-success" : "pill pill-draft"}>{document.status}</span>
      </div>
    </li>
  );
}

function RecordRows({
  records,
  documents = [],
  target,
  canWrite,
  base,
}: {
  records: RecordEntry[];
  documents?: TimelineDocument[];
  target: string | null;
  canWrite: boolean;
  base: string;
}) {
  const entries: TimelineEntry[] = [
    ...records.map((record) => ({ kind: "record" as const, occurred_at: record.occurred_at, record })),
    ...documents.map((document) => ({ kind: "document" as const, occurred_at: document.occurred_at, document })),
  ].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return groupsOf(entries).map((group) => (
    <section key={group.id} aria-label={group.label}>
      <h3 className="timeline-month">{group.label}</h3>
      <ol className="clinical-list timeline">
        {group.records.map((entry) => entry.kind === "document"
          ? <DocumentRow key={`documento-${entry.document.id}`} document={entry.document} base={base} />
          : <RecordRow key={entry.record.id} record={entry.record} target={target} canWrite={canWrite} base={base} />)}
      </ol>
    </section>
  ));
}

function RecordRow({ record, target, canWrite, base }: { record: RecordEntry; target: string | null; canWrite: boolean; base: string }) {
  return (
          <li
            id={`registro-${record.id}`}
            key={record.id}
            className={record.status === "draft" ? "is-draft" : undefined}
          >
            <div className="timeline-head">
              <time className="timeline-day" dateTime={record.occurred_at}>
                {recordWhen(record.occurred_at).day}
              </time>
              {record.content_restricted ? <p>Conteúdo restrito</p> : <details open={target === record.id}>
                <summary>{record.title}</summary>
                <p className="record-body"><ClinicalText text={record.body} /></p>
                {record.linked_corrections?.map((correction) => <section key={correction.version} aria-label="Correção vinculada">
                  <h4>{correction.title}</h4><p className="record-body"><ClinicalText text={correction.body} /></p>
                  <p>{correction.actor_name} · {correction.reason}</p>
                </section>)}
                <Link className="clinical-link" prefetch={false} href={`${base}/evolucao?registro=${record.id}`}>
                  {canWrite && record.can_edit ? record.has_signature ? "Registrar correção vinculada" : "Editar evolução" : "Consultar evolução e histórico"}
                </Link>
                {record.encounter_status && (
                  <p>
                    Atendimento{" "}
                    {record.encounter_status === "open"
                      ? "aberto"
                      : "encerrado"}
                  </p>
                )}
              </details>}
              <p className="timeline-byline">
                {record.author_name}{record.specialty ? `, ${record.specialty}` : ""}
                {record.content_restricted && <> · <time dateTime={record.occurred_at}>{new Intl.DateTimeFormat("pt-BR", {dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(record.occurred_at))}</time></>}
                {record.is_author && record.is_restricted && (
                  <span className="record-restriction">
                    {" "}
                    · Restrito ao autor
                  </span>
                )}
              </p>
              {!record.content_restricted && <span
                className={
                  record.status === "draft"
                    ? "pill pill-draft"
                    : "pill pill-success"
                }
              >
                {record.status === "draft" ? "Rascunho" : "Finalizado"}
              </span>}
            </div>
          </li>
  );
}

export function ProfileTimeline({
  records,
  documents = [],
  recordId,
  canWrite,
  base,
}: {
  records: RecordEntry[];
  documents?: TimelineDocument[];
  recordId: string | null;
  canWrite: boolean;
  base: string;
}) {
  const query = useSearchParams();
  const specialties = [...new Set(records.flatMap((r) => r.specialty ? [r.specialty] : []))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const from = profileFilterDate(query.get("de"));
  const to = profileFilterDate(query.get("ate"));
  const specialty = specialties.includes(query.get("especialidade") ?? "")
    ? query.get("especialidade")!
    : "";
  const status = ["draft", "finalized"].includes(query.get("estado") ?? "")
    ? query.get("estado")!
    : "";
  const scope = ["evolucoes", "documentos"].includes(query.get("registros") ?? "") ? query.get("registros")! : "";
  const [fragment, setFragment] = useState<string | null>(null);
  useEffect(() => {
    const read = () =>
      setFragment(
        location.hash
          .match(/^#registro-([a-f0-9-]{36})$/i)?.[1]
          ?.toLowerCase() ?? null,
      );
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const target = recordId ?? fragment;
  const key = JSON.stringify([from, to, specialty, status, scope]);
  const [pagination, setPagination] = useState({ key, count: 20 });
  const limit = pagination.key === key ? pagination.count : 20;
  const invalidRange = Boolean(from && to && from > to);
  // Specialty and evolution state apply to evolutions only, so they leave documents out.
  const showDocuments = scope !== "evolucoes" && !specialty && !status;
  const shownDocuments = invalidRange || !showDocuments
    ? []
    : documents.filter((d) => {
        const date = recordWhen(d.occurred_at).date;
        return (!from || date >= from) && (!to || date <= to);
      });
  const filtered = invalidRange || scope === "documentos"
    ? []
    : records.filter((r) => {
        const date = recordWhen(r.occurred_at).date;
        return (
          (!from || date >= from) &&
          (!to || date <= to) &&
          (!specialty || r.specialty === specialty) &&
          (!status || r.status === status)
        );
      });
  const merged = [
    ...filtered.map((record) => ({ at: record.occurred_at, record, document: null })),
    ...shownDocuments.map((document) => ({ at: document.occurred_at, record: null, document })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  const visible = merged.flatMap((entry) => entry.record ? [entry.record] : []);
  const visibleDocuments = merged.flatMap((entry) => entry.document ? [entry.document] : []);
  const total = filtered.length + shownDocuments.length;
  const selected = records.find((r) => r.id === target);
  const separate = selected && !visible.some((r) => r.id === selected.id);
  const active = [
    from && `a partir de ${from}`,
    to && `até ${to}`,
    specialty,
    status && (status === "draft" ? "Rascunho" : "Finalizado"),
    scope && (scope === "evolucoes" ? "Somente evoluções" : "Somente documentos médicos"),
  ].filter(Boolean);
  const clear = () =>
    updateProfileQuery({ de: "", ate: "", especialidade: "", estado: "", registros: "" });
  return (
    <section aria-labelledby="linha-do-tempo">
      <h2 id="linha-do-tempo">Linha do tempo</h2>
      <form
        className="profile-filters"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Filtrar a linha do tempo"
      >
        <label>
          De
          <input
            type="date"
            name="de"
            aria-label="De"
            value={from}
            onChange={(e) => updateProfileQuery({ de: e.target.value })}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            name="ate"
            aria-label="Até"
            value={to}
            onChange={(e) => updateProfileQuery({ ate: e.target.value })}
          />
        </label>
        <label>
          Especialidade
          <select
            name="especialidade"
            aria-label="Especialidade"
            value={specialty}
            onChange={(e) =>
              updateProfileQuery({ especialidade: e.target.value })
            }
          >
            <option value="">Todas as especialidades autorizadas</option>
            {specialties.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Estado da evolução
          <select
            name="estado"
            aria-label="Estado da evolução"
            value={status}
            onChange={(e) => updateProfileQuery({ estado: e.target.value })}
          >
            <option value="">Todos os estados</option>
            <option value="draft">Rascunho</option>
            <option value="finalized">Finalizado</option>
          </select>
        </label>
        {documents.length ? (
          <label>
            Registros
            <select
              name="registros"
              aria-label="Registros"
              value={scope}
              onChange={(e) => updateProfileQuery({ registros: e.target.value })}
            >
              <option value="">Evoluções e documentos médicos</option>
              <option value="evolucoes">Somente evoluções</option>
              <option value="documentos">Somente documentos médicos</option>
            </select>
          </label>
        ) : null}
        <button
          className="outline"
          type="button"
          onClick={clear}
          disabled={!active.length}
        >
          Limpar filtros
        </button>
      </form>
      {invalidRange && (
        <p role="alert">
          A data inicial deve ser anterior ou igual à data final.
        </p>
      )}
      <p className="profile-filter-summary" role="status">
        Filtros ativos: {active.length ? active.join(" · ") : "nenhum"}.
        Mostrando {merged.length} de {total} registros correspondentes
        {documents.length ? ` (${filtered.length} evoluções e ${shownDocuments.length} documentos médicos)` : ""}
        {" "}· {records.length} atendimentos representados neste perfil.
      </p>
      {separate && (
        <div className="profile-target-record">
          <h3>Evolução acessada pelo link</h3>
          <p>
            Este registro está fora dos filtros ou do trecho exibido abaixo. Os
            filtros permanecem aplicados à lista.
          </p>
          <RecordRows
            records={[selected]}
            target={target}
            canWrite={canWrite}
            base={base}
          />
        </div>
      )}
      {total ? (
        <RecordRows
          records={visible}
          documents={visibleDocuments}
          target={target}
          canWrite={canWrite}
          base={base}
        />
      ) : (
        <EmptyState
          icon="records"
          title={
            records.length || documents.length
              ? "Nenhum registro autorizado corresponde aos filtros."
              : "Nenhum registro disponível para este perfil."
          }
        >
          <p>
            {records.length
              ? "Ajuste o período, a especialidade ou o estado, ou limpe os filtros."
              : "As evoluções autorizadas para você aparecerão aqui. Consulte os dados do atleta ou inicie uma evolução quando permitido."}
          </p>
          {canWrite && !records.length && (
            <Link className="button" href={`${base}/evolucao`} prefetch={false}>
              Nova evolução
            </Link>
          )}
        </EmptyState>
      )}
      {merged.length < total && (
        <button
          type="button"
          className="outline profile-show-more"
          onClick={() => setPagination({ key, count: limit + 20 })}
        >
          Mostrar mais 20 registros
        </button>
      )}
      <RecordTarget recordId={target} />
    </section>
  );
}
