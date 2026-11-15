import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceArea } from "../../../../components/workspace-area";
import { eventDate, getAthlete } from "../../../../features/athletes/data";

export default async function AthletePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const { id } = await params;
  const { aba = "visao-geral" } = await searchParams;
  if (aba !== "visao-geral" && aba !== "timeline" && aba !== "cadastro") notFound();

  const { athlete, can_read_records, records } = await getAthlete(id, aba === "timeline" ? "timeline" : "profile");
  const base = `/atletas/${athlete.id}`;
  const fields = [
    ["Nome completo", athlete.full_name],
    ["Nome social", athlete.social_name],
    ["Nascimento", athlete.birth_date?.split("-").reverse().join("/")],
    ["Clube / equipe", athlete.team],
    ["Categoria", athlete.category],
    ["Status cadastral", athlete.status === "active" ? "Ativo" : "Inativo"],
    ["Origem do cadastro", athlete.source === "manual" ? "Manual" : "Demonstração"],
    ...(aba === "cadastro" ? [["Identificador CBB", athlete.external_cbb_id]] : []),
  ];
  const tabs = [
    { value: "visao-geral", title: "Visão geral", href: base },
    ...(can_read_records ? [{ value: "timeline", title: "Linha do tempo", href: base + "?aba=timeline" }] : []),
    { value: "cadastro", title: "Dados cadastrais", href: base + "?aba=cadastro" },
  ];

  return (
    <WorkspaceArea>
      <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
        <Link className="clinical-link" href="/atletas" prefetch={false}>Trocar atleta</Link>
        <header className="clinical-header">
          <div>
            <h1>{athlete.social_name || athlete.full_name}</h1>
            <p className="record-id">ID {athlete.id}</p>
          </div>
          <Link className="outline" href={`/?atleta=${athlete.id}`} prefetch={false}>Abrir no chat</Link>
        </header>
        <nav className="athlete-tabs" aria-label="Seções do atleta">
          {tabs.map((tab) => (
            <Link key={tab.value} href={tab.href} aria-current={aba === tab.value ? "page" : undefined} prefetch={false}>
              {tab.title}
            </Link>
          ))}
        </nav>
        {aba === "timeline" ? (
          <section aria-labelledby="timeline-title">
            <h2 id="timeline-title">Linha do tempo</h2>
            {records?.length ? (
              <ol className="clinical-list">
                {records.map((record) => (
                  <li key={record.id}>
                    <details>
                      <summary>{record.title}</summary>
                      <p className="record-body">{record.body}</p>
                    </details>
                    <p>{record.specialty} · {record.author_name}</p>
                    <small><time dateTime={record.occurred_at}>{eventDate.format(new Date(record.occurred_at))}</time>
                      {" · "}{record.status === "draft" ? "Rascunho" : "Finalizado"}</small>
                  </li>
                ))}
              </ol>
            ) : <p className="clinical-empty">Nenhum registro disponível para este perfil.</p>}
          </section>
        ) : (
          <section aria-labelledby="athlete-data-title">
            <h2 id="athlete-data-title">{aba === "cadastro" ? "Dados cadastrais" : "Identificação e contexto esportivo"}</h2>
            <dl className="athlete-facts">
              {fields.filter(([, value]) => value).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </section>
        )}
      </main>
    </WorkspaceArea>
  );
}
