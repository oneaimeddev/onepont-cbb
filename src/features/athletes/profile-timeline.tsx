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
type RecordEntry = NonNullable<AthleteWorkspace["records"]>[number];

function RecordRows({
  records,
  target,
  canWrite,
  base,
}: {
  records: RecordEntry[];
  target: string | null;
  canWrite: boolean;
  base: string;
}) {
  return groupsOf(records).map((group) => (
    <section key={group.id} aria-label={group.label}>
      <h3 className="timeline-month">{group.label}</h3>
      <ol className="clinical-list timeline">
        {group.records.map((record) => (
          <li
            id={`registro-${record.id}`}
            key={record.id}
            className={record.status === "draft" ? "is-draft" : undefined}
          >
            <div className="timeline-head">
              <time className="timeline-day" dateTime={record.occurred_at}>
                {recordWhen(record.occurred_at).day}
              </time>
              <details open={target === record.id}>
                <summary>{record.title}</summary>
                <p className="record-body">{record.body}</p>
                {canWrite && record.is_author && record.status === "draft" && (
                  <Link
                    className="clinical-link"
                    prefetch={false}
                    href={`${base}/evolucao?registro=${record.id}`}
                  >
                    Revisar rascunho
                  </Link>
                )}
                {record.encounter_status && (
                  <p>
                    Atendimento{" "}
                    {record.encounter_status === "open"
                      ? "aberto"
                      : "encerrado"}
                  </p>
                )}
              </details>
              <p className="timeline-byline">
                {record.author_name}, {record.specialty}
                {record.is_author && record.is_restricted && (
                  <span className="record-restriction">
                    {" "}
                    · Restrito ao autor
                  </span>
                )}
              </p>
              <span
                className={
                  record.status === "draft"
                    ? "pill pill-draft"
                    : "pill pill-success"
                }
              >
                {record.status === "draft" ? "Rascunho" : "Finalizado"}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  ));
}

export function ProfileTimeline({
  records,
  recordId,
  canWrite,
  base,
}: {
  records: RecordEntry[];
  recordId: string | null;
  canWrite: boolean;
  base: string;
}) {
  const query = useSearchParams();
  const specialties = [...new Set(records.map((r) => r.specialty))].sort(
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
  const key = JSON.stringify([from, to, specialty, status]);
  const [pagination, setPagination] = useState({ key, count: 20 });
  const limit = pagination.key === key ? pagination.count : 20;
  const invalidRange = Boolean(from && to && from > to);
  const filtered = invalidRange
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
  const visible = filtered.slice(0, limit);
  const selected = records.find((r) => r.id === target);
  const separate = selected && !visible.some((r) => r.id === selected.id);
  const active = [
    from && `a partir de ${from}`,
    to && `até ${to}`,
    specialty,
    status && (status === "draft" ? "Rascunho" : "Finalizado"),
  ].filter(Boolean);
  const clear = () =>
    updateProfileQuery({ de: "", ate: "", especialidade: "", estado: "" });
  return (
    <section aria-labelledby="linha-do-tempo">
      <h2 id="linha-do-tempo">Linha do tempo</h2>
      <form
        className="profile-filters"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Filtrar evoluções"
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
        Mostrando {visible.length} de {filtered.length} evoluções
        correspondentes · {records.length} autorizadas neste perfil.
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
      {filtered.length ? (
        <RecordRows
          records={visible}
          target={target}
          canWrite={canWrite}
          base={base}
        />
      ) : (
        <EmptyState
          icon="records"
          title={
            records.length
              ? "Nenhuma evolução autorizada corresponde aos filtros."
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
      {visible.length < filtered.length && (
        <button
          type="button"
          className="outline profile-show-more"
          onClick={() => setPagination({ key, count: limit + 20 })}
        >
          Mostrar mais 20 evoluções
        </button>
      )}
      <RecordTarget recordId={target} />
    </section>
  );
}
