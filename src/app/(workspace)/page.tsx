import Link from "next/link";
import { Avatar } from "../../components/avatar";
import { Icon } from "../../components/icon";
import { WorkspaceArea } from "../../components/workspace-area";
import { MessageComposer } from "../../features/chat/message-composer";
import { sections } from "../../features/sections";
import { getAthlete } from "../../features/athletes/data";
import { requireProfile } from "../../lib/profile";

export default async function ChatPage({ searchParams }: {
  searchParams: Promise<{ atleta?: string | string[] }>;
}) {
  await requireProfile();
  const { atleta } = await searchParams;
  const context = typeof atleta === "string" ? await getAthlete(atleta, "chat") : null;
  const active = context?.athlete ?? null;
  const activeName = active && (active.social_name || active.full_name);
  const activeDetails = active ? [active.team, active.category].filter(Boolean) : [];
  return (
    <WorkspaceArea context={active && activeName && (
      <>
        <h2>Atleta em contexto</h2>
        <div className="context-athlete">
          <Avatar name={activeName} athleteId={active.id} photoVersion={active.photo_version} />
          <div>
            <strong>{activeName}</strong>
            {activeDetails.length > 0 && <span className="meta-list">{activeDetails.map((item) => <span key={item}>{item}</span>)}</span>}
          </div>
        </div>
        <p className="record-id">{active.id}</p>
        <div className="context-actions">
          <Link className="outline" href={`/atletas/${active.id}`} prefetch={false}>Voltar ao perfil</Link>
          {context?.can_write && <Link className="outline" href={`/atletas/${active.id}/evolucao`} prefetch={false}>Registrar evolução</Link>}
          {context?.can_read_records && <Link className="ghost-link" href={`/atletas/${active.id}?aba=timeline`} prefetch={false}>Consultar atendimentos e evoluções</Link>}
          <Link className="ghost-link" href="/" prefetch={false}>Encerrar contexto</Link>
        </div>
      </>
    )}>
      <main id="conteudo" tabIndex={-1} className="conversation">
        <div className="conversation-content">
          <div className="conversation-intro">
            <h1>Como podemos ajudar?</h1>
            <p>{activeName
              ? `${activeName} está em contexto. Quando o assistente estiver disponível, a conversa usará apenas as informações autorizadas para o seu perfil.`
              : "Abra o perfil de um atleta e consulte as informações disponíveis para você."}</p>
          </div>
          <nav className="task-suggestions" aria-label="Tarefas clínicas">
            <ul>
              {(["atletas", "prontuarios", "evolucoes"] as const).map((slug) => (
                <li key={slug}>
                  {sections[slug].isAvailable ? (
                    <Link href={`/${slug}`} prefetch={false}>
                      <span className="task-icon"><Icon name={sections[slug].icon} /></span>
                      <strong>{sections[slug].title}</strong>
                      <span>{sections[slug].description}</span>
                    </Link>
                  ) : (
                    <div className="is-unavailable">
                      <span className="task-icon"><Icon name="lock" /></span>
                      <strong>{sections[slug].title}</strong>
                      <span>{sections[slug].description}</span>
                      <span className="status-tag">Indisponível</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <MessageComposer />
      </main>
    </WorkspaceArea>
  );
}
