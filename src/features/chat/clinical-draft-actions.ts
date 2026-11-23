"use server";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { buildConsultationReport, plainReport } from "../clinical/consultation-report";
import { isReportMode, reportModes } from "../clinical/consultation-report-modes";
import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";
import type { ClinicalDraft } from "./clinical-draft";
import { intelligenceModel } from "./config";
import { uuidPattern } from "./guards";

export type DraftSaveResult =
  | { ok: true; id: string; href: string }
  | { ok: false; error: "unapproved" | "denied" | "reused" | "invalid" | "unavailable" };

function failure(code: unknown): DraftSaveResult {
  if (code === "denied" || code === "reused" || code === "invalid") return { ok: false, error: code };
  return { ok: false, error: "unavailable" };
}

export async function saveClinicalDraft(input: {
  confirm: string;
  athleteId: string;
  requestId: string;
  title: string;
  body: string;
  occurredOn: string | null;
  restricted: boolean;
}): Promise<DraftSaveResult> {
  await requireProfile();
  if (input.confirm !== "yes") return { ok: false, error: "unapproved" };
  if (!uuidPattern.test(input.athleteId) || !uuidPattern.test(input.requestId)) return { ok: false, error: "invalid" };
  if (typeof input.restricted !== "boolean") return { ok: false, error: "invalid" };
  const title = input.title.trim();
  const body = input.body;
  if (title.length < 1 || title.length > 160 || body.trim().length < 1 || body.length > 20000) {
    return { ok: false, error: "invalid" };
  }
  let occurredOn: string | null = null;
  if (input.occurredOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return { ok: false, error: "invalid" };
    occurredOn = input.occurredOn;
  }
  const client = await supabaseServer();
  const approved = await client.rpc("clinical_draft_approve", {
    target: input.athleteId,
    request_id: input.requestId,
    entry_title: title,
    entry_body: body,
    occurred_on: occurredOn,
    restricted: input.restricted,
  });
  const approval = approved.data as { ok?: boolean; error?: string; approvalId?: string } | null;
  if (approved.error || !approval?.ok || typeof approval.approvalId !== "string") return failure(approval?.error);
  const committed = await client.rpc("clinical_draft_commit", {
    approval_id: approval.approvalId,
    target: input.athleteId,
    entry_title: title,
    entry_body: body,
    occurred_on: occurredOn,
    restricted: input.restricted,
  });
  const saved = committed.data as { ok?: boolean; error?: string; id?: string } | null;
  if (committed.error || !saved?.ok || typeof saved.id !== "string" || !uuidPattern.test(saved.id)) return failure(saved?.error);
  // The guarded commit now links any conversational proposal in the same database transaction.
  return { ok: true, id: saved.id, href: `/atletas/${input.athleteId}/evolucao?registro=${saved.id}` };
}

export async function finalizeClinicalDraft(input: {
  confirm: string;
  athleteId: string;
  recordId: string;
}): Promise<DraftSaveResult> {
  await requireProfile();
  if (input.confirm !== "yes") return { ok: false, error: "unapproved" };
  if (!uuidPattern.test(input.athleteId) || !uuidPattern.test(input.recordId)) return { ok: false, error: "invalid" };
  const client = await supabaseServer();
  const finalized = await client.rpc("clinical_draft_finalize", {
    target: input.athleteId,
    record_id: input.recordId,
  });
  const saved = finalized.data as { ok?: boolean; error?: string; id?: string } | null;
  if (finalized.error || !saved?.ok || typeof saved.id !== "string" || !uuidPattern.test(saved.id)) return failure(saved?.error);
  return { ok: true, id: saved.id, href: `/atletas/${input.athleteId}/evolucao?registro=${saved.id}` };
}

export async function discardClinicalDraft(requestId: string) {
  await requireProfile();
  if (!uuidPattern.test(requestId)) return { ok: false as const, error: "invalid" as const };
  const client = await supabaseServer();
  const discarded = await client.rpc("clinical_draft_proposal_discard", { request_id: requestId });
  const result = discarded.data as { ok?: boolean } | null;
  if (discarded.error || result?.ok !== true) return { ok: false as const, error: "unavailable" as const };
  return { ok: true as const };
}

export async function confirmSpokenDraft(input: {
  utterance: string;
  requestId: string | null;
  title: string;
  body: string;
  occurredOn: string | null;
  restricted: boolean;
  inputMode: "text" | "voice";
}): Promise<DraftSaveResult | { ok: false; error: "ignored" | "ambiguous" | "modified" }> {
  await requireProfile();
  if (input.inputMode !== "text" && input.inputMode !== "voice") return { ok: false, error: "invalid" };
  if (input.requestId !== null && !uuidPattern.test(input.requestId)) return { ok: false, error: "invalid" };
  if (typeof input.restricted !== "boolean") return { ok: false, error: "invalid" };
  let occurredOn: string | null = null;
  if (input.occurredOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return { ok: false, error: "invalid" };
    occurredOn = input.occurredOn;
  }
  const client = await supabaseServer();
  const confirmed = await client.rpc("clinical_draft_confirm_utterance", {
    utterance: input.utterance.slice(0, 240),
    request_id: input.requestId,
    entry_title: input.title,
    entry_body: input.body,
    occurred_on: occurredOn,
    restricted: input.restricted,
    input_mode: input.inputMode,
  });
  const saved = confirmed.data as { ok?: boolean; error?: string; id?: string; athleteId?: string } | null;
  if (confirmed.error) return { ok: false, error: "unavailable" };
  if (saved?.error === "ignored" || saved?.error === "ambiguous" || saved?.error === "modified") return { ok: false, error: saved.error };
  if (!saved?.ok || typeof saved.id !== "string" || !uuidPattern.test(saved.id) || typeof saved.athleteId !== "string" || !uuidPattern.test(saved.athleteId)) {
    return failure(saved?.error);
  }
  return { ok: true, id: saved.id, href: `/atletas/${saved.athleteId}/evolucao?registro=${saved.id}` };
}

export type ReportResult =
  | { ok: true; draft: ClinicalDraft }
  | { ok: false; error: "denied" | "invalid" | "unavailable" };

/**
 * Generates the consultation report in the mode the professional picked, from the transcript the
 * professional sent, for their own profession. The result is only a proposal: it is registered
 * like any chat evolution proposal and still needs the professional's confirmation in the card.
 */
export async function generateConsultationReport(input: {
  athleteId: string;
  requestId: string;
  mode: string;
  transcript: string;
}): Promise<ReportResult> {
  const profile = await requireProfile();
  if (!uuidPattern.test(input.athleteId) || !uuidPattern.test(input.requestId) || !isReportMode(input.mode)) return { ok: false, error: "invalid" };
  const transcript = typeof input.transcript === "string" ? input.transcript.trim().slice(0, 20000) : "";
  if (transcript.length < 20) return { ok: false, error: "invalid" };
  const model = intelligenceModel();
  if (!model) return { ok: false, error: "unavailable" };
  const client = await supabaseServer();
  const prepared = await client.rpc("agent_clinical_draft_prepare", { target: input.athleteId });
  const names = prepared.data as { ok?: boolean; athleteName?: string; professionalName?: string } | null;
  if (prepared.error || !names?.ok || !names.athleteName || !names.professionalName) return { ok: false, error: "denied" };

  const mode = input.mode;
  const request = buildConsultationReport(mode, {
    athlete: names.athleteName,
    professional: names.professionalName,
    profession: profile.profession,
    transcript,
  });
  let body = "";
  try {
    const generated = await generateText({
      model: model.provider === "google"
        ? createGoogleGenerativeAI({ apiKey: model.apiKey }).chat(model.model)
        : createOpenAI({ apiKey: model.apiKey, baseURL: model.baseURL }).chat(model.model),
      system: request.system,
      prompt: request.prompt,
      temperature: 0.2,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions: model.provider === "openai" ? { openai: { store: false } } : undefined,
    });
    if (generated.finishReason !== "stop") throw new Error("Incomplete report");
    body = plainReport(generated.text).slice(0, 20000);
  } catch (cause) {
    console.error(JSON.stringify({ event: "consultation_report_failed", mode, reason: cause instanceof Error ? cause.name : "unknown" }));
    return { ok: false, error: "unavailable" };
  }
  if (!body) return { ok: false, error: "unavailable" };

  const title = reportModes[mode].title;
  const registered = await client.rpc("clinical_draft_proposal_register", {
    target: input.athleteId,
    request_id: input.requestId,
    entry_title: title,
    entry_body: body,
    occurred_on: null,
    restricted: true,
  });
  const stored = registered.data as { ok?: boolean; error?: string; version?: unknown; contentHash?: unknown } | null;
  if (registered.error || stored?.ok !== true) return { ok: false, error: stored?.error === "denied" ? "denied" : "unavailable" };
  return {
    ok: true,
    draft: {
      requestId: input.requestId,
      athleteId: input.athleteId,
      athleteName: names.athleteName,
      professionalName: names.professionalName,
      occurredOn: null,
      title,
      body,
      missing: [],
      restricted: true,
      state: "proposal",
      recordId: null,
      error: null,
      contentHash: typeof stored.contentHash === "string" ? stored.contentHash : null,
      version: typeof stored.version === "number" ? stored.version : null,
    },
  };
}
