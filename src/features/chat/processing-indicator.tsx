export function ProcessingIndicator({ tools = false }: { tools?: boolean }) {
  return (
    <p className="ia-pending" role="status" aria-live="polite">
      <span className="ia-processing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        {tools
          ? "Consultando informações autorizadas…"
          : "Preparando resposta…"}
      </span>
    </p>
  );
}
