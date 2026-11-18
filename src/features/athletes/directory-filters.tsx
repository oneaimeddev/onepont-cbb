"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DirectoryFilters({ count, children }: { count: number; children: ReactNode }) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = root.current;
    const form = details?.closest("form");
    if (!details || !form) return;
    const focusKey = "cbb-directory-filter-focus";
    try {
      if (sessionStorage.getItem(focusKey)) {
        sessionStorage.removeItem(focusKey);
        details.querySelector("summary")?.focus({ preventScroll: true });
      }
    } catch { /* UI focus restoration is best effort when storage is unavailable. */ }
    const submitted = () => {
      if (details.open) {
        try { sessionStorage.setItem(focusKey, "1"); } catch { /* Native GET remains available. */ }
      }
      const focusedInside = details.contains(document.activeElement);
      details.open = false;
      if (focusedInside) details.querySelector("summary")?.focus();
    };
    form.addEventListener("submit", submitted);
    return () => form.removeEventListener("submit", submitted);
  }, []);
  return <details ref={root} className="directory-filters">
    <summary>Filtros{count > 0 && <span className="filter-count">{count}</span>}</summary>
    <p className="directory-filter-help">Categoria, clube, modalidade e naipe são combinados no mesmo vínculo vigente.</p>
    {children}
    <button type="submit" className="outline directory-apply">Aplicar filtros</button>
  </details>;
}
