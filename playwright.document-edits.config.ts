import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: [
    "**/tests/conversational-document-edits.spec.mjs",
    "**/tests/chat-document-adapters.spec.mjs",
    "**/tests/chat-document-creation.spec.mjs",
    "**/tests/chat-document-message-save.spec.mjs",
    "**/tests/chat-operations.spec.mjs",
    "**/tests/conversation-security.spec.mjs",
    "**/tests/workflow-backend.spec.mjs",
    "**/tests/document-agent.spec.mjs",
    "**/tests/exam-agent.spec.mjs",
    "**/tests/spoken-draft.spec.mjs",
  ],
  workers: 1,
  reporter: "line",
});
