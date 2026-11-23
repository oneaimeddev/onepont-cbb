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
        !path.startsWith("docs/visual/handoff-007-10-6b-3/") &&
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

export async function stubMicrophone(page) {
  await page.addInitScript(() => {
    window.testMicrophoneTracks = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const output = context.createMediaStreamDestination();
      const track = output.stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        if (context.state !== "closed") void context.close();
      };
      window.testMicrophoneTracks.push(track);
      return output.stream;
    };
  });
}

/**
 * Mocks the dictation transcription route. `dictate` records like a voice note (click, wait,
 * stop), checks the transcription lands in the composer and, unless told otherwise, sends it.
 */
export async function mockDictation(page) {
  const queue = [];
  const requests = [];
  await page.route("**/api/inteligencia/ditado", async (route) => {
    const request = route.request();
    requests.push({ contentType: request.headers()["content-type"], bytes: request.postDataBuffer()?.length ?? 0 });
    await route.fulfill({ json: { text: queue.shift() ?? "" } });
  });
  return {
    requests,
    /** Queues the text returned by the next transcription request. */
    next(text) {
      queue.push(text);
    },
    async dictate(text, { send = true, holdMs = 500 } = {}) {
      queue.push(text);
      const composer = page.getByRole("form", { name: "Composição de mensagem" });
      const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
      await composer.getByRole("button", { name: "Gravar áudio", exact: true }).click();
      await expect(composer.getByRole("status").filter({ hasText: "Gravando" })).toBeVisible();
      await page.waitForTimeout(holdMs);
      await composer.getByRole("button", { name: "Parar gravação", exact: true }).click();
      await expect.poll(() => field.inputValue()).toContain(text);
      if (send) await field.press("Enter");
    },
  };
}
