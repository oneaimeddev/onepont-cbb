import { defineConfig } from "@playwright/test";

export default defineConfig({
  projects: [
    { name: "app", testIgnore: /voice.*\.spec/, use: { baseURL: "http://127.0.0.1:3100" } },
    {
      name: "voice",
      testMatch: /voice.*\.spec/,
      use: {
        baseURL: "http://127.0.0.1:3101",
        permissions: ["microphone"],
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      env: { ...process.env, CBB_INTELLIGENCE_API_KEY: "" },
    },
    {
      // The voice project mocks every provider call in the browser; this key only enables the UI.
      command: "npm run start -- --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101/login",
      reuseExistingServer: false,
      env: { ...process.env, CBB_INTELLIGENCE_API_KEY: "offline-playwright-key", CBB_INTELLIGENCE_MODEL: "gemini-3.5-flash", CBB_INTELLIGENCE_BASE_URL: "", CBB_VOICE_ENABLED: "true" },
    },
  ],
});
