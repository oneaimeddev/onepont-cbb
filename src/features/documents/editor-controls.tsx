"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { setUnsavedClinicalDraft } from "../clinical/unsaved";

// Local to document editing: no autosave, persisted history or clinical confirmation.
export function DocumentEditorFrame({ dirty, children }: { dirty: boolean; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let pending = dirty;
    setUnsavedClinicalDraft(pending);
    const leave = (preview = false) => {
      const accepted = window.confirm(preview
        ? "A prévia contém somente a última versão salva. As alterações não salvas serão descartadas ao sair. Deseja abrir essa versão? Cancele para continuar editando e salvar primeiro."
        : "Existem alterações não salvas neste documento. Deseja descartá-las e sair? Cancele para continuar editando.");
      if (accepted) {
        pending = false;
        setUnsavedClinicalDraft(false);
      }
      return accepted;
    };
    const click = (event: MouseEvent) => {
      if (!pending || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href);
      if (!/^https?:$/.test(destination.protocol) || (destination.pathname === location.pathname && destination.search === location.search)) return;
      if (!leave(link.hasAttribute("data-document-preview"))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const submit = (event: Event) => {
      if (event.target instanceof HTMLFormElement && root.current?.contains(event.target)) {
        pending = false;
        setUnsavedClinicalDraft(false);
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    // Navigation API covers cancellable Back/Forward in supporting browsers.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const navigate = (event: Event) => {
      const next = event as Event & { canIntercept?: boolean; navigationType?: string; hashChange?: boolean };
      if (pending && next.canIntercept && next.cancelable && next.navigationType !== "reload" && !next.hashChange && !leave()) event.preventDefault();
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    window.addEventListener("beforeunload", unload);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      window.removeEventListener("beforeunload", unload);
      navigation?.removeEventListener("navigate", navigate);
      setUnsavedClinicalDraft(false);
    };
  }, [dirty]);

  return <div ref={root} className="document-edit-scope">{children}</div>;
}

export function DocumentTextarea({ value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const field = ref.current;
    if (!field) return;
    field.style.minHeight = "";
    field.style.height = "auto";
    const height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
    field.style.height = height;
    // Manual resizing can expand the field, but cannot hide its existing text.
    field.style.minHeight = height;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth !== width) {
        width = field.clientWidth;
        fit();
      }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, []);
  return <textarea {...props} value={value} ref={ref} />;
}

// Only removed items are retained, with their original identity, values and position.
export function useDocumentItems<T extends { id: string; name: string }>(items: T[], update: (items: T[]) => void, noun: string) {
  const root = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusTo = useRef<string | null | undefined>(undefined);
  const [removed, setRemoved] = useState<{ item: T; index: number }[]>([]);
  const [announcement, setAnnouncement] = useState("");
  useLayoutEffect(() => {
    if (focusTo.current === undefined) return;
    const target = focusTo.current === null ? addButton.current : root.current?.querySelector<HTMLInputElement>(`[data-item-name="${focusTo.current}"]`);
    focusTo.current = undefined;
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  }, [items]);
  const add = (item: T) => {
    focusTo.current = item.id;
    update([...items, item]);
    setAnnouncement(`${noun} adicionado.`);
  };
  const remove = (item: T, index: number) => {
    focusTo.current = items[index + 1]?.id ?? items[index - 1]?.id ?? null;
    setRemoved((current) => [...current, { item, index }]);
    update(items.filter((entry) => entry.id !== item.id));
    setAnnouncement(`${noun} removido: ${item.name.trim() || `item ${index + 1}`}.`);
  };
  const undo = () => {
    const last = removed.at(-1);
    if (!last) return;
    const restored = [...items];
    restored.splice(Math.min(last.index, restored.length), 0, last.item);
    focusTo.current = last.item.id;
    update(restored);
    setRemoved((current) => current.slice(0, -1));
    setAnnouncement(`${noun} restaurado: ${last.item.name.trim() || "item sem nome"}.`);
  };
  return { root, addButton, add, remove, undo, announcement, removed: removed.at(-1) };
}

export function RemovalNotice({ announcement, name, undo }: { announcement: string; name?: string; undo: () => void }) {
  return <div className="document-removal">
    <p aria-live="polite" aria-atomic="true">{announcement}</p>
    {name !== undefined && <button type="button" className="outline" onClick={undo}>Desfazer remoção de {name || "item sem nome"}</button>}
  </div>;
}
