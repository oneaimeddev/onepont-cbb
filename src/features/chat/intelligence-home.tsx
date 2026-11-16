"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon, type IconName } from "../../components/icon";
import { sections } from "../sections";
import { presentedAthletes, presentedNavigation, type PresentedAthlete } from "./guards";
import { MessageComposer } from "./message-composer";
import { MessageText } from "./message-text";
import { loadScroll, loadTurns, replaceTurns, saveScroll, subscribeTurns, turnServerSnapshot, turnSnapshot, turnsFrom, type ChatTurn } from "./transcript";
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

const replies = {
  unavailable: "O assistente está indisponível no momento. A interface tradicional continua disponível.",
  invalid: "Não foi possível ler essa mensagem.",
  limit: "O limite de uso desta conversa foi atingido. Tente novamente em alguns minutos.",
  provider: "Não foi possível consultar o assistente agora. Tente novamente em alguns instantes.",
} as const;

function replyFor(code: unknown) {
  if (code === "unavailable" || code === "invalid" || code === "limit" || code === "provider") return replies[code];
  return replies.provider;
}

function readEvent(chunk: string) {
  let event = "message";
  const data: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join("\n")) as unknown };
}

export function IntelligenceHome({
  fonts,
  greeting,
  profile,
  context,
  signOut,
  enabled,
}: {
  fonts: string;
  greeting: string;
  profile: { displayName: string; profession: string; initials: string; canReadAudit: boolean };
  context?: ReactNode;
  signOut: ReactNode;
  enabled: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const accountRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickRef = useRef(true);
  const pinRef = useRef(false);
  const scrollRestoredRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const rawTurns = useSyncExternalStore(subscribeTurns, turnSnapshot, turnServerSnapshot);
  const turns = useMemo(() => turnsFrom(rawTurns), [rawTurns]);
  const live = turns.some((turn) => turn.role === "user" || turn.text.trim() || turn.athletes.length > 0 || turn.navigation);

  useLayoutEffect(() => () => abortRef.current?.abort(), []);

  useLayoutEffect(() => {
    const node = logRef.current;
    if (!node) return;
    if (!scrollRestoredRef.current) {
      scrollRestoredRef.current = true;
      const saved = loadScroll();
      if (saved !== null && turns.some((turn) => turn.role === "user")) {
        node.scrollTop = saved;
        stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
        pinRef.current = false;
        return;
      }
    }
    if (!pinRef.current && !stickRef.current) return;
    node.scrollTop = node.scrollHeight;
    pinRef.current = false;
    stickRef.current = true;
  }, [turns]);

  function selectAthlete(id: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("atleta", id);
    router.replace(`/?${params.toString()}`);
  }

  function startNew() {
    abortRef.current?.abort();
    delete document.documentElement.dataset.iaRestored;
    setPending(false);
    setStreamingId(null);
    setFailure(null);
    replaceTurns([]);
  }

  function patchTurns(updater: (current: ChatTurn[]) => ChatTurn[]) {
    replaceTurns(updater(loadTurns()));
  }

  function finishTurn(id: string, text: string, athletes: PresentedAthlete[], navigation: ChatTurn["navigation"]) {
    patchTurns((current) => current.map((turn) => turn.id === id ? { ...turn, text, athletes, navigation } : turn));
  }

  async function send(message: string) {
    const history = [
      ...turns.flatMap((turn) => turn.text.trim() ? [{ role: turn.role, content: turn.text.slice(0, 2000) }] : []),
      { role: "user" as const, content: message },
    ].slice(-8);
    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: "user", text: message, athletes: [], navigation: null };
    const assistantId = crypto.randomUUID();
    pinRef.current = true;
    setFailure(null);
    setPending(true);
    setStreamingId(assistantId);
    patchTurns((current) => [
      ...current.filter((turn) => turn.text.trim() || turn.athletes.length > 0 || turn.navigation),
      userTurn,
      { id: assistantId, role: "assistant", text: "", athletes: [], navigation: null },
    ]);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let settled = false;
    try {
      const response = await fetch("/api/inteligencia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history,
          contextAthleteId: new URLSearchParams(window.location.search).get("atleta"),
        }),
        signal: controller.signal,
      });
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("text/event-stream")) {
        let code: unknown = "provider";
        try {
          const body = await response.json() as { error?: unknown };
          code = body.error;
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
        const sentence = replyFor(code);
        finishTurn(assistantId, sentence, [], null);
        setFailure(sentence);
        settled = true;
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("A resposta do assistente chegou sem conteúdo.");
      const decoder = new TextDecoder();
      let buffer = "";
      while (!settled) {
        const step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          let parsed: { event: string; data: unknown } | null = null;
          try {
            parsed = readEvent(chunk);
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
          if (!parsed || settled) continue;
          const data = parsed.data;
          const record = data && typeof data === "object" ? data as { text?: unknown; athletes?: unknown; navigation?: unknown; error?: unknown } : {};
          if (parsed.event === "delta" && typeof record.text === "string" && record.text) {
            patchTurns((current) => current.map((turn) => turn.id === assistantId && typeof record.text === "string" ? { ...turn, text: turn.text + record.text } : turn));
          } else if (parsed.event === "done") {
            const text = typeof record.text === "string" && record.text.trim() ? record.text.trim() : replies.provider;
            finishTurn(assistantId, text, presentedAthletes(record.athletes), presentedNavigation(record.navigation));
            settled = true;
          } else if (parsed.event === "error") {
            const sentence = replyFor(record.error);
            finishTurn(assistantId, sentence, [], null);
            setFailure(sentence);
            settled = true;
          }
        }
      }
      if (!settled) {
        patchTurns((current) => current.map((turn) => turn.id === assistantId && !turn.text.trim()
          ? { ...turn, text: replies.provider }
          : turn));
        setFailure(replies.provider);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!(error instanceof Error)) throw error;
      finishTurn(assistantId, replies.provider, [], null);
      setFailure(replies.provider);
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        setStreamingId(null);
      }
    }
  }

  function closeMenu() {
    setMenuOpen(false);
    accountRef.current?.focus();
  }

  return (
    <div className={`ia ${fonts}${live ? " is-live" : ""}`}>
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
          <div className="ia-top-start">
            <p className="ia-product">Prontuário</p>
            {live ? <button type="button" className="ia-new" onClick={startNew}>Nova conversa</button> : null}
          </div>
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
          <div className="ia-hero" inert={live ? true : undefined} aria-hidden={live ? true : undefined}>
            <div className="ia-hero-inner">
              <p>{greeting}</p>
              <h1>Como posso ajudar<br /><span>você hoje?</span></h1>
            </div>
          </div>
          {live ? (
            <div
              className="ia-log"
              ref={logRef}
              role="region"
              aria-label="Histórico da conversa"
              tabIndex={0}
              onScroll={(event) => {
                const node = event.currentTarget;
                stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
                saveScroll(node.scrollTop);
              }}
            >
              {turns.map((turn) => {
                if (turn.role === "assistant" && !turn.text && turn.athletes.length === 0 && !turn.navigation && turn.id !== streamingId) return null;
                return (
                <article
                  key={turn.id}
                  className={turn.role === "user" ? "ia-turn ia-turn-user" : "ia-turn"}
                  aria-live={turn.role === "assistant" && turn.id === streamingId ? "off" : undefined}
                >
                  <p className="ia-sr">{turn.role === "user" ? "Você" : "Assistente"}</p>
                  {turn.role === "user" ? <p className="ia-user-text">{turn.text}</p> : null}
                  {turn.role === "assistant" && turn.text ? <MessageText text={turn.text} /> : null}
                  {turn.role === "assistant" && turn.id === streamingId && !turn.text ? (
                    <p className="ia-pending" aria-live="polite">Consultando os registros autorizados.</p>
                  ) : null}
                  {turn.athletes.length > 0 ? (
                    <ul className="ia-cards">
                      {turn.athletes.map((athlete) => (
                        <li key={athlete.id} className="ia-card">
                          <button type="button" onClick={() => selectAthlete(athlete.id)}>
                            <strong>{athlete.name}</strong>
                            {athlete.facts.length > 0 ? <span>{athlete.facts.join(", ")}</span> : null}
                          </button>
                          <Link href={`/atletas/${athlete.id}`} prefetch={false}>Abrir prontuário</Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {turn.navigation && turn.athletes.length === 0 ? <Link className="ia-open" href={turn.navigation.href} prefetch={false}>Abrir prontuário de {turn.navigation.name}</Link> : null}
                </article>
                );
              })}
              {context}
            </div>
          ) : null}
          <MessageComposer key="composer" enabled={enabled} pending={pending} failure={failure} onEdit={() => setFailure(null)} onSend={send} />
          {live ? null : (
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
          )}
          {live ? null : context}
        </main>
      </div>
    </div>
  );
}
