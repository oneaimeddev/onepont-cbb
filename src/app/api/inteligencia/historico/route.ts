import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { historyScope, readLongitudinalHistory } from "../../../../features/chat/history-run";
import { presentedAnalysis } from "../../../../features/chat/history-analysis";
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
  const record = body as { utterance?: unknown; contextAthleteId?: unknown; inputMode?: unknown; previous?: unknown };
  if (typeof record.utterance !== "string" || record.utterance.trim().length < 1 || record.utterance.length > 500) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const contextAthleteId = typeof record.contextAthleteId === "string" && uuidPattern.test(record.contextAthleteId) ? record.contextAthleteId : null;
  const inputMode = record.inputMode === "voice" ? "voice" : "text";
  const result = await readLongitudinalHistory({
    utterance: record.utterance,
    contextAthleteId,
    previous: historyScope(record.previous),
    inputMode,
    channel: "chat",
    signal: request.signal,
  });
  return Response.json({ text: result.text, analysis: presentedAnalysis(result.analysis), athletes: result.athletes });
}
