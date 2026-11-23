"use client";

import Link from "next/link";
import "./create-menu.css";
import { useEffect, useId, useRef, useState } from "react";
import { documentKinds, documentMenu } from "./content";

const ariaLabels = {
  prescription: "Nova prescrição",
  exam_request: "Nova solicitação de exames",
  certificate: "Novo atestado",
  referral: "Novo encaminhamento",
  surgical_order: "Novo pedido cirúrgico",
} as const;

export function CreateDocumentMenu({ base }: { base: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div className="document-create" ref={root} onBlur={(event) => {
    // Safari does not focus links on tap (relatedTarget is null); outside taps close via pointerdown.
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>+ Novo documento</button>
    {open && <nav id={id} className="document-create-options" aria-label="Tipos de documento">
      {documentMenu.map(({ kind, group }, index) => (
        <span key={kind} className="document-create-entry">
          {group === "documents" && documentMenu[index - 1]?.group !== "documents" ? <span className="document-create-group" aria-hidden="true">Documentos</span> : null}
          <Link href={`${base}/documentos/nova?tipo=${documentKinds[kind].slug}`} aria-label={ariaLabels[kind]} prefetch={false} onClick={() => setOpen(false)}>{documentKinds[kind].title}</Link>
        </span>
      ))}
    </nav>}
  </div>;
}
