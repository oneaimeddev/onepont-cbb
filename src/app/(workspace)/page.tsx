import Link from "next/link";
import { Avatar } from "../../components/avatar";
import { SubmitButton } from "../../components/submit-button";
import { intelligenceEnabled } from "../../features/chat/config";
import { IntelligenceHome } from "../../features/chat/intelligence-home";
import { chatFonts } from "../../features/chat/fonts";
import { getAthlete } from "../../features/athletes/data";
import { requireProfile } from "../../lib/profile";
import { logout } from "../login/actions";

function greetingFor(name: string) {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).format(new Date()));
  const period = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return `${period}, ${name}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "").join("");
}

export default async function ChatPage({ searchParams }: {
  searchParams: Promise<{ atleta?: string | string[] }>;
}) {
  const profile = await requireProfile();
  const { atleta } = await searchParams;
  const context = typeof atleta === "string" ? await getAthlete(atleta, "chat") : null;
  const active = context?.athlete ?? null;
  const activeName = active && (active.social_name || active.full_name);
  const activeDetails = active ? [active.team, active.category].filter(Boolean) : [];
  const givenName = profile.display_name.trim().split(/\s+/)[0] || profile.display_name;

  return (
    <IntelligenceHome
      fonts={chatFonts}
      greeting={greetingFor(givenName)}
      profile={{
        displayName: profile.display_name,
        profession: profile.profession,
        initials: initials(profile.display_name),
        canReadAudit: profile.can_read_audit,
      }}
      enabled={intelligenceEnabled()}
      signOut={(
        <form action={logout}>
          <SubmitButton className="ia-signout" pendingLabel="Saindo…">Sair</SubmitButton>
        </form>
      )}
      context={active && activeName ? (
        <aside className="context-panel" aria-label="Contexto da tarefa">
          <h2>Atleta em contexto</h2>
          <p>{activeName} está em contexto. {intelligenceEnabled() ? "A conversa usa apenas as informações autorizadas para o seu perfil." : "Quando o assistente estiver disponível, a conversa usará apenas as informações autorizadas para o seu perfil."}</p>
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
        </aside>
      ) : null}
    />
  );
}
