"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../../components/icon";
import { sections } from "../sections";
import { MessageComposer } from "./message-composer";
import "./intelligence.css";

const shortcuts: { href: string; label: string; icon: IconName; slug?: keyof typeof sections }[] = [
  { href: "/", label: "Conversa", icon: "chat" },
  { href: "/atletas", label: "Buscar atletas", icon: "search", slug: "atletas" },
  { href: "/prontuarios", label: "Prontuários", icon: "records", slug: "prontuarios" },
  { href: "/evolucoes", label: "Evolução", icon: "note", slug: "evolucoes" },
];

const tasks = [
  { href: "/atletas", label: "Buscar atletas", slug: "atletas" },
  { href: "/evolucoes", label: "Criar evolução", slug: "evolucoes" },
  { href: "/prontuarios", label: "Consultar prontuários", slug: "prontuarios" },
] as const;

export function IntelligenceHome({
  fonts,
  greeting,
  profile,
  context,
  signOut,
}: {
  fonts: string;
  greeting: string;
  profile: { displayName: string; profession: string; initials: string; canReadAudit: boolean };
  context?: ReactNode;
  signOut: ReactNode;
}) {
  const pathname = usePathname();
  const accountRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
    accountRef.current?.focus();
  }

  return (
    <div className={`ia ${fonts}`}>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <aside className="ia-rail">
        <Link href="/" aria-label="Prontuário CBB, início" prefetch={false}>
          <Image src="/brand/cbb.png" width={697} height={869} alt="" priority />
        </Link>
        <nav aria-label="Atalhos">
          {shortcuts.map((item) => {
            const unavailable = item.slug ? !sections[item.slug].isAvailable : false;
            if (unavailable) {
              return (
                <span key={item.href} className="ia-icon" title="Indisponível" aria-label={`${item.label}, indisponível`}>
                  <Icon name="lock" size={18} />
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                className="ia-icon"
                href={item.href}
                aria-label={item.label}
                aria-current={pathname === item.href ? "page" : undefined}
                prefetch={false}
              >
                <Icon name={item.icon} size={18} />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="ia-stage">
        <header className="ia-top">
          <p className="ia-product">Prontuário</p>
          <div
            className="ia-user"
            onKeyDown={(event) => {
              if (event.key === "Escape" && menuOpen) closeMenu();
            }}
          >
            <button
              ref={accountRef}
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={`Conta de ${profile.displayName}`}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="ia-avatar" aria-hidden="true">{profile.initials}</span>
              <span>
                <strong>{profile.displayName}</strong>
                <small>{profile.profession}</small>
              </span>
            </button>
            {menuOpen ? (
              <div className="ia-menu" role="menu" aria-label="Conta">
                <div className="ia-menu-id">
                  <strong>{profile.displayName}</strong>
                  <small>{profile.profession}</small>
                </div>
                {profile.canReadAudit ? (
                  <Link role="menuitem" href="/auditoria" prefetch={false} onClick={() => setMenuOpen(false)}>Auditoria</Link>
                ) : null}
                {signOut}
              </div>
            ) : null}
          </div>
        </header>

        <main className="ia-canvas" id="conteudo" tabIndex={-1}>
          <div className="ia-hero">
            <p>{greeting}</p>
            <h1>Como posso ajudar<br /><span>você hoje?</span></h1>
          </div>
          <MessageComposer />
          <nav className="ia-tasks" aria-label="Tarefas clínicas">
            <ul className="ia-pills">
              {tasks.map((task) => (
                <li key={task.href}>
                  {sections[task.slug].isAvailable ? (
                    <Link href={task.href} prefetch={false}>{task.label}</Link>
                  ) : (
                    <span>{task.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          {context}
        </main>
      </div>
    </div>
  );
}
