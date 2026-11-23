import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "**/tests/delivery-simulation.spec.mjs",
  workers: 1, reporter: "line", timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3104" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3104",
    url: "http://127.0.0.1:3104/login", reuseExistingServer: false,
    env: { ...process.env, CBB_SIGNING_MODE: "demo", CBB_DEPLOYMENT_ENV: "test", CBB_INTELLIGENCE_API_KEY: "" },
  },
});
