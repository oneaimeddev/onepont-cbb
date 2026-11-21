import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "**/tests/palette-identity.spec.mjs",
  workers: 1,
  reporter: "line",
  timeout: 180000,
  use: {
    baseURL: "http://127.0.0.1:3104",
    locale: "pt-BR",
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Sao_Paulo",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3104",
    url: "http://127.0.0.1:3104/login",
    reuseExistingServer: false,
    env: {
      ...process.env,
      CBB_SIGNING_MODE: "demo",
      CBB_DEPLOYMENT_ENV: "test",
      CBB_INTELLIGENCE_API_KEY: "offline-palette-only",
      CBB_INTELLIGENCE_MODEL: "gpt-4.1-mini",
      CBB_INTELLIGENCE_BASE_URL: "http://127.0.0.1:3199/v1",
      CBB_VOICE_ENABLED: "false",
    },
  },
});
