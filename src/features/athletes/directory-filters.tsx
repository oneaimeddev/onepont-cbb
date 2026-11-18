import type { ReactNode } from "react";

export function DirectoryFilters({ count, children }: { count: number; children: ReactNode }) {
  return <fieldset className="directory-filters directory-filters-inline">
    <legend>Filtros{count > 0 && <span className="filter-count">{count}</span>}</legend>
    <div className="directory-filter-row">
      {children}
      <button type="submit" className="outline directory-apply">Aplicar filtros</button>
    </div>
    <p className="directory-filter-help">Categoria, clube, modalidade e naipe são combinados no mesmo vínculo vigente.</p>
  </fieldset>;
}
