import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "../../../../components/avatar";
import { Icon } from "../../../../components/icon";
import { WorkspaceArea } from "../../../../components/workspace-area";
import { AccessPanel } from "../../../../features/athletes/access-panel";
import { accessRoster, loadAthlete, loadCatalog, loadRegistration, searchProfessionals, uuidPattern } from "../../../../features/athletes/data";
import { listDocuments, medicalCapability } from "../../../../features/documents/data";
import { ProfileTabs } from "../../../../features/athletes/profile-navigation";
import { ProfileTimeline, type TimelineDocument } from "../../../../features/athletes/profile-timeline";
import { documentKinds, statusLabels } from "../../../../features/documents/content";
import { ProfileRegistration } from "../../../../features/athletes/profile-registration";
import { CreateDocumentMenu } from "../../../../features/documents/create-menu";
import { ProfileDocumentList } from "../../../../features/documents/profile-list";
import { requireProfile } from "../../../../lib/profile";
import { AttachmentModule } from "../../../../features/attachments/module";

export default async function AthletePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; registro?: string | string[]; retorno?: string; erro?: string; salvo?: string; aviso?: string; q?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const aba = (Array.isArray(query.aba) ? query.aba[0] : query.aba) ?? "visao-geral";
  const requestedRecord = Array.isArray(query.registro) ? query.registro[0] : query.registro;
  const registro = requestedRecord && uuidPattern.test(requestedRecord)
    ? requestedRecord.toLowerCase()
    : null;
  const { retorno, erro, salvo, aviso } = query;
  const term = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? "").trim().slice(0, 80);
  const profile = await requireProfile();
  const capability = await medicalCapability();
  const sections = ["visao-geral", "timeline", "cadastro", "anexos", ...(capability.enabled ? ["documentos"] : []), ...(profile.can_manage_access ? ["acesso"] : [])];
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
          <header className="record-mast">
            <div>
              <h1 className="athlete-name">{managedName}</h1>
              <p className="record-id sr-only">ID {roster.athlete.id}</p>
            </div>
          </header>
          <AccessPanel athleteId={roster.athlete.id} links={roster.links} matches={matches} term={term} notice={accessNotice} />
        </main>
      </WorkspaceArea>
    );
  }

  const { athlete, can_read_records, records, can_edit, can_write, sports, counts, recent_records } = workspace;
  const registration = can_edit ? await loadRegistration(athlete.id) : null;
  const registrationCatalog = can_edit ? await loadCatalog() : null;
  const name = athlete.social_name || athlete.full_name;
  const base = `/atletas/${athlete.id}`;
  const returnTo = retorno && /^\/(atletas|prontuarios|evolucoes)(\?|$)/.test(retorno) ? retorno : "/atletas";
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const age = athlete.birth_date ? (() => {
    const years = Number(today.slice(0, 4)) - Number(athlete.birth_date.slice(0, 4));
    return years - (today.slice(5) < athlete.birth_date.slice(5) ? 1 : 0);
  })() : null;
  const activeSports = sports.filter((sport) => sport.starts_on <= today && (!sport.ends_on || sport.ends_on >= today));
  const current = activeSports[0];
  const lede = [current?.division, current?.club].filter(Boolean).join(", ");
  const spec = [
    ["Nome completo", athlete.full_name],
    ["Categoria", current?.category ?? athlete.category],
    ["Clube", current?.club ?? athlete.team],
    ["Idade", age === null ? null : `${age} anos`],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const tabs = [
    ["visao-geral", "Visão geral"],
    ...(can_read_records ? [["timeline", "Linha do tempo"] as const] : []),
    ["cadastro", "Dados cadastrais"],
    ...(can_read_records ? [["anexos", "Anexos clínicos"] as const] : []),
    ...(capability.enabled && can_read_records ? [["documentos", "Documentos médicos"] as const] : []),
    ...(roster ? [["acesso", "Acesso"] as const] : []),
  ] as const;
  if ((aba === "documentos" || aba === "anexos") && !can_read_records) notFound();
  const documents = aba === "documentos" ? await listDocuments(athlete.id) : null;
  // Every medical document the professional can open also appears in the athlete's timeline.
  const timelineDocuments: TimelineDocument[] = aba === "timeline" && capability.enabled && can_read_records
    ? ((await listDocuments(athlete.id)) ?? []).map((document) => ({
        id: document.id,
        title: documentKinds[document.document_type]?.title ?? "Documento médico",
        status: document.workflow?.lifecycle === "finalized" ? "Finalizado" : statusLabels[document.status],
        finalized: document.workflow?.lifecycle === "finalized",
        author: document.author_name ?? "",
        occurred_at: document.created_at,
      }))
    : [];
  if (aba === "documentos" && !documents) notFound();

  function tabHref(value: string) {
    const next = new URLSearchParams();
    if (value !== "visao-geral") next.set("aba", value);
    next.set("retorno", returnTo);
    return `${base}?${next}`;
  }

  return (
    <WorkspaceArea>
      <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
        <Link className="back-link" href={returnTo} prefetch={false}><Icon name="back" size={18} />Trocar atleta</Link>
        <header className="record-mast">
          <Avatar name={name} size="lg" athleteId={athlete.id} photoVersion={athlete.photo_version} />
          <div>
            <div className="record-mast-top">
              <div className="record-identity">
                <h1 className="athlete-name">{name}</h1>
                {lede && <p className="record-lede">{lede}</p>}
                {athlete.status !== "active" && <span className="pill">Inativo</span>}
              </div>
              <Link className="record-chat" href={`/?atleta=${athlete.id}`} prefetch={false} aria-label="Abrir no chat — CBB Intelligence" title="Abrir no CBB Intelligence">
                <Icon name="chat" size={18} /><span className="profile-chat-label">CBB Intelligence</span>
              </Link>
            </div>
            <dl className="record-spec">
              {spec.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </div>
        </header>
        <p className="record-id sr-only">ID {athlete.id}</p>
        {aba !== "acesso" && erro && <p role="alert">Não foi possível salvar. Confira os dados e as permissões.</p>}
        {aba !== "acesso" && salvo && <p role="status">Cadastro salvo.</p>}
        <ProfileTabs active={aba} tabs={tabs.map(([value, label]) => ({id: value, label, href: tabHref(value)}))} />

        {aba === "acesso" && roster ? (
          <AccessPanel athleteId={athlete.id} links={roster.links} matches={matches} term={term} notice={accessNotice} />
        ) : null}

        {aba === "visao-geral" && (
          <div className="record-work">
            <section aria-labelledby="historico-recente">
              <div className="record-mast-top">
                <h2 id="historico-recente">Evoluções recentes</h2>
                {can_write ? (
                  <div className="record-actions">
                    <Link className="button" href={`${base}/evolucao`} prefetch={false}>Nova evolução</Link>
                  </div>
                ) : null}
              </div>
              {recent_records?.length ? (
                <ol className="timeline recent-evolutions">
                  {recent_records.map((record) => (
                    <li key={record.id}>
                      <div className="timeline-head">
                        <time className="timeline-day" dateTime={record.occurred_at}>{new Intl.DateTimeFormat("pt-BR", {timeZone:"America/Sao_Paulo"}).format(new Date(record.occurred_at))}</time>
                        <Link href={`${base}?aba=timeline&retorno=${encodeURIComponent(returnTo)}&registro=${record.id}#registro-${record.id}`} prefetch={false}>{record.title}</Link>
                        <p className="timeline-byline">{record.author_name}, {record.specialty}</p>
                        <span className={record.status === "draft" ? "pill pill-draft" : "pill pill-success"}>{record.status === "draft" ? "Rascunho" : "Finalizado"}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="muted">Nenhum registro recente disponível para este perfil. {can_write ? "Use Nova evolução para iniciar um registro deste atleta." : "Consulte os dados cadastrais disponíveis ou a equipe responsável pelo acompanhamento."}</p>}
              {can_read_records && <Link className="clinical-link" href={tabHref("timeline")} prefetch={false}>Ver todas as evoluções</Link>}
            </section>
            <aside className="record-context">
              <h2>Contexto esportivo</h2>
              {activeSports.length === 0 ? <p>Nenhum vínculo esportivo vigente.</p> : (
                <ul className="season-lines">
                  {activeSports.map((sport) => (
                    <li key={sport.id}>
                      <strong>{[sport.category, sport.division].filter(Boolean).join(", ") || "Vínculo vigente"}</strong>
                      <span>{[sport.club, sport.modality].filter(Boolean).join(", ")}</span>
                      {sport.position ? <span>Posição {sport.position}</span> : null}
                      {sport.shirt_number ? <span>Camisa {sport.shirt_number}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              {counts && <p>{counts.evolutions} evoluções autorizadas</p>}
            </aside>
          </div>
        )}

        {aba === "timeline" && <ProfileTimeline key={athlete.id} records={records ?? []} documents={timelineDocuments} recordId={registro} canWrite={can_write} base={base} />}

        {aba === "documentos" && documents && (
          <section aria-labelledby="documentos-clinicos">
            <div className="record-mast-top">
              <h2 id="documentos-clinicos">Documentos médicos</h2>
              <CreateDocumentMenu base={base} />
            </div>
            <p>Documentos privados deste médico. Consulte o estado de cada versão.</p>
            <ProfileDocumentList documents={documents} base={base} />
          </section>
        )}

        {aba === "anexos" && can_read_records && <AttachmentModule key={athlete.id} athleteId={athlete.id} />}

        {aba === "cadastro" && <ProfileRegistration athlete={athlete} canEdit={can_edit} registration={registration} catalog={registrationCatalog} sports={sports} />}

      </main>
    </WorkspaceArea>
  );
}
