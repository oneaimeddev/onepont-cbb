"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ClinicalDocument } from "../documents/data";
import { DocumentPreview } from "../documents/preview";
import { documentKinds } from "../documents/content";
import { command } from "./client";
import {
  demoNotice,
  signingStateLabels,
  type SigningAttempt,
  type SigningInventory,
} from "./contracts";
import "../documents/documents.css";
import "./signing.css";
export type PreparedSnapshot = {
  id: string;
  document_id: string;
  version: number;
  content_hash: string;
  created_at: string;
  expires_at: string;
  material: ClinicalDocument & { athlete_name: string };
};
export function SigningJourney({
  document,
  athleteName,
  inventory,
  initialSnapshot,
  initialAttempt,
  history,
}: {
  document: ClinicalDocument;
  athleteName: string;
  inventory: SigningInventory;
  initialSnapshot: PreparedSnapshot | null;
  initialAttempt: SigningAttempt | null;
  history: {
    id: string;
    state: SigningAttempt["state"];
    confirmed_at: string;
    snapshot_id: string;
    version: number;
    label: string;
  }[];
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot),
    [attempt, setAttempt] = useState(initialAttempt),
    [identity, setIdentity] = useState(""),
    [scenario, setScenario] = useState("success"),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const editor = `/atletas/${document.athlete_id}/documentos/${document.id}`;
  const active =
    attempt?.state === "authorizing" || attempt?.state === "processing";
  const selected = inventory.identities.find((i) => i.id === identity);
  function updateUrl(s: PreparedSnapshot, a: SigningAttempt | null) {
    const url = new URL(window.location.href);
    url.searchParams.set("preparacao", s.id);
    if (a) url.searchParams.set("tentativa", a.id);
    else url.searchParams.delete("tentativa");
    window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    if (!active || !attempt) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const result = await command("signing", "status", {
          attempt_id: attempt.id,
        });
        if (!stopped) {
          setAttempt(result.attempt);
          setError("");
        }
      } catch (e) {
        if (!stopped) {
          clearInterval(timer);
          setError((e as Error).message);
          if ((e as { code?: string }).code === "stale")
            setAttempt((a) => (a ? { ...a, state: "stale" } : a));
        }
      }
    }, 1200);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, attempt]);
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const result = await command("signing", "prepare", {
        document_id: document.id,
        version: document.version,
      });
      setSnapshot(result.snapshot);
      setAttempt(null);
      setConfirmed(false);
      setIdentity("");
      key.current = null;
      updateUrl(result.snapshot, null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!snapshot || !confirmed || !selected) return;
    setBusy(true);
    setError("");
    try {
      key.current ??= crypto.randomUUID();
      const result = await command("signing", "confirm", {
        snapshot_id: snapshot.id,
        identity_id: identity,
        hash: snapshot.content_hash,
        idempotency_key: key.current,
        scenario,
        confirmed: true,
      });
      setAttempt(result.attempt);
      updateUrl(result.snapshot, result.attempt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function check(cancel = false) {
    if (!attempt) return;
    setBusy(true);
    try {
      const result = await command("signing", cancel ? "cancel" : "status", {
        attempt_id: attempt.id,
      });
      setAttempt(result.attempt);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const material = snapshot?.material ?? document;
  return (
    <section className="signing-section" aria-labelledby="journey-title">
      <h1 id="journey-title" className="athlete-name">
        Assinatura demonstrativa
      </h1>
      <p>
        {athleteName} · {documentKinds[document.document_type].title}
      </p>
      <aside className="signing-demo-notice">
        <strong>{demoNotice}</strong>
        <p>
          Esta jornada usa exclusivamente identidades fictícias. O documento
          original permanece sem assinatura e sem emissão.
        </p>
      </aside>
      <ol className="signing-steps">
        <li aria-current={!snapshot ? "step" : undefined}>Revisar</li>
        <li aria-current={snapshot && !attempt ? "step" : undefined}>
          Preparar e escolher
        </li>
        <li aria-current={active ? "step" : undefined}>Autorizar simulação</li>
        <li aria-current={attempt && !active ? "step" : undefined}>
          Resultado
        </li>
      </ol>
      <dl className="signing-facts">
        <div>
          <dt>Documento</dt>
          <dd>{document.id}</dd>
        </div>
        <div>
          <dt>Versão {snapshot ? "preparada" : "atual"}</dt>
          <dd>{snapshot?.version ?? document.version}</dd>
        </div>
        {snapshot && (
          <>
            <div>
              <dt>Preparado em</dt>
              <dd>
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeZone: "America/Sao_Paulo",
                  timeStyle: "medium",
                }).format(new Date(snapshot.created_at))}
              </dd>
            </div>
            <div>
              <dt>Hash SHA-256 do conteúdo exato</dt>
              <dd>{snapshot.content_hash}</dd>
            </div>
          </>
        )}
      </dl>
      <details open={!attempt}>
        <summary>
          {snapshot
            ? "Consultar conteúdo integral preparado"
            : "Revisar conteúdo integral salvo"}
        </summary>
        <DocumentPreview
          document={material}
          athleteName={snapshot?.material.athlete_name ?? athleteName}
        />
      </details>
      {!snapshot ? (
        <>
          <p>
            Revise todo o conteúdo salvo antes de preparar. A preparação congela
            esta versão por 15 minutos e não assina o documento.
          </p>
          <div className="signing-actions">
            <Link href={editor} className="ghost" prefetch={false}>
              Voltar à edição
            </Link>
            <button
              className="button"
              disabled={busy}
              onClick={() => void prepare()}
            >
              {busy ? "Preparando…" : "Preparar versão demonstrativa"}
            </button>
          </div>
        </>
      ) : !attempt ? (
        <>
          <h2>Escolher identidade demonstrativa</h2>
          {inventory.identities.length ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="signing-form">
                <label>
                  Identidade para este documento
                  <select
                    value={identity}
                    required
                    onChange={(e) => {
                      setIdentity(e.target.value);
                      setConfirmed(false);
                      key.current = null;
                    }}
                  >
                    <option value="">Selecione explicitamente</option>
                    {inventory.identities.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label} — {i.provider}
                        {inventory.preferred === i.id ? " (preferencial)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cenário de demonstração
                  <select
                    value={scenario}
                    onChange={(e) => {
                      setScenario(e.target.value);
                      setConfirmed(false);
                      key.current = null;
                    }}
                  >
                    <option value="success">Sucesso simulado</option>
                    <option value="denied">Negativa</option>
                    <option value="expired">Expiração</option>
                    <option value="failed">Falha técnica</option>
                    <option value="delayed">
                      Resposta atrasada (8 segundos)
                    </option>
                  </select>
                </label>
              </div>
              <p>
                Documento: {documentKinds[document.document_type].title}, versão{" "}
                {snapshot.version}. Identidade:{" "}
                <strong>{selected?.label ?? "Ainda não selecionada"}</strong>.
                Provedor: Simulador CBB. Nenhuma identidade foi verificada.
              </p>
              <label className="signing-choice">
                <input
                  type="checkbox"
                  checked={confirmed}
                  required
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Revisei o conteúdo integral desta versão e autorizo somente a
                simulação com a identidade selecionada. Entendo que o documento
                não será assinado digitalmente.
              </label>
              <div className="signing-actions">
                <Link className="ghost" href={editor} prefetch={false}>
                  Retornar à edição
                </Link>
                <button
                  className="button"
                  disabled={busy || !selected || !confirmed}
                >
                  {busy ? "Registrando…" : "Confirmar e autorizar simulação"}
                </button>
              </div>
            </form>
          ) : (
            <p>
              Nenhuma identidade disponível.{" "}
              <Link href="/perfil" prefetch={false}>
                Gerencie as identidades demonstrativas em Meu perfil
              </Link>{" "}
              e retorne para preparar novamente.
            </p>
          )}
        </>
      ) : (
        <section aria-labelledby="signing-result">
          <div role="status">
            <h2 id="signing-result">{signingStateLabels[attempt.state]}</h2>
          </div>
          <p>
            Identidade:{" "}
            {inventory.identities.find((i) => i.id === attempt.identity_id)
              ?.label ?? "Identidade demonstrativa selecionada"}
            . Tentativa: {attempt.id}.
          </p>
          <p>
            <strong>
              Documento não assinado digitalmente. Nenhum certificado foi
              validado.
            </strong>
          </p>
          {!active && attempt.state !== "simulated_success" && (
            <p>
              O rascunho continua disponível. Confira os dados e prepare uma
              nova tentativa para tentar novamente.
            </p>
          )}
          <div className="signing-actions">
            {active && (
              <>
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() => void check()}
                >
                  Consultar andamento
                </button>
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() => void check(true)}
                >
                  Cancelar tentativa
                </button>
              </>
            )}
            {!active && (
              <button
                className="ghost"
                disabled={busy}
                onClick={() => void prepare()}
              >
                Preparar nova tentativa
              </button>
            )}
            <Link className="ghost" href={editor} prefetch={false}>
              Voltar ao documento original
            </Link>
          </div>
        </section>
      )}
      {!!history.length && (
        <section aria-labelledby="signing-history">
          <h2 id="signing-history">Tentativas demonstrativas recentes</h2>
          <p>Últimas 10 tentativas deste documento.</p>
          <ul className="signing-list">
            {history.map((h) => (
              <li key={h.id}>
                <Link
                  prefetch={false}
                  href={`${editor}/assinatura?preparacao=${h.snapshot_id}&tentativa=${h.id}`}
                >
                  {signingStateLabels[h.state]} · Versão {h.version} · {h.label}{" "}
                  ·{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                  timeZone: "America/Sao_Paulo",
                    timeStyle: "short",
                  }).format(new Date(h.confirmed_at))}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Link href={editor} prefetch={false}>
            Abrir versão atual no editor
          </Link>
        </div>
      )}
    </section>
  );
}
