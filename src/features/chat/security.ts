import "server-only";
import { supabaseServer } from "../../lib/supabase";

// Only the authenticated current utterance comes from the client. Prior model context is rebuilt from authorized persistence.
export async function authorizedConversationInput(body: unknown) {
  if (!body || typeof body !== "object") return { error: "invalid" as const };
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.messages)) return { error: "invalid" as const };
  const latest = input.messages.at(-1);
  if (!latest || latest.role !== "user" || typeof latest.content !== "string")
    return { error: "invalid" as const };
  const client = await supabaseServer();
  const current = await client.rpc("conversation_current");
  if (current.error) return { error: "unavailable" as const };
  if (!current.data?.ok) return { error: "closed" as const };
  const stored = Array.isArray(current.data.messages)
    ? current.data.messages
    : [];
  const prior = stored
    .slice(-7)
    .filter(
      (m: { role?: string; text?: unknown }) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.text === "string",
    )
    .map((m: { role: string; text: string }) => ({
      role: m.role,
      content: m.text,
    }));
  return {
    input: {
      ...input,
      messages: [...prior, { role: "user", content: latest.content }],
    },
  };
}
