import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import {
  createProfileFixture,
  cleanupProfileFixture,
  loginProfile,
} from "./fixtures/profile.mjs";
const require = createRequire(import.meta.url);
test.use({ locale: "pt-BR", viewport: { width: 1440, height: 1000 } });
let f;
const shots = "docs/visual/handoff-007-9b/after";
test.beforeAll(async () => {
  test.setTimeout(90000);
  f = await createProfileFixture();
  mkdirSync(shots, { recursive: true });
});
test.afterAll(async () => {
  await cleanupProfileFixture();
});
test("evolução recente abre, recebe foco e aceita o link legado", async ({
  page,
}) => {
  await loginProfile(page, f.owner);
  await page.goto(`/atletas/${f.rich}`);
  await page.locator(".recent-evolutions a").first().click();
  await page.waitForURL((u) => u.searchParams.get("aba") === "timeline");
  const row = page.locator(`#registro-${f.recent[0]}`);
  await expect(row.locator("details")).toHaveAttribute("open", "");
  await expect(row.locator("summary")).toBeFocused();
  await page.screenshot({
    path: `${shots}/timeline-target.png`,
    fullPage: false,
  });
  await page.goto(`/atletas/${f.rich}?aba=timeline#registro-${f.recent[2]}`);
  await expect(
    page.locator(`#registro-${f.recent[2]} details`),
  ).toHaveAttribute("open", "");
  await page.goto(`/atletas/${f.rich}?aba=timeline&registro=${f.privateId}`);
  await expect(page.locator(`#registro-${f.privateId}`)).toHaveCount(0);
  expect(await page.content()).not.toContain("Conteúdo PRIVADO DEMO");
});
test("aba ativa visível, todas as seções disponíveis e teclado em 320/390px", async ({
  page,
}) => {
  await loginProfile(page, f.owner);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/atletas/${f.rich}?aba=documentos`);
    const selected = page
      .getByRole("navigation", { name: "Seções do atleta" })
      .getByRole("link", { name: "Documentos médicos", exact: true });
    await expect
      .poll(() =>
        selected.evaluate((x) => {
          const a = x.getBoundingClientRect(),
            b = x.parentElement.getBoundingClientRect();
          return a.left >= b.left - 1 && a.right <= b.right + 1;
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${shots}/tabs-${width}.png`,
      fullPage: false,
    });
    await selected.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(
      page.getByRole("link", { name: "Anexos clínicos", exact: true }),
    ).toBeFocused();
  }
});
test("cadastro protege saída, recarga e descarte; salvar usa confirmação do servidor", async ({
  page,
}) => {
  await loginProfile(page, f.owner);
  await page.goto(`/atletas/${f.rich}?aba=cadastro`);
  await page
    .getByText("Editar identificação e status", { exact: true })
    .click();
  const name = page.getByLabel("Nome completo", { exact: true });
  await name.fill("Marina alteração DEMO");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("link", { name: "Linha do tempo", exact: true }).click();
  await expect(name).toHaveValue("Marina alteração DEMO");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("link", { name: "Trocar atleta", exact: true }).click();
  await expect(name).toHaveValue("Marina alteração DEMO");
  const reloadDialog = page.waitForEvent("dialog");
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const warning = await reloadDialog;
  expect(warning.type()).toBe("beforeunload");
  await warning.dismiss();
  await expect(name).toHaveValue("Marina alteração DEMO");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("link", { name: "Linha do tempo", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("aba") === "timeline");
  await page.goto(`/atletas/${f.rich}?aba=cadastro`);
  await page
    .getByText("Editar identificação e status", { exact: true })
    .click();
  await expect(name).toHaveValue("Marina Perfil DEMO");
  await name.fill("Marina Perfil Atualizada DEMO");
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await page.waitForURL((u) => u.searchParams.has("salvo"));
  await expect(
    page.getByRole("status").filter({ hasText: "Cadastro salvo." }),
  ).toContainText("Cadastro salvo.");
  await page
    .getByText("Editar identificação e status", { exact: true })
    .click();
  await name.fill("Marina Perfil DEMO");
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await page.waitForURL((u) => u.searchParams.has("salvo"));
  await expect(page.locator("h1")).toHaveText("Marina Perfil DEMO");
  await page
    .getByText("Registrar novo vínculo esportivo", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Categoria", exact: true })
    .fill("Sub-19");
  await page.getByRole("option", { name: "Sub-19", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Alterações cadastrais não salvas." }),
  ).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("link", { name: "Trocar atleta", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Categoria", exact: true }),
  ).toHaveValue("Sub-19");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("link", { name: "Linha do tempo", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("aba") === "timeline");
});
test("restrição só na autora e documentos/anexos seguem autorizados", async ({
  page,
}) => {
  await loginProfile(page, f.psych);
  await page.goto(`/atletas/${f.rich}?aba=timeline`);
  await expect(
    page
      .locator(`#registro-${f.privateId}`)
      .getByText("· Restrito ao autor", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/own-restriction.png`,
    fullPage: false,
  });
  const denied = await page.goto(`/atletas/${f.rich}/documentos/${f.docs[0]}`);
  expect(denied.status()).toBe(404);
  await page.context().clearCookies();
  await loginProfile(page, f.physio);
  await page.goto(`/atletas/${f.rich}?aba=timeline`);
  expect(await page.content()).not.toContain(f.privateId);
  expect(await page.content()).not.toContain("Conteúdo PRIVADO DEMO");
  await page.goto(`/atletas/${f.rich}?aba=anexos`);
  await expect(
    page.getByRole("heading", { name: "Anexos clínicos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Resultado laboratorial DEMO", { exact: true }),
  ).toHaveCount(0);
  await page.context().clearCookies();
  await loginProfile(page, f.registry);
  await page.goto(`/atletas/${f.rich}`);
  await expect(
    page.getByRole("link", { name: "Linha do tempo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Nova evolução", exact: true }),
  ).toHaveCount(0);
});

test("cadastro prioriza leitura, contatos autorizados e preserva vínculos e foto", async ({
  page,
}) => {
  await loginProfile(page, f.owner);
  await page.goto(`/atletas/${f.rich}?aba=cadastro`);
  await expect(
    page.getByRole("heading", { name: "Contatos e responsáveis" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Nome completo", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "(11) 0000-0000", exact: true }),
  ).toHaveAttribute("href", "tel:1100000000");
  await expect(
    page.getByRole("link", { name: "atleta.demo@example.com" }),
  ).toHaveAttribute("href", "mailto:atleta.demo@example.com");
  await expect(
    page.getByRole("region", { name: "Histórico de vínculos" }).locator("li"),
  ).toHaveCount(3);
  await expect(
    page.getByText("Clube anterior DEMO", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/registration-desktop.png`,
    fullPage: true,
  });
  await page.getByText("Atualizar fotografia", { exact: true }).click();
  await expect(page.getByLabel("JPEG, PNG ou WebP, até 5 MB")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/atletas/${f.rich}?aba=cadastro`);
  await page.screenshot({
    path: `${shots}/registration-mobile.png`,
    fullPage: true,
  });
  await page.context().clearCookies();
  await loginProfile(page, f.physio);
  await page.goto(`/atletas/${f.rich}?aba=cadastro`);
  expect(await page.content()).not.toContain("atleta.demo@example.com");
  expect(await page.content()).not.toContain("DEMO-PERFIL");
  await expect(
    page.getByText("Editar identificação e status", { exact: true }),
  ).toHaveCount(0);
});
test("timeline filtra período, especialidade, estado, limpa e mantém fonte profunda", async ({
  page,
}) => {
  await loginProfile(page, f.owner);
  await page.goto(`/atletas/${f.rich}?aba=timeline`);
  await expect(page.locator(".clinical-list details")).toHaveCount(20);
  await expect(page.getByRole("status")).toContainText("64 autorizadas");
  await page.getByRole("button", { name: "Mostrar mais 20 evoluções" }).click();
  await expect(page.locator(".clinical-list details")).toHaveCount(40);
  await page
    .getByLabel("Especialidade", { exact: true })
    .selectOption("Medicina");
  await expect(page.locator(".clinical-list details")).toHaveCount(20);
  await expect(page.getByRole("status")).toContainText("Medicina");
  await page.getByLabel("Estado da evolução").selectOption("draft");
  await expect(page.locator(".clinical-list details")).toHaveCount(1);
  await page.getByLabel("De", { exact: true }).fill("2026-11-17");
  await page.getByLabel("Até", { exact: true }).fill("2026-11-17");
  await expect(page.locator(".clinical-list details")).toHaveCount(1);
  await page.screenshot({
    path: `${shots}/timeline-filtered.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel("Especialidade", { exact: true })).toHaveValue(
    "Medicina",
  );
  await expect(page.locator(".clinical-list details")).toHaveCount(1);
  await page.getByLabel("Até", { exact: true }).fill("2026-11-16");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "data inicial",
  );
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator(".clinical-list details")).toHaveCount(20);
  await page.goto(
    `/atletas/${f.rich}?aba=timeline&especialidade=Medicina&registro=${f.recent[64]}`,
  );
  await expect(
    page.locator(`#registro-${f.recent[64]} details`),
  ).toHaveAttribute("open", "");
  await expect(page.locator(`#registro-${f.recent[64]} summary`)).toBeFocused();
  await expect(page.getByLabel("Especialidade", { exact: true })).toHaveValue(
    "Medicina",
  );
  await page.goto(`/atletas/${f.rich}?aba=timeline#registro-${f.recent[64]}`);
  await expect(
    page.locator(`#registro-${f.recent[64]} details`),
  ).toHaveAttribute("open", "");
});
test("documentos filtrados por tipo/ordem preservam editores, estados e contexto", async ({
  page,
}) => {
  await loginProfile(page, f.owner);
  await page.goto(`/atletas/${f.rich}?aba=documentos`);
  await expect(page.locator(".profile-document-list > li")).toHaveCount(5);
  await expect(
    page.getByText("Nenhum documento desta lista é emitido ou assinado.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".profile-document-list")).toContainText(
    "Versão 2",
  );
  await page
    .getByLabel("Tipo de documento", { exact: true })
    .selectOption("exam_request");
  await expect(page.locator(".profile-document-list > li")).toHaveCount(2);
  await page.getByLabel("Ordenar documentos").selectOption("oldest");
  await expect(
    page.locator(".profile-document-list a").first(),
  ).toHaveAttribute("href", `/atletas/${f.rich}/documentos/${f.docs[4]}`);
  await page.screenshot({
    path: `${shots}/medical-documents.png`,
    fullPage: true,
  });
  await page.locator(".profile-document-list a").first().click();
  await page.waitForURL((u) => u.pathname.endsWith(f.docs[4]));
  await expect(page.locator("h1")).toHaveText("Marina Perfil DEMO");
  await page.goto(`/atletas/${f.rich}`);
  await page
    .getByRole("link", {
      name: "Abrir no chat — CBB Intelligence",
      exact: true,
    })
    .click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(
    page.getByRole("complementary", { name: "Contexto da tarefa" }),
  ).toContainText("Marina Perfil DEMO");
  await page.goto(`/atletas/${f.fresh}`);
  await expect(
    page.getByText("Use Nova evolução para iniciar um registro deste atleta.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({ path: `${shots}/empty-athlete.png`, fullPage: true });
});

test("acessibilidade e capturas finais das cinco seções em desktop e mobile", async ({
  page,
}) => {
  test.setTimeout(120000);
  await loginProfile(page, f.owner);
  const checks = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const [tab, label] of [
      ["visao-geral", "profile"],
      ["cadastro", "registration"],
      ["timeline", "timeline"],
      ["documentos", "documents"],
      ["anexos", "attachments"],
    ]) {
      await page.goto(`/atletas/${f.rich}?aba=${tab}`);
      await page.waitForLoadState("networkidle");
      if (tab === "anexos")
        await expect(
          page.getByText("Resultado laboratorial DEMO", { exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const result = await page.evaluate(async () => {
        const r = await axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
          },
        });
        return {
          violations: r.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
          incomplete: r.incomplete.map((v) => v.id),
        };
      });
      checks.push({ section: label, width, ...result });
      writeFileSync(
        "docs/visual/handoff-007-9b/accessibility.json",
        JSON.stringify(checks, null, 2) + "\n",
      );
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: `${shots}/${label}-${width}.png`,
        fullPage: tab !== "timeline",
      });
    }
  }
});
