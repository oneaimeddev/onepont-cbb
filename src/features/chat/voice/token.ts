import "server-only";
import setup from "./live-setup.json";

const tokenEndpoint = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";
export const liveSocketUrl = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export type VoiceToken = { token: string; url: string; expiresAt: string };

export async function mintVoiceToken(apiKey: string): Promise<VoiceToken | { error: number }> {
  const now = Date.now();
  const expiresAt = new Date(now + 11 * 60_000).toISOString();
  const response = await fetch(`${tokenEndpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      bidiGenerateContentSetup: setup,
    }),
  });
  if (!response.ok) return { error: response.status };
  const body = await response.json() as { name?: unknown };
  if (typeof body.name !== "string" || !body.name) return { error: 502 };
  return { token: body.name, url: liveSocketUrl, expiresAt };
}
