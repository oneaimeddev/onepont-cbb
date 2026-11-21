import Link from "next/link";
import { Avatar } from "../../components/avatar";
import { SubmitButton } from "../../components/submit-button";
import { intelligenceEnabled, voiceApiKey } from "../../features/chat/config";
import { parseConversation, parseHistory } from "../../features/chat/conversation";
import { endConversationContext } from "../../features/chat/conversation-actions";
import { IntelligenceHome } from "../../features/chat/intelligence-home";
import { chatFonts } from "../../features/chat/fonts";
import { getAthlete, loadAthlete } from "../../features/athletes/data";
import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";
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
  const requested = typeof atleta === "string" ? atleta : null;
  const client = await supabaseServer();
  const [currentResult, recentResult, evolutionPolicy] = await Promise.all([
    requested ? client.rpc("conversation_current") : Promise.resolve({ data: null, error: null }),
    client.rpc("conversation_recent"),
    client.rpc("evolution_policy"),
  ]);
  if (currentResult.error || recentResult.error || evolutionPolicy.error) throw new Error("Não foi possível recuperar a conversa.");
  const current = parseConversation(currentResult.data);
  const history = parseHistory(recentResult.data);
  const context = requested
    ? await getAthlete(requested, "chat")
    : current.athleteId
      ? await loadAthlete(current.athleteId, "chat")
      : null;
  const active = context?.athlete ?? null;
  const activeName = active && (active.social_name || active.full_name);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const sport = context?.sports?.find((item) => item.starts_on <= today && (!item.ends_on || item.ends_on >= today));
  const givenName = profile.display_name.trim().split(/\s+/)[0] || profile.display_name;

  return (
    <IntelligenceHome
      fonts={chatFonts}
      greeting={greetingFor(givenName)}
      landing={!requested}
      profile={{
        displayName: profile.display_name,
        profession: profile.profession,
        initials: initials(profile.display_name),
        canReadAudit: profile.can_read_audit,
      }}
      enabled={intelligenceEnabled()}
      voiceEnabled={Boolean(voiceApiKey())}
      contextAthleteId={active?.id ?? null}
      canFinalize={Boolean(context?.can_finalize)}
      evolutionRestricted={Boolean(evolutionPolicy.data?.psychology_required)}
      initialSessionId={current.sessionId}
      initialSnapshot={current.snapshot}
      initialHistory={history}
      signOut={(
        <form action={logout} role="none">
          <SubmitButton role="menuitem" className="ia-signout" pendingLabel="Saindo…">Sair</SubmitButton>
        </form>
      )}
      context={active && activeName ? (
        <div className="ia-context-card">
          <div className="ia-context-id">
            <Avatar name={activeName} athleteId={active.id} photoVersion={active.photo_version} />
            <h2>{activeName}</h2>
          </div>
          <dl>
            <div><dt>Categoria</dt><dd>{sport?.category || active.category || "Não informado"}</dd></div>
            <div><dt>Naipe</dt><dd>{sport?.division || "Não informado"}</dd></div>
            <div><dt>Clube</dt><dd>{sport?.club || active.team || "Não informado"}</dd></div>
          </dl>
          <p>{activeName} está em contexto. {intelligenceEnabled() ? "A conversa usa apenas as informações autorizadas para o seu perfil." : "Quando o assistente estiver disponível, a conversa usará apenas as informações autorizadas para o seu perfil."}</p>
          <p className="ia-context-record">{active.id}</p>
          <nav className="ia-context-actions" aria-label="Ações do atleta">
            <Link href={`/atletas/${active.id}`} prefetch={false}>Abrir prontuário</Link>
            {context?.can_write ? <Link href={`/atletas/${active.id}/evolucao`} prefetch={false}>Registrar evolução</Link> : null}
            {context?.can_read_records ? <Link href={`/atletas/${active.id}?aba=timeline`} prefetch={false}>Consultar histórico</Link> : null}
            <form action={endConversationContext}>
              <button type="submit">Encerrar contexto</button>
            </form>
          </nav>
        </div>
      ) : null}
    />
  );
}
