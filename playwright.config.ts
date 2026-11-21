import { defineConfig } from "@playwright/test";

export default defineConfig({
  projects: [
    {
      name: "app",
      testIgnore:
        /voice.*\.spec|chat-document-model\.spec|chat-journey-ui\.spec|palette-identity\.spec/,
      use: { baseURL: "http://127.0.0.1:3100" },
    },
    {
      name: "voice",
      testMatch: /voice.*\.spec/,
      use: {
        baseURL: "http://127.0.0.1:3101",
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
    {
      name: "journey",
      testMatch: /chat-journey-ui\.spec/,
      use: {
        baseURL: "http://127.0.0.1:3103",
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
    {
      name: "document-model",
      testMatch: /chat-document-model\.spec/,
      use: { baseURL: "http://127.0.0.1:3102" },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3103",
      url: "http://127.0.0.1:3103/login",
      reuseExistingServer: false,
      env: {
        ...process.env,
        CBB_SIGNING_MODE: "demo",
        CBB_DEPLOYMENT_ENV: "test",
        CBB_INTELLIGENCE_API_KEY: "offline-journey-key",
        CBB_INTELLIGENCE_MODEL: "gemini-3.5-flash",
        CBB_INTELLIGENCE_BASE_URL: "",
        CBB_VOICE_ENABLED: "true",
      },
    },
    {
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
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      env: {
        ...process.env,
        CBB_SIGNING_MODE: "demo",
        CBB_DEPLOYMENT_ENV: "test",
        CBB_INTELLIGENCE_API_KEY: "",
      },
    },
    {
      // The voice project mocks every provider call in the browser; this key only enables the UI.
      command: "npm run start -- --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101/login",
      reuseExistingServer: false,
      env: {
        ...process.env,
        CBB_SIGNING_MODE: "off",
        CBB_DEPLOYMENT_ENV: "operational",
        CBB_INTELLIGENCE_API_KEY: "offline-playwright-key",
        CBB_INTELLIGENCE_MODEL: "gemini-3.5-flash",
        CBB_INTELLIGENCE_BASE_URL: "",
        CBB_VOICE_ENABLED: "true",
      },
    },
  ],
});
