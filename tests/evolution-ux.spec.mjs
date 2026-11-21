import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { evolutionFixture, sql } from "./helpers/evolution-fixture.mjs";
const require = createRequire(import.meta.url),
  shots = "docs/visual/handoff-007-10-6d";
let f;
test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  f = await evolutionFixture();
});
test.afterEach(async () => {
  await f?.cleanup();
});
async function login(page, user) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}
async function top(page){
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
}
async function axe(page) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const result = await page.evaluate(() =>
    window.axe.run(document.querySelector("main"), {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    }),
  );
  expect(
    result.violations.map((x) => ({
      id: x.id,
      nodes: x.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}
test("psychology draft has no public option; peer sees metadata without any protected HTML or direct access", async ({
  page,
  browser,
}) => {
  await login(page, f.psych);
  await page.goto(`/atletas/${f.athlete}/evolucao`);
  await expect(
    page.getByText(
      "Evoluções de Psicologia têm sigilo obrigatório de conteúdo.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Restringir o registro ao autor" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Tipo ou título da evolução")
    .fill("Atendimento sigiloso fictício");
  await page
    .getByLabel("Conteúdo", { exact: true })
    .fill("SEGREDO-UI-PSICO-DEMO");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Revisar evolução", exact: true }),
  ).toBeVisible();
  const record = new URL(page.url()).searchParams.get("registro");
  await axe(page);
  await top(page);
  await page.screenshot({
    path: `${shots}/psychology-draft-1280.png`,
    fullPage: true,
  });
  await page
    .getByLabel(
      "Revisei esta versão e confirmo a finalização para este atleta.",
    )
    .check();
  await page
    .getByRole("button", { name: "Confirmar finalização", exact: true })
    .click();
  const ctx = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const other = await ctx.newPage();
    await login(other, f.doctor);
    const response = await other.goto(`/atletas/${f.athlete}?aba=timeline`);
    expect(await response.text()).not.toContain("SEGREDO-UI-PSICO-DEMO");
    expect(await other.content()).not.toContain(
      "Atendimento sigiloso fictício",
    );
    await expect(
      other
        .locator(".timeline")
        .getByText("Conteúdo restrito", { exact: true }),
    ).toBeVisible();
    await expect(
      other
        .locator(".timeline")
        .getByText("Psicólogo Sigilo DEMO", { exact: false }),
    ).toBeVisible();
    await axe(other);
    await top(other);
    await other.screenshot({
      path: `${shots}/restricted-timeline-1440.png`,
      fullPage: true,
    });
    await other.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        other.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await axe(other);
    await top(other);
    await other.screenshot({
      path: `${shots}/restricted-timeline-390.png`,
      fullPage: true,
    });
    const denied = await other.goto(
      `/atletas/${f.athlete}/evolucao?registro=${record}`,
    );
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain("SEGREDO-UI-PSICO-DEMO");
  } finally {
    await ctx.close();
  }
});
test("published correction records a reason and keeps original history and a single timeline entry", async ({
  page,
}) => {
  const r = await f.finalize(
    f.doctor,
    await f.save(f.doctor, {
      entry_title: "Evolução compartilhada DEMO",
      entry_body: "Texto original DEMO",
    }),
  );
  const original = sql(
    `select to_jsonb(r)::text from clinical.records r where id='${r.id}'`,
  );
  await login(page, f.doctor);
  await page.goto(`/atletas/${f.athlete}?aba=timeline`);
  await page.locator(".timeline summary").click();
  await page
    .getByRole("link", { name: "Editar evolução", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Corrigir evolução", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Conteúdo", { exact: true })
    .fill("Texto corrigido DEMO");
  await page
    .getByLabel("Motivo da correção", { exact: true })
    .fill("Ajuste de digitação DEMO");
  await page
    .getByLabel(
      "Revisei esta correção e confirmo o registro de uma nova versão.",
    )
    .check();
  await page
    .getByRole("button", { name: "Registrar correção", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Correção registrada. A versão anterior foi preservada.",
  );
  await expect(
    page
      .getByRole("region", { name: "Conteúdo vigente" })
      .locator(".record-body"),
  ).toHaveText("Texto corrigido DEMO");
  expect(
    sql(`select to_jsonb(r)::text from clinical.records r where id='${r.id}'`),
  ).toBe(original);
  await page.getByText("Histórico de versões", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: `Versão ${r.version}` }),
  ).toContainText("Texto original DEMO");
  await expect(
    page.getByRole("region", { name: `Versão ${r.version + 1}` }),
  ).toContainText("Ajuste de digitação DEMO");
  await axe(page);
  await top(page);
  await page.screenshot({
    path: `${shots}/correction-history-1280.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await axe(page);
  await top(page);
  await page.screenshot({
    path: `${shots}/correction-history-390.png`,
    fullPage: true,
  });
  await page.goto(`/atletas/${f.athlete}?aba=timeline`);
  await expect(page.locator(".timeline li")).toHaveCount(1);
});
