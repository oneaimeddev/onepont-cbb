"use server";

import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";
import type { DocumentContent, DocumentKind } from "../documents/content";
import { uuidPattern } from "./guards";

type DocumentSaveResult =
  | { ok: true; id: string; athleteId: string; requestId: string }
  | { ok: false; error: "unapproved" | "denied" | "reused" | "invalid" | "unavailable" | "ignored" | "ambiguous" | "modified" };

function failure(code: unknown): DocumentSaveResult {
  if (code === "denied" || code === "reused" || code === "invalid" || code === "ignored" || code === "ambiguous" || code === "modified") {
    return { ok: false, error: code };
  }
  return { ok: false, error: "unavailable" };
}

function saved(value: { ok?: boolean; error?: string; id?: string; athleteId?: string; requestId?: string } | null): DocumentSaveResult {
  if (!value?.ok || typeof value.id !== "string" || !uuidPattern.test(value.id) || typeof value.athleteId !== "string" || !uuidPattern.test(value.athleteId) || typeof value.requestId !== "string" || !uuidPattern.test(value.requestId)) {
    return failure(value?.error);
  }
  return { ok: true, id: value.id, athleteId: value.athleteId, requestId: value.requestId };
}

export async function saveDocumentDraft(input: {
  confirm: string;
  requestId: string;
  kind: DocumentKind;
  content: DocumentContent;
}): Promise<DocumentSaveResult> {
  await requireProfile();
  if (input.confirm !== "yes") return { ok: false, error: "unapproved" };
  if (!uuidPattern.test(input.requestId) || (input.kind !== "prescription" && input.kind !== "surgical_order" && input.kind !== "exam_request")) return { ok: false, error: "invalid" };
  const client = await supabaseServer();
  const confirmed = await client.rpc("clinical_document_confirm_card", {
    request_id: input.requestId,
    kind: input.kind,
    payload: input.content,
  });
  if (confirmed.error) return { ok: false, error: "unavailable" };
  return saved(confirmed.data as { ok?: boolean; error?: string; id?: string; athleteId?: string; requestId?: string } | null);
}

export async function discardDocumentDraft(requestId: string) {
  await requireProfile();
  if (!uuidPattern.test(requestId)) return { ok: false as const, error: "invalid" as const };
  const client = await supabaseServer();
  const discarded = await client.rpc("clinical_document_proposal_discard", { request_id: requestId });
  const result = discarded.data as { ok?: boolean } | null;
  if (discarded.error || result?.ok !== true) return { ok: false as const, error: "unavailable" as const };
  return { ok: true as const };
}

export async function confirmSpokenDocument(input: {
  utterance: string;
  requestId: string | null;
  kind: DocumentKind | null;
  content: DocumentContent | null;
  inputMode: "text" | "voice";
}): Promise<DocumentSaveResult> {
  await requireProfile();
  if (input.inputMode !== "text" && input.inputMode !== "voice") return { ok: false, error: "invalid" };
  if (input.requestId !== null && !uuidPattern.test(input.requestId)) return { ok: false, error: "invalid" };
  const client = await supabaseServer();
  const confirmed = await client.rpc("clinical_document_confirm_utterance", {
    utterance: input.utterance.slice(0, 240),
    request_id: input.requestId,
    kind: input.kind,
    payload: input.content,
    input_mode: input.inputMode,
  });
  if (confirmed.error) return { ok: false, error: "unavailable" };
  return saved(confirmed.data as { ok?: boolean; error?: string; id?: string; athleteId?: string; requestId?: string } | null);
}
