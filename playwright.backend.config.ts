import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "**/tests/workflow-backend.spec.mjs",
  workers: 1,
  reporter: "line",
});
