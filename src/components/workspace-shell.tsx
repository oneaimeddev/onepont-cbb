"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";

type NavigationItem = { href: string; title: string; isAvailable?: boolean };

export function WorkspaceShell({ children, session, navigation }: {
  children: React.ReactNode;
  session: React.ReactNode;
  navigation: NavigationItem[];
}) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const athletePath = pathname.match(/^\/atletas\/([0-9a-f-]{36})$/i);
  const current = navigation.find((item) => item.href === pathname)
    ?? navigation.find((item) => pathname.startsWith(item.href + "/"));

  function closeNavigation() {
    setNavigationOpen(false);
    menuButton.current?.focus();
  }

  return (
    <div className="workspace-shell" onKeyDown={(event) => {
      if (event.key === "Escape" && navigationOpen) closeNavigation();
    }}>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <div className="mobile-toolbar">
        <Link href="/" aria-label="Prontuário CBB, início"><Brand /></Link>
        <button ref={menuButton} className="outline" type="button" aria-expanded={navigationOpen}
          aria-controls="workspace-sidebar" onClick={() => setNavigationOpen(!navigationOpen)}>
          {navigationOpen ? "Fechar menu" : "Menu"}
        </button>
      </div>
      <aside id="workspace-sidebar" className={navigationOpen ? "workspace-sidebar is-open" : "workspace-sidebar"}>
        <Link className="sidebar-brand" href="/" aria-label="Prontuário CBB, início"><Brand /></Link>
        <nav aria-label="Navegação do workspace">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href === "/" && athletePath ? `/?atleta=${athletePath[1]}` : item.href}
              prefetch={false} aria-current={current?.href === item.href ? (pathname === item.href ? "page" : "location") : undefined}
              onClick={() => { if (navigationOpen) closeNavigation(); }}>
              {item.title}
              {item.isAvailable === false && <small className="status-tag">Indisponível</small>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-session">{session}</div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <span>{current?.title ?? "Prontuário CBB"}</span>
          <small>Ambiente de demonstração</small>
        </header>
        {children}
      </div>
    </div>
  );
}
