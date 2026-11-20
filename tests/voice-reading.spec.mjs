import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
const athlete = randomUUID();
const prescription = randomUUID();
const other = randomUUID();
const shots = "docs/visual/handoff-007-5-1d";

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
}

test.afterAll(async () => {
  const ids = users.map((id) => `'${id}'`).join(",") || "null";
  sql(`delete from clinical.document_revisions where document_id in (select id from clinical.documents where athlete_id = '${athlete}');
    delete from clinical.documents where athlete_id = '${athlete}';
    delete from clinical.conversation_messages where session_id in (select id from clinical.conversation_sessions where professional_id in (${ids}));
    delete from clinical.conversation_sessions where professional_id in (${ids});
    delete from clinical.audit_events where actor_user_id in (${ids}) or athlete_id = '${athlete}';
    delete from clinical.medical_authors where professional_id in (${ids});
    delete from clinical.athlete_access where athlete_id = '${athlete}';
    delete from clinical.athletes where id = '${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("a fala envia a lista desta conversa e o cartão relê o original", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `voz-leitura-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const profile = await admin.from("profiles").insert({ id: data.user.id, display_name: "QA Voz Leitura", profession: "Medicina", can_read_audit: false });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  sql(`insert into clinical.athletes(id, full_name, source) values('${athlete}', 'Atleta DEMO Voz', 'demo');
    insert into clinical.athlete_access(athlete_id, professional_id, can_read_records) values('${athlete}', '${data.user.id}', true);
    insert into clinical.medical_authors(professional_id, credential_label, enabled, granted_by)
    values('${data.user.id}', 'CRM fictício', true, '${data.user.id}');`);
  const saved = await client.rpc("document_save", {
    target: athlete,
    document_id: prescription,
    expected_version: 0,
    kind: "prescription",
    payload: {
      notes: "",
      items: [{
        id: randomUUID(), name: "Dipirona", presentation: "", dose: "500", dose_unit: "mg",
        route: "", schedule: "a cada oito horas", duration: "", quantity: "", instructions: "",
      }],
    },
    intent: "save",
  });
  expect(saved.data.status).toBe("draft");

  const bodies = [];
  await page.route("**/api/inteligencia", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const payload = {
      text: "O documento original está no cartão. Ele não foi emitido nem assinado.",
      athletes: [],
      navigation: null,
      search: null,
      draft: null,
      document: null,
      readings: body.messages.at(-1).content === "Abra a última prescrição."
        ? {
          source: "document",
          athleteId: athlete,
          total: 1,
          page: 1,
          pageSize: 1,
          kind: "prescription",
          status: "draft",
          items: [{ id: prescription, athleteId: athlete, kind: "prescription", open: true }],
        }
        : null,
      context: null,
      contextCleared: false,
    };
    expect(JSON.stringify(payload)).not.toContain("500");
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
    });
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?atleta=${athlete}`);
  await expect(page.getByRole("heading", { name: "Atleta DEMO Voz" })).toBeVisible();
  await page.evaluate(({ athleteId, documentId, spareId }) => {
    sessionStorage.setItem("cbb-intelligence-turns:v1", JSON.stringify({
      v: 1,
      turns: [
        {
          id: "lista",
          role: "assistant",
          text: "Encontrei 1 registro autorizado. O cartão mostra o original.",
          athletes: [],
          navigation: null,
          search: null,
          draft: null,
          document: null,
          readings: {
            source: "document",
            athleteId,
            total: 1,
            page: 1,
            pageSize: 5,
            kind: "prescription",
            status: "draft",
            items: [{ id: documentId, athleteId, kind: "prescription", open: false }],
          },
        },
        {
          id: "salvo",
          role: "assistant",
          text: "Rascunho salvo.",
          athletes: [],
          navigation: null,
          search: null,
          draft: null,
          document: {
            state: "saved",
            requestId: spareId,
            athleteId,
            athleteName: "Atleta DEMO Voz",
            professionalName: "QA Voz Leitura",
            credentialLabel: null,
            kind: "prescription",
            title: "Prescrição",
            content: null,
            missing: [],
            documentId,
            error: null,
            contentHash: null,
            version: 1,
          },
        },
      ],
    }));
    window.dispatchEvent(new Event("cbb-intelligence-adopt"));
  }, { athleteId: athlete, documentId: prescription, spareId: other });

  const field = page.getByRole("textbox", { name: "Mensagem", exact: true });
  await field.fill("Abra a última prescrição.");
  await field.press("Enter");
  await expect(page.getByText("500 mg")).toBeVisible();
  await page.getByText("500 mg").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Atleta DEMO Voz" })).toBeVisible();
  expect(bodies[0].contextAthleteId).toBe(athlete);
  expect(bodies[0].documentRoster).toEqual([prescription]);
  expect(bodies[0].createdDocumentIds).toEqual([prescription]);
  expect(JSON.stringify(bodies[0])).not.toContain("500 mg");
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/voz.png` });

  await page.getByRole("button", { name: "Nova conversa" }).click();
  await expect(page.getByRole("heading", { name: "Atleta DEMO Voz" })).toHaveCount(0);
  await expect(page.getByText("500 mg")).toHaveCount(0);
  await field.fill("Quais prescrições ele possui?");
  await field.press("Enter");
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1].documentRoster).toEqual([]);
  expect(bodies[1].createdDocumentIds).toEqual([]);
  expect(bodies[1].contextAthleteId ?? null).toBeNull();
});
