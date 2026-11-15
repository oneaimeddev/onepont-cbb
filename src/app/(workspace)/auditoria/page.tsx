import { notFound } from "next/navigation";
import type { AuditEvent } from "../../../features/audit/contract";
import { eventDate } from "../../../features/athletes/data";
import { requireProfile } from "../../../lib/profile";
import { supabaseServer } from "../../../lib/supabase";

const operationLabels: Record<string, string> = {
  "athlete.list": "Consulta ao catálogo",
  "athlete.create": "Cadastro de atleta",
  "athlete.view": "Consulta ao perfil",
  "athlete.context.open": "Abertura de contexto no chat",
  "clinical_record.timeline.read": "Consulta à linha do tempo",
  "audit.list": "Consulta à auditoria",
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
      <h1>Auditoria</h1>
      <p>Até 100 operações recentes, com horários de Brasília.</p>
      {events.length ? (
        <ol className="clinical-list">
          {events.map((event) => (
            <li key={event.request_id}>
              <strong>{operationLabels[event.operation] ?? event.operation}</strong>
              <p><time dateTime={event.occurred_at}>{eventDate.format(new Date(event.occurred_at))}</time>
                {" · "}{outcomes[event.outcome]}{" · "}{event.origin_channel === "traditional_ui" ? "Interface tradicional" : event.origin_channel}</p>
              <small className="record-id">Usuário {event.actor_user_id}</small>
              {event.athlete_id && <small className="record-id">Atleta {event.athlete_id}</small>}
            </li>
          ))}
        </ol>
      ) : <p className="clinical-empty">Nenhuma operação registrada.</p>}
    </main>
  );
}
