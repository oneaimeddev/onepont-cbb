"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DocumentPreview } from "./preview";
import { reviewCommand } from "./review-client";
import type {
  DocumentReviewRecord,
  DemoDelivery,
  DeliveryEligibility,
} from "./review-types";
import { command } from "../signing/client";
import {
  demoNotice,
  signingStateLabels,
  type SigningAttempt,
  type SigningInventory,
} from "../signing/contracts";
import "../signing/signing.css";
import "./documents.css";
export function DocumentReviewPanel({
  initial,
  inventory,
  demoEnabled,
  onBack,
  onPersisted,
  initialAttempt = null,
  initialDelivery,
  deliveryEligibility,
  initialIdentity = "",
  onIdentityChange,
  onRetry,
}: {
  initial: DocumentReviewRecord;
  inventory: SigningInventory | null;
  demoEnabled: boolean;
  onBack: () => void;
  onPersisted: () => void;
  initialAttempt?: SigningAttempt | null;
  initialDelivery?: DemoDelivery;
  deliveryEligibility?: DeliveryEligibility | null;
  initialIdentity?: string;
  onIdentityChange?: (id: string) => void;
  onRetry?: () => Promise<DocumentReviewRecord>;
}) {
  const router = useRouter();
  const [deliveryScenario, setDeliveryScenario] = useState("success");
  const [review, setReview] = useState(initial),
    [identity, setIdentity] = useState(
      inventory?.identities.some((i) => i.id === initialIdentity)
        ? initialIdentity
        : "",
    ),
    [confirmed, setConfirmed] = useState(false),
    [scenario, setScenario] = useState("success"),
    [send, setSend] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [attempt, setAttempt] = useState(initialAttempt),
    [delivery, setDelivery] = useState<DemoDelivery>(
      initialDelivery ?? {
        requested: false,
        state: "not_requested",
        eligible_for_real: false,
      },
    );
  const key = useRef<string | null>(null);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const editor = `/atletas/${review.athlete_id}/documentos/${review.document_id}`;
  const active =
    attempt?.state === "authorizing" || attempt?.state === "processing";
  useEffect(() => {
    heading.current?.focus();
  }, []);
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
          if (result.workflow?.lifecycle === "finalized") {
            clearInterval(timer);
            router.replace(editor);
            router.refresh();
          }
        }
      } catch (e) {
        clearInterval(timer);
        if (!stopped) {
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
  }, [active, attempt, editor, router]);
  async function commit(sign: boolean) {
    if (inFlight.current) return;
    if (sign && (!identity || !confirmed)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      key.current ??= crypto.randomUUID();
      const result = await reviewCommand(sign ? "sign" : "save", {
        review_id: review.id,
        review_hash: review.content_hash,
        identity_id: identity,
        idempotency_key: key.current,
        scenario,
        confirmed,
        delivery_requested: send,
        delivery_scenario: deliveryScenario,
      });
      onPersisted();
      setReview(result.review);
      if (sign) {
        setAttempt(result.attempt);
        setDelivery(result.delivery);
        if (result.workflow?.lifecycle === "finalized") {
          router.replace(editor);
          router.refresh();
          return;
        }
        const url = new URL(window.location.href);
        url.pathname = editor + "/assinatura";
        url.search = "";
        url.searchParams.set("tentativa", result.attempt.id);
        url.searchParams.set("preparacao", result.snapshot.id);
        window.history.replaceState(null, "", url);
      } else {
        setSaved(true);
        const url = new URL(window.location.href);
        url.pathname = editor;
        url.search = "?salvo=rascunho";
        window.history.replaceState(null, "", url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function check(cancel = false) {
    if (!attempt || inFlight.current) return;
    setBusy(true);
    inFlight.current = true;
    try {
      const result = await command("signing", cancel ? "cancel" : "status", {
        attempt_id: attempt.id,
      });
      setAttempt(result.attempt);
      if (result.workflow?.lifecycle === "finalized") {
        router.replace(editor);
        router.refresh();
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function retry() {
    if (!onRetry) return;
    setBusy(true);
    setError("");
    try {
      setReview(await onRetry());
      setAttempt(null);
      setSaved(false);
      setConfirmed(false);
      setSend(false);
      setDelivery({
        requested: false,
        state: "not_requested",
        eligible_for_real: false,
      });
      key.current = null;
      heading.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="document-review"
      aria-labelledby="document-review-title"
    >
      <header className="document-review-heading">
        <h1
          ref={heading}
          tabIndex={-1}
          id="document-review-title"
          className="athlete-name"
        >
          {attempt
            ? "Resultado da demonstração"
            : saved
              ? "Documento salvo"
              : "Revisar documento"}
        </h1>
        <p>
          Confira o conteúdo integral antes de autorizar.{" "}
          {review.material.version ? `Versão ${review.material.version}.` : ""}
        </p>
      </header>
      <aside className="signing-demo-notice">
        <strong>{demoNotice}</strong>
        <p>
          A assinatura real e a integração de entrega estão indisponíveis.
          Nenhum WhatsApp será enviado.
        </p>
      </aside>
      <div className="document-review-layout">
        <DocumentPreview
          review
          document={review.material}
          athleteName={review.material.athlete_name}
        />
        <div className="document-review-decisions">
          {saved ? (
            <section aria-labelledby="saved-without-signature">
              <div role="status">
                <h3 id="saved-without-signature">
                  Documento salvo sem assinatura.
                </h3>
              </div>
              <p>
                O rascunho está disponível para retomada. Nenhuma tentativa de
                assinatura foi criada.
              </p>
              <Link
                className="button"
                href={editor + "?salvo=rascunho"}
                prefetch={false}
              >
                Voltar ao documento salvo
              </Link>
            </section>
          ) : attempt ? (
            <section aria-labelledby="document-simulation-result">
              <div role="status">
                <h3 id="document-simulation-result">
                  {signingStateLabels[attempt.state]}
                </h3>
              </div>
              <p>
                Documento não assinado digitalmente. Nenhum certificado foi
                validado.
              </p>
              <p>
                {inventory?.identities.find((i) => i.id === attempt.identity_id)
                  ?.label ?? "Identidade demonstrativa selecionada"}
              </p>
              {delivery.requested ? (
                <aside className="document-delivery-result">
                  <p>
                    <strong>
                      {attempt.state === "simulated_success"
                        ? "Envio não realizado — integração indisponível"
                        : "Intenção demonstrativa registrada, sem envio"}
                    </strong>
                  </p>
                  <p>
                    Nenhum WhatsApp foi enviado. Esta intenção nunca será
                    processada por um conector real.
                  </p>
                </aside>
              ) : (
                <p>Envio não solicitado.</p>
              )}
              <div className="signing-actions">
                {active ? (
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
                ) : (
                  onRetry && (
                    <button
                      className="ghost"
                      disabled={busy}
                      onClick={() => void retry()}
                    >
                      Revisar para tentar novamente
                    </button>
                  )
                )}
                <Link className="outline" href={editor} prefetch={false}>
                  Voltar ao documento
                </Link>
              </div>
            </section>
          ) : (
            <>
              <h3>Identidade de assinatura</h3>
              {demoEnabled && inventory?.identities.length ? (
                <label>
                  Identidade para este documento
                  <select
                    disabled={busy}
                    value={identity}
                    onChange={(e) => {
                      setIdentity(e.target.value);
                      onIdentityChange?.(e.target.value);
                      setConfirmed(false);
                      key.current = null;
                    }}
                  >
                    <option value="">Selecione explicitamente</option>
                    {inventory.identities.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label} — {i.provider}
                        {inventory.preferred === i.id
                          ? " (preferencial)"
                          : ""}{" "}
                        — fictícia
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>
                  {demoEnabled
                    ? "Nenhuma identidade demonstrativa disponível."
                    : "Assinatura indisponível neste ambiente."}{" "}
                  Você pode revisar e salvar sem assinar.{" "}
                  <Link href="/perfil" prefetch={false}>
                    Abrir Perfil Profissional
                  </Link>
                </p>
              )}
              {demoEnabled && (
                <details>
                  <summary>Cenários de demonstração</summary>
                  <label>
                    Cenário da entrega
                    <select
                      value={deliveryScenario}
                      disabled={busy}
                      onChange={(e) => {
                        setDeliveryScenario(e.target.value);
                        setConfirmed(false);
                        key.current = null;
                      }}
                    >
                      <option value="success">
                        Entrega simulada concluída
                      </option>
                      <option value="temporary_failure">
                        Falha temporária
                      </option>
                      <option value="permanent_failure">
                        Falha definitiva
                      </option>
                      <option value="timeout">Timeout e reconciliação</option>
                      <option value="delayed">Resposta atrasada</option>
                      <option value="duplicate">Resposta duplicada</option>
                    </select>
                  </label>
                  <label>
                    Cenário de demonstração
                    <select
                      disabled={busy}
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
                </details>
              )}
              <section aria-labelledby="delivery-option">
                <h3 id="delivery-option">Entrega ao atleta</h3>
                <label className="signing-choice">
                  <input
                    type="checkbox"
                    disabled={busy || !demoEnabled}
                    checked={send}
                    onChange={(e) => {
                      setSend(e.target.checked);
                      setConfirmed(false);
                      key.current = null;
                    }}
                  />
                  Enviar ao atleta por WhatsApp após assinar (demonstração)
                </label>
                <p className="professional-help">
                  Entrega simulada após a finalização, se o destinatário for
                  elegível. Nenhum WhatsApp real será enviado.
                </p>
                {send && (
                  <div className="document-recipient">
                    <dl>
                      <div>
                        <dt>Destinatário</dt>
                        <dd>{review.recipient.name ?? "Não identificado"}</dd>
                      </div>
                      <div>
                        <dt>Relação com o atleta</dt>
                        <dd>
                          {review.recipient.category === "guardian"
                            ? "Responsável — "
                            : ""}
                          {review.recipient.relation}
                        </dd>
                      </div>
                      <div>
                        <dt>{deliveryEligibility?.policy === "virtual-demo-v1" ? "Contato demonstrativo" : "Telefone mascarado"}</dt>
                        <dd>
                          {review.recipient.phone_masked ?? "Não disponível"}
                        </dd>
                      </div>
                    </dl>
                    <p>{review.recipient.reason}</p>
                    <p>
                      {deliveryEligibility?.eligible
                        ? "Destinatário autorizado somente para simulação. Nenhuma autorização de produção foi concedida."
                        : "Nenhuma autorização elegível de entrega está disponível. O documento pode ser finalizado sem envio."}
                    </p>
                  </div>
                )}
              </section>
              <label className="signing-choice">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || !demoEnabled || !identity}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Revisei este conteúdo e autorizo somente a simulação com a
                identidade escolhida. Nenhuma assinatura digital válida será
                produzida.
              </label>
              <div className="document-review-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy || !demoEnabled || !identity || !confirmed}
                  onClick={() => void commit(true)}
                >
                  {busy ? "Processando…" : "Simular assinatura"}
                </button>
                <button
                  type="button"
                  className="outline"
                  disabled={busy}
                  onClick={() => void commit(false)}
                >
                  Salvar sem assinar
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={onBack}
                >
                  Voltar e editar
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="document-review-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
