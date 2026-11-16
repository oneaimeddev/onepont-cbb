import { getAccess } from "../../../lib/profile";
import { supabaseServer } from "../../../lib/supabase";
import { replyToProfessional } from "../../../features/chat/agent";

const hits = new Map<string, number[]>();

function withinLimit(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 20) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

const errors = {
  unavailable: "O assistente está indisponível no momento. A interface tradicional continua disponível.",
  invalid: "Não foi possível ler essa mensagem.",
  limit: "O limite de uso desta conversa foi atingido. Tente novamente em alguns minutos.",
  provider: "Não foi possível consultar o assistente agora. Tente novamente em alguns instantes.",
} as const;

export async function POST(request: Request) {
  let originHost = "";
  try { originHost = new URL(request.headers.get("origin") ?? "").host; } catch { /* Origem ausente ou inválida. */ }
  if (!originHost || originHost !== request.headers.get("host")) {
    return Response.json({ error: "invalid" }, { status: 403 });
  }
  const access = await getAccess();
  if (access.status !== 200) return Response.json({ error: "invalid" }, { status: access.status });
  const client = await supabaseServer();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return Response.json({ error: "invalid" }, { status: 401 });
  if (!withinLimit(data.user.id)) return Response.json({ error: "limit", text: errors.limit }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid", text: errors.invalid }, { status: 400 }); }
  const reply = await replyToProfessional(body);
  if ("error" in reply) {
    const status = reply.error === "limit" ? 429 : reply.error === "invalid" ? 400 : reply.error === "provider" ? 502 : 503;
    return Response.json({ error: reply.error, text: errors[reply.error] }, { status });
  }
  return Response.json(reply);
}
