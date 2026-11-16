import { notFound } from "next/navigation";
import { EmptyState } from "../../../components/empty-state";
import type { AuditEvent } from "../../../features/audit/contract";
import { eventDate } from "../../../features/athletes/data";
import { requireProfile } from "../../../lib/profile";
import { supabaseServer } from "../../../lib/supabase";

const operationLabels: Record<string, string> = {
  "photo.read": "Consulta de fotografia",
  "photo.replace": "Fotografia salva",
  "photo.remove": "Fotografia removida",
  "athlete.edit": "Cadastro atualizado",
  "clinical_record.draft_saved": "Rascunho salvo",
  "clinical_record.finalized": "Evolução finalizada",
  "clinical_record.save": "Tentativa de alteração clínica",
  "qa.permissions.provisioned": "Permissões de homologação concedidas",
  "athlete.list": "Consulta ao catálogo",
  "athlete.create": "Cadastro de atleta",
  "athlete.view": "Consulta ao perfil",
  "athlete.context.open": "Abertura de contexto no chat",
  "clinical_record.timeline.read": "Consulta à linha do tempo",
  "clinical_record.summary.read": "Consulta às atividades recentes",
  "audit.list": "Consulta à auditoria",
  "athlete_access.grant": "Acesso profissional concedido",
  "athlete_access.revoke": "Acesso profissional revogado",
  "athlete_access.list": "Consulta aos vínculos",
  "athlete_access.search": "Busca de profissionais",
};

const outcomes = { success: "Concluída", denied: "Negada", failed: "Falhou" };

export default async function AuditPage() {
  const profile = await requireProfile();
  if (!profile.can_read_audit) notFound();
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_audit");
  if (error?.code === "42501") notFound();
  if (error) throw new Error("Falha ao consultar auditoria.");
  const events = data as AuditEvent[];

  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
      <header className="clinical-header">
        <div>
          <h1>Auditoria</h1>
          <p>Até 100 operações recentes, com horários de Brasília.</p>
        </div>
      </header>
      {events.length ? (
        <ol className="clinical-list audit-list">
          {events.map((event) => (
            <li key={event.request_id}>
              <div className="audit-entry">
                <strong>{operationLabels[event.operation] ?? event.operation}</strong>
                <span className={event.outcome === "success" ? "pill pill-success" : "pill pill-danger"}>{outcomes[event.outcome]}</span>
              </div>
              <span className="meta-list">
                <time dateTime={event.occurred_at}>{eventDate.format(new Date(event.occurred_at))}</time>
                <span>{event.origin_channel === "ai_chat" ? "CBB Intelligence" : event.origin_channel === "traditional_ui" ? "Interface tradicional" : event.origin_channel}</span>
              </span>
              <small className="record-id">Usuário {event.actor_user_id}</small>
              {event.athlete_id && <small className="record-id">Atleta {event.athlete_id}</small>}
              {event.operation.startsWith("athlete_access.") && event.resource_id && <small className="record-id">Profissional {event.resource_id}</small>}
            </li>
          ))}
        </ol>
      ) : <EmptyState icon="audit" title="Nenhuma operação registrada." />}
    </main>
  );
}
