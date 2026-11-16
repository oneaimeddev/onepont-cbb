import { editAthlete } from "./edit-actions";
import { SubmitButton } from "../../../../components/submit-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoEditor } from "../../../../features/athletes/photo-editor";
import { Avatar } from "../../../../components/avatar";
import { EmptyState } from "../../../../components/empty-state";
import { Icon } from "../../../../components/icon";
import { WorkspaceArea } from "../../../../components/workspace-area";
import { AccessPanel } from "../../../../features/athletes/access-panel";
import { accessRoster, eventDate, loadAthlete, searchProfessionals } from "../../../../features/athletes/data";
import { requireProfile } from "../../../../lib/profile";

export default async function AthletePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; retorno?: string; erro?: string; salvo?: string; aviso?: string; q?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const aba = (Array.isArray(query.aba) ? query.aba[0] : query.aba) ?? "visao-geral";
  const { retorno, erro, salvo, aviso } = query;
  const term = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? "").trim().slice(0, 80);
  const profile = await requireProfile();
  const sections = ["visao-geral", "timeline", "cadastro", ...(profile.can_manage_access ? ["acesso"] : [])];
  if (!sections.includes(aba)) notFound();

  const workspace = await loadAthlete(id, aba === "timeline" ? "timeline" : "profile");
  const roster = profile.can_manage_access ? await accessRoster(id) : null;
  const matches = roster && term.length >= 2 ? await searchProfessionals(term) : [];
  const accessNotice = erro ? "Não foi possível alterar o acesso."
    : aviso === "existe" ? "Este profissional já acompanha o atleta."
    : salvo === "concedido" ? "Acesso concedido."
    : salvo === "revogado" ? "Acesso revogado."
    : null;
  if (!workspace) {
    if (!roster || (aba !== "acesso" && aba !== "visao-geral")) notFound();
    const managedName = roster.athlete.social_name || roster.athlete.full_name;
    return (
      <WorkspaceArea>
        <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
          <Link className="back-link" href="/atletas" prefetch={false}><Icon name="back" size={18} />Trocar atleta</Link>
          <header className="clinical-header athlete-header">
            <div>
              <h1>{managedName}</h1>
              <p className="record-id">ID {roster.athlete.id}</p>
            </div>
          </header>
          <AccessPanel athleteId={roster.athlete.id} links={roster.links} matches={matches} term={term} notice={accessNotice} />
        </main>
      </WorkspaceArea>
    );
  }

  const { athlete, can_read_records, records, can_edit, can_write, sports, counts, recent_records } = workspace;
  const name = athlete.social_name || athlete.full_name;
  const base = `/atletas/${athlete.id}`;
  const returnTo = retorno && /^\/(atletas|prontuarios)(\?|$)/.test(retorno) ? retorno : "/atletas";
  const backQuery = "&retorno=" + encodeURIComponent(returnTo);
  const age = athlete.birth_date ? (() => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const years = Number(today.slice(0,4)) - Number(athlete.birth_date.slice(0,4));
    return years - (today.slice(5) < athlete.birth_date.slice(5) ? 1 : 0);
  })() : null;
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
  const activeSports = sports.filter((sport) => sport.starts_on <= new Date().toISOString().slice(0,10) && (!sport.ends_on || sport.ends_on >= new Date().toISOString().slice(0,10)));
  const headerDetails = [...new Set([age === null ? null : `${age} anos`, athlete.team, athlete.category,
    ...activeSports.flatMap((sport) => [sport.club, sport.category, sport.division, sport.modality])].filter(Boolean))];
  const tabs = [
    { value: "visao-geral", title: "Visão geral", href: base },
    ...(can_read_records ? [{ value: "timeline", title: "Linha do tempo", href: base + "?aba=timeline" }] : []),
    { value: "cadastro", title: "Dados cadastrais", href: base + "?aba=cadastro" },
    ...(roster ? [{ value: "acesso", title: "Acesso", href: base + "?aba=acesso" }] : []),
  ];

  return (
    <WorkspaceArea>
      <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
        <Link className="back-link" href={returnTo} prefetch={false}><Icon name="back" size={18} />Trocar atleta</Link>
        <header className="clinical-header athlete-header">
          <div className="athlete-identity">
            <Avatar name={name} size="lg" athleteId={athlete.id} photoVersion={athlete.photo_version} />
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
        {can_write && <Link className="outline" href={base + "/evolucao"} prefetch={false}>Iniciar atendimento</Link>}
        <nav className="athlete-tabs" aria-label="Seções do atleta">
          {tabs.map((tab) => (
            <Link key={tab.value} href={tab.href + (tab.href.includes("?") ? backQuery : "?retorno=" + encodeURIComponent(returnTo))} aria-current={aba === tab.value ? "page" : undefined} prefetch={false}>
              {tab.title}
            </Link>
          ))}
        </nav>
        {aba !== "acesso" && erro && <p role="alert">Não foi possível salvar. Confira os dados e as permissões.</p>}
        {aba !== "acesso" && salvo && <p role="status">Cadastro salvo.</p>}
        {aba === "acesso" && roster ? (
          <AccessPanel athleteId={athlete.id} links={roster.links} matches={matches} term={term} notice={accessNotice} />
        ) : aba === "timeline" ? (
          <section aria-labelledby="timeline-title">
            <h2 id="timeline-title">Linha do tempo</h2>
            {records?.length ? (
              <ol className="clinical-list timeline">
                {records.map((record) => (
                  <li id={`registro-${record.id}`} key={record.id} className={record.status === "draft" ? "is-draft" : undefined}>
                    <div className="timeline-entry">
                      <details>
                        <summary><Icon name="chevron" size={16} />{record.title}</summary>
                        <p className="record-body">{record.body}</p>
                        {can_write && record.is_author && record.status === "draft" && <Link className="clinical-link" prefetch={false} href={base + "/evolucao?registro=" + record.id}>Revisar rascunho</Link>}
                        {record.encounter_id && <small className="record-id">Atendimento {record.encounter_id}</small>}
                        {record.encounter_status && <p>Atendimento {record.encounter_status === "open" ? "aberto" : "encerrado"}</p>}
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
            {aba === "visao-geral" && counts && <dl className="athlete-facts">
              <div><dt>Atendimentos autorizados</dt><dd>{counts.encounters}</dd></div>
              <div><dt>Evoluções autorizadas</dt><dd>{counts.evolutions}</dd></div>
            </dl>}
            <dl className="athlete-facts">
              {fields.filter(([, value]) => value).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            {aba === "visao-geral" && !!recent_records?.length && <section className="sport-history">
              <h2>Atividades recentes</h2>
              <ul className="clinical-list">{recent_records.map((record) => <li key={record.id}>
                <Link className="clinical-link" prefetch={false} href={base + "?aba=timeline" + backQuery + "#registro-" + record.id}>{record.title}</Link>
                <span className="meta-list"><span>{record.specialty}</span><span>{record.author_name}</span>
                  <time dateTime={record.occurred_at}>{eventDate.format(new Date(record.occurred_at))}</time>
                  <span>{record.status === "draft" ? "Rascunho" : "Finalizado"}</span>
                </span>
              </li>)}</ul>
            </section>}
            {sports.length > 0 && <section className="sport-history"><h2>Vínculos esportivos</h2>
              <ul className="clinical-list">{sports.map((sport) => <li key={sport.id}>
                <strong>{sport.category} · {sport.modality} · {sport.division}</strong>
                <p>{sport.club} · Temporada {sport.season}</p>
                <small>{sport.starts_on} — {sport.ends_on ?? "Em vigor"}</small>
              </li>)}</ul></section>}
            {aba === "cadastro" && can_edit && <>
              <form action={editAthlete} className="athlete-form">
                <h2>Editar cadastro</h2>
                <input type="hidden" name="id" value={id} />
                <label>Nome completo<input name="name" required maxLength={160} defaultValue={athlete.full_name} /></label>
                <label>Nome social<input name="social" maxLength={160} defaultValue={athlete.social_name ?? ""} /></label>
                <label>Nascimento<input type="date" name="birth" defaultValue={athlete.birth_date ?? ""} /></label>
                <label>Clube cadastral<input name="club" maxLength={120} defaultValue={athlete.team ?? ""} /></label>
                <label>Categoria cadastral<input name="category" maxLength={120} defaultValue={athlete.category ?? ""} /></label>
                <label>Status<select name="status" defaultValue={athlete.status}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
                <SubmitButton pendingLabel="Salvando…">Salvar cadastro</SubmitButton>
              </form>
              <PhotoEditor athleteId={id} />
            </>}
          </section>
        )}
      </main>
    </WorkspaceArea>
  );
}
