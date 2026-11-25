"use client";

import { useState } from "react";
import { Icon } from "../../../components/icon";
import type { ConsultationRecordingState } from "./use-consultation-recording";

function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${String(minutes).padStart(2, "0")}:${rest}`;
}

const tips = [
  "Mantenha a tela do aparelho ligada durante toda a consulta.",
  "Deixe o navegador em primeiro plano: não troque de aplicativo nem de aba enquanto grava.",
  "Use uma internet estável, de preferência Wi-Fi. A transcrição acontece durante a consulta.",
];

/**
 * Live consultation recording inside the chat: guidance before starting, the recording with time,
 * level, pause and end, then the transcription. The result arrives in the conversation as the
 * report card (detailed or synthetic), the same as an attached consultation audio.
 */
export function ConsultationRecordingPanel({ state, athleteName, elapsed, levels, warning, error, canRetry, progress, onStart, onPause, onResume, onFinish, onCancel }: {
  state: ConsultationRecordingState;
  athleteName: string;
  elapsed: number;
  levels: number[];
  warning: string | null;
  error: string | null;
  canRetry: boolean;
  progress: { done: number; total: number };
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (state === "idle") return null;
  const live = state === "recording" || state === "paused";
  const bars = Array.from({ length: 40 }, (_, index) => levels[index - (40 - levels.length)] ?? 0);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="ia-record" data-state={state} aria-label="Gravação da consulta">
      <header className="ia-record-head">
        <span className="ia-record-mark" aria-hidden="true"><Icon name="record" size={18} /></span>
        <div>
          <h3>Gravar consulta</h3>
          <p>{athleteName}</p>
        </div>
        {state === "confirm" ? (
          <button type="button" className="ia-record-close" onClick={onCancel} aria-label="Fechar" title="Fechar">
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </header>

      {state === "confirm" ? (
        <>
          <div className="ia-record-guide">
            <p className="ia-record-guide-title">Antes de começar</p>
            <ul>{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          </div>
          <p className="ia-record-note">Conduza a consulta normalmente. Ao encerrar, a conversa é transcrita e você escolhe o relatório detalhado ou sintético.</p>
          <div className="ia-record-actions">
            <button type="button" className="ia-record-primary" onClick={onStart}><Icon name="record" size={16} />Iniciar gravação</button>
            <button type="button" onClick={onCancel}>Cancelar</button>
          </div>
        </>
      ) : null}

      {state === "starting" ? (
        <p className="ia-record-status" role="status"><span className="ia-processing-dots" aria-hidden="true"><span /><span /><span /></span>Abrindo o microfone…</p>
      ) : null}

      {live ? (
        <>
          <div className="ia-record-live">
            <span className="ia-record-state" role="status">
              <span className="ia-record-dot" aria-hidden="true" />
              {state === "recording" ? "Gravando" : "Gravação pausada"}
            </span>
            <time className="ia-record-time" aria-label={`Tempo de gravação ${clock(elapsed)}`}>{clock(elapsed)}</time>
            <span className="ia-record-wave" aria-hidden="true">
              {bars.map((value, index) => <i key={index} style={{ transform: `scaleY(${Math.max(0.08, Math.min(1, value * 4))})` }} />)}
            </span>
          </div>
          {progress.total ? <p className="ia-record-note">{progress.done} de {progress.total} trechos já transcritos durante a consulta.</p> : null}
          {warning ? <p className="ia-record-warning" role="alert">{warning}</p> : null}
          <div className="ia-record-actions">
            <button type="button" className="ia-record-primary" onClick={onFinish}><Icon name="stop" size={16} />Encerrar e transcrever</button>
            {state === "recording"
              ? <button type="button" onClick={onPause}><Icon name="pause" size={16} />Pausar</button>
              : <button type="button" onClick={onResume}><Icon name="record" size={16} />Continuar</button>}
            <button type="button" className="ia-record-discard" onClick={() => { if (confirmDiscard) { setConfirmDiscard(false); onCancel(); } else setConfirmDiscard(true); }} onBlur={() => setConfirmDiscard(false)}>
              {confirmDiscard ? "Confirmar descarte" : "Descartar"}
            </button>
          </div>
        </>
      ) : null}

      {state === "finishing" ? (
        <div className="ia-record-progress" role="status">
          <span><span className="ia-processing-dots" aria-hidden="true"><span /><span /><span /></span>Transcrevendo a consulta · {progress.done} de {progress.total}</span>
          <span className="ia-audio-bar" role="progressbar" aria-label="Transcrição da consulta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span style={{ width: `${percent}%` }} />
          </span>
        </div>
      ) : null}

      {state === "error" ? (
        <>
          <p className="ia-record-warning" role="alert">{error}</p>
          <div className="ia-record-actions">
            {canRetry
              ? <button type="button" className="ia-record-primary" onClick={onFinish}>Tentar novamente</button>
              : <button type="button" className="ia-record-primary" onClick={onStart}><Icon name="record" size={16} />Gravar novamente</button>}
            <button type="button" onClick={onCancel}>{canRetry ? "Descartar" : "Fechar"}</button>
          </div>
        </>
      ) : null}
    </section>
  );
}
