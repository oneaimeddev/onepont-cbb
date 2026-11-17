import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { athletesFromDirectory, directoryFilters, directoryPageSize } from "../../../../features/chat/guards";

const pageLimit = 40;

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
  const record = body as { filters?: unknown; page?: unknown };
  const filters = directoryFilters(record.filters);
  const page = record.page;
  if (!filters || typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > pageLimit) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const payload: Record<string, string> = { page: String(page), page_size: String(directoryPageSize) };
  for (const [key, value] of Object.entries(filters)) {
    if (value) payload[key] = value;
  }
  const { data, error } = await client.rpc("agent_athlete_directory", { filters: payload });
  if (error || !data) return Response.json({ error: "unavailable" }, { status: 503 });
  const athletes = athletesFromDirectory(data.athletes);
  return Response.json({
    athletes,
    total: Number(data.total) || 0,
    page: Number(data.page) || page,
    pageSize: directoryPageSize,
    filters,
  });
}
