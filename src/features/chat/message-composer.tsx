import { Icon } from "../../components/icon";

export function MessageComposer() {
  return (
    <section className="composer-area" aria-label="Composição de mensagem">
      <div className="message-composer">
        <label className="sr-only" htmlFor="chat-input">Mensagem</label>
        <textarea id="chat-input" rows={2} placeholder="Escreva uma mensagem ao assistente…"
          aria-describedby="composer-status" disabled />
        <div className="composer-toolbar">
          <p className="composer-status" id="composer-status">
            <Icon name="info" size={16} />
            <span>O assistente ainda está indisponível. O envio será habilitado quando a integração estiver pronta.</span>
          </p>
          <button type="button" className="button" disabled aria-describedby="composer-status">
            <Icon name="send" size={18} />Enviar
          </button>
        </div>
      </div>
    </section>
  );
}
