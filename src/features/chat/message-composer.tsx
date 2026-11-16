import { useState } from "react";
import { Icon } from "../../components/icon";

export function MessageComposer({
  enabled,
  pending,
  onSend,
}: {
  enabled: boolean;
  pending: boolean;
  onSend: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  const status = !enabled
    ? "O assistente ainda está indisponível. O envio será habilitado quando a integração estiver pronta."
    : pending
      ? "Consultando os registros autorizados."
      : "As respostas usam somente os registros autorizados para o seu perfil.";

  return (
    <form
      className="ia-composer"
      aria-label="Composição de mensagem"
      onSubmit={(event) => {
        event.preventDefault();
        const message = value.trim();
        if (!enabled || pending || !message) return;
        setValue("");
        onSend(message);
      }}
    >
      <label className="ia-sr" htmlFor="chat-input">Mensagem</label>
      <textarea
        id="chat-input"
        rows={2}
        placeholder="Pergunte sobre um atleta, uma evolução ou um prontuário."
        aria-describedby="composer-status"
        disabled={!enabled || pending}
        value={value}
        onChange={(event) => setValue(event.target.value)}
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
      <p className="ia-status" id="composer-status">{status}</p>
    </form>
  );
}
