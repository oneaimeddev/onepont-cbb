import { Icon } from "../../../components/icon";
import type { DictationState } from "./use-dictation";

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Microphone button: starts a recording, and while recording it becomes the stop button. */
export function DictationButton({ state, disabled, onStart, onStop }: {
  state: DictationState;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const recording = state === "recording" || state === "starting";
  const label = recording ? "Parar gravação" : "Gravar áudio";
  return (
    <button
      type="button"
      className="ia-icon ia-dictation-button"
      data-state={state}
      aria-label={label}
      title={label}
      aria-pressed={recording}
      disabled={state === "transcribing" || (disabled && !recording)}
      onClick={recording ? onStop : onStart}
    >
      <Icon name={recording ? "stop" : "mic"} size={18} />
    </button>
  );
}

/**
 * Compact status shown in the composer toolbar while a dictation is active: a recording
 * indicator with the elapsed time, the transcription in progress, or a failure to resolve.
 */
export function DictationStatus({ state, elapsed, level, error, canRetry, onCancel, onRetry }: {
  state: DictationState;
  elapsed: number;
  level: number;
  error: string | null;
  canRetry: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (state === "error") {
    return (
      <div className="ia-dictation is-error" role="alert">
        <span>{error}</span>
        {canRetry ? <button type="button" onClick={onRetry}>Tentar novamente</button> : null}
        <button type="button" onClick={onCancel}>{canRetry ? "Descartar" : "Fechar"}</button>
      </div>
    );
  }
  if (state === "transcribing") {
    return (
      <div className="ia-dictation" role="status">
        <span className="ia-processing-dots" aria-hidden="true"><span /><span /><span /></span>
        <span>Transcrevendo…</span>
      </div>
    );
  }
  const recording = state === "recording";
  const bars = [0.55, 0.9, 0.7, 1, 0.6];
  return (
    <div className="ia-dictation" data-state={state}>
      <button type="button" className="ia-dictation-discard" onClick={onCancel} aria-label="Descartar gravação" title="Descartar gravação">
        <Icon name="close" size={16} />
      </button>
      <span className="ia-dictation-dot" aria-hidden="true" />
      <span role="status">{recording ? "Gravando" : "Abrindo o microfone…"}</span>
      {recording ? <time className="ia-dictation-time" aria-hidden="true">{clock(elapsed)}</time> : null}
      {recording ? (
        <span className="ia-dictation-level" aria-hidden="true">
          {bars.map((weight, index) => (
            <span key={index} style={{ transform: `scaleY(${Math.max(0.15, Math.min(1, level * 3 * weight))})` }} />
          ))}
        </span>
      ) : null}
    </div>
  );
}
