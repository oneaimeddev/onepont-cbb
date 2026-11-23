"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { submitEvolution } from "../../app/(workspace)/atletas/[id]/evolucao/actions";
import { setUnsavedClinicalDraft } from "./unsaved";

type Phase =
  | "idle"
  | "validating"
  | "finalizing"
  | "saving"
  | "finalized"
  | "saved"
  | "error";
export function EvolutionForm({
  athleteId,
  consultationId,
  requestId,
  recordId,
  version,
  title: initialTitle,
  body: initialBody,
  restricted: initialRestricted,
  mandatoryRestriction,
  canFinalize,
}: {
  athleteId: string;
  consultationId?: string;
  requestId: string;
  recordId: string | null;
  version: number;
  title: string;
  body: string;
  restricted: boolean;
  mandatoryRestriction: boolean;
  canFinalize: boolean;
}) {
  const router = useRouter(),
    locked = useRef(false),
    dirty = useRef(false);
  const [submissionId] = useState(requestId);
  const [title, setTitle] = useState(initialTitle),
    [body, setBody] = useState(initialBody),
    [restricted, setRestricted] = useState(
      initialRestricted || mandatoryRestriction || !recordId,
    );
  const [phase, setPhase] = useState<Phase>("idle"),
    [error, setError] = useState("");

  function changed() {
    dirty.current = true;
    setUnsavedClinicalDraft(true);
  }
  useEffect(() => {
    const leave = () => {
      if (!dirty.current) return true;
      const accepted = window.confirm(
        "Existem alterações não salvas nesta evolução. Deseja descartá-las e sair?",
      );
      if (accepted) {
        dirty.current = false;
        setUnsavedClinicalDraft(false);
      }
      return accepted;
    };
    const click = (event: MouseEvent) => {
      if (
        !dirty.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const next = new URL(link.href);
      if (
        !/^https?:$/.test(next.protocol) ||
        (next.pathname === location.pathname && next.search === location.search)
      )
        return;
      if (!leave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const navigate = (event: Event) => {
      const next = event as Event & {
        canIntercept?: boolean;
        navigationType?: string;
        hashChange?: boolean;
      };
      if (
        dirty.current &&
        next.canIntercept &&
        next.cancelable &&
        next.navigationType === "traverse" &&
        !next.hashChange &&
        !leave()
      )
        event.preventDefault();
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      navigation?.removeEventListener("navigate", navigate);
      setUnsavedClinicalDraft(false);
    };
  }, []);
  async function submit(form: FormData) {
    if (locked.current) return;
    locked.current = true;
    setError("");
    setPhase("validating");
    const intent = form.get("intent");
    if (
      !title.trim() ||
      title.trim().length > 160 ||
      !body.trim() ||
      body.length > 20000 ||
      (intent !== "draft" && intent !== "finalize")
    ) {
      setError("Preencha o título e o conteúdo da evolução.");
      setPhase("error");
      locked.current = false;
      return;
    }
    setPhase(intent === "finalize" ? "finalizing" : "saving");
    try {
      const result = await submitEvolution(form);
      if (!result.ok) {
        setError(
          result.error === "denied"
            ? "Você não tem permissão para concluir esta operação. O conteúdo foi mantido."
            : result.error === "conflict"
              ? "A evolução foi alterada em outra sessão. Seu texto foi mantido; confira a versão atual antes de tentar novamente."
              : result.error === "reused"
                ? "Esta solicitação já foi utilizada com outro conteúdo. Seu texto foi mantido; confira o registro antes de iniciar uma nova solicitação."
                : result.error === "invalid"
                  ? "Confira o título e o conteúdo. As informações foram mantidas."
                  : "Não foi possível confirmar o salvamento. O conteúdo foi mantido; tente novamente com segurança.",
        );
        setPhase("error");
        locked.current = false;
        return;
      }
      dirty.current = false;
      setUnsavedClinicalDraft(false);
      setPhase(result.status === "finalized" ? "finalized" : "saved");
      if (result.status === "finalized")
        router.push(
          `/atletas/${athleteId}?aba=timeline&registro=${result.id}#registro-${result.id}`,
        );
      else {
        const current = new URL(location.href);
        if (current.searchParams.get("registro") === result.id)
          router.refresh();
        else
          router.push(`/atletas/${athleteId}/evolucao?registro=${result.id}`);
        // The refreshed record/version remounts this form; keep controls locked until then.
      }
    } catch {
      setError(
        "Não foi possível confirmar o salvamento. O conteúdo foi mantido; tente novamente com segurança.",
      );
      setPhase("error");
      locked.current = false;
    }
  }
  return (
    <form
      action={submit}
      className="athlete-form composer-panel"
      onInvalid={() => {
        setError("Preencha os campos obrigatórios antes de continuar.");
        setPhase("error");
      }}
    >
      <input type="hidden" name="athlete" value={athleteId} />
      {consultationId && <input type="hidden" name="capture" value={consultationId} />}
      <input type="hidden" name="request" value={submissionId} />
      <input type="hidden" name="record" value={recordId ?? ""} />
      <input type="hidden" name="version" value={version} />
      <EvolutionFields
        title={title}
        body={body}
        restricted={restricted}
        initialRestricted={initialRestricted}
        mandatoryRestriction={mandatoryRestriction}
        canFinalize={canFinalize}
        phase={phase}
        error={error}
        onTitle={(value) => {
          setTitle(value);
          changed();
        }}
        onBody={(value) => {
          setBody(value);
          changed();
        }}
        onRestricted={(value) => {
          setRestricted(value);
          changed();
        }}
      />
    </form>
  );
}

function EvolutionFields({
  title,
  body,
  restricted,
  initialRestricted,
  mandatoryRestriction,
  canFinalize,
  phase,
  error,
  onTitle,
  onBody,
  onRestricted,
}: {
  title: string;
  body: string;
  restricted: boolean;
  initialRestricted: boolean;
  mandatoryRestriction: boolean;
  canFinalize: boolean;
  phase: Phase;
  error: string;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onRestricted: (value: boolean) => void;
}) {
  const { pending, data } = useFormStatus();
  const finalizing = pending
    ? data?.get("intent") === "finalize"
    : phase === "finalizing";
  const saving = pending ? data?.get("intent") === "draft" : phase === "saving";
  const busy =
    pending ||
    phase === "validating" ||
    phase === "saving" ||
    phase === "finalizing" ||
    phase === "finalized" ||
    phase === "saved";
  return (
    <>
      <label>
        Tipo ou título da evolução
        <input
          name="title"
          maxLength={160}
          required
          value={title}
          readOnly={busy}
          onChange={(e) => {
            onTitle(e.target.value);
          }}
        />
      </label>
      <label htmlFor="evolution-body">Conteúdo</label>
      <textarea
        id="evolution-body"
        name="body"
        maxLength={20000}
        required
        rows={8}
        value={body}
        readOnly={busy}
        onChange={(e) => {
          onBody(e.target.value);
        }}
      />
      {mandatoryRestriction || initialRestricted ? (
        <>
          <input type="hidden" name="restricted" value="yes" />
          <p>
            {mandatoryRestriction
              ? "Evoluções de Psicologia têm sigilo obrigatório de conteúdo."
              : "Este registro permanece restrito ao autor."}
          </p>
        </>
      ) : (
        <label className="check-label">
          <input
            type="checkbox"
            name="restricted"
            value="yes"
            checked={restricted}
            disabled={busy}
            onChange={(e) => {
              onRestricted(e.target.checked);
            }}
          />
          Restringir o registro ao autor
        </label>
      )}
      {canFinalize && (
        <button
          className="button"
          type="submit"
          name="intent"
          value="finalize"
          disabled={busy}
          aria-busy={finalizing}
        >
          {finalizing ? "Finalizando…" : "Finalizar evolução"}
        </button>
      )}
      <button
        className="outline"
        type="submit"
        name="intent"
        value="draft"
        disabled={busy}
        aria-busy={saving}
      >
        {saving ? "Salvando…" : "Salvar rascunho"}
      </button>
      {error && !pending ? (
        <p role="alert">{error}</p>
      ) : (
        <p role="status">
          {pending
            ? finalizing
              ? "Finalizando evolução…"
              : "Salvando rascunho…"
            : phase === "validating"
              ? "Validando…"
              : phase === "finalizing"
                ? "Finalizando evolução…"
                : phase === "saving"
                  ? "Salvando rascunho…"
                  : phase === "finalized"
                    ? "Finalizado."
                    : phase === "saved"
                      ? "Rascunho salvo."
                      : "Escolha finalizar o atendimento ou guardar um rascunho para depois."}
        </p>
      )}
    </>
  );
}
