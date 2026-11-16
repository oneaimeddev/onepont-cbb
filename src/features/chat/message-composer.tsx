import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../../components/icon";

const fieldLimit = 160;

export function MessageComposer({
  enabled,
  pending,
  failure,
  onEdit,
  onSend,
}: {
  enabled: boolean;
  pending: boolean;
  failure: string | null;
  onEdit: () => void;
  onSend: (message: string) => void;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const status = !enabled
    ? "O assistente ainda está indisponível. O envio será habilitado quando a integração estiver pronta."
    : pending
      ? "Consultando os registros autorizados."
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
    if (!enabled || pending || !message) return;
    setValue("");
    onSend(message);
  }

  return (
    <form
      className="ia-composer"
      aria-label="Composição de mensagem"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="ia-sr" htmlFor="chat-input">Mensagem</label>
      <textarea
        ref={fieldRef}
        id="chat-input"
        rows={2}
        maxLength={2000}
        placeholder="Pergunte sobre um atleta, uma evolução ou um prontuário."
        aria-describedby="composer-status"
        disabled={!enabled || pending}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
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
        <button type="button" className="ia-attach" disabled aria-describedby="composer-status">
          <Icon name="clip" size={16} />
          Anexar
        </button>
        <div className="ia-toolbar-end">
          <button type="button" className="ia-icon" disabled aria-label="Falar" aria-describedby="composer-status">
            <Icon name="mic" size={18} />
          </button>
          <button type="submit" className="ia-send" disabled={!enabled || pending || value.trim().length === 0} aria-label="Enviar" aria-describedby="composer-status">
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
      <p className="ia-status" id="composer-status" role={failure ? "alert" : undefined}>{status}</p>
    </form>
  );
}
