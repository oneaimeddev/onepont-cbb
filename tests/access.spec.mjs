import { test, expect } from "./fixtures.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { localSupabase } from "../scripts/local-supabase.mjs";

const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const users = [];
let athlete = randomUUID();

function sql(input) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" });
}

async function user(displayName, profession, canManage) {
  const email = `qa-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  users.push(id);
  const profile = await admin.from("profiles").insert({
    id, display_name: displayName, profession, can_read_audit: canManage, can_manage_access: canManage,
  });
  if (profile.error) throw profile.error;
  const client = createClient(localSupabase.url, localSupabase.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return { id, email, password, client };
}

function save(client, recordId, version, title, body, restricted, finalize = false) {
  return client.rpc("clinical_save", {
    target: athlete, request_id: randomUUID(), record_id: recordId, expected_version: version,
    entry_title: title, entry_body: body, restricted, finalize,
  });
}

test.afterAll(async () => {
  sql(`delete from clinical.record_revisions where record_id in (select id from clinical.records where athlete_id='${athlete}');
    delete from clinical.records where athlete_id='${athlete}';
    delete from clinical.encounters where athlete_id='${athlete}';
    delete from clinical.athlete_access where athlete_id='${athlete}';
    delete from clinical.athletes where id='${athlete}';`);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("dois profissionais, concessão, revogação e registro restrito", async ({ page }) => {
  const physioName = `QA Fisioterapeuta ${randomUUID().slice(0, 8)}`;
  const adminName = `QA Administrativo ${randomUUID().slice(0, 8)}`;
  const doctor = await user("QA Médico acesso", "Medicina esportiva", false);
  const physio = await user(physioName, "Fisioterapia", false);
  const manager = await user(adminName, "Administração", true);
  sql(`insert into clinical.athlete_creators(professional_id, can_write_created, can_finalize_created) values('${doctor.id}', true, true);`);
  const created = await doctor.client.rpc("athlete_create", {
    creation_id: randomUUID(), name: "Atleta QA acesso", social: "", birth: null, club: "Clube QA", sport_category: "Sub-18",
  });
  athlete = created.data;
  expect(athlete).toMatch(/^[0-9a-f-]{36}$/);

  expect((await physio.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" })).data).toBeNull();
  expect((await physio.client.rpc("athlete_directory", { filters: { q: "Atleta QA acesso" } })).data.athletes.some((item) => item.id === athlete)).toBe(false);
  expect((await physio.client.rpc("athlete_access_grant", { target: athlete, professional: physio.id })).data.error).toBe("denied");
  expect((await manager.client.rpc("athlete_access_grant", { target: athlete, professional: manager.id })).data.error).toBe("self");
  expect((await manager.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" })).data).toBeNull();

  const shared = await save(doctor.client, null, null, "Evolução compartilhada QA", "Conteúdo compartilhado sintético.", false);
  const secret = await save(doctor.client, null, null, "Nota restrita QA", "Conteúdo restrito sintético.", true);
  expect(shared.data.id).toBeTruthy();
  expect(secret.data.id).toBeTruthy();
  const widened = await save(doctor.client, secret.data.id, secret.data.version, "Nota restrita QA", "Conteúdo restrito sintético.", false);
  expect(widened.data.version).toBe(secret.data.version + 1);
  const authorView = await doctor.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" });
  expect(authorView.data.records.find((item) => item.id === secret.data.id).is_restricted).toBe(true);
  const finalized = await save(doctor.client, shared.data.id, shared.data.version, "Evolução compartilhada QA", "Conteúdo compartilhado sintético.", false, true);
  expect(finalized.data.version).toBe(shared.data.version + 1);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(doctor.email);
  await page.getByLabel("Senha", { exact: true }).fill(doctor.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto(`/atletas/${athlete}/evolucao?registro=${secret.data.id}`);
  await expect(page.getByText("Este registro permanece restrito ao autor.")).toBeVisible();
  await expect(page.getByLabel("Restringir o registro ao autor")).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(manager.email);
  await page.getByLabel("Senha", { exact: true }).fill(manager.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("/");
  await page.goto("/atletas");
  await page.getByLabel("Identificador do atleta").fill(athlete);
  await page.getByRole("button", { name: "Abrir vínculos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profissionais vinculados" })).toBeVisible();
  await expect(page.getByText("Conteúdo compartilhado sintético")).toHaveCount(0);
  await page.getByLabel("Profissional").fill(physioName);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: "Conceder acesso", exact: true }).click();
  await expect(page.getByText("Acesso concedido.", { exact: true })).toBeVisible();
  await expect(page.getByText(`Concedido por ${adminName}`)).toBeVisible();

  const granted = await manager.client.rpc("athlete_access_manage", { target: athlete });
  const link = granted.data.links.find((item) => item.professional_id === physio.id);
  expect(link).toMatchObject({ can_read_records: true, can_edit: false, can_write: true, can_finalize: true, granted_by_name: adminName });
  expect(granted.data.links.some((item) => item.professional_id === manager.id)).toBe(false);
  expect((await manager.client.rpc("athlete_access_grant", { target: athlete, professional: physio.id })).data.status).toBe("exists");

  const follow = await physio.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" });
  expect(follow.data.records.map((item) => item.title)).toContain("Evolução compartilhada QA");
  expect(follow.data.records.map((item) => item.title)).not.toContain("Nota restrita QA");
  expect(JSON.stringify(follow.data)).not.toContain("Conteúdo restrito sintético");
  expect((await physio.client.rpc("clinical_save", {
    target: athlete, request_id: randomUUID(), record_id: secret.data.id, expected_version: widened.data.version,
    entry_title: "Nota restrita QA", entry_body: "Tentativa indevida.", restricted: false, finalize: false,
  })).data.error).toBe("denied");

  await page.getByRole("listitem").filter({ hasText: physioName }).getByRole("button", { name: "Revogar", exact: true }).click();
  await expect(page.getByText("Acesso revogado.", { exact: true })).toBeVisible();
  expect((await physio.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" })).data).toBeNull();
  expect((await save(physio.client, null, null, "Depois da revogação", "Não deve gravar.", true)).data.error).toBe("denied");

  const preserved = await doctor.client.rpc("athlete_workspace", { target: athlete, view_name: "timeline" });
  const sharedRow = preserved.data.records.find((item) => item.id === shared.data.id);
  expect(sharedRow.status).toBe("finalized");
  expect(sharedRow.body).toContain("compartilhado");
  expect(preserved.data.records.find((item) => item.id === secret.data.id).is_restricted).toBe(true);

  const audit = await manager.client.rpc("athlete_audit");
  const events = audit.data.filter((event) => event.operation.startsWith("athlete_access."));
  expect(events.some((event) => event.operation === "athlete_access.grant" && event.outcome === "success" && event.resource_id === physio.id && event.actor_user_id === manager.id)).toBe(true);
  expect(events.some((event) => event.operation === "athlete_access.revoke" && event.outcome === "success" && event.resource_id === physio.id)).toBe(true);
  expect(events.some((event) => event.operation === "athlete_access.grant" && event.outcome === "denied" && event.actor_user_id === physio.id)).toBe(true);
  expect(events.some((event) => event.operation === "athlete_access.grant" && event.outcome === "denied" && event.actor_user_id === manager.id)).toBe(true);
  expect(JSON.stringify(audit.data)).not.toContain("Conteúdo restrito sintético");
});
