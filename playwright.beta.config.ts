import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: ["**/tests/beta-environment.spec.mjs", "**/tests/beta-null-author.spec.mjs"],
  workers: 1,
  reporter: "line",
});
