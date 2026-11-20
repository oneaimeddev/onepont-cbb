import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "**/tests/conversation-security.spec.mjs",
  workers: 1,
  reporter: "line",
});
