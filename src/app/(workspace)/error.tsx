"use client";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page"><h1>Não foi possível carregar esta página</h1><p role="alert">A consulta não foi concluída. Tente novamente em alguns instantes.</p><button className="outline" onClick={reset}>Tentar novamente</button></main>;
}
