import { test, expect, stubMicrophone } from "./fixtures.mjs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
const require = createRequire(import.meta.url);
let f;
const shots = "docs/visual/handoff-007-10-6b-3";
test.beforeEach(async ({ page }) => {
  f = await workflowFixture();
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(f.owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(f.owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
});
test.afterEach(async () => {
  await f?.cleanup();
});
async function seed(kind, athlete = f.athlete) {
  const session = (await f.rpc("conversation_start", {})).session.id;
  await f.rpc("conversation_set_context", { context_athlete: athlete });
  const rv = await f.prepare(kind, { athlete_id: athlete });
  const doc = (
    await f.rpc("chat_document_proposal_create", {
      target: athlete,
      kind,
      payload: rv.material.content,
      message_key: randomUUID(),
    })
  ).document;
  await f.rpc("conversation_save", {
    target: session,
    context_athlete: athlete,
    transcript: [
      {
        id: randomUUID(),
        role: "assistant",
        text: "Proposta fictícia DEMO para revisão",
        document: {
          requestId: doc.requestId,
          athleteId: doc.athleteId,
          kind: doc.kind,
          state: "proposal",
        },
      },
    ],
  });
  return doc;
}
async function say(page, text) {
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/inteligencia"),
  );
  await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  expect((await response).status()).toBe(200);
}
for (const kind of ["prescription", "exam_request", "surgical_order"])
  test(`UI ${kind}: summary is rendered before attestation, finalization and reload recover in chat`, async ({
    page,
  }) => {
    const doc = await seed(kind);
    await page.goto(`/?atleta=${f.athlete}`);
    const card = page.locator(".ia-draft");
    await expect(card).toHaveCount(1);
    await card
      .getByRole("button", {
        name: `Usar ${f.inventory.identities[0].label}`,
        exact: true,
      })
      .click();
    await expect(
      card.getByRole("region", { name: "Resumo da autorização pendente" }),
    ).toBeVisible();
    expect(
      sql(
        `select count(*) from clinical.chat_operation_challenges where professional_id='${f.owner.id}' and presented_at is not null`,
      ),
    ).toBe("0");
    await expect(
      card.getByRole("article", { name: "Pré-visualização do rascunho" }),
    ).toBeVisible();
    const acknowledge = card.getByRole("button", {
      name: "Li a versão e o resumo",
      exact: true,
    });
    await acknowledge.focus();
    await expect(acknowledge).toBeFocused();
    await acknowledge.press("Enter");
    await expect(
      card.getByRole("button", {
        name: "Enviar confirmação de assinatura simulada",
        exact: true,
      }),
    ).toBeEnabled();
    if (kind === "prescription") {
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const result = await window.axe.run(
          document.querySelector(".ia-draft"),
          {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          },
        );
        return result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        }));
      });
      expect(violations).toEqual([]);
      mkdirSync(shots, { recursive: true });
      await card
        .getByRole("heading", { name: "Confira esta autorização" })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${shots}/authorization-chat-desktop.png`,
      });
    }
    await card
      .getByRole("button", {
        name: "Enviar confirmação de assinatura simulada",
        exact: true,
      })
      .click();
    await expect(
      card.getByText(
        "Assinatura simulada. Versão finalizada e somente leitura.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      card.getByRole("article", { name: "Documento finalizado" }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Editar", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      card.getByRole("article", { name: "Documento finalizado" }),
    ).toBeVisible();
    await card
      .getByRole("button", {
        name: "Histórico de assinatura e entrega",
        exact: true,
      })
      .click();
    await expect(
      card.getByRole("list", { name: "Histórico de assinatura e entrega" }),
    ).toBeVisible();
    expect(
      sql(
        `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}'`,
      ),
    ).toBe("1");
    if (kind === "prescription") {
      await card
        .getByRole("button", { name: "Preparar documento derivado" })
        .click();
      await expect(
        page.getByText(/Para criar outro rascunho vinculado/),
      ).toBeVisible();
      await say(page, "Confirmo criar um documento derivado");
      await expect(card).toHaveCount(2);
      expect(
        sql(
          `select count(*) from clinical.document_derivations where professional_id='${f.owner.id}'`,
        ),
      ).toBe("1");
    }
    expect(doc.requestId).toBeTruthy();
  });
test("mobile: delivery summary, authorized recipient, polling and reload retain simulated outcome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed("exam_request", f.minor);
  await page.goto(`/?atleta=${f.minor}`);
  const card = page.locator(".ia-draft");
  await card
    .getByRole("button", {
      name: `Usar ${f.inventory.identities[0].label}`,
      exact: true,
    })
    .click();
  await expect(
    card.getByRole("button", { name: "Li a versão e o resumo" }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Preparar assinatura e entrega" })
    .click();
  const summary = card.getByRole("region", {
    name: "Resumo da autorização pendente",
  });
  await expect(summary).toContainText("Responsável Ciclo DEMO");
  await expect(summary).toContainText("Autorizar entrega simulada");
  await expect(summary).not.toContainText("11988880003");
  await card.getByRole("button", { name: "Li a versão e o resumo" }).click();
  await expect(
    card.getByRole("button", {
      name: "Enviar confirmação de assinatura simulada",
    }),
  ).toBeEnabled();
  mkdirSync(shots, { recursive: true });
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/authorization-chat-mobile.png` });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await card
    .getByRole("button", { name: "Enviar confirmação de assinatura simulada" })
    .click();
  await expect(
    card.getByText("Entrega simulada concluída", { exact: true }),
  ).toBeVisible({ timeout: 25000 });
  await page.reload();
  await expect(
    card.getByText("Entrega simulada concluída", { exact: true }),
  ).toBeVisible();
  await card
    .getByText("Entrega simulada concluída", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/delivery-chat-mobile.png` });
});
test("retoma o envio depois de resolver um destinatário ausente e exige nova confirmação", async ({ page }) => {
  await seed("exam_request", f.absent);
  await page.goto(`/?atleta=${f.absent}`);

  await say(page, "Quero finalizar esse documento e preparar o envio.");
  const blocked = page.getByText(/Ainda falta um destinatário autorizado/);
  await expect(blocked).toHaveCount(1);
  await say(page, "Certo, vamos resolver isso.");
  await expect(blocked).toHaveCount(2);
  await page.getByRole("link", { name: "Abrir cadastro do atleta" }).last().click();
  await page.waitForURL(`**/atletas/${f.absent}?aba=cadastro`);

  sql(`insert into clinical.athlete_contacts(athlete_id, phone) values('${f.absent}', '11999990009')`);
  await page.goBack();
  await expect(blocked).toHaveCount(2);
  await say(page, "Retomar a preparação do envio.");
  await expect(page.getByText(/Escolha a identidade antes de preparar a assinatura/)).toBeVisible();
  await say(page, `Use a identidade ${f.inventory.identities[0].label}`);
  await expect(page.getByText(/Preparei o resumo de autorização no cartão/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumo da autorização pendente" })).toContainText("Autorizar entrega simulada");
  expect(sql(`select count(*) from clinical.chat_operation_authorizations where professional_id = '${f.owner.id}'`)).toBe("0");
});

test("voice transcription reaches same edit/review authority; high impact stays pending for text", async ({
  page,
}) => {
  await stubMicrophone(page);
  await seed("prescription");
  await page.goto(`/?atleta=${f.athlete}`);
  let socket;
  await page.route("**/api/inteligencia/voz", (route) =>
    route.fulfill({
      json: {
        token: "auth_tokens/offline-journey",
        url: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    }),
  );
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      if (JSON.parse(String(raw)).setup)
        ws.send(JSON.stringify({ setupComplete: {} }));
    });
  });
  const composer = page.getByRole("form", { name: "Composição de mensagem" });
  await composer
    .getByRole("button", { name: "Iniciar conversa por voz" })
    .click();
  await expect(
    page.getByRole("region", { name: "Conversa por voz" }).getByRole("status"),
  ).toContainText("Ouvindo");
  const spoken = async (text) => {
    const result = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/inteligencia") &&
        r.request().postDataJSON()?.inputMode === "voice",
    );
    socket.send(
      JSON.stringify({ serverContent: { inputTranscription: { text } } }),
    );
    expect((await result).status()).toBe(200);
  };
  await spoken(
    "Altere a posologia do primeiro medicamento para uma vez ao dia DEMO",
  );
  const card = page.locator(".ia-draft");
  await expect(
    card.getByText("Instruções: uma vez ao dia DEMO", { exact: true }),
  ).toBeVisible();
  await spoken("Revise a prescrição");
  await expect(
    card.getByRole("article", { name: "Pré-visualização do rascunho" }),
  ).toBeVisible();
  await spoken(`Use a identidade ${f.inventory.identities[0].label}`);
  await expect(
    card.getByRole("button", { name: "Li a versão e o resumo" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Li a versão e o resumo" }).click();
  await expect(
    card.getByRole("button", {
      name: "Enviar confirmação de assinatura simulada",
    }),
  ).toBeEnabled();
  await spoken("Confirmo esta versão e a assinatura");
  await expect(
    page.getByText(/Para autorizar assinatura, entrega, reenvio ou derivação/),
  ).toBeVisible();
  expect(
    sql(
      `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}'`,
    ),
  ).toBe("0");
  mkdirSync(shots, { recursive: true });
  await page
    .getByText(/Para autorizar assinatura, entrega, reenvio ou derivação/)
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/voice-confirmation-fallback.png` });
});

test("a delayed pre-save inspection cannot turn a saved draft back into a proposal", async ({
  page,
}) => {
  await seed("prescription");
  let release,
    captured = false;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let first = true;
  await page.route("**/api/inteligencia/operacoes", async (route) => {
    if (first && route.request().postDataJSON().action === "inspect") {
      first = false;
      const response = await route.fetch();
      captured = true;
      await blocked;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.goto(`/?atleta=${f.athlete}`);
  const card = page.locator(".ia-draft");
  await expect.poll(() => captured).toBe(true);
  await card
    .getByRole("button", { name: "Confirmar e salvar", exact: true })
    .click();
  await expect(card.getByText("Rascunho salvo", { exact: true })).toBeVisible();
  release();
  await expect(
    card.getByRole("button", { name: "Usar Identidade DEMO A", exact: true }),
  ).toBeVisible();
  await expect(card.getByText("Rascunho salvo", { exact: true })).toBeVisible();
  expect(
    sql(
      `select count(*) from clinical.documents where author_id='${f.owner.id}'`,
    ),
  ).toBe("1");
});

test("cancelled signature requires a new review and confirmation before another attempt", async ({
  page,
}) => {
  const doc = await seed("prescription");
  let state = await f.rpc("chat_document_proposal_review", {
    request_id: doc.requestId,
    expected_version: doc.version,
    expected_hash: doc.contentHash,
    idempotency_key: randomUUID(),
  });
  state = await f.rpc("chat_document_select_identity", {
    workspace_id: state.workspace.id,
    expected_revision: state.workspace.revision,
    identity_id: f.inventory.identities[0].id,
  });
  const c = (
    await f.rpc("chat_operation_prepare", {
      workspace_id: state.workspace.id,
      expected_revision: state.workspace.revision,
      idempotency_key: randomUUID(),
    })
  ).challenge;
  const origin = new URL(page.url()).origin;
  const op = async (data) => {
    const response = await page.request.post("/api/inteligencia/operacoes", {
      headers: { Origin: origin },
      data,
    });
    expect(response.status()).toBe(200);
    return response.json();
  };
  await op({
    action: "present",
    sessionId: state.workspace.sessionId,
    challengeId: c.id,
    nonce: c.nonce,
    summaryHash: c.summaryHash,
  });
  const first = await op({
    action: "confirm",
    sessionId: state.workspace.sessionId,
    challengeId: c.id,
    nonce: c.nonce,
    messageId: randomUUID(),
    message: "Confirmo esta versão e a assinatura",
    inputMode: "text",
  });
  const cancelled = await f.rpc("signing_demo_command", {
    action: "cancel",
    payload: { attempt_id: first.execution.attempt.id },
  });
  expect(cancelled.error, JSON.stringify(cancelled)).toBeUndefined();
  await page.goto(`/?atleta=${f.athlete}`);
  const card = page.locator(".ia-draft");
  await expect(card).toContainText("Assinatura simulada cancelada");
  expect(
    sql(
      `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}'`,
    ),
  ).toBe("1");
  await card
    .getByRole("button", {
      name: `Usar ${f.inventory.identities[0].label}`,
      exact: true,
    })
    .click();
  await expect(
    card.getByRole("button", { name: "Li a versão e o resumo" }),
  ).toBeVisible();
  expect(
    sql(
      `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}'`,
    ),
  ).toBe("1");
  await card.getByRole("button", { name: "Li a versão e o resumo" }).click();
  await card
    .getByRole("button", { name: "Enviar confirmação de assinatura simulada" })
    .click();
  await expect(
    card.getByRole("article", { name: "Documento finalizado" }),
  ).toBeVisible({ timeout: 20000 });
  expect(
    sql(
      `select count(*) from clinical.signature_attempts where professional_id='${f.owner.id}'`,
    ),
  ).toBe("2");
  expect(
    sql(
      `select count(*) from clinical.document_finalizations where professional_id='${f.owner.id}'`,
    ),
  ).toBe("1");
});
