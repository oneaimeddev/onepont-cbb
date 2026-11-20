import { test, expect } from "./fixtures.mjs";
import { workflowFixture, workflowSql } from "./helpers/workflow-fixtures.mjs";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  shots = "docs/visual/handoff-007-10-6b-2";
let fx;
test.beforeAll(async () => {
  fx = await workflowFixture();
  mkdirSync(shots, { recursive: true });
});
test.afterAll(async () => {
  await fx?.cleanup();
});
async function shot(page, name, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `${shots}/${name}-${width}.png`,
    fullPage: true,
  });
}
async function access(page) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  expect(
    await page.evaluate(async () =>
      (
        await window.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        })
      ).violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("jornada durável: revisão, finalização, falha, retry, histórico e derivação em desktop e mobile", async ({
  page,
}) => {
  test.setTimeout(120000);
  const external = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      external.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(fx.owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(fx.owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  const did = randomUUID(),
    base = `/atletas/${fx.athlete}`;
  await page.goto(`${base}/documentos/nova?tipo=prescricao&documento=${did}`);
  await page
    .getByLabel("Nome do medicamento", { exact: true })
    .fill("Medicamento Ciclo DEMO");
  await page
    .getByLabel("Apresentação ou concentração")
    .fill("Comprimido fictício");
  await page.getByLabel("Dose", { exact: true }).fill("1");
  await page.getByLabel("Unidade", { exact: true }).fill("mg");
  await page.getByLabel("Via de administração").fill("Oral");
  await page.getByLabel("Frequência").fill("Posologia fictícia");
  await page.getByLabel("Duração").fill("DEMO");
  await page.getByLabel("Quantidade").fill("1");
  await page
    .getByLabel("Instruções complementares")
    .fill("Dado fictício. Não utilizar clinicamente.");
  await shot(page, "01-elaboracao");
  await page
    .getByRole("button", { name: "Revisar e assinar", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "Identidade para este documento",
      exact: true,
    })
    .selectOption(fx.inventory.identities[0].id);
  await page.getByLabel("Enviar ao atleta por WhatsApp").check();
  await expect(page.locator(".document-recipient")).toContainText(
    "autorizado somente para simulação",
  );
  await page.getByText("Cenários de demonstração", { exact: true }).click();
  await page.getByLabel("Cenário da entrega").selectOption("temporary_failure");
  await page.getByLabel("Cenário de demonstração").selectOption("delayed");
  await page.getByLabel("Revisei este conteúdo").check();
  await shot(page, "02-revisao-identidade-envio");
  await page
    .getByRole("button", { name: "Simular assinatura", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancelar tentativa", exact: true }),
  ).toBeVisible();
  await shot(page, "03-assinatura-andamento", 390);
  await expect(
    page.getByRole("heading", { name: "Documento finalizado", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", {
      name: "Falha na entrega simulada",
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Salvar rascunho", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Editar", exact: true }),
  ).toHaveCount(0);
  await shot(page, "04-finalizado-falha-historico");
  const immutable = workflowSql(
    `select content_hash from clinical.document_finalizations where document_id='${did}'`,
  );
  await page
    .getByRole("button", { name: "Tentar entrega novamente", exact: true })
    .focus();
  await expect(
    page.getByRole("button", { name: "Tentar entrega novamente", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page
    .getByLabel("Justificativa da entrega")
    .fill("Retentativa fictícia autorizada para demonstração");
  await page.getByLabel("Confirmo este destinatário").check();
  await shot(page, "05-retentativa", 390);
  await page
    .getByRole("button", {
      name: "Confirmar entrega demonstrativa",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Processando entrega simulada",
      exact: true,
    }),
  ).toBeVisible();
  await shot(page, "05b-entrega-andamento", 390);
  await expect(
    page.getByRole("heading", {
      name: "Entrega simulada concluída",
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await access(page);
    await shot(page, "06-finalizado-entrega-historico", width);
  }
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Documento finalizado", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Criar documento derivado", exact: true })
    .click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith(`${base}/documentos/`) &&
      !url.pathname.endsWith(did),
  );
  await expect(
    page.getByRole("button", { name: "Revisar e assinar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "versão 1 da origem" }),
  ).toBeVisible();
  await shot(page, "07-derivado", 390);
  expect(
    workflowSql(
      `select content_hash from clinical.document_finalizations where document_id='${did}'`,
    ),
  ).toBe(immutable);
  expect(
    workflowSql(
      `select count(*) from clinical.document_derivations where source_document_id='${did}'`,
    ),
  ).toBe("1");
  const denied = await fx.prepare("exam_request");
  const deniedAttempt = await fx.sign(denied, { scenario: "denied" });
  await fx.status(deniedAttempt.attempt.id);
  const ready = await fx.prepare("surgical_order");
  await fx.rpc("document_review_command", {
    action: "save",
    payload: { review_id: ready.id },
  });
  workflowSql(
    `update clinical.documents set status='ready_for_review' where id='${ready.document_id}'`,
  );
  await page.goto(`${base}?aba=documentos`);
  const list = page.locator(".profile-document-list");
  await expect(list).toContainText("Finalizado");
  await expect(list).toContainText("Rascunho");
  await expect(list).toContainText("Em revisão");
  await expect(list).toContainText("Assinatura simulada negada");
  await expect(list).toContainText("Assinatura simulada");
  await expect(list).toContainText("Entrega simulada concluída");
  const finalized = list.locator("li").filter({ hasText: "Finalizado" });
  await expect(finalized).not.toContainText("Rascunho");
  for (const width of [1440, 390]) {
    await shot(page, "08-listagem-mista", width);
    await access(page);
  }
  expect(external).toEqual([]);
});
