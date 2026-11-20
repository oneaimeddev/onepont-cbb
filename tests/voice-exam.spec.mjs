import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const documentId = randomUUID();
const requestId = randomUUID();
const shots = "docs/visual/handoff-007-8";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",") || "null";
  sql(`delete from clinical.document_revisions where document_id = '${documentId}';
    delete from clinical.documents where athlete_id = '${athlete}';
    delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id = '${athlete}';
    delete from clinical.medical_authors where professional_id in (${ids});
    delete from clinical.athlete_access where athlete_id = '${athlete}';
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("a fala abre a solicitação original no cartão", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `voz-exame-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: "QA Voz Exames", profession: "Medicina" });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Atleta DEMO Exame', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values('${athlete}', '${data.user.id}', true);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by)
    values('${data.user.id}', 'CRM fictício', true, '${data.user.id}');`);
  const itemId = randomUUID();
  const saved = await client.rpc("document_save", {
    target: athlete,
    document_id: documentId,
    expected_version: 0,
    kind: "exam_request",
    payload: {
      occurred_at: "",
      indication: "Dor fictícia no joelho.",
      justification: "Justificativa fictícia registrada.",
      diagnosis: "",
      priority: "",
      additional: "",
      items: [{ id: itemId, name: "Hemograma fictício", exam_type: "laboratory", region: "", laterality: "", technical_details: "", notes: "" }],
    },
    intent: "save",
  });
  expect(saved.data.status).toBe("draft");

  await page.route("**/api/inteligencia", async (route) => {
    const body = route.request().postDataJSON();
    const phrase = body.messages.at(-1).content;
    const proposal = phrase.startsWith("Prepare");
    const payload = proposal
      ? {
        text: "A proposta está no cartão. Ela ainda não foi salva.",
        athletes: [],
        navigation: null,
        search: null,
        draft: null,
        document: {
          state: "proposal",
          requestId,
          athleteId: athlete,
          athleteName: "Atleta DEMO Exame",
          professionalName: "QA Voz Exames",
          credentialLabel: "CRM fictício",
          kind: "exam_request",
          title: "Ressonância magnética",
          content: {
            occurred_at: "",
            indication: "",
            justification: "",
            diagnosis: "",
            priority: "",
            additional: "",
            items: [{
              id: requestId,
              name: "Ressonância magnética",
              exam_type: "imaging",
              region: "joelho",
              laterality: "right",
              technical_details: "",
              notes: "",
            }],
          },
          missing: ["Solicitação: Justificativa"],
          documentId: null,
          error: null,
          contentHash: null,
          version: 1,
        },
        readings: null,
        context: null,
        contextCleared: false,
      }
      : {
        text: "O documento original está no cartão. Ele não foi emitido nem assinado.",
        athletes: [],
        navigation: null,
        search: null,
        draft: null,
        document: null,
        readings: {
          source: "document",
          athleteId: athlete,
          total: 1,
          page: 1,
          pageSize: 1,
          kind: "exam_request",
          status: "draft",
          items: [{ id: documentId, athleteId: athlete, kind: "exam_request", open: true }],
        },
        context: null,
        contextCleared: false,
      };
    expect(JSON.stringify(payload)).not.toContain("Hemograma");
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
    });
  });

  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/?atleta=${athlete}`);
  await expect(page.getByRole("heading", { name: "Atleta DEMO Exame" })).toBeVisible();
  const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await field.fill("Prepare uma solicitação de ressonância magnética de joelho direito.");
  await field.press("Enter");
  const proposal = page.getByRole("region", { name: "Proposta de solicitação de exames" });
  await expect(proposal).toBeVisible();
  await expect(proposal.getByText("Ressonância magnética")).toBeVisible();
  await expect(proposal.getByText("Rascunho — não assinado e não emitido.")).toBeVisible();
  await proposal.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/proposta-1440x900.png` });

  await field.fill("Abra a última solicitação.");
  await field.press("Enter");
  await expect(page.getByRole("heading", { name: "Hemograma fictício" })).toBeVisible();
  await expect(page.getByText("Justificativa fictícia registrada.")).toBeVisible();
  await expect(page.getByText("Conteúdo recuperado do registro. Não foi reescrito pelo assistente.")).toBeVisible();
  await page.getByText("Justificativa fictícia registrada.").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/leitura-1440x900.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${shots}/leitura-390x844.png` });
});
