"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./account-menu.css";

export function AccountMenu({ profile, signOut }: {
  profile: { displayName: string; profession: string; canReadAudit: boolean; initials?: string };
  signOut: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const lastOnOpen = useRef(false);
  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    const items = root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (items?.length) items[lastOnOpen.current ? items.length - 1 : 0].focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const initials = profile.initials ?? profile.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR");
  return <div className="ia-user" ref={root} onBlur={(event) => {
    // Safari (iOS/macOS) does not focus links or buttons on tap/click, so a tap on a menu item
    // blurs the focused item with relatedTarget = null. Closing here would unmount the menu
    // before the click lands; outside taps are handled by the pointerdown listener instead.
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault(); lastOnOpen.current = event.key === "ArrowUp"; setOpen(true); return;
    }
    if (!open) return;
    event.preventDefault();
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-haspopup="menu" aria-controls={open ? id : undefined} aria-label={`Conta de ${initials} ${profile.displayName} ${profile.profession}`} onClick={() => { lastOnOpen.current = false; setOpen((value) => !value); }}>
      <span className="ia-avatar" aria-hidden="true">{initials}</span>{" "}
      <span><strong>{profile.displayName}</strong>{" "}<small>{profile.profession}</small></span>
    </button>
    {open && <div id={id} className="ia-menu" role="menu" aria-label="Conta">
      <div className="ia-menu-id" role="presentation"><strong>{profile.displayName}</strong><small>{profile.profession}</small></div>
      <Link role="menuitem" href="/perfil" prefetch={false} onClick={() => setOpen(false)}>Meu perfil</Link>
      {profile.canReadAudit && <Link role="menuitem" href="/auditoria" prefetch={false} onClick={() => setOpen(false)}>Auditoria</Link>}
      {signOut}
    </div>}
  </div>;
}
