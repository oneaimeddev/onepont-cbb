import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "**/tests/evolution-submit.spec.mjs",
  workers: 1,
  reporter: "line",
});
