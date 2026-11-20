"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentPreview } from "./preview";
import { documentKinds } from "./content";
import type { ClinicalDocument } from "./data";
import { deliveryLabel, type WorkflowDetail } from "./workflow-types";
import "./documents.css";
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});
async function action(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/documents/workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error(
      (
        {
          recipient_unavailable:
            "O destinatário ou a autorização não está disponível. Nenhuma entrega será iniciada.",
          confirmation_required:
            "Confirme o destinatário e informe uma justificativa de ao menos 8 caracteres.",
          conflict:
            "Esta operação mudou de estado. Consulte o andamento antes de repetir.",
          unavailable: "Operação indisponível para seu acesso.",
        } as Record<string, string>
      )[data.error] ??
        "Não foi possível concluir. Consulte o andamento e tente novamente.",
    );
  return data;
}
export function DocumentWorkflowView({
  document,
  initial,
}: {
  document: ClinicalDocument;
  initial: WorkflowDetail;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<{ id: string; kind: "retry" | "resend" } | null>(
      null,
    ),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const actionKey = useRef<string | null>(null),
    deriveKey = useRef<string | null>(null);
  const workflow = detail.workflow,
    finalized = workflow.lifecycle === "finalized",
    pendingSignature = ["authorizing", "processing"].includes(
      workflow.signature?.state ?? "",
    );
  const pendingDelivery = workflow.deliveries.some((d) =>
    [
      "queued",
      "processing",
      "accepted_by_provider",
      "uncertain",
      "waiting_signature",
    ].includes(d.state),
  );
  const base = `/atletas/${document.athlete_id}`;
  useEffect(() => {
    if (!pendingSignature && !pendingDelivery) return;
    let done = false;
    const timer = setInterval(async () => {
      try {
        const data = await action("get", { document_id: document.id });
        if (!done) {
          setDetail(data);
          setError("");
        }
      } catch (e) {
        clearInterval(timer);
        if (!done) setError((e as Error).message);
      }
    }, 1200);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [document.id, pendingSignature, pendingDelivery]);
  async function refresh() {
    try {
      setDetail(await action("get", { document_id: document.id }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function derive() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      deriveKey.current ??= crypto.randomUUID();
      const data = await action("derive", {
        document_id: document.id,
        idempotency_key: deriveKey.current,
      });
      router.push(`${base}/documentos/${data.documentId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function request(kind: "retry" | "resend" | "cancel", id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      actionKey.current ??= crypto.randomUUID();
      await action(kind, {
        request_id: id,
        idempotency_key: actionKey.current,
        justification: reason,
        confirmed,
      });
      setForm(null);
      setConfirmed(false);
      setReason("");
      actionKey.current = null;
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const material = detail.material ?? document;
  const name = detail.material?.athlete_name ?? "Atleta";
  return (
    <main
      id="conteudo"
      tabIndex={-1}
      className="traditional-content clinical-page document-final-view"
    >
      <Link
        href={`${base}?aba=documentos`}
        className="back-link"
        prefetch={false}
      >
        Voltar aos documentos do atleta
      </Link>
      <header className="document-review-heading">
        <h1 className="athlete-name">
          {finalized
            ? "Documento finalizado"
            : pendingSignature
              ? "Assinatura em andamento"
              : "Resultado da assinatura"}
        </h1>
        <p>
          {documentKinds[document.document_type].title} · Versão{" "}
          {document.version} · {name}
        </p>
        {finalized && (
          <p>
            Finalizado em {date.format(new Date(workflow.finalization!.at))} ·
            Somente leitura
          </p>
        )}
      </header>
      {workflow.signature?.provenance === "simulated" && (
        <aside className="signing-demo-notice">
          <strong>Operação demonstrativa</strong>
          <p>
            A finalização é persistida e bloqueia alterações. Não houve
            assinatura digital válida nem envio externo de mensagem.
          </p>
        </aside>
      )}
      <div className="document-review-layout">
        <DocumentPreview
          review
          document={material}
          athleteName={name}
          processing={pendingSignature}
          finalized={
            finalized
              ? {
                  provenance: workflow.finalization!.provenance,
                  verified:
                    workflow.signature?.cryptographicallyVerified ?? false,
                }
              : undefined
          }
        />
        <aside
          className="document-review-decisions"
          aria-label="Assinatura e entrega"
        >
          <h2>Assinatura</h2>
          <p role="status">
            {finalized
              ? workflow.signature?.provenance === "simulated"
                ? "Assinatura simulada concluída"
                : workflow.signature?.cryptographicallyVerified
                  ? "Assinatura validada"
                  : "Validação indisponível"
              : pendingSignature
                ? "Aguardando conclusão da assinatura"
                : ((
                    {
                      denied: "Autorização negada",
                      expired: "Autorização expirada",
                      failed: "Falha na assinatura",
                      cancelled: "Assinatura cancelada",
                      stale: "Conteúdo desatualizado",
                    } as Record<string, string>
                  )[workflow.signature?.state ?? ""] ?? "Não concluída")}
          </p>
          <p>
            {workflow.signature?.identityLabel} ·{" "}
            {workflow.signature?.adapter === "simulated"
              ? "Adaptador simulado"
              : workflow.signature?.adapter}
          </p>
          {pendingSignature && (
            <button
              className="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await action("cancel_signature", {
                    document_id: document.id,
                  });
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancelar assinatura
            </button>
          )}
          <h2>Entrega</h2>
          {!workflow.deliveries.length ? (
            <p>Envio não solicitado.</p>
          ) : (
            workflow.deliveries.map((d) => (
              <section
                key={d.id}
                className="document-delivery-status"
                aria-label="Solicitação de entrega"
              >
                <h3>{deliveryLabel(d.state, d.provenance)}</h3>
                <p>
                  {d.attempts} {d.attempts === 1 ? "tentativa" : "tentativas"} ·{" "}
                  {d.provenance === "simulated"
                    ? "Procedência simulada"
                    : "Procedência verificada"}
                </p>
                {d.recipient ? (
                  <p>
                    {d.recipient.name} · {d.recipient.relation} ·{" "}
                    {d.recipient.phone_masked}
                  </p>
                ) : (
                  <p>
                    Destinatário não disponível ao seu acesso ou sem autorização
                    elegível.
                  </p>
                )}
                {d.provenance === "simulated" && (
                  <p>Nenhum WhatsApp foi enviado externamente.</p>
                )}
                {d.state === "blocked" && (
                  <p>
                    A autorização do destinatário não permite prosseguir. O
                    documento permanece finalizado.
                  </p>
                )}
                <div className="signing-actions">
                  {d.state === "failed" && d.failureKind === "retryable" && (
                    <button
                      className="outline"
                      disabled={busy}
                      onClick={() => {
                        setForm({ id: d.id, kind: "retry" });
                        setConfirmed(false);
                        actionKey.current = null;
                      }}
                    >
                      Tentar entrega novamente
                    </button>
                  )}
                  {d.state === "delivered" && (
                    <button
                      className="ghost"
                      disabled={busy}
                      onClick={() => {
                        setForm({ id: d.id, kind: "resend" });
                        setConfirmed(false);
                        actionKey.current = null;
                      }}
                    >
                      Solicitar reenvio
                    </button>
                  )}
                  {[
                    "queued",
                    "processing",
                    "accepted_by_provider",
                    "uncertain",
                  ].includes(d.state) && (
                    <button
                      className="ghost"
                      disabled={busy}
                      onClick={() => void request("cancel", d.id)}
                    >
                      Cancelar entrega
                    </button>
                  )}
                </div>
              </section>
            ))
          )}
          {form && (
            <form
              className="document-delivery-confirmation"
              onSubmit={(e) => {
                e.preventDefault();
                void request(form.kind, form.id);
              }}
            >
              <label>
                Justificativa da entrega
                <textarea
                  value={reason}
                  minLength={8}
                  maxLength={500}
                  required
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="signing-choice">
                <input
                  type="checkbox"
                  checked={confirmed}
                  required
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Confirmo este destinatário para esta operação demonstrativa.
                Nenhuma mensagem real será enviada.
              </label>
              <button
                className="button"
                disabled={busy || !confirmed || reason.trim().length < 8}
              >
                {busy ? "Registrando…" : "Confirmar entrega demonstrativa"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setForm(null)}
              >
                Voltar sem solicitar
              </button>
            </form>
          )}
          <button
            className="ghost"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Atualizar andamento
          </button>
          {finalized ? (
            <div className="document-review-actions">
              <button
                className="outline"
                disabled={busy}
                onClick={() => void derive()}
              >
                Criar documento derivado
              </button>
              <p>
                A origem permanece preservada. O novo documento não cancela nem
                substitui automaticamente o anterior.
              </p>
            </div>
          ) : (
            !pendingSignature && (
              <button className="button" onClick={() => router.refresh()}>
                Voltar ao editor
              </button>
            )
          )}
          {error && <p role="alert">{error}</p>}
        </aside>
      </div>
      {workflow.derivedFrom && (
        <p>
          Documento derivado de{" "}
          <Link
            href={`${base}/documentos/${workflow.derivedFrom.documentId}`}
            prefetch={false}
          >
            versão {workflow.derivedFrom.version} da origem
          </Link>
          . Sem cancelamento automático.
        </p>
      )}
      <section
        className="document-workflow-history"
        aria-labelledby="workflow-history"
      >
        <h2 id="workflow-history">Histórico do documento</h2>
        <ol>
          {detail.history.map((e, i) => (
            <li key={`${e.kind}:${e.at}:${i}`}>
              <time dateTime={e.at}>{date.format(new Date(e.at))}</time>
              <span>
                {e.attemptNumber ? `Tentativa ${e.attemptNumber} · ` : ""}
                {e.kind === "delivery"
                  ? deliveryLabel(
                      e.state as Parameters<typeof deliveryLabel>[0],
                      e.provenance,
                    )
                  : e.kind === "finalization"
                    ? "Versão finalizada"
                    : e.kind === "review"
                      ? "Documento revisado"
                      : ((
                          {
                            authorizing: "Simulação de assinatura autorizada",
                            processing: "Assinatura em processamento",
                            simulated_success: "Assinatura simulada concluída",
                            denied: "Autorização negada",
                            expired: "Autorização expirada",
                            failed: "Falha na assinatura",
                            cancelled: "Assinatura cancelada",
                            stale: "Conteúdo desatualizado",
                          } as Record<string, string>
                        )[e.state] ?? e.state)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
