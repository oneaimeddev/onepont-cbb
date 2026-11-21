"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentDraft } from "./document-draft";
import type { DocumentWorkspaceState } from "./operations/contracts";
import type { SigningInventory } from "../signing/contracts";
import {
  deliveryLabel,
  signatureLabel,
  signatureNeedsNewReview,
  type WorkflowDetail,
} from "../documents/workflow-types";

type JourneyView = {
  observedAt: number;
  document: DocumentDraft;
  sessionId: string;
  state: DocumentWorkspaceState | null;
  inventory: SigningInventory | null;
  workflow: WorkflowDetail | null;
  demoEnabled: boolean;
};
async function command(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/inteligencia/operacoes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok || result.error)
    throw new Error(
      "Confira seu acesso, contexto e a versão do documento. Peça uma nova revisão se a operação expirou.",
    );
  return result;
}
export function useDocumentJourney(draft: DocumentDraft) {
  const [view, setView] = useState<JourneyView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const requestSequence = useRef(0);
  const { requestId, athleteId, kind, version, contentHash } = draft;
  const enabled = draft.state !== "discarded" && !draft.locallyEdited;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled) return;
      const sequence = ++requestSequence.current;
      try {
        const next = await command(
          {
            action: "inspect",
            requestId,
            athleteId,
            kind,
            version,
            contentHash,
          },
          signal,
        );
        if (
          mounted.current &&
          !signal?.aborted &&
          sequence === requestSequence.current
        ) {
          setView({ ...next, observedAt: Date.now() });
          setError("");
        }
      } catch (e) {
        if (
          mounted.current &&
          !signal?.aborted &&
          sequence === requestSequence.current
        ) {
          setView(null);
          setError((e as Error).message);
        }
      }
    },
    [enabled, requestId, athleteId, kind, version, contentHash],
  );
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refresh(controller.signal);
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [refresh]);
  const active =
    !!view?.workflow &&
    ((!!view.workflow.workflow.signature &&
      ["authorizing", "processing"].includes(
        view.workflow.workflow.signature.state,
      )) ||
      view.workflow.workflow.deliveries.some((d) =>
        [
          "waiting_signature",
          "queued",
          "processing",
          "accepted_by_provider",
          "uncertain",
        ].includes(d.state),
      ));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [active, refresh]);
  const expiresAt =
    view?.state?.challenge?.phase === "pending"
      ? view.state.challenge.expiresAt
      : null;
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => {
      void refresh();
    }, remaining + 100);
    return () => clearTimeout(timer);
  }, [expiresAt, refresh]);
  async function resume() {
    const a = view?.state?.authorization;
    if (!a || !view) return;
    setBusy(true);
    try {
      await command({
        action: "execute",
        sessionId: view.sessionId,
        authorizationId: a.authorizationId,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function present() {
    const c = view?.state?.challenge;
    if (!c || !view) return;
    setBusy(true);
    setError("");
    try {
      await command({
        action: "present",
        sessionId: view.sessionId,
        challengeId: c.id,
        nonce: c.nonce,
        summaryHash: c.summaryHash,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return {
    resume,
    view: enabled ? view : null,
    error: enabled ? error : "",
    busy,
    refresh,
    present,
  };
}
export function DocumentJourney({
  journey,
  onSend,
  disabled = false,
}: {
  journey: ReturnType<typeof useDocumentJourney>;
  onSend?: (message: string) => void;
  disabled?: boolean;
}) {
  const { view, error, busy } = journey;
  const [history, setHistory] = useState(false);
  if (!view) return error ? <p role="status">{error}</p> : null;
  const c = view.state?.challenge,
    w = view.workflow?.workflow;
  const expired = !!c && new Date(c.expiresAt).getTime() <= view.observedAt;
  const needsNewReview = signatureNeedsNewReview(w?.signature);
  const pending = c?.phase === "pending" && (!w?.signature || needsNewReview);
  const confirmation = c?.summary.delivery.requested
    ? "Confirmo esta versão, a assinatura e o envio para o destinatário apresentado"
    : "Confirmo esta versão e a assinatura";
  const send = (text: string) => onSend?.(text);
  return (
    <section
      className="ia-document-journey"
      aria-label="Assinatura e entrega no chat"
      aria-busy={busy}
    >
      <h4>Assinatura e entrega</h4>
      {view.demoEnabled ? (
        <p className="ia-draft-banner">
          Demonstração: assinatura e entrega simuladas. Sem assinatura digital
          real ou envio real por WhatsApp.
        </p>
      ) : (
        <p>Assinatura demonstrativa indisponível neste ambiente.</p>
      )}
      {w?.signature ? (
        <>
          <p>Identidade: {w.signature.identityLabel}</p>
          <p role="status">
            {signatureLabel(w.signature)}.{" "}
            {w.lifecycle === "finalized"
              ? "Versão finalizada e somente leitura."
              : needsNewReview
                ? "A tentativa anterior terminou. Prepare uma nova revisão e confirme novamente para tentar outra assinatura."
                : "Acompanhe o processamento sem repetir a autorização."}
          </p>
          {w.deliveries.length ? (
            w.deliveries.map((d) => (
              <div key={d.id}>
                <p>{deliveryLabel(d.state, d.provenance)}</p>
                <p>
                  Destinatário: {d.recipient?.name ?? "Indisponível"} ·{" "}
                  {d.recipient?.relation} · {d.recipient?.phone_masked}
                </p>
                {d.state === "failed" && d.failureKind === "retryable" ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => send("A entrega falhou? Tente novamente.")}
                  >
                    Preparar retentativa
                  </button>
                ) : null}
                {d.state === "delivered" ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => send("Quero reenviar o documento")}
                  >
                    Preparar reenvio
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p>Sem entrega autorizada.</p>
          )}
          {w.lifecycle === "finalized" ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => send("Quero criar um documento derivado")}
            >
              Preparar documento derivado
            </button>
          ) : null}
        </>
      ) : null}
      {view.state?.authorization && !w?.signature ? (
        <>
          <p>
            Autorização registrada. Consulte ou retome a execução antes de
            preparar outra operação.
          </p>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => void journey.resume()}
          >
            Retomar operação autorizada
          </button>
        </>
      ) : null}
      {pending ? (
        <section aria-label="Resumo da autorização pendente">
          <h4>Confira esta autorização</h4>
          {expired ? (
            <p role="status">
              Esta autorização expirou. Prepare novamente a assinatura e confira
              o novo resumo.
            </p>
          ) : null}
          <dl>
            <div>
              <dt>Atleta</dt>
              <dd>{view.document.athleteName}</dd>
            </div>
            <div>
              <dt>Documento</dt>
              <dd>
                {view.document.title} · versão {c.summary.version}
              </dd>
            </div>
            <div>
              <dt>Identidade</dt>
              <dd>
                {c.summary.identity.label} · {c.summary.identity.provider}
              </dd>
            </div>
            <div>
              <dt>Efeito</dt>
              <dd>
                Finalizar esta versão com assinatura simulada.{" "}
                {c.summary.delivery.requested
                  ? "Autorizar entrega simulada por WhatsApp."
                  : "Sem envio."}
              </dd>
            </div>
          </dl>
          {c.summary.delivery.recipient ? (
            <p>
              Destinatário: {c.summary.delivery.recipient.name} ·{" "}
              {c.summary.delivery.recipient.relation} ·{" "}
              {c.summary.delivery.recipient.phone_masked}
            </p>
          ) : null}
          <p>
            Válida até{" "}
            <time dateTime={c.expiresAt}>
              {new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              }).format(new Date(c.expiresAt))}
            </time>
            . Mudar conteúdo, identidade ou destinatário exige nova confirmação.
          </p>
          <div className="ia-draft-actions">
            {!c.presentedAt ? (
              <button
                type="button"
                disabled={busy || disabled || expired}
                onClick={() => void journey.present()}
              >
                Li a versão e o resumo
              </button>
            ) : (
              <>
                <p>
                  Para autorizar, envie: “{confirmation}”. Por voz, mantenha a
                  operação pendente e use a confirmação textual abaixo.
                </p>
                <button
                  type="button"
                  className="ia-draft-save"
                  disabled={busy || disabled || expired}
                  onClick={() => send(confirmation)}
                >
                  Enviar confirmação de assinatura simulada
                </button>
              </>
            )}
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => send("Cancele a operação")}
            >
              Cancelar operação pendente
            </button>
          </div>
        </section>
      ) : null}
      {(!w?.signature || needsNewReview) && view.demoEnabled && onSend ? (
        <div className="ia-draft-actions">
          {view.inventory?.connected ? (
            view.inventory.identities.map((i) => (
              <button
                type="button"
                key={i.id}
                disabled={disabled || busy}
                onClick={() => send(`Use a identidade ${i.label}`)}
              >
                Usar {i.label}
              </button>
            ))
          ) : (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => send("Conectar assinatura demonstrativa")}
            >
              Conectar assinatura demonstrativa
            </button>
          )}
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => send("Assine sem envio")}
          >
            Preparar assinatura sem envio
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => send("Assine e envie")}
          >
            Preparar assinatura e entrega
          </button>
        </div>
      ) : null}
      <div className="ia-draft-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void journey.refresh()}
        >
          Atualizar estado do documento
        </button>
        {view.workflow ? (
          <button
            type="button"
            aria-expanded={history}
            onClick={() => setHistory(!history)}
          >
            Histórico de assinatura e entrega
          </button>
        ) : null}
      </div>
      {history && view.workflow ? (
        <ol aria-label="Histórico de assinatura e entrega">
          {view.workflow.history.map((item, index) => (
            <li key={`${item.kind}:${item.at}:${index}`}>
              {item.kind === "delivery"
                ? deliveryLabel(
                    item.state as Parameters<typeof deliveryLabel>[0],
                    item.provenance,
                  )
                : item.kind === "finalization"
                  ? "Versão finalizada"
                  : item.kind === "review"
                    ? "Documento revisado"
                    : ((
                        {
                          authorizing: "Assinatura autorizada",
                          processing: "Assinatura em processamento",
                          simulated_success: "Assinatura simulada concluída",
                          succeeded: "Assinatura simulada concluída",
                          denied: "Autorização negada",
                          expired: "Autorização expirada",
                          failed: "Falha na assinatura",
                          cancelled: "Assinatura cancelada",
                          stale: "Versão desatualizada",
                        } as Record<string, string>
                      )[item.state] ?? "Atualização de assinatura")}{" "}
              · {item.provenance === "simulated" ? "Simulado" : "Verificado"} ·{" "}
              <time dateTime={item.at}>
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "America/Sao_Paulo",
                }).format(new Date(item.at))}
              </time>
            </li>
          ))}
        </ol>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
