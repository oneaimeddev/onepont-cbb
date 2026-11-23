import { createClient } from "@supabase/supabase-js";
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
import { correctEvolution } from "./actions";
import { EvolutionForm } from "../../../../../features/clinical/evolution-form";
import { ConsultationCapture, ConsultationProcessing } from "../../../../../features/clinical/consultation-capture";
import { consultationSpecialty } from "../../../../../features/clinical/consultation-prompt";
import { getAccess, requireProfile } from "../../../../../lib/profile";
import { supabaseServer } from "../../../../../lib/supabase";
import { ClinicalText } from "../../../../../components/clinical-text";

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
  searchParams: Promise<{ registro?: string; erro?: string; salvo?: string; modo?: string; consulta?: string }>;
}) {
  const { id } = await params;
  const { registro, erro, salvo, modo, consulta } = await searchParams;
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
  const voiceAvailable = !registro && context.can_write && context.athlete.source === "demo"
    && process.env.CONSULTATION_VOICE_BETA === "1" && Boolean(consultationSpecialty(profile.profession));
  const access = voiceAvailable && modo === "voz" ? await getAccess() : null;
  let voiceReview: { body: string; transcript: string; specialty: string } | null = null;
  if (access?.status === 200 && consulta) {
    if (!uuidPattern.test(consulta)) notFound();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) notFound();
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const result = await admin.rpc("consultation_work", {
      actor: access.userId, target: id, capture_id: consulta, action: "status",
    });
    if (result.error || !result.data || result.data.error) notFound();
    if (result.data.state === "ready") voiceReview = result.data;
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
      {(modo === "voz" || registro) && <Link className="back-link" href={`/?atleta=${id}`} prefetch={false}>Voltar ao CBB Intelligence</Link>}
      <h1>
        {voiceReview
          ? "Revisar evolução por voz"
          : record
          ? published
            ? !editable
              ? "Evolução registrada"
              : record.has_signature
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
      {voiceAvailable && (
        <Link className="back-link" href={modo === "voz" ? `/atletas/${id}/evolucao` : `/atletas/${id}/evolucao?modo=voz`}>
          {modo === "voz" ? "Preencher evolução manualmente" : "Registrar consulta por voz"}
        </Link>
      )}
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
          <p className="record-body"><ClinicalText text={record.body} /></p>
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
              <p className="record-body"><ClinicalText text={c.body} /></p>
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
      ) : voiceReview ? (
        <>
          <section className="evolution-review" aria-label="Revisão da consulta por voz">
            <p>Especialidade utilizada: {voiceReview.specialty}</p>
            <p>Confira as informações antes de salvar ou finalizar.</p>
            {voiceReview.transcript?.includes("[inaudível]") && <p role="status">A transcrição contém trechos inaudíveis.</p>}
            <details>
              <summary>Conferir transcrição</summary>
              <p className="record-body">{voiceReview.transcript}</p>
            </details>
            {consulta && <ConsultationProcessing athlete={id} session={consulta} regenerate />}
          </section>
          <EvolutionForm
            key={voiceReview.body}
            athleteId={id}
            consultationId={consulta}
            requestId={randomUUID()}
            recordId={null}
            version={0}
            title="Evolução da consulta"
            body={voiceReview.body}
            restricted={Boolean(context.psychology_required)}
            mandatoryRestriction={Boolean(context.psychology_required || voiceReview.specialty === "Psicologia")}
            canFinalize={context.can_finalize}
          />
        </>
      ) : access?.status === 200 ? (
        <ConsultationCapture athlete={id} owner={access.userId} label={`${context.athlete.social_name || context.athlete.full_name} · ${profile.profession}`} />
      ) : editable ? (
        <EvolutionForm
          key={`${record?.id ?? "new"}:${record?.version ?? 0}`}
          athleteId={id}
          requestId={randomUUID()}
          recordId={record?.id ?? null}
          version={record?.version ?? 0}
          title={record?.title ?? ""}
          body={record?.body ?? ""}
          restricted={Boolean(record?.is_restricted)}
          mandatoryRestriction={Boolean(context.psychology_required)}
          canFinalize={context.can_finalize}
        />
      ) : (
        record && (
          <section aria-label="Conteúdo vigente">
            <h2>{record.title}</h2>
            <p className="record-body"><ClinicalText text={record.body} /></p>
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
              <p className="record-body"><ClinicalText text={v.body} /></p>
            </section>
          ))}
        </details>
      )}
    </main>
  );
}
