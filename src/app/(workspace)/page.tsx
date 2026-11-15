import Link from "next/link";
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
  const active = typeof atleta === "string" ? (await getAthlete(atleta, "chat")).athlete : null;
  const activeName = active && (active.social_name || active.full_name);
  return (
    <WorkspaceArea context={active && (
      <>
        <h2>Atleta em contexto</h2>
        <strong>{activeName}</strong>
        <p className="record-id">{active.id}</p>
        <Link className="clinical-link" href={`/atletas/${active.id}`} prefetch={false}>Voltar ao perfil</Link>
        <Link className="clinical-link" href="/" prefetch={false}>Encerrar contexto</Link>
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
                      <strong>{sections[slug].title}</strong>
                      <span>{sections[slug].description}</span>
                    </Link>
                  ) : (
                    <div className="is-unavailable">
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
