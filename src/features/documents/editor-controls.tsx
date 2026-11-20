"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { setUnsavedClinicalDraft } from "../clinical/unsaved";

const EditorReviewContext = createContext<{show:(node:ReactNode)=>void;back:()=>void;release:()=>void}|null>(null);
export function useEditorReview(){const value=useContext(EditorReviewContext);if(!value)throw new Error("Editor context missing");return value;}
// Document fields remain mounted while the current content is reviewed.
export function DocumentEditorFrame({ dirty, children }: { dirty: boolean; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef(dirty);
  const [review, setReview] = useState<ReactNode>(null);
  const release = () => { pending.current=false; setUnsavedClinicalDraft(false); };
  useEffect(() => {
    pending.current = dirty;
    setUnsavedClinicalDraft(pending.current);
    const leave = (preview = false) => {
      const accepted = window.confirm(preview
        ? "A prévia contém somente a última versão salva. As alterações não salvas serão descartadas ao sair. Deseja abrir essa versão? Cancele para continuar editando e salvar primeiro."
        : "Existem alterações não salvas neste documento. Deseja descartá-las e sair? Cancele para continuar editando.");
      if (accepted) {
        pending.current = false;
        setUnsavedClinicalDraft(false);
      }
      return accepted;
    };
    const click = (event: MouseEvent) => {
      if (!pending.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href);
      if (!/^https?:$/.test(destination.protocol) || (destination.pathname === location.pathname && destination.search === location.search)) return;
      if (!leave(link.hasAttribute("data-document-preview"))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    // Navigation API covers cancellable Back/Forward in supporting browsers.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const navigate = (event: Event) => {
      const next = event as Event & { canIntercept?: boolean; navigationType?: string; hashChange?: boolean };
      if (pending.current && next.canIntercept && next.cancelable && next.navigationType !== "reload" && !next.hashChange && !leave()) event.preventDefault();
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      navigation?.removeEventListener("navigate", navigate);
      setUnsavedClinicalDraft(false);
    };
  }, [dirty]);

  return <EditorReviewContext.Provider value={{show:setReview,back:()=>{setReview(null);requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>('[data-review-trigger]')?.focus());},release}}><div ref={root} className={review ? "document-edit-scope is-reviewing" : "document-edit-scope"}><div className="document-editor-fields" hidden={!!review}>{children}</div>{review}</div></EditorReviewContext.Provider>;
}

export function DocumentTextarea({ value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const field = ref.current;
    if (!field || !field.getClientRects().length) return;
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
  const [selected, setSelected] = useState(items[0]?.id ?? "");
  const [reviewAll, setReviewAll] = useState(false);
  const activeId = items.some((item) => item.id === selected) ? selected : (items[0]?.id ?? "");
  useLayoutEffect(() => {
    if (focusTo.current === undefined) return;
    const target = focusTo.current === null ? addButton.current : root.current?.querySelector<HTMLInputElement>(`[data-item-name="${focusTo.current}"]`);
    focusTo.current = undefined;
    target?.focus({ preventScroll: !reviewAll });
    if (target) {
      const bounds = target.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      if (reviewAll || bounds.top < top || bounds.bottom > top + (viewport?.height ?? innerHeight)) target.scrollIntoView({ block: "nearest" });
    }
  }, [items, activeId, reviewAll]);
  const add = (item: T) => {
    focusTo.current = item.id;
    setSelected(item.id);
    update([...items, item]);
    setAnnouncement(`${noun} adicionado.`);
  };
  const remove = (item: T, index: number) => {
    focusTo.current = items[index + 1]?.id ?? items[index - 1]?.id ?? null;
    setSelected(focusTo.current ?? "");
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
    setSelected(last.item.id);
    update(restored);
    setRemoved((current) => current.slice(0, -1));
    setAnnouncement(`${noun} restaurado: ${last.item.name.trim() || "item sem nome"}.`);
  };
  return { root, addButton, add, remove, undo, announcement, removed: removed.at(-1), activeId, select: setSelected, reviewAll, setReviewAll };
}

export function RemovalNotice({ announcement, name, undo }: { announcement: string; name?: string; undo: () => void }) {
  return <div className="document-removal">
    <p aria-live="polite" aria-atomic="true">{announcement}</p>
    {name !== undefined && <button type="button" className="outline" onClick={undo}>Desfazer remoção de {name || "item sem nome"}</button>}
  </div>;
}


export function DocumentItemNavigation({ items, activeId, select, reviewAll, setReviewAll, noun, children }: {
  items: { id: string; name: string }[];
  activeId: string;
  select: (id: string) => void;
  reviewAll: boolean;
  setReviewAll: (all: boolean) => void;
  noun: string;
  children: ReactNode;
}) {
  return <div className="document-item-navigation">
    {!reviewAll && items.length > 0 && <label>{noun} em edição
      <select value={activeId} onChange={(event) => select(event.target.value)}>
        {items.map((item, index) => <option key={item.id} value={item.id}>{index + 1} de {items.length} · {item.name.trim() || "Sem nome"}</option>)}
      </select>
    </label>}
    <div className="document-item-navigation-actions">
      {children}
      <button type="button" className="outline" aria-pressed={reviewAll} onClick={() => setReviewAll(!reviewAll)}>{reviewAll ? "Editar por item" : "Conferir todos"}</button>
    </div>
    <p className="document-navigation-help">{reviewAll ? "Todos os itens estão abertos para conferência." : "Edite um item por vez. Use a lista para alternar; os dados preenchidos são mantidos."}</p>
  </div>;
}
