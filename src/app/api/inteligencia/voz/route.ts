import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { voiceApiKey } from "../../../../features/chat/config";
import { mintVoiceToken } from "../../../../features/chat/voice/token";

const hits = new Map<string, number[]>();

function underLimit(userId: string) {
  const now = Date.now();
  return (hits.get(userId) ?? []).filter((time) => now - time < 10 * 60 * 1000).length < 12;
}

function withinLimit(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 12) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

const errors = {
  unavailable: "A conversa por voz está indisponível. Você pode continuar digitando.",
  limit: "Muitas sessões de voz em pouco tempo. Tente novamente em alguns minutos.",
  provider: "Não foi possível iniciar a voz agora. Tente novamente em instantes.",
} as const;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let originHost = "";
  try { originHost = new URL(request.headers.get("origin") ?? "").host; } catch { /* Origem ausente ou inválida. */ }
  if (!originHost || originHost !== request.headers.get("host")) {
    return Response.json({ error: "invalid" }, { status: 403, headers: noStore });
  }
  // getAccess already validated the session with Supabase Auth; reuse it instead of a second round trip.
  const access = await getAccess();
  if (access.status !== 200) return Response.json({ error: "invalid" }, { status: access.status, headers: noStore });
  const client = await supabaseServer();
  const apiKey = voiceApiKey();
  // The conversation check and the provider token are independent, so they run in parallel.
  // The token is minted only when the key exists and the user is under the rate limit; one minted
  // for a request refused below is single use, expires in a minute and is never returned.
  const minted = apiKey && underLimit(access.userId)
    ? mintVoiceToken(apiKey).then((token) => ({ token }), (cause: unknown) => ({ cause }))
    : null;
  const current = await client.rpc("conversation_current");
  if (current.error || !current.data?.ok) return Response.json({ error: "unavailable", text: "Inicie uma nova conversa para continuar por voz." }, { status: 409, headers: noStore });
  if (!apiKey) return Response.json({ error: "unavailable", text: errors.unavailable }, { status: 503, headers: noStore });
  if (!minted || !withinLimit(access.userId)) return Response.json({ error: "limit", text: errors.limit }, { status: 429, headers: noStore });
  try {
    const result = await minted;
    if ("cause" in result) throw result.cause;
    const token = result.token;
    if ("error" in token) {
      console.error(JSON.stringify({ event: "voice_token_failed", status: token.error }));
      return Response.json({ error: "provider", text: errors.provider }, { status: 502, headers: noStore });
    }
    return Response.json(token, { headers: noStore });
  } catch (cause) {
    console.error(JSON.stringify({ event: "voice_token_failed", reason: cause instanceof Error ? cause.name : "unknown" }));
    return Response.json({ error: "provider", text: errors.provider }, { status: 502, headers: noStore });
  }
}
