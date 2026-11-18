"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

const discard = () => window.confirm("Há alterações cadastrais não salvas. Deseja descartá-las e sair? Cancele para continuar editando.");
const snapshot = (form: HTMLFormElement) => JSON.stringify([...new FormData(form)].map(([key, value]) => [key, typeof value === "string" ? value : `${value.name}:${value.size}:${value.lastModified}`]));

export function RegistrationGuard({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const forms = [...container.querySelectorAll("form")];
    const initial = new Map(forms.map(form => [form, snapshot(form)]));
    const update = () => { dirty.current = forms.some(form => snapshot(form) !== initial.get(form)); setChanged(dirty.current); };
    const submit = () => { dirty.current = false; setChanged(false); };
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href);
      if (!/^https?:$/.test(target.protocol) || target.href === location.href || (target.pathname === location.pathname && target.search === location.search)) return;
      if (!discard()) { event.preventDefault(); event.stopImmediatePropagation(); } else submit();
    };
    // Navigation API additionally covers browser Back/Forward where cancellation is supported.
    type NavigateEvent = Event & { canIntercept?: boolean; navigationType?: string; hashChange?: boolean };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const navigate = (event: Event) => {
      const next = event as NavigateEvent;
      if (dirty.current && next.canIntercept && next.navigationType !== "reload" && !next.hashChange) {
        if (!discard()) event.preventDefault(); else submit();
      }
    };
    container.addEventListener("input", update); container.addEventListener("change", update);
    container.addEventListener("submit", submit);
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      container.removeEventListener("input", update); container.removeEventListener("change", update); container.removeEventListener("submit", submit);
      document.removeEventListener("click", click, true); window.removeEventListener("beforeunload", unload); navigation?.removeEventListener("navigate", navigate);
    };
  }, []);
  return <div ref={root} className="registration-edit-scope">{changed && <p role="status">Alterações cadastrais não salvas.</p>}{children}</div>;
}
