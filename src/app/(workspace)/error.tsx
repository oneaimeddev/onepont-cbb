"use client";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="traditional-content"><h1>Não foi possível carregar esta página</h1><p>Tente novamente em alguns instantes.</p><button className="outline" onClick={reset}>Tentar novamente</button></main>;
}
