import "server-only";

export function intelligenceEnabled() {
  return Boolean(process.env.CBB_INTELLIGENCE_API_KEY);
}

export function intelligenceModel() {
  const apiKey = process.env.CBB_INTELLIGENCE_API_KEY;
  if (!apiKey) return null;
  const model = process.env.CBB_INTELLIGENCE_MODEL || "gpt-4.1-mini";
  const baseURL = process.env.CBB_INTELLIGENCE_BASE_URL || undefined;
  return {
    apiKey,
    model,
    baseURL,
    provider: model.startsWith("gemini") && !baseURL ? "google" as const : "openai" as const,
  };
}

export function voiceApiKey() {
  if (process.env.CBB_VOICE_ENABLED === "false") return null;
  const config = intelligenceModel();
  return config?.provider === "google" ? config.apiKey : null;
}

/** Live consultation recording. Accepts the usual ways of switching a flag on ("1", "true", "on", "sim"). */
export function consultationVoiceEnabled() {
  return ["1", "true", "on", "sim", "yes"].includes((process.env.CONSULTATION_VOICE_BETA ?? "").trim().toLowerCase());
}
