import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: [
    "**/tests/conversational-document-edits.spec.mjs",
    "**/tests/chat-operations.spec.mjs",
    "**/tests/conversation-security.spec.mjs",
    "**/tests/workflow-backend.spec.mjs",
  ],
  workers: 1,
  reporter: "line",
});
