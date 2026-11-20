import { test as base, expect } from "@playwright/test";
// Explicit historical captures are opt-in. Assertions and browser behavior are unchanged.
export const test = base.extend({
  page: async ({ page }, run) => {
    const screenshot = page.screenshot.bind(page);
    page.screenshot = async (options = {}) => {
      const path = String(options.path ?? "").replaceAll("\\", "/");
      if (
        path.startsWith("docs/visual/") &&
        !path.startsWith("docs/visual/handoff-007-10-6b-2/") &&
        process.env.CBB_REGENERATE_HISTORICAL_EVIDENCE !== "1"
      )
        return Buffer.alloc(0);
      return screenshot(options);
    };
    await run(page);
  },
});
export { expect };

export { request } from "@playwright/test";
