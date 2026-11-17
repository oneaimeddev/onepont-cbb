import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "../../../../components/avatar";
import { EmptyState } from "../../../../components/empty-state";
import { Icon } from "../../../../components/icon";
import { SubmitButton } from "../../../../components/submit-button";
import { WorkspaceArea } from "../../../../components/workspace-area";
import { AccessPanel } from "../../../../features/athletes/access-panel";
import { accessRoster, eventDate, loadAthlete, loadCatalog, loadRegistration, searchProfessionals, uuidPattern } from "../../../../features/athletes/data";
import { SportLinkForm } from "../../../../features/athletes/registration-form";
import { documentKinds, statusLabels } from "../../../../features/documents/content";
import { listDocuments, medicalCapability } from "../../../../features/documents/data";
import { PhotoEditor } from "../../../../features/athletes/photo-editor";
import { requireProfile } from "../../../../lib/profile";
import { editAthlete } from "./edit-actions";

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const monthName = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });

function recordWhen(iso: string) {
  const key = dayKey.format(new Date(iso));
  const label = monthName.format(new Date(iso));
  return {
    monthId: key.slice(0, 7),
    monthLabel: label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1),
    day: String(Number(key.slice(8))),
  };
}

function groupsOf<T extends { occurred_at: string }>(records: T[]) {
  const groups: { id: string; label: string; records: T[] }[] = [];
  for (const record of records) {
    const when = recordWhen(record.occurred_at);
    const current = groups.at(-1);
    if (current?.id === when.monthId) current.records.push(record);
    else groups.push({ id: when.monthId, label: when.monthLabel, records: [record] });
  }
  return groups;
}

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
  const sections = ["visao-geral", "timeline", "cadastro", ...(capability.enabled ? ["documentos"] : []), ...(profile.can_manage_access ? ["acesso"] : [])];
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
  const genderLabels: Record<string, string> = {
    feminino: "Feminino", masculino: "Masculino", nao_binario: "Não binário", outro: "Outro", nao_informado: "Prefere não informar",
  };
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
    ...(capability.enabled && can_read_records ? [["documentos", "Documentos"] as const] : []),
    ...(roster ? [["acesso", "Acesso"] as const] : []),
  ] as const;
  const history = records ?? [];
  if (aba === "documentos" && !can_read_records) notFound();
  const documents = aba === "documentos" ? await listDocuments(athlete.id) : null;
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
              <Link className="record-chat" href={`/?atleta=${athlete.id}`} prefetch={false} aria-label="Abrir no chat">
                <Icon name="chat" size={18} />
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
        <nav className="athlete-tabs" aria-label="Seções do atleta">
          {tabs.map(([value, label]) => (
            <Link key={value} href={tabHref(value)} prefetch={false} aria-current={aba === value ? "page" : undefined}>{label}</Link>
          ))}
        </nav>

        {aba === "acesso" && roster ? (
          <AccessPanel athleteId={athlete.id} links={roster.links} matches={matches} term={term} notice={accessNotice} />
        ) : null}

        {aba === "visao-geral" && (
          <div className="record-work">
            <section aria-labelledby="historico-recente">
              <div className="record-mast-top">
                <h2 id="historico-recente">Histórico clínico</h2>
                {can_write ? (
                  <div className="record-actions">
                    <Link className="button" href={`${base}/evolucao`} prefetch={false}>Nova evolução</Link>
                  </div>
                ) : null}
              </div>
              {recent_records?.length ? (
                <ol className="timeline">
                  {recent_records.map((record) => (
                    <li key={record.id}>
                      <div className="timeline-head">
                        <time className="timeline-day" dateTime={record.occurred_at}>{recordWhen(record.occurred_at).day}</time>
                        <Link href={`${base}?aba=timeline&retorno=${encodeURIComponent(returnTo)}#registro-${record.id}`} prefetch={false}>{record.title}</Link>
                        <p className="timeline-byline">{record.author_name}, {record.specialty}</p>
                        <span className={record.status === "draft" ? "pill pill-draft" : "pill pill-success"}>{record.status === "draft" ? "Rascunho" : "Finalizado"}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="muted">Nenhum registro recente disponível para este perfil.</p>}
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

        {aba === "timeline" && (
          <section aria-labelledby="linha-do-tempo">
            <h2 id="linha-do-tempo">Linha do tempo</h2>
            {history.length === 0 ? (
              <EmptyState icon="records" title="Nenhum registro disponível para este perfil.">
                <p>Os registros autorizados para o seu perfil aparecem aqui, do mais recente ao mais antigo.</p>
              </EmptyState>
            ) : groupsOf(history).map((group) => (
              <section key={group.id} aria-label={group.label}>
                <h3 className="timeline-month">{group.label}</h3>
                <ol className="clinical-list timeline">
                  {group.records.map((record) => (
                    <li id={`registro-${record.id}`} key={record.id} className={record.status === "draft" ? "is-draft" : undefined}>
                      <div className="timeline-head">
                        <time className="timeline-day" dateTime={record.occurred_at}>{recordWhen(record.occurred_at).day}</time>
                        <details open={registro === record.id.toLowerCase()}>
                          <summary>{record.title}</summary>
                          <p className="record-body">{record.body}</p>
                          {can_write && record.is_author && record.status === "draft" && <Link className="clinical-link" prefetch={false} href={`${base}/evolucao?registro=${record.id}`}>Revisar rascunho</Link>}
                          {record.encounter_status && <p>Atendimento {record.encounter_status === "open" ? "aberto" : "encerrado"}</p>}
                        </details>
                        <p className="timeline-byline">{record.author_name}, {record.specialty}</p>
                        <span className={record.status === "draft" ? "pill pill-draft" : "pill pill-success"}>{record.status === "draft" ? "Rascunho" : "Finalizado"}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </section>
        )}

        {aba === "documentos" && documents && (
          <section aria-labelledby="documentos-clinicos">
            <div className="record-mast-top">
              <h2 id="documentos-clinicos">Documentos</h2>
              <div className="record-actions">
                <Link className="outline" href={`${base}/documentos/nova?tipo=prescricao`} prefetch={false}>Nova prescrição</Link>
                <Link className="outline" href={`${base}/documentos/nova?tipo=cirurgia`} prefetch={false}>Novo pedido cirúrgico</Link>
                <Link className="outline" href={`${base}/documentos/nova?tipo=exames`} prefetch={false}>Nova solicitação de exames</Link>
              </div>
            </div>
            <p>Rascunhos privados deste médico. Nenhum documento desta lista é emitido ou assinado.</p>
            {documents.length === 0 ? (
              <EmptyState icon="records" title="Nenhum rascunho deste atleta.">
                <p>Uma prescrição, um pedido cirúrgico ou uma solicitação de exames preparada aqui fica vinculada a este atleta e a você.</p>
              </EmptyState>
            ) : (
              <ol className="clinical-list">
                {documents.map((document) => (
                  <li key={document.id}>
                    <Link href={`${base}/documentos/${document.id}`} prefetch={false}>{documentKinds[document.document_type].title}</Link>
                    <p>{statusLabels[document.status]} · <time dateTime={document.updated_at}>{eventDate.format(new Date(document.updated_at))}</time></p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {aba === "cadastro" && (
          <section aria-labelledby="dados-cadastrais">
            <h2 id="dados-cadastrais">Dados cadastrais</h2>
            {can_edit && (
              <form action={editAthlete} className="athlete-form composer-panel">
                <input type="hidden" name="id" value={id} />
                <label>Nome completo<input name="name" required maxLength={160} defaultValue={athlete.full_name} /></label>
                <label>Nome social<input name="social" maxLength={160} defaultValue={athlete.social_name ?? ""} /></label>
                <label>Nascimento<input type="date" name="birth" defaultValue={athlete.birth_date ?? ""} /></label>
                <input type="hidden" name="club" value={athlete.team ?? ""} />
                <input type="hidden" name="category" value={athlete.category ?? ""} />
                <label>Status<select name="status" defaultValue={athlete.status}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
                <SubmitButton pendingLabel="Salvando…">Salvar cadastro</SubmitButton>
              </form>
            )}
            {can_edit && <PhotoEditor athleteId={id} />}
            {registration && (
              <div className="record-work registration-facts">
                <section aria-labelledby="dados-pessoais">
                  <h2 id="dados-pessoais">Dados pessoais</h2>
                  <dl className="record-spec">
                    <div><dt>Identidade de gênero</dt><dd>{registration.gender_identity ? genderLabels[registration.gender_identity] : "Não informada"}</dd></div>
                    <div><dt>Identificador</dt><dd>{registration.document_id ?? "Não informado"}</dd></div>
                  </dl>
                </section>
                <section aria-labelledby="contatos-cadastro">
                  <h2 id="contatos-cadastro">Contatos</h2>
                  <dl className="record-spec">
                    <div><dt>Telefone</dt><dd>{registration.phone ?? "Não informado"}</dd></div>
                    <div><dt>E-mail</dt><dd>{registration.email ?? "Não informado"}</dd></div>
                    <div><dt>Responsável legal</dt><dd>{registration.guardian_name ?? "Não informado"}</dd></div>
                    <div><dt>Relação</dt><dd>{registration.guardian_relation ?? "Não informada"}</dd></div>
                    <div><dt>Contato do responsável</dt><dd>{registration.guardian_contact ?? "Não informado"}</dd></div>
                    <div><dt>Contato de emergência</dt><dd>{registration.emergency_contact ?? "Não informado"}</dd></div>
                  </dl>
                </section>
              </div>
            )}
            {registrationCatalog && <SportLinkForm athleteId={athlete.id} catalog={registrationCatalog} />}
            {sports.length > 0 && (
              <section className="sport-history" aria-labelledby="historico-esportivo">
                <h2 id="historico-esportivo">Histórico esportivo</h2>
                <ul className="season-lines">
                  {sports.map((sport) => (
                    <li key={sport.id}>
                      <strong>{[sport.category, sport.modality, sport.division].filter(Boolean).join(", ")}</strong>
                      <span>{[sport.club, sport.position, sport.shirt_number ? `camisa ${sport.shirt_number}` : null].filter(Boolean).join(", ") || "Sem clube"}, temporada {sport.season}{sport.ends_on ? `, até ${sport.ends_on}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>
        )}
      </main>
    </WorkspaceArea>
  );
}
