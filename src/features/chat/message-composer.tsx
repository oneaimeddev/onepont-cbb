import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Icon } from "../../components/icon";
import { messageLimit } from "./voice/transcription";

const fieldLimit = 160;

export function MessageComposer({
  enabled,
  pending,
  failure,
  value,
  voicePanel,
  voiceControl,
  attachmentControl,
  onFocusChange,
  onValueChange,
  onEdit,
  onSend,
}: {
  enabled: boolean;
  pending: boolean;
  failure: string | null;
  value: string;
  voicePanel?: ReactNode;
  voiceControl?: ReactNode;
  attachmentControl?: ReactNode;
  onFocusChange?: (focused: boolean) => void;
  onValueChange: (value: string) => void;
  onEdit: () => void;
  onSend: (message: string) => void;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const tooLong = value.length > messageLimit;
  const status = !enabled
    ? "O assistente ainda está indisponível. O envio será habilitado quando a integração estiver pronta."
    : pending
      ? "Aguarde a conclusão para enviar outra mensagem."
      : tooLong
        ? `A mensagem passou de ${messageLimit} caracteres. Divida o texto antes de enviar.`
        : failure
          ? failure
          : "As respostas usam somente os registros autorizados para o seu perfil.";

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, fieldLimit)}px`;
  }, [value]);

  function submit() {
    const message = value.trim();
    if (!enabled || pending || !message || tooLong) return;
    onValueChange("");
    onSend(message);
  }

  return (
    <form
      className="ia-composer"
      aria-label="Composição de mensagem"
      aria-busy={pending}
      onFocusCapture={() => onFocusChange?.(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange?.(false); }}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {voicePanel}
      <label className="ia-sr" htmlFor="chat-input">Mensagem</label>
      <textarea
        ref={fieldRef}
        id="chat-input"
        rows={2}
        maxLength={tooLong ? undefined : messageLimit}
        placeholder="Pergunte sobre um atleta, uma evolução ou um prontuário."
        aria-describedby="composer-status"
        aria-invalid={tooLong || undefined}
        disabled={!enabled || pending}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          if (failure) onEdit();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          const native = event.nativeEvent;
          if (native.isComposing || native.keyCode === 229) return;
          event.preventDefault();
          submit();
        }}
      />
      <div className="ia-toolbar">
        {attachmentControl ?? <button type="button" className="ia-attach" disabled aria-describedby="composer-status">
          <Icon name="clip" size={16} />
          Anexar
        </button>}
        <div className="ia-toolbar-end">
          {voiceControl ?? (
            <button type="button" className="ia-icon" disabled aria-label="Iniciar conversa por voz" title="Iniciar conversa por voz" aria-describedby="composer-status">
              <Icon name="mic" size={18} />
            </button>
          )}
          <button type="submit" className="ia-send" disabled={!enabled || pending || tooLong || value.trim().length === 0} aria-label="Enviar" aria-describedby="composer-status">
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
      <p className="ia-status" id="composer-status" role={failure || tooLong ? "alert" : undefined}>{status}</p>
    </form>
  );
}
