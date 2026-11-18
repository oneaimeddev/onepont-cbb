"use client";

import Link from "next/link";
import "./create-menu.css";
import { useEffect, useId, useRef, useState } from "react";

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
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>+ Novo documento</button>
    {open && <nav id={id} className="document-create-options" aria-label="Tipos de documento">
      <Link href={`${base}/documentos/nova?tipo=prescricao`} aria-label="Nova prescrição" prefetch={false} onClick={() => setOpen(false)}>Prescrição</Link>
      <Link href={`${base}/documentos/nova?tipo=cirurgia`} aria-label="Novo pedido cirúrgico" prefetch={false} onClick={() => setOpen(false)}>Pedido cirúrgico</Link>
      <Link href={`${base}/documentos/nova?tipo=exames`} aria-label="Nova solicitação de exames" prefetch={false} onClick={() => setOpen(false)}>Solicitação de exames</Link>
    </nav>}
  </div>;
}
