import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import { voiceApiKey } from "../../../../features/chat/config";
import { mintVoiceToken } from "../../../../features/chat/voice/token";

const hits = new Map<string, number[]>();

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
  const access = await getAccess();
  if (access.status !== 200) return Response.json({ error: "invalid" }, { status: access.status, headers: noStore });
  const client = await supabaseServer();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return Response.json({ error: "invalid" }, { status: 401, headers: noStore });
  const current=await client.rpc("conversation_current");
  if(current.error||!current.data?.ok)return Response.json({error:"unavailable",text:"Inicie uma nova conversa para continuar por voz."},{status:409,headers:noStore});
  const apiKey = voiceApiKey();
  if (!apiKey) return Response.json({ error: "unavailable", text: errors.unavailable }, { status: 503, headers: noStore });
  if (!withinLimit(data.user.id)) return Response.json({ error: "limit", text: errors.limit }, { status: 429, headers: noStore });
  try {
    const token = await mintVoiceToken(apiKey);
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
