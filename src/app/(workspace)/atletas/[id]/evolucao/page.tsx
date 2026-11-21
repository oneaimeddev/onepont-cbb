import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import {
  getAthlete,
  uuidPattern,
  eventDate,
} from "../../../../../features/athletes/data";
import { SubmitButton } from "../../../../../components/submit-button";
import { ClinicalDraftWatch } from "../../../../../features/clinical/draft-watch";
import { saveEvolution, correctEvolution } from "./actions";
import { requireProfile } from "../../../../../lib/profile";
import { supabaseServer } from "../../../../../lib/supabase";

type HistoryEntry = {
  version: number;
  title: string;
  body: string;
  reason: string;
  actor_name: string;
  created_at: string;
  kind: string;
};
export default async function EvolutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ registro?: string; erro?: string; salvo?: string }>;
}) {
  const { id } = await params;
  const { registro, erro, salvo } = await searchParams;
  const context = await getAthlete(id, "timeline");
  const profile = await requireProfile();
  if (!registro && !context.can_write) notFound();
  let record = context.records?.find((item) => item.id === registro);
  let history: HistoryEntry[] = [];
  if (registro) {
    if (!uuidPattern.test(registro)) notFound();
    const client = await supabaseServer();
    const result = await client.rpc("evolution_read", {
      target: id,
      record_id: registro,
    });
    if (result.error || !result.data || result.data.error) notFound();
    record = result.data;
    const versions = await client.rpc("evolution_history", {
      target: id,
      record_id: registro,
    });
    if (versions.error || versions.data?.error)
      throw new Error("Não foi possível consultar o histórico da evolução.");
    history = versions.data.versions;
  }
  const published = record?.status === "finalized";
  const editable = record ? Boolean(record.can_edit) : context.can_write;
  return (
    <main
      id="conteudo"
      tabIndex={-1}
      className="traditional-content clinical-page"
    >
      <Link className="back-link" href={`/atletas/${id}?aba=timeline`}>
        Voltar ao atleta
      </Link>
      <h1>
        {record
          ? published
            ? !editable ? "Evolução registrada" : record.has_signature
              ? "Correção vinculada à evolução"
              : "Corrigir evolução"
            : "Revisar evolução"
          : "Iniciar atendimento"}
      </h1>
      <div className="evolution-context">
        <p>{context.athlete.social_name || context.athlete.full_name}</p>
        <p>
          {record?.author_name ?? profile.display_name},{" "}
          {record?.specialty ?? profile.profession}
        </p>
        <small className="record-id sr-only">Atleta {id}</small>
        {record?.encounter_id && (
          <small className="record-id sr-only">
            Atendimento {record.encounter_id}
          </small>
        )}
      </div>
      {erro && (
        <p role="alert">
          Não foi possível salvar. O registro ou suas permissões podem ter
          mudado. Recarregue e confira os dados.
        </p>
      )}
      {salvo && (
        <p role="status">
          Correção registrada. A versão anterior foi preservada.
        </p>
      )}
      {record && published && (
        <section aria-label="Conteúdo vigente">
          <h2>{record.title}</h2>
          <p className="record-body">{record.body}</p>
          <p>
            {record.has_signature
              ? `Versão assinada ${record.signed_version}. As correções vinculadas preservam o conteúdo assinado.`
              : `Versão vigente ${record.version}. Autoria original preservada.`}
          </p>
          {record.is_restricted && (
            <p>Conteúdo restrito. O sigilo permanece em todas as revisões.</p>
          )}
          {record.has_signature && (
            <p>
              A versão assinada é imutável. Uma correção será registrada
              separadamente e vinculada a esta evolução.
            </p>
          )}
          {record.linked_corrections?.map((c) => (
            <section key={c.version} aria-label="Correção vinculada">
              <h3>{c.title}</h3>
              <p className="record-body">{c.body}</p>
              <p>
                {c.actor_name} · {eventDate.format(new Date(c.created_at))} ·{" "}
                {c.reason}
              </p>
            </section>
          ))}
        </section>
      )}
      {published ? (
        editable &&
        record && (
          <ClinicalDraftWatch>
            <form
              action={correctEvolution}
              className="athlete-form composer-panel"
              key={record.version}
            >
              <input type="hidden" name="athlete" value={id} />
              <input type="hidden" name="record" value={record.id} />
              <input type="hidden" name="request" value={randomUUID()} />
              <input type="hidden" name="version" value={record.version} />
              <label>
                Tipo ou título da evolução
                <input
                  name="title"
                  maxLength={160}
                  required
                  defaultValue={
                    record.has_signature ? "Correção vinculada" : record.title
                  }
                />
              </label>
              <label htmlFor="correction-body">Conteúdo</label>
              <textarea
                id="correction-body"
                name="body"
                maxLength={20000}
                required
                defaultValue={record.has_signature ? "" : record.body}
                rows={8}
              />
              <label>
                Motivo da correção
                <textarea
                  name="reason"
                  minLength={3}
                  maxLength={1000}
                  required
                  rows={3}
                />
              </label>
              <label className="check-label">
                <input type="checkbox" name="confirm" value="yes" required />
                Revisei esta correção e confirmo o registro de uma nova versão.
              </label>
              <SubmitButton pendingLabel="Registrando…">
                {record.has_signature
                  ? "Registrar correção vinculada"
                  : "Registrar correção"}
              </SubmitButton>
            </form>
          </ClinicalDraftWatch>
        )
      ) : editable ? (
        <ClinicalDraftWatch>
          <form
            action={saveEvolution}
            className="athlete-form composer-panel"
            key={record?.version ?? "new"}
          >
            <input type="hidden" name="athlete" value={id} />
            <input type="hidden" name="request" value={randomUUID()} />
            <input type="hidden" name="record" value={record?.id ?? ""} />
            <input type="hidden" name="version" value={record?.version ?? 0} />
            <label>
              Tipo ou título da evolução
              <input
                name="title"
                maxLength={160}
                required
                defaultValue={record?.title}
              />
            </label>
            <label htmlFor="evolution-body">Conteúdo</label>
            <textarea
              id="evolution-body"
              name="body"
              maxLength={20000}
              required
              defaultValue={record?.body}
              rows={8}
            />
            {record?.is_restricted || context.psychology_required ? (
              <>
                <input type="hidden" name="restricted" value="yes" />
                <p>
                  {context.psychology_required
                    ? "Evoluções de Psicologia têm sigilo obrigatório de conteúdo."
                    : "Este registro permanece restrito ao autor."}
                </p>
              </>
            ) : (
              <label className="check-label">
                <input
                  type="checkbox"
                  name="restricted"
                  value="yes"
                  defaultChecked={true}
                />
                Restringir o registro ao autor
              </label>
            )}
            <SubmitButton pendingLabel="Salvando…">
              Salvar rascunho
            </SubmitButton>
          </form>
          {record && context.can_finalize && (
            <form
              action={saveEvolution}
              className="athlete-form evolution-review"
            >
              <h2>Finalizar versão salva</h2>
              <p>
                Confira o conteúdo salvo abaixo. Alterações no formulário acima
                precisam ser salvas antes da confirmação.
              </p>
              <strong>{record.title}</strong>
              <p className="record-body">{record.body}</p>
              <input type="hidden" name="athlete" value={id} />
              <input type="hidden" name="request" value={randomUUID()} />
              <input type="hidden" name="record" value={record.id} />
              <input type="hidden" name="version" value={record.version} />
              <input type="hidden" name="action" value="finalize" />
              <label className="check-label">
                <input type="checkbox" name="confirm" value="yes" required />
                Revisei esta versão e confirmo a finalização para este atleta.
              </label>
              <SubmitButton pendingLabel="Finalizando…">
                Confirmar finalização
              </SubmitButton>
            </form>
          )}
        </ClinicalDraftWatch>
      ) : (
        record && (
          <section aria-label="Conteúdo vigente">
            <h2>{record.title}</h2>
            <p className="record-body">{record.body}</p>
            <p>Somente leitura.</p>
          </section>
        )
      )}
      {record && (
        <details className="evolution-review">
          <summary>Histórico de versões</summary>
          {history.map((v) => (
            <section key={v.version} aria-label={`Versão ${v.version}`}>
              <h2>
                Versão {v.version}
                {v.kind === "original"
                  ? " — Original preservado"
                  : v.kind === "addendum"
                    ? " — Correção vinculada"
                    : ""}
              </h2>
              <p>
                {v.kind === "archived_draft"
                  ? "Preservada por"
                  : "Registrada por"}{" "}
                {v.actor_name} · {eventDate.format(new Date(v.created_at))}
              </p>
              {v.reason && <p>Motivo: {v.reason}</p>}
              <strong>{v.title}</strong>
              <p className="record-body">{v.body}</p>
            </section>
          ))}
        </details>
      )}
    </main>
  );
}
