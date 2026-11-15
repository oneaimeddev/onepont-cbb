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
  return (
    <WorkspaceArea context={active && (
      <>
        <h2>Atleta em contexto</h2>
        <strong>{active.social_name || active.full_name}</strong>
        <p className="record-id">{active.id}</p>
        <Link className="clinical-link" href={`/atletas/${active.id}`} prefetch={false}>Voltar ao perfil</Link>
        <Link className="clinical-link" href="/" prefetch={false}>Encerrar contexto</Link>
      </>
    )}>
      <main id="conteudo" tabIndex={-1} className="conversation">
        <div className="conversation-content">
          <div className="conversation-intro">
            <h1>Como podemos ajudar?</h1>
            <p>Abra o perfil de um atleta e consulte as informações disponíveis para você.</p>
          </div>
          <nav className="task-suggestions" aria-label="Tarefas clínicas">
            {(["atletas", "prontuarios", "evolucoes"] as const).map((slug) => (
              <Link href={`/${slug}`} prefetch={false} key={slug}>
                <strong>{sections[slug].title}</strong>
                <span>{sections[slug].description}</span>
              </Link>
            ))}
          </nav>
        </div>
        <MessageComposer />
      </main>
    </WorkspaceArea>
  );
}
