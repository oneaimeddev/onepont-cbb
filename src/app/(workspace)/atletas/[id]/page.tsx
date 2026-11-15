import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "../../../../components/avatar";
import { EmptyState } from "../../../../components/empty-state";
import { Icon } from "../../../../components/icon";
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
  const name = athlete.social_name || athlete.full_name;
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
  const headerDetails = [athlete.team, athlete.category].filter(Boolean);
  const tabs = [
    { value: "visao-geral", title: "Visão geral", href: base },
    ...(can_read_records ? [{ value: "timeline", title: "Linha do tempo", href: base + "?aba=timeline" }] : []),
    { value: "cadastro", title: "Dados cadastrais", href: base + "?aba=cadastro" },
  ];

  return (
    <WorkspaceArea>
      <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
        <Link className="back-link" href="/atletas" prefetch={false}><Icon name="back" size={18} />Trocar atleta</Link>
        <header className="clinical-header athlete-header">
          <div className="athlete-identity">
            <Avatar name={name} size="lg" />
            <div>
              <h1>{name}</h1>
              <span className="meta-list">
                {headerDetails.map((item) => <span key={item}>{item}</span>)}
                {athlete.status === "inactive" && <span className="pill">Inativo</span>}
              </span>
              <p className="record-id">ID {athlete.id}</p>
            </div>
          </div>
          <Link className="button" href={`/?atleta=${athlete.id}`} prefetch={false}><Icon name="chat" size={18} />Abrir no chat</Link>
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
              <ol className="clinical-list timeline">
                {records.map((record) => (
                  <li key={record.id} className={record.status === "draft" ? "is-draft" : undefined}>
                    <div className="timeline-entry">
                      <details>
                        <summary><Icon name="chevron" size={16} />{record.title}</summary>
                        <p className="record-body">{record.body}</p>
                      </details>
                      <span className={record.status === "draft" ? "pill pill-draft" : "pill pill-success"}>
                        {record.status === "draft" ? "Rascunho" : "Finalizado"}
                      </span>
                    </div>
                    <span className="meta-list">
                      <span>{record.specialty}</span>
                      <span>{record.author_name}</span>
                      <time dateTime={record.occurred_at}>{eventDate.format(new Date(record.occurred_at))}</time>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon="records" title="Nenhum registro disponível para este perfil.">
                <p>Os registros autorizados para o seu perfil aparecem aqui, do mais recente ao mais antigo.</p>
              </EmptyState>
            )}
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
