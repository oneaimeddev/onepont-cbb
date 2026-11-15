import { Icon } from "../../components/icon";

export function MessageComposer() {
  return (
    <section className="ia-composer" aria-label="Composição de mensagem">
      <label className="ia-sr" htmlFor="chat-input">Mensagem</label>
      <textarea
        id="chat-input"
        rows={2}
        placeholder="Pergunte sobre um atleta, uma evolução ou um prontuário."
        aria-describedby="composer-status"
        disabled
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
          <button type="button" className="ia-send" disabled aria-label="Enviar" aria-describedby="composer-status">
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
      <p className="ia-status" id="composer-status">
        O assistente ainda está indisponível. O envio será habilitado quando a integração estiver pronta.
      </p>
    </section>
  );
}
