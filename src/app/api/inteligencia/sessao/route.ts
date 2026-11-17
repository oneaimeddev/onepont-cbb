import { uuidPattern } from "../../../../features/chat/guards";
import { conversationTurn, turnsFrom } from "../../../../features/chat/transcript";
import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";

type ConversationResult = { ok?: boolean; error?: string } | null;

function sameOrigin(request: Request) {
  let originHost = "";
  try { originHost = new URL(request.headers.get("origin") ?? "").host; } catch { /* Origem ausente ou inválida. */ }
  return Boolean(originHost) && originHost === request.headers.get("host");
}

function athleteIdFrom(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string" || !uuidPattern.test(value)) return undefined;
  return value;
}

function statusFor(result: ConversationResult) {
  if (result?.error === "denied") return 403;
  if (result?.error === "conflict" || result?.error === "closed") return 409;
  return 400;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "invalid" }, { status: 403 });
  const access = await getAccess();
  if (access.status !== 200) return Response.json({ error: "invalid" }, { status: access.status });
  const client = await supabaseServer();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: "invalid" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "invalid" }, { status: 400 });
  const record = body as { action?: unknown; sessionId?: unknown; athleteId?: unknown; messages?: unknown };
  const athleteId = athleteIdFrom(record.athleteId);
  if (athleteId === undefined) return Response.json({ error: "invalid" }, { status: 400 });

  if (record.action === "start") {
    const { data, error } = await client.rpc("conversation_start");
    const result = data as ConversationResult;
    if (error || !result?.ok) return Response.json({ error: "unavailable" }, { status: 503 });
    return Response.json(data);
  }

  if (record.action === "recent") {
    const { data, error } = await client.rpc("conversation_recent");
    const result = data as ConversationResult;
    if (error || !result?.ok) return Response.json({ error: "unavailable" }, { status: 503 });
    return Response.json(data);
  }

  const sessionId = record.sessionId == null ? null : record.sessionId;
  if (sessionId !== null && (typeof sessionId !== "string" || !uuidPattern.test(sessionId))) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  if (record.action === "resume") {
    if (sessionId === null) return Response.json({ error: "invalid" }, { status: 400 });
    const { data, error } = await client.rpc("conversation_resume", { target: sessionId });
    const result = data as ConversationResult;
    if (error) return Response.json({ error: "unavailable" }, { status: 503 });
    if (!result?.ok) return Response.json({ error: result?.error ?? "invalid" }, { status: statusFor(result) });
    return Response.json(data);
  }

  if (record.action === "context") {
    const { data, error } = await client.rpc("conversation_set_context", { context_athlete: athleteId });
    const result = data as ConversationResult;
    if (error) return Response.json({ error: "unavailable" }, { status: 503 });
    if (!result?.ok) return Response.json({ error: result?.error ?? "invalid" }, { status: statusFor(result) });
    return Response.json(data);
  }

  if (record.action !== "save") return Response.json({ error: "invalid" }, { status: 400 });
  const messages = turnsFrom(JSON.stringify({ v: 1, turns: record.messages ?? [] })).map(conversationTurn);
  if (messages.length === 0) return Response.json({ error: "invalid" }, { status: 400 });
  const { data, error } = await client.rpc("conversation_save", {
    target: sessionId,
    context_athlete: athleteId,
    transcript: messages,
  });
  const result = data as ConversationResult;
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });
  if (!result?.ok) return Response.json({ error: result?.error ?? "invalid" }, { status: statusFor(result) });
  return Response.json(data);
}
