import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "**/tests/chat-document-model.spec.mjs",
  workers: 1,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3102" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3102",
    url: "http://127.0.0.1:3102/login",
    reuseExistingServer: false,
    env: {
      ...process.env,
      CBB_SIGNING_MODE: "demo",
      CBB_DEPLOYMENT_ENV: "test",
      CBB_INTELLIGENCE_API_KEY: "offline-model-fixture",
      CBB_INTELLIGENCE_MODEL: "gpt-4.1-mini",
      CBB_INTELLIGENCE_BASE_URL: "http://127.0.0.1:3199/v1",
      CBB_VOICE_ENABLED: "false",
    },
  },
});
