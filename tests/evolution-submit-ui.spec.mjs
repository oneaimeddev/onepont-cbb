import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { evolutionFixture, sql } from "./helpers/evolution-fixture.mjs";
const require = createRequire(import.meta.url),
  shots = "docs/visual/handoff-007-10-6d-1";
let f;
test.use({ viewport: { width: 1440, height: 1000 } });
test.beforeEach(async () => {
  f = await evolutionFixture();
  mkdirSync(shots, { recursive: true });
});
test.afterEach(async () => {
  await f?.cleanup();
});
async function login(page, user = f.doctor) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/atletas/${f.athlete}/evolucao`);
}
async function fill(page) {
  await page
    .getByLabel("Tipo ou título da evolução")
    .fill("Atendimento direto DEMO");
  await page
    .getByLabel("Conteúdo", { exact: true })
    .fill("Registro fictício atual.\nSegunda linha preservada.");
}
async function capture(page, name) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const a = await page.evaluate(() =>
    window.axe.run(document.querySelector("main"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  expect(a.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
const count = () =>
  sql(`select count(*) from clinical.records where athlete_id='${f.athlete}'`);
test("one click finalizes current fields; two actions, required fields and no confirmation dialog", async ({
  page,
}) => {
  await login(page);
  const final = page.getByRole("button", {
      name: "Finalizar evolução",
      exact: true,
    }),
    draft = page.getByRole("button", { name: "Salvar rascunho", exact: true });
  await expect(final).toHaveClass("button");
  await expect(draft).toHaveClass("outline");
  await fill(page);
  await capture(page, "form-1440");
  await page.getByLabel("Tipo ou título da evolução").fill("");
  await final.click();
  expect(count()).toBe("0");
  await expect(page.getByLabel("Tipo ou título da evolução")).toBeFocused();
  await fill(page);
  let dialogs = 0;
  page.on("dialog", async (d) => {
    dialogs++;
    await d.dismiss();
  });
  await final.click();
  await page.waitForURL(/aba=timeline/);
  await expect(page.locator(".timeline .pill")).toHaveText("Finalizado");
  await expect(page.locator(".timeline .record-body")).toContainText(
    "Registro fictício atual.",
  );
  expect(dialogs).toBe(0);
  expect(count()).toBe("1");
  await capture(page, "finalized-1440");
});
test("draft can be resumed and finalized using edits not manually saved", async ({
  page,
}) => {
  await login(page);
  await fill(page);
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await page.waitForURL(/registro=/);
  const id = new URL(page.url()).searchParams.get("registro");
  expect(sql(`select status from clinical.records where id='${id}'`)).toBe(
    "draft",
  );
  await page
    .getByLabel("Conteúdo", { exact: true })
    .fill("Texto atual do formulário, ainda não salvo.");
  await expect(
    page.getByRole("checkbox", { name: /Revisei esta versão/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Finalizar evolução", exact: true })
    .click();
  await page.waitForURL(/aba=timeline/);
  expect(count()).toBe("1");
  expect(
    sql(`select body||'|'||status from clinical.records where id='${id}'`),
  ).toBe("Texto atual do formulário, ainda não salvo.|finalized");
  await page
    .getByRole("link", { name: "Editar evolução", exact: true })
    .click();
  await expect(
    page.getByLabel("Motivo da correção", { exact: true }),
  ).toBeVisible();
});
test("lost response after commit retains text and nonce; retry reuses the result", async ({
  page,
}) => {
  await login(page);
  await fill(page);
  const nonce = await page.locator('input[name="request"]').inputValue();
  let intercepted = false;
  await page.route("**/atletas/**/evolucao*", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().headers()["next-action"] &&
      !intercepted
    ) {
      intercepted = true;
      await route.fetch();
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Finalizar evolução", exact: true })
    .click();
  await expect(
    page.locator(".composer-panel").getByRole("alert"),
  ).toContainText("conteúdo foi mantido");
  expect(intercepted).toBe(true);
  expect(count()).toBe("1");
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveValue(
    "Registro fictício atual.\nSegunda linha preservada.",
  );
  await expect(page.locator('input[name="request"]')).toHaveValue(nonce);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("cbb-unsaved-clinical:v1"),
    ),
  ).toBe("1");
  await capture(page, "retry-preserved-1440");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("link", { name: "Voltar ao atleta", exact: true })
    .click();
  await expect(page).toHaveURL(/evolucao/);
  await page
    .getByRole("button", { name: "Finalizar evolução", exact: true })
    .click();
  await page.waitForURL(/aba=timeline/);
  expect(count()).toBe("1");
  expect(
    sql(
      `select count(*) from clinical.audit_events where actor_user_id='${f.doctor.id}' and operation='clinical_record.traditional_submitted'`,
    ),
  ).toBe("1");
});
test("Psychology mobile finalization stays private and duplicate interactions are blocked", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, f.psych);
  await fill(page);
  await expect(
    page.getByRole("checkbox", { name: "Restringir o registro ao autor" }),
  ).toHaveCount(0);
  await capture(page, "form-390");
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/atletas/**/evolucao*", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      calls++;
      await held;
    }
    await route.continue();
  });
  const final = page.getByRole("button", {
    name: "Finalizar evolução",
    exact: true,
  });
  await final.click();
  await expect(
    page.getByRole("button", { name: "Finalizando…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Salvar rascunho", exact: true }),
  ).toBeDisabled();
  await page
    .locator('button[name="intent"][value="finalize"]')
    .evaluate((button) => button.click());
  release();
  await page.waitForURL(/aba=timeline/);
  expect(calls).toBe(1);
  expect(count()).toBe("1");
  expect(
    sql(
      `select visibility||'|'||status from clinical.records where athlete_id='${f.athlete}'`,
    ),
  ).toBe("author_only|finalized");
});
test("authorization failure keeps the form and permits a safe retry", async ({
  page,
}) => {
  await login(page);
  await fill(page);
  sql(
    `update clinical.athlete_access set can_finalize=false where athlete_id='${f.athlete}' and professional_id='${f.doctor.id}'`,
  );
  await page
    .getByRole("button", { name: "Finalizar evolução", exact: true })
    .click();
  await expect(
    page.locator(".composer-panel").getByRole("alert"),
  ).toContainText("não tem permissão");
  await expect(page.getByLabel("Conteúdo", { exact: true })).toHaveValue(
    "Registro fictício atual.\nSegunda linha preservada.",
  );
  expect(count()).toBe("0");
  sql(
    `update clinical.athlete_access set can_finalize=true where athlete_id='${f.athlete}' and professional_id='${f.doctor.id}'`,
  );
  await page
    .getByRole("button", { name: "Finalizar evolução", exact: true })
    .click();
  await page.waitForURL(/aba=timeline/);
  expect(count()).toBe("1");
});
