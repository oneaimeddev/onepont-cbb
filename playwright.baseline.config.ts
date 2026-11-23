import { defineConfig } from "@playwright/test";

// Smoke tests for the consolidated baseline; existing domain suites stay independent.
export default defineConfig({
  workers: 1,
  reporter: "line",
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3105" },
  projects: [
    { name: "access", testMatch: "**/tests/access.spec.mjs" },
    {
      name: "evolutions",
      testMatch: /tests\/evolution-(domain|submit)\.spec\.mjs/,
      grep: /ordinary finalized|restricted encounter|psychology correction|direct .* finalization|failure after persistence/,
    },
    {
      name: "intelligence",
      testMatch: "**/tests/chat-workflow-execution.spec.mjs",
      grep: /prescription: receipt invokes|execution revalidates (revoked|contact changed)|scoped polling/,
    },
    { name: "simulation", testMatch: "**/tests/delivery-simulation.spec.mjs" },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3105",
    url: "http://127.0.0.1:3105/login",
    reuseExistingServer: false,
    env: {
      ...process.env,
      CBB_SIGNING_MODE: "demo",
      CBB_DEPLOYMENT_ENV: "test",
      CBB_INTELLIGENCE_API_KEY: "",
    },
  },
});
