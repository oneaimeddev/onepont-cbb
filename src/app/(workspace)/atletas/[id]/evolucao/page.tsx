import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getAthlete } from "../../../../../features/athletes/data";
import { SubmitButton } from "../../../../../components/submit-button";
import { saveEvolution } from "./actions";
import { requireProfile } from "../../../../../lib/profile";

export default async function EvolutionPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ registro?: string; erro?: string }>;
}) {
  const { id } = await params;
  const { registro, erro } = await searchParams;
  const context = await getAthlete(id, "timeline");
  const profile = await requireProfile();
  if (!context.can_write) notFound();
  const record = context.records?.find((item) => item.id === registro);
  if (registro && (!record || !record.is_author)) notFound();
  return (
    <main id="conteudo" tabIndex={-1} className="traditional-content clinical-page">
      <Link className="back-link" href={`/atletas/${id}`}>Voltar ao atleta</Link>
      <h1>{record ? "Revisar evolução" : "Iniciar atendimento"}</h1>
      <div className="evolution-context">
        <p>{context.athlete.social_name || context.athlete.full_name}</p>
        <p>{record?.author_name ?? profile.display_name}, {record?.specialty ?? profile.profession}</p>
        <small className="record-id sr-only">Atleta {id}</small>
        {record?.encounter_id && <small className="record-id sr-only">Atendimento {record.encounter_id}</small>}
      </div>
      {erro && <p role="alert">Não foi possível salvar. O registro ou suas permissões podem ter mudado. Recarregue e confira os dados.</p>}
      {record?.status === "finalized" ? <p>Registro finalizado.</p> : (
        <>
          <form action={saveEvolution} className="athlete-form composer-panel" key={record?.version ?? "new"}>
            <input type="hidden" name="athlete" value={id} />
            <input type="hidden" name="request" value={randomUUID()} />
            <input type="hidden" name="record" value={record?.id ?? ""} />
            <input type="hidden" name="version" value={record?.version ?? 0} />
            <label>Tipo ou título da evolução<input name="title" maxLength={160} required defaultValue={record?.title} /></label>
            <label htmlFor="evolution-body">Conteúdo</label><textarea id="evolution-body" name="body" maxLength={20000} required defaultValue={record?.body} rows={8} />
            {record?.is_restricted ? (
              <>
                <input type="hidden" name="restricted" value="yes" />
                <p>Este registro permanece restrito ao autor.</p>
              </>
            ) : (
              <label className="check-label"><input type="checkbox" name="restricted" value="yes" defaultChecked={record?.is_restricted ?? true} />Restringir o registro ao autor</label>
            )}
            <SubmitButton pendingLabel="Salvando…">Salvar rascunho</SubmitButton>
          </form>
          {record && context.can_finalize && (
            <form action={saveEvolution} className="athlete-form evolution-review">
              <h2>Finalizar versão salva</h2>
              <p>Confira o conteúdo salvo abaixo. Alterações no formulário acima precisam ser salvas antes da confirmação.</p>
              <strong>{record.title}</strong>
              <p className="record-body">{record.body}</p>
              <input type="hidden" name="athlete" value={id} />
              <input type="hidden" name="request" value={randomUUID()} />
              <input type="hidden" name="record" value={record.id} />
              <input type="hidden" name="version" value={record.version} />
              <input type="hidden" name="action" value="finalize" />
              <label className="check-label"><input type="checkbox" name="confirm" value="yes" required />Revisei esta versão e confirmo a finalização para este atleta.</label>
              <SubmitButton pendingLabel="Finalizando…">Confirmar finalização</SubmitButton>
            </form>
          )}
        </>
      )}
    </main>
  );
}
