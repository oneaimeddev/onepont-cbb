"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

type NavigationItem = { href: string; title: string; icon: IconName; isAvailable?: boolean };

export function WorkspaceShell({ children, session, navigation, fonts }: {
  children: React.ReactNode;
  session: React.ReactNode;
  navigation: NavigationItem[];
  fonts: string;
}) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const athletePath = pathname.match(/^\/atletas\/([0-9a-f-]{36})$/i);
  function mark(href: string) {
    if (href === "/atletas") {
      if (pathname === "/atletas" || pathname === "/prontuarios" || pathname === "/evolucoes") return "page" as const;
      if (pathname.startsWith("/atletas/") || pathname.startsWith("/prontuarios/") || pathname.startsWith("/evolucoes/")) return "location" as const;
      return undefined;
    }
    if (href === "/") return pathname === "/" ? "page" as const : undefined;
    if (pathname === href) return "page" as const;
    if (pathname.startsWith(`${href}/`)) return "location" as const;
    return undefined;
  }

  function closeNavigation() {
    setNavigationOpen(false);
    menuButton.current?.focus();
  }

  if (pathname === "/") return children;

  return (
    <div className={`${fonts} workspace-shell${isWide ? " is-wide" : ""}`} onKeyDown={(event) => {
      if (event.key === "Escape" && navigationOpen) closeNavigation();
    }}>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <aside id="workspace-sidebar" className={navigationOpen ? "workspace-sidebar is-open" : "workspace-sidebar"}>
        <Link className="sidebar-brand" href="/" aria-label="Prontuário CBB, início">
          <Image src="/brand/cbb.png" width={697} height={869} alt="" className="brand-mark" priority />
        </Link>
        <nav aria-label="Navegação do workspace">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href === "/" && athletePath ? `/?atleta=${athletePath[1]}` : item.href}
              prefetch={false} aria-label={item.title} data-label={item.title} aria-current={mark(item.href)}
              onClick={() => { if (navigationOpen) closeNavigation(); }}>
              <Icon name={item.icon} size={18} />
              <span className="nav-label">{item.title}</span>
              {item.isAvailable === false && (
                <small className="status-tag" title="Indisponível"><Icon name="lock" size={14} /><span className="tag-text">Indisponível</span></small>
              )}
            </Link>
          ))}
        </nav>
        <button type="button" className="rail-toggle" aria-label={isWide ? "Recolher menu" : "Expandir menu"} data-label={isWide ? "Recolher" : "Expandir"} aria-expanded={isWide} aria-controls="workspace-sidebar" onClick={() => setIsWide((value) => !value)}>
          <Icon name="rail" size={18} />
          <span className="nav-label">{isWide ? "Recolher" : "Expandir"}</span>
        </button>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="workspace-mast">
            <Link className="mast-mark" href="/" aria-label="Prontuário CBB, início">
              <Image src="/brand/cbb.png" width={697} height={869} alt="" className="brand-mark" priority />
            </Link>
            <p className="workspace-product">Prontuário<small>Demonstração</small></p>
            <button ref={menuButton} className="ghost menu-button" type="button" aria-expanded={navigationOpen}
              aria-controls="workspace-sidebar" onClick={() => setNavigationOpen((value) => !value)}>
              <Icon name={navigationOpen ? "close" : "menu"} />
              {navigationOpen ? "Fechar menu" : "Menu"}
            </button>
          </div>
          {session}
        </header>
        {children}
      </div>
    </div>
  );
}
