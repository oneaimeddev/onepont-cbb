import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "**/tests/chat-operations.spec.mjs",
  workers: 1,
  reporter: "line",
});
