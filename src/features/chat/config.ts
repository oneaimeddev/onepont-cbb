import "server-only";

export function intelligenceEnabled() {
  return Boolean(process.env.CBB_INTELLIGENCE_API_KEY);
}

export function intelligenceModel() {
  const apiKey = process.env.CBB_INTELLIGENCE_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.CBB_INTELLIGENCE_MODEL || "gpt-4.1-mini",
    baseURL: process.env.CBB_INTELLIGENCE_BASE_URL || undefined,
  };
}
