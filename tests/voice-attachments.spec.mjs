import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, mockDictation, test } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { localSupabase } from "../scripts/local-supabase.mjs";
const admin = createClient(localSupabase.url, localSupabase.adminKey, {
  auth: { persistSession: false },
});
let userId = null;
const target = randomUUID();
const sql = (input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_prontuario-cbb",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, stdio: ["pipe", "pipe", "pipe"] },
  )
    .toString()
    .trim();
test.afterAll(async () => {
  if (!userId) return;
  const paths = JSON.parse(
    sql(
      `select coalesce(json_agg(storage_path),'[]') from clinical.attachment_uploads where attachment_id in(select id from clinical.attachments where uploaded_by='${userId}')`,
    ),
  );
  if (paths.length)
    await admin.storage.from("clinical-attachments").remove(paths);
  sql(
    `delete from clinical.attachment_uploads where attachment_id in(select id from clinical.attachments where uploaded_by='${userId}');delete from clinical.attachments where uploaded_by='${userId}';delete from clinical.conversation_sessions where professional_id='${userId}';delete from clinical.audit_events where actor_user_id='${userId}';delete from clinical.athletes where id='${target}';`,
  );
  await admin.auth.admin.deleteUser(userId);
});

test("voz consulta metadados reais e abre referência ordinal sem interpretar o arquivo", async ({
  page,
}) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  const email = `voice-attachment-${randomUUID()}@example.com`,
    password = randomUUID();
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (user.error) throw user.error;
  userId = user.data.user.id;
  await admin
    .from("profiles")
    .insert({
      id: userId,
      display_name: "Voz Anexos DEMO",
      profession: "Fisioterapia",
      can_read_audit: false,
    });
  sql(
    `insert into clinical.athletes(id,full_name,source) values('${target}','Atleta DEMO Voz Anexos','demo');insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_write) values('${target}','${userId}',true,true);`,
  );
  const dictation = await mockDictation(page);
  const requests = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/inteligencia")
      requests.push(r.postDataJSON());
  });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("ARQUIVO FICTICIO DE VOZ - SEM ANALISE");
  const bytes = Buffer.from(await pdf.save());
  const id = randomUUID();
  const upload = await page.request.post("/api/anexos", {
    headers: { Origin: "http://127.0.0.1:3101" },
    multipart: {
      athlete_id: target,
      id,
      title: "Laudo DEMO para voz",
      category: "imaging_report",
      file: {
        name: "voz-demo.pdf",
        mimeType: "application/pdf",
        buffer: bytes,
      },
    },
  });
  expect(upload.ok()).toBe(true);
  await page.goto(`/?atleta=${target}`);
  await dictation.dictate("Quais anexos estão disponíveis?");
  const cards = page.getByRole("region", { name: "Anexos da conversa" });
  await expect(
    cards.getByText("Laudo DEMO para voz", { exact: true }),
  ).toBeVisible();
  expect(requests[0].inputMode).toBe("voice");
  expect(JSON.stringify(requests[0])).not.toContain("ARQUIVO FICTICIO");
  await dictation.dictate("Abra o primeiro arquivo.");
  const viewer = page.getByRole("dialog", {
    name: "Laudo DEMO para voz",
    exact: true,
  });
  await expect(viewer.locator("canvas")).toBeVisible();
  expect(requests[1].attachmentRoster).toEqual([id]);
  expect(requests[1].contextAthleteId).toBe(target);
  expect(requests[1].inputMode).toBe("voice");
  mkdirSync("docs/visual/handoff-007-6", { recursive: true });
  await page.screenshot({
    path: "docs/visual/handoff-007-6/voice-viewer.png",
    fullPage: true,
  });
  expect(
    sql(
      `select count(*) from clinical.audit_events where actor_user_id='${userId}' and operation='attachment.list' and origin_channel='ai_voice' and execution_method='human_voice'`,
    ),
  ).not.toBe("0");
});
