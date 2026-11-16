"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Icon } from "../../../components/icon";
import {
  athlete,
  groupByMonth,
  history as seededHistory,
  professionals,
  season,
  type ClinicalEntry,
  type RecordStatus,
  type RecordVisibility,
} from "./sample";
import "./north-star.css";

const filters = [
  { id: "all", label: "Tudo" },
  { id: "open", label: "Em andamento" },
  { id: "restricted", label: "Restritos à autora" },
] as const;

type FilterId = (typeof filters)[number]["id"];

const statusLabel: Record<RecordStatus, string> = {
  final: "Finalizado",
  draft: "Rascunho",
};

const visibilityLabel: Record<RecordVisibility, string> = {
  team: "Equipe de cuidado",
  author: "Restrito à autora",
};

function matches(entry: ClinicalEntry, filter: FilterId) {
  if (filter === "open") return entry.status === "draft";
  if (filter === "restricted") return entry.visibility === "author" && entry.status === "final";
  return true;
}

export function NorthStar({ fonts }: { fonts: string }) {
  const [entries, setEntries] = useState(seededHistory);
  const [filter, setFilter] = useState<FilterId>("all");
  const [openId, setOpenId] = useState("retorno-tornozelo");
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState("");

  const visible = entries.filter((entry) => matches(entry, filter));
  const groups = groupByMonth(visible);
  const draft = entries.find((entry) => entry.id === "joelho-rascunho");

  function reveal(id: string) {
    setFilter("all");
    setOpenId(id);
    requestAnimationFrame(() => {
      document.getElementById(`registro-${id}`)?.scrollIntoView({ block: "center" });
    });
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle || !nextBody) {
      setFormError("Informe o título e o relato para guardar o rascunho.");
      return;
    }
    const id = `rascunho-${entries.length + 1}`;
    const created: ClinicalEntry = {
      id,
      iso: "2026-11-15",
      day: "15",
      monthId: "2026-11",
      monthLabel: "Novembro de 2026",
      title: nextTitle,
      author: "Helena Vargas",
      specialty: "Medicina esportiva",
      status: "draft",
      visibility: "author",
      body: nextBody,
    };
    setEntries((current) => [created, ...current]);
    setTitle("");
    setBody("");
    setFormError("");
    setComposing(false);
    setFilter("all");
    setOpenId(id);
  }

  return (
    <div className={`north ${fonts}`}>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <aside className="rail">
        <Link href="/" aria-label="Prontuário CBB, início" prefetch={false}>
          <Image src="/brand/cbb.png" width={697} height={869} alt="" priority />
        </Link>
        <nav aria-label="Atalhos">
          <Link className="rail-icon" href="/atletas" aria-label="Buscar atletas" prefetch={false}>
            <Icon name="search" size={18} />
          </Link>
          <Link className="rail-icon" href="/design-lab/clinical-north-star" aria-label="Prontuário do atleta" aria-current="page" prefetch={false}>
            <Icon name="records" size={18} />
          </Link>
          <button className="rail-icon" type="button" aria-label="Nova evolução" onClick={() => setComposing(true)}>
            <Icon name="note" size={18} />
          </button>
        </nav>
      </aside>

      <div className="stage">
        <header className="top">
          <p className="product">Prontuário <small>Demonstração</small></p>
          <p className="viewer">
            <strong>Helena Vargas</strong>
            <small>Medicina esportiva</small>
          </p>
        </header>

        <main className="canvas" id="conteudo" tabIndex={-1}>
          <header className="mast">
            <Image
              className="portrait"
              src={athlete.portrait}
              alt={athlete.name}
              width={athlete.portraitWidth}
              height={athlete.portraitHeight}
              priority
            />
            <div>
              <div className="identity-top">
                <div>
                  <h1>{athlete.name}</h1>
                  <p className="lede">{athlete.line}</p>
                </div>
                <div className="actions">
                  <button className="primary" type="button" onClick={() => { setComposing(true); setFormError(""); }}>
                    Nova evolução
                  </button>
                  <a className="secondary" href="#historico" onClick={() => setFilter("all")}>Consultar histórico</a>
                </div>
              </div>
              <dl className="spec">
                {athlete.facts.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </header>

          <div className="work">
            <section id="historico" aria-labelledby="historico-titulo">
              <h2 id="historico-titulo">Histórico clínico</h2>
              <fieldset className="filters">
                <legend className="sr-only">Recorte do histórico</legend>
                {filters.map((item) => (
                  <label key={item.id}>
                    <input
                      type="radio"
                      name="recorte"
                      value={item.id}
                      checked={filter === item.id}
                      onChange={() => setFilter(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </fieldset>

              {composing ? (
                <form className="composer" onSubmit={saveDraft}>
                  <h3>Nova evolução</h3>
                  <p className="context-copy">Helena Vargas, Medicina esportiva. Nesta demonstração o rascunho não sai da página.</p>
                  <label>
                    Título
                    <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} autoComplete="off" />
                  </label>
                  <label>
                    Relato
                    <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={600} rows={4} />
                  </label>
                  {formError ? <p className="form-error" role="alert">{formError}</p> : null}
                  <div className="composer-actions">
                    <button className="save" type="submit">Guardar rascunho</button>
                    <button className="cancel" type="button" onClick={() => { setComposing(false); setFormError(""); }}>Cancelar</button>
                  </div>
                </form>
              ) : null}

              {groups.length === 0 ? (
                <p className="empty-history">Nenhum registro neste recorte.</p>
              ) : groups.map((group) => (
                <section className="month" key={group.id} aria-labelledby={`mes-${group.id}`}>
                  <h3 id={`mes-${group.id}`}>{group.label}</h3>
                  <ol className="entries">
                    {group.entries.map((entry) => {
                      const isOpen = openId === entry.id;
                      return (
                        <li className={isOpen ? "entry is-open" : "entry"} id={`registro-${entry.id}`} key={entry.id}>
                          <time className="day" dateTime={entry.iso}>{entry.day}</time>
                          <span className="mark" aria-hidden="true" />
                          <div className="record">
                            <div className="record-head">
                              <button
                                className="record-title"
                                type="button"
                                aria-expanded={isOpen}
                                onClick={() => setOpenId(isOpen ? "" : entry.id)}
                              >
                                {entry.title}
                              </button>
                              <p className="byline">{entry.author}, {entry.specialty}</p>
                              <p className="state">
                                <span className={entry.status === "draft" ? "is-draft" : undefined}>{statusLabel[entry.status]}</span>
                                <span>{visibilityLabel[entry.visibility]}</span>
                              </p>
                            </div>
                            {isOpen ? <p className="record-body">{entry.body}</p> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </section>

            <aside className="context" aria-label="Contexto do atleta">
              {draft ? (
                <div className="pending">
                  <h2>Pendente</h2>
                  <p>Rascunho de 18 de setembro sobre dor anterior no joelho, ainda sem finalização.</p>
                  <button className="quiet-button" type="button" onClick={() => reveal(draft.id)}>Abrir rascunho</button>
                </div>
              ) : null}

              <h2>{season.title}</h2>
              <ul className="season-lines">
                <li>União Basquete Campinas</li>
                <li>Feminino, basquete 5x5</li>
                <li>Desde 1º de março de 2026</li>
              </ul>
              <details className="season">
                <summary>Temporada anterior <Icon name="chevron" size={16} /></summary>
                <ul className="season-lines">
                  <li>Litoral Basquete</li>
                  <li>Feminino, sem convocação</li>
                  <li>Março de 2025 a fevereiro de 2026</li>
                </ul>
              </details>

              <h2>Equipe com acesso</h2>
              <p className="context-copy">Helena lê os registros da equipe. O acompanhamento psicológico permanece com a autora.</p>
              <ul className="people">
                {professionals.map((person) => (
                  <li key={person.name}>
                    <strong>{person.name}{person.relation === "você" ? <span>você</span> : null}</strong>
                    <small>{person.specialty}</small>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
