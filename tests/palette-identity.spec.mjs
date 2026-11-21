import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
const require = createRequire(import.meta.url),
  phase = process.env.CBB_PALETTE_PHASE ?? "after",
  root = "docs/visual/handoff-007-10-6c";
let f,
  editor,
  finalized,
  chat,
  records = [];
test.beforeAll(async () => {
  mkdirSync(`${root}/${phase}`, { recursive: true });
  f = await workflowFixture();
  sql(
    `update clinical.athletes set category='Adulto DEMO',team='Equipe DEMO' where id='${f.athlete}';`,
  );
  const rv = await f.prepare("prescription");
  const saved = await f.rpc("document_review_command", {
    action: "save",
    payload: { review_id: rv.id },
  });
  expect(saved.error).toBeUndefined();
  editor = rv.document_id;
  const signedReview = await f.prepare("surgical_order");
  const signed = await f.sign(signedReview);
  await f.status(signed.attempt.id);
  finalized = signedReview.document_id;
  const session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: f.athlete });
  chat = (
    await f.rpc("chat_document_proposal_create", {
      target: f.athlete,
      kind: "prescription",
      payload: rv.material.content,
      message_key: randomUUID(),
    })
  ).document;
  let state = await f.rpc("chat_document_proposal_review", {
    request_id: chat.requestId,
    expected_version: chat.version,
    expected_hash: chat.contentHash,
    idempotency_key: randomUUID(),
  });
  state = await f.rpc("chat_document_select_identity", {
    workspace_id: state.workspace.id,
    expected_revision: state.workspace.revision,
    identity_id: f.inventory.identities[0].id,
  });
  await f.rpc("chat_operation_prepare", {
    workspace_id: state.workspace.id,
    expected_revision: state.workspace.revision,
    idempotency_key: randomUUID(),
  });
  await f.rpc("conversation_save", {
    target: session,
    context_athlete: f.athlete,
    transcript: [
      {
        id: randomUUID(),
        role: "user",
        text: "Prepare uma prescrição fictícia para revisão.",
      },
      {
        id: randomUUID(),
        role: "assistant",
        text: "Confira a proposta e a autorização demonstrativa.",
        document: {
          requestId: chat.requestId,
          athleteId: f.athlete,
          kind: chat.kind,
          state: "proposal",
        },
      },
    ],
  });
  mkdirSync(`${root}/${phase}`, { recursive: true });
});
test.afterAll(async () => {
  try {
    writeFileSync(
      `${root}/${phase}/observations.json`,
      JSON.stringify(records, null, 2),
    );
  } finally {
    await f?.cleanup();
  }
});
async function login(page) {
  await page.clock.setFixedTime(new Date("2026-11-20T15:00:00Z"));
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(f.owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(f.owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
}
async function observe(page, name, width = 1440, capture = true) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const observation = await page.evaluate(async () => {
    const scope =
      document.querySelector("main") ??
      document.querySelector(".ia") ??
      document.body;
    const axe = await window.axe.run(scope, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    const style = (e) => {
      const s = getComputedStyle(e);
      return {
        tag: e.tagName,
        className: String(e.className),
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        padding: s.padding,
        margin: s.margin,
        borderWidth: s.borderWidth,
        borderRadius: s.borderRadius,
        display: s.display,
        color: s.color,
        background: s.backgroundColor,
      };
    };
    return {
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
      styles: [
        ...scope.querySelectorAll(
          "h1,h2,h3,button,input,select,textarea,.pill,.status-tag,.document-banner",
        ),
      ]
        .filter((e) => e.getClientRects().length)
        .map(style),
      sheet: document.querySelector(".document-sheet")
        ? [...document.querySelector(".document-sheet").querySelectorAll("*")]
            .filter((e) => e.getClientRects().length)
            .map(style)
        : [],
    };
  });
  records.push({ name, width, ...observation });
  if (phase === "after") {
    const baseline = JSON.parse(
      readFileSync(`${root}/before/observations.json`, "utf8"),
    ).find((r) => r.name === name && r.width === width);
    expect(baseline).toBeTruthy();
    expect(observation.violations).toEqual([]);
    const geometry = (rows) =>
      rows.map((row) => {
        const result = { ...row };
        delete result.color;
        delete result.background;
        return result;
      });
    expect(geometry(observation.styles)).toEqual(geometry(baseline.styles));
    if (observation.sheet.length)
      expect(observation.sheet).toEqual(baseline.sheet);
  }
  if (capture)
    await page.screenshot({ path: `${root}/${phase}/${name}-${width}.png` });
}
test("representative clinical and chat surfaces retain layout, template and authorization", async ({
  page,
}) => {
  await login(page);
  await observe(page, "home");
  await page.setViewportSize({ width: 390, height: 844 });
  await observe(page, "home", 390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/atletas");
  await observe(page, "directory");
  await page.goto(`/atletas/${f.athlete}`);
  await observe(page, "athlete");
  await page.setViewportSize({ width: 390, height: 844 });
  await observe(page, "athlete", 390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/atletas/${f.athlete}/documentos/${editor}`);
  await observe(page, "prescription-editor");
  await page
    .getByRole("button", { name: "Revisar e assinar", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Pré-visualização do rascunho" }),
  ).toBeVisible();
  await observe(page, "document-review");
  const unchanged = sql(
    `select canonical_bytes||'|'||content_hash from clinical.signature_snapshots where document_id='${finalized}'`,
  );
  await page.goto(`/atletas/${f.athlete}/documentos/${finalized}`);
  await expect(
    page.getByRole("article", { name: "Documento finalizado" }),
  ).toBeVisible();
  await observe(page, "finalized-document");
  expect(
    sql(
      `select canonical_bytes||'|'||content_hash from clinical.signature_snapshots where document_id='${finalized}'`,
    ),
  ).toBe(unchanged);
  await page.goto("/perfil");
  await observe(page, "professional-profile", 1440, false);
  await page.goto(`/?atleta=${f.athlete}`);
  await expect(
    page.getByRole("region", { name: "Resumo da autorização pendente" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Mensagem fictícia DEMO");
  await page
    .getByRole("heading", { name: "Confira esta autorização" })
    .scrollIntoViewIfNeeded();
  await observe(page, "intelligence");
  expect(
    sql(
      `select count(*) from clinical.chat_operation_challenges where professional_id='${f.owner.id}' and presented_at is not null`,
    ),
  ).toBe("0");
});

test("primary colours expose hover, active, focus and disabled states", async ({
  page,
}) => {
  test.skip(phase === "before", "States belong to the approved palette.");
  await login(page);
  const send = page.locator(".ia-send");
  await expect(send).toBeDisabled();
  await expect(send).toHaveCSS("background-color", "rgb(139, 152, 171)");
  await page.goto("/atletas");
  const action = page.locator(".directory-submit");
  await expect(action).toHaveCSS("background-color", "rgb(61, 112, 57)");
  await action.hover();
  await expect(action).toHaveCSS("background-color", "rgb(50, 93, 47)");
  await page.mouse.down();
  await expect(action).toHaveCSS("background-color", "rgb(41, 77, 38)");
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await action.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(action).toBeFocused();
  await expect(action).toHaveCSS("outline-color", "rgb(35, 102, 178)");
  await expect(action).toHaveCSS("outline-width", "3px");
  await page.goto(`/atletas/${f.athlete}/documentos/${editor}`);
  const pending = page.locator("button.button").first();
  await pending.evaluate((button) => {
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
  });
  await expect(pending).toHaveCSS("background-color", "rgb(41, 77, 38)");
  await expect(pending).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(pending).toHaveCSS("opacity", "0.8");
});
