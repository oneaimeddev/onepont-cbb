"use server";

import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";
import type { DocumentContent, DocumentKind } from "../documents/content";
import type { DocumentReviewRecord } from "../documents/review-types";
import { presentedDocument, type DocumentDraft } from "./document-draft";
import { uuidPattern } from "./guards";

type DocumentSaveResult =
  | { ok: true; id: string; athleteId: string; requestId: string; document?: DocumentDraft }
  | { ok: false; error: "unapproved" | "denied" | "reused" | "invalid" | "unavailable" | "ignored" | "ambiguous" | "modified" | "conflict" | "locked" };

function failure(code: unknown): DocumentSaveResult {
  if (code === "conflict" || code === "stale" || code === "locked") return { ok: false, error: code === "stale" ? "conflict" : code };
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
  version: number | null;
  contentHash: string | null;
  idempotencyKey: string;
}): Promise<DocumentSaveResult> {
  await requireProfile();
  if (input.confirm !== "yes") return { ok: false, error: "unapproved" };
  if (!uuidPattern.test(input.requestId) || (input.kind !== "prescription" && input.kind !== "surgical_order" && input.kind !== "exam_request")) return { ok: false, error: "invalid" };
  const client = await supabaseServer();
  if (!input.version || !input.contentHash || !/^[a-f0-9]{32}$/.test(input.contentHash) || !uuidPattern.test(input.idempotencyKey)) return { ok: false, error: "invalid" };
  const confirmed = await client.rpc("chat_document_card", {
    request_id: input.requestId,
    kind: input.kind,
    payload: input.content,
    expected_version: input.version, expected_hash: input.contentHash, idempotency_key: input.idempotencyKey, intent: "save",
  });
  if (confirmed.error) return { ok: false, error: "unavailable" };
  const document = presentedDocument(confirmed.data?.document);
  if (!document || !document.documentId || confirmed.data?.error) return failure(confirmed.data?.error);
  return { ok: true, id: document.documentId, athleteId: document.athleteId, requestId: document.requestId, document };
}

export async function reviewDocumentDraft(input: { requestId: string; kind: DocumentKind; content: DocumentContent; version: number | null; contentHash: string | null; idempotencyKey: string }) {
  await requireProfile();
  if (!uuidPattern.test(input.requestId) || !uuidPattern.test(input.idempotencyKey) || !input.version || !input.contentHash || !/^[a-f0-9]{32}$/.test(input.contentHash)) return { error: "invalid" };
  const client = await supabaseServer();
  const r = await client.rpc("chat_document_card", { request_id: input.requestId, kind: input.kind, payload: input.content, expected_version: input.version, expected_hash: input.contentHash, idempotency_key: input.idempotencyKey, intent: "review" });
  if (r.error) return { error: "unavailable" };
  return { error: r.data?.error as string | undefined, document: presentedDocument(r.data?.document), review: r.data?.review as DocumentReviewRecord | undefined };
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
