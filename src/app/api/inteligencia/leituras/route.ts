import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { uuidPattern } from "../../../../features/chat/guards";
import type { ReadingKind } from "../../../../features/chat/document-resolution";
import { documentTitle, isDocumentKind, presentedContent } from "../../../../features/chat/document-draft";

const limit = 8;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function unavailable(id: string) {
  return { id, unavailable: true as const };
}

function documentSummary(row: Record<string, unknown>, kind: ReadingKind) {
  const status = row.status === "ready_for_review" ? "ready_for_review" : "draft";
  return {
    id: row.id,
    kind,
    title: text(row.label, 160),
    authorName: text(row.author_name, 160),
    credentialLabel: text(row.credential_label, 80) || null,
    statusLabel: status === "ready_for_review" ? "Em revisão" : "Rascunho",
    unsigned: true,
    occurredAt: text(row.updated_at, 40),
  };
}

function documentDetail(row: Record<string, unknown>, kind: ReadingKind, patientName = "") {
  if (kind === "certificate" || kind === "referral") {
    const letter = presentedContent(kind, row.content);
    return { ...documentSummary({ ...row, label: documentTitle(kind, letter) }, kind), letter, patientName };
  }
  const summary = documentSummary({ ...row, label: kind === "surgical_order" ? text((row.content as { procedure?: unknown } | null)?.procedure, 160) : firstMedication(row.content) }, kind);
  const content = row.content;
  if (!content || typeof content !== "object") return summary;
  const record = content as Record<string, unknown>;
  if (kind === "prescription") {
    const medications = Array.isArray(record.items) ? record.items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const entry = item as Record<string, unknown>;
      const name = text(entry.name, 160);
      if (!name) return [];
      return [{
        name,
        presentation: text(entry.presentation, 160),
        dose: text(entry.dose, 160),
        dose_unit: text(entry.dose_unit, 160),
        route: text(entry.route, 160),
        schedule: text(entry.schedule, 160),
        duration: text(entry.duration, 160),
        quantity: text(entry.quantity, 160),
        instructions: text(entry.instructions, 500),
      }];
    }).slice(0, 12) : [];
    return { ...summary, notes: text(record.notes, 2000), medications };
  }
  if (kind === "exam_request") {
    const exams = Array.isArray(record.items) ? record.items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const entry = item as Record<string, unknown>;
      const name = text(entry.name, 160);
      if (!name) return [];
      return [{
        name,
        exam_type: text(entry.exam_type, 20),
        region: text(entry.region, 160),
        laterality: text(entry.laterality, 20),
        technical_details: text(entry.technical_details, 500),
        notes: text(entry.notes, 500),
      }];
    }).slice(0, 12) : [];
    return {
      ...summary,
      occurredAt: text(record.occurred_at, 10) || summary.occurredAt,
      indication: text(record.indication, 2000),
      diagnosis: text(record.diagnosis, 500),
      justification: text(record.justification, 2000),
      priority: text(record.priority, 20),
      additional: text(record.additional, 2000),
      exams,
    };
  }
  return {
    ...summary,
    procedure: text(record.procedure, 200),
    region: text(record.region, 120),
    laterality: text(record.laterality, 20),
    indication: text(record.indication, 2000),
    diagnosis: text(record.diagnosis, 500),
    justification: text(record.justification, 2000),
    priority: text(record.priority, 20),
    additional: text(record.additional, 2000),
    materials: text(record.materials, 1000),
  };
}

function firstMedication(content: unknown) {
  if (!content || typeof content !== "object") return "";
  const items = (content as { items?: unknown }).items;
  if (!Array.isArray(items)) return "";
  for (const item of items) {
    if (item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && (item as { name: string }).name.trim()) {
      return (item as { name: string }).name.trim().slice(0, 160);
    }
  }
  return "";
}

export async function POST(request: Request) {
  let originHost = "";
  try { originHost = new URL(request.headers.get("origin") ?? "").host; } catch { /* Origem ausente ou inválida. */ }
  if (!originHost || originHost !== request.headers.get("host")) {
    return Response.json({ error: "invalid" }, { status: 403 });
  }
  const access = await getAccess();
  if (access.status !== 200) return Response.json({ error: "invalid" }, { status: access.status });
  const client = await supabaseServer();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: "invalid" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "invalid" }, { status: 400 });
  const record = body as { athleteId?: unknown; items?: unknown };
  if (typeof record.athleteId !== "string" || !uuidPattern.test(record.athleteId) || !Array.isArray(record.items) || record.items.length < 1 || record.items.length > limit) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const items = record.items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as { id?: unknown; kind?: unknown; detail?: unknown };
    if (typeof entry.id !== "string" || !uuidPattern.test(entry.id)) return [];
    if (entry.kind !== "evolution" && !isDocumentKind(entry.kind)) return [];
    return [{ id: entry.id, kind: entry.kind as ReadingKind, detail: entry.detail === true }];
  });
  if (items.length !== record.items.length) return Response.json({ error: "invalid" }, { status: 400 });

  const documents = items.filter((item) => item.kind !== "evolution");
  const evolutions = items.filter((item) => item.kind === "evolution");
  const summaries = new Map<string, Record<string, unknown>>();
  if (documents.length > 0) {
    const listed = await client.rpc("chat_document_browse", {
      target: record.athleteId,
      filters: { ids: documents.map((item) => item.id) },
    });
    const data = listed.data as { error?: string; documents?: unknown } | null;
    if (!listed.error && data && !data.error && Array.isArray(data.documents)) {
      for (const entry of data.documents) {
        if (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string") {
          summaries.set((entry as { id: string }).id, entry as Record<string, unknown>);
        }
      }
    }
  }
  let records: Record<string, unknown>[] = [];
  if (evolutions.length > 0) {
    const timeline = await client.rpc("chat_athlete_timeline", { target: record.athleteId });
    const data = timeline.data as { records?: unknown } | null;
    records = !timeline.error && data && Array.isArray(data.records) ? data.records as Record<string, unknown>[] : [];
  }

  let patient: string | null = null;
  async function patientName() {
    if (patient !== null) return patient;
    const presented = await client.rpc("agent_presented_athletes", { ids: [record.athleteId] });
    const row = Array.isArray(presented.data) ? presented.data[0] as { social_name?: unknown; full_name?: unknown } | undefined : undefined;
    patient = text(row?.social_name, 160) || text(row?.full_name, 160);
    return patient;
  }
  const readings = [];
  for (const item of items) {
    if (item.kind === "evolution") {
      const found = records.find((entry) => entry.id === item.id);
      if (!found) {
        readings.push(unavailable(item.id));
        continue;
      }
      const bodyText = text(found.body, 20000);
      readings.push({
        id: item.id,
        kind: "evolution",
        title: text(found.title, 160),
        authorName: text(found.author_name, 160),
        credentialLabel: null,
        statusLabel: found.status === "finalized" ? "Finalizada" : "Rascunho",
        unsigned: false,
        occurredAt: text(found.occurred_at, 40),
        specialty: text(found.specialty, 80),
        restricted: found.is_restricted === true,
        ...(item.detail ? { body: bodyText.slice(0, 4000), truncated: bodyText.length > 4000 } : {}),
      });
      continue;
    }
    const summary = summaries.get(item.id);
    if (!summary || (summary.document_type !== item.kind)) {
      readings.push(unavailable(item.id));
      continue;
    }
    if (!item.detail) {
      readings.push(documentSummary(summary, item.kind));
      continue;
    }
    const opened = await client.rpc("chat_document_open", { target: record.athleteId, document_id: item.id });
    const data = opened.data as Record<string, unknown> | null;
    if (opened.error || !data || data.error || data.document_type !== item.kind) {
      readings.push(unavailable(item.id));
      continue;
    }
    readings.push(documentDetail(data, item.kind, item.kind === "certificate" || item.kind === "referral" ? await patientName() : ""));
  }
  return Response.json({ readings });
}
