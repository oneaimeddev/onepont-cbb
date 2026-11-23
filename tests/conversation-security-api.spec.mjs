import { test, expect } from "./fixtures.mjs";
import {
  workflowFixture,
  workflowSql as sql,
} from "./helpers/workflow-fixtures.mjs";
let f;
test.beforeAll(async () => {
  f = await workflowFixture();
});
test.afterAll(async () => {
  if (f) {
    sql(
      `delete from clinical.conversation_sessions where professional_id in('${f.owner.id}','${f.other.id}')`,
    );
    await f.cleanup();
  }
});
test("histórico revogado não chega ao modelo nem autoriza iniciar voz", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(f.owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(f.owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  const session = (await f.rpc("conversation_start", {})).session.id;
  const secret = "Dado fictício restrito CORTE A";
  await f.rpc("conversation_save", {
    target: session,
    context_athlete: f.athlete,
    transcript: [
      {
        id: "sensitive",
        role: "assistant",
        text: secret,
        athletes: [],
        navigation: null,
        search: null,
      },
    ],
  });
  sql(
    `update clinical.athlete_access set can_read_records=false where athlete_id='${f.athlete}' and professional_id='${f.owner.id}'`,
  );
  const origin = "http://127.0.0.1:3100";
  const response = await page.request.post("/api/inteligencia", {
    headers: { Origin: origin },
    data: {
      messages: [
        { role: "assistant", content: secret },
        { role: "user", content: "Resuma a conversa" },
      ],
    },
  });
  expect(response.status()).toBe(409);
  expect(await response.text()).not.toContain(secret);
  const recent = await page.request.post("/api/inteligencia/sessao", {
    headers: { Origin: origin },
    data: { action: "recent" },
  });
  expect(recent.status()).toBe(200);
  expect(await recent.text()).not.toContain(secret);
});
