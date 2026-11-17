import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { uuidPattern } from "../../../../features/chat/guards";

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
  const record = body as { athleteId?: unknown; page?: unknown; kind?: unknown; status?: unknown };
  if (typeof record.athleteId !== "string" || !uuidPattern.test(record.athleteId)) return Response.json({ error: "invalid" }, { status: 400 });
  if (typeof record.page !== "number" || !Number.isInteger(record.page) || record.page < 1 || record.page > 40) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const kind = record.kind === "prescription" || record.kind === "surgical_order" || record.kind === "exam_request" ? record.kind : "";
  const status = record.status === "draft" || record.status === "ready_for_review" ? record.status : "";
  const listed = await client.rpc("chat_document_browse", {
    target: record.athleteId,
    filters: { page: String(record.page), page_size: "5", kind, status },
  });
  const data = listed.data as { error?: string; documents?: unknown; total?: unknown; page?: unknown; page_size?: unknown } | null;
  if (listed.error || !data || data.error || !Array.isArray(data.documents)) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  const documents = data.documents.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; document_type?: unknown };
    if (typeof row.id !== "string" || (row.document_type !== "prescription" && row.document_type !== "surgical_order" && row.document_type !== "exam_request")) return [];
    return [{ id: row.id, kind: row.document_type }];
  });
  return Response.json({
    documents,
    total: Number(data.total) || 0,
    page: Number(data.page) || record.page,
    pageSize: Number(data.page_size) || 5,
  });
}
