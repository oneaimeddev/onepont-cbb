import { useRef } from "react";
import { Icon } from "../../../components/icon";
import { audioAccept } from "./audio-file";
import type { ConsultationAudioState } from "./use-consultation-audio";

/** Button that opens the file picker for a consultation recorded on another device. */
export function ConsultationAudioButton({ disabled, onFile }: { disabled: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="ia-attach" disabled={disabled} onClick={() => input.current?.click()} title="Anexar a gravação de uma consulta para transcrever">
        <Icon name="headphones" size={16} />Áudio da consulta
      </button>
      <input
        ref={input}
        type="file"
        accept={audioAccept}
        hidden
        aria-label="Arquivo de áudio da consulta"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}

/** Progress of an attached recording: preparing, transcribing segment by segment, or a failure. */
export function ConsultationAudioStatus({ state, progress, error, canRetry, onCancel, onRetry }: {
  state: ConsultationAudioState;
  progress: { done: number; total: number };
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
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="ia-dictation ia-audio-progress">
      <button type="button" className="ia-dictation-discard" onClick={onCancel} aria-label="Cancelar a transcrição do áudio" title="Cancelar">
        <Icon name="close" size={16} />
      </button>
      <span className="ia-processing-dots" aria-hidden="true"><span /><span /><span /></span>
      <span role="status">
        {state === "preparing" ? "Preparando o áudio…" : `Transcrevendo a consulta · ${progress.done} de ${progress.total}`}
      </span>
      {state === "transcribing" ? (
        <span className="ia-audio-bar" role="progressbar" aria-label="Transcrição da consulta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </span>
      ) : null}
    </div>
  );
}
