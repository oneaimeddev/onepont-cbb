export function DirectorySkeleton() {
  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page" aria-busy="true">
      <p className="sr-only">Carregando atletas.</p>
      <div className="directory-skeleton" aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>
    </main>
  );
}
