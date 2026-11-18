import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { localSupabase } from "../scripts/local-supabase.mjs";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(localSupabase.url, localSupabase.adminKey, opts);
const users = [];
const athleteIds = [];
const shots = "docs/visual/handoff-007-6";
function sql(input) {
  return execFileSync(
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
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
    ],
    { input, stdio: ["pipe", "pipe", "pipe"] },
  )
    .toString()
    .trim();
}
async function rpc(client, name, params = {}) {
  const result = await client.rpc(name, params);
  expect(result.error).toBeNull();
  return result.data;
}
async function account() {
  const email = `attachment-${randomUUID()}@example.com`,
    password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  users.push(id);
  const p = await admin.from("profiles").insert({
    id,
    display_name: "Profissional Anexos DEMO",
    profession: "Medicina",
    can_read_audit: false,
  });
  if (p.error) throw p.error;
  const client = createClient(
    localSupabase.url,
    localSupabase.publishableKey,
    opts,
  );
  await client.auth.signInWithPassword({ email, password });
  return { id, email, password, client };
}
function athlete(user, name = "Atleta DEMO Anexos") {
  const id = randomUUID();
  athleteIds.push(id);
  sql(
    `insert into clinical.athletes(id,full_name,source) values('${id}','${name}','demo');insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_write,can_edit) values('${id}','${user.id}',true,true,true);`,
  );
  return id;
}
async function pdfBytes() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([600, 500]);
  page.drawText("LAUDO FICTICIO - DEMONSTRACAO CBB", {
    x: 40,
    y: 440,
    size: 18,
    font,
  });
  page.drawText("Arquivo sintetico para testar anexos. Sem dados reais.", {
    x: 40,
    y: 400,
    size: 12,
    font,
  });
  return Buffer.from(await pdf.save());
}
async function login(page, user) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
async function upload(
  request,
  target,
  bytes,
  name = "laudo-demo.pdf",
  extra = {},
) {
  return request.post("/api/anexos", {
    headers: { Origin: "http://127.0.0.1:3100" },
    multipart: {
      athlete_id: target,
      id: randomUUID(),
      title: "Laudo fictício DEMO",
      category: "imaging_report",
      file: {
        name,
        mimeType: name.endsWith("pdf") ? "application/pdf" : "image/png",
        buffer: bytes,
      },
      ...extra,
    },
  });
}
async function fillUpload(page, bytes, name = "laudo-demo.pdf") {
  const dialog = page.getByRole("dialog", {
    name: "Adicionar anexo",
    exact: true,
  });
  await dialog.getByLabel("Arquivo PDF ou imagem").setInputFiles({
    name,
    mimeType: name.endsWith(".pdf") ? "application/pdf" : "image/png",
    buffer: bytes,
  });
  await dialog
    .getByLabel("Título", { exact: true })
    .fill("Laudo de imagem DEMO");
  await dialog
    .getByLabel("Categoria", { exact: true })
    .selectOption("imaging_report");
  await dialog.getByLabel("Data clínica (opcional)").fill("2026-11-10");
  await dialog.getByLabel("Confirmo o atleta destinatário").check();
  return dialog;
}

test.afterAll(async () => {
  if (!users.length) return;
  const ids = users.map((id) => `'${id}'`).join(",");
  const paths = sql(
    `select coalesce(json_agg(u.storage_path),'[]') from clinical.attachment_uploads u join clinical.attachments a on a.id=u.attachment_id where a.uploaded_by in (${ids});`,
  );
  const objects = JSON.parse(paths);
  if (objects.length) {
    const result = await admin.storage
      .from("clinical-attachments")
      .remove(objects);
    if (result.error) throw result.error;
  }
  sql(
    `delete from clinical.attachment_uploads where attachment_id in(select id from clinical.attachments where uploaded_by in(${ids}));delete from clinical.attachments where uploaded_by in(${ids});delete from clinical.document_proposals where actor_id in(${ids});delete from clinical.conversation_sessions where professional_id in(${ids});delete from clinical.documents where author_id in(${ids});delete from clinical.audit_events where actor_user_id in(${ids});delete from clinical.records where author_id in(${ids});delete from clinical.athletes where id in(${athleteIds.map((id) => `'${id}'`).join(",") || "null"});`,
  );
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

test("upload privado, idempotência, tipo real, limites, edição e retirada lógica", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const owner = await account();
  const target = athlete(owner);
  const bytes = await pdfBytes();
  await login(page, owner);
  expect((await request.post("/api/anexos", { multipart: {} })).status()).toBe(
    403,
  );
  const id = randomUUID();
  const saved = await upload(page.request, target, bytes, "laudo-demo.pdf", {
    id,
  });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ id, status: "ready" });
  const repeated = await upload(page.request, target, bytes, "laudo-demo.pdf", {
    id,
  });
  expect(repeated.status()).toBe(200);
  expect(
    sql(
      `select count(*) from clinical.attachments where id='${id}' and status='ready'`,
    ),
  ).toBe("1");
  const newAttempt = await upload(
    page.request,
    target,
    bytes,
    "laudo-demo.pdf",
    { title: "Outro título não deve sobrescrever" },
  );
  expect(await newAttempt.json()).toMatchObject({
    id,
    status: "ready",
    reused: true,
  });
  const list = await rpc(owner.client, "attachment_list", { target });
  expect(list.items).toHaveLength(1);
  expect(JSON.stringify(list)).not.toContain("storage_path");
  expect(list.items[0].visibility).toBe("author_only");
  const download = await page.request.get(`/api/anexos/${id}?download=1`);
  expect(download.status()).toBe(200);
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(Buffer.compare(await download.body(), bytes)).toBe(0);
  expect(
    (
      await upload(
        page.request,
        target,
        Buffer.from("<script>alert(1)</script>"),
        "invalido.png",
      )
    ).status(),
  ).toBe(400);
  expect(
    (await upload(page.request, target, bytes, "invalido.png")).status(),
  ).toBe(400);
  expect([400, 413]).toContain(
    (
      await upload(
        page.request,
        target,
        Buffer.alloc(20 * 1024 * 1024 + 1),
        "grande.pdf",
      )
    ).status(),
  );
  const eof = bytes.lastIndexOf(Buffer.from("%%EOF"));
  const large = Buffer.concat([
    bytes.subarray(0, eof),
    Buffer.alloc(20 * 1024 * 1024 - bytes.length, 32),
    bytes.subarray(eof),
  ]);
  expect(large.length).toBe(20 * 1024 * 1024);
  const started = Date.now();
  const largeResult = await upload(
    page.request,
    target,
    large,
    "limite-20mb.pdf",
  );
  expect(largeResult.status()).toBe(200);
  console.log("Attachment 20 MiB upload ms:", Date.now() - started);
  const png = await sharp({
    create: { width: 480, height: 180, channels: 3, background: "#102849" },
  })
    .png()
    .toBuffer();
  expect(
    (await upload(page.request, target, png, "imagem-demo.png")).status(),
  ).toBe(200);
  const edited = await rpc(owner.client, "attachment_edit", {
    attachment_key: id,
    expected_version: 1,
    payload: {
      title: "Título revisto DEMO",
      category: "complementary",
      description: "Descrição fictícia",
      document_date: "2026-11-11",
    },
  });
  expect(edited.ok).toBe(true);
  expect(
    (
      await rpc(owner.client, "attachment_edit", {
        attachment_key: id,
        expected_version: 1,
        payload: { title: "Outra aba", category: "other" },
      })
    ).error,
  ).toBe("conflict");
  expect(
    (
      await rpc(owner.client, "attachment_edit", {
        attachment_key: id,
        expected_version: 2,
        payload: {},
        retire: true,
      })
    ).ok,
  ).toBe(true);
  expect((await page.request.get(`/api/anexos/${id}?file=1`)).status()).toBe(
    404,
  );
  expect(
    sql(
      `select count(*) from storage.objects o join clinical.attachment_uploads u on u.storage_path=o.name where u.attachment_id='${id}' and o.bucket_id='clinical-attachments'`,
    ),
  ).toBe("1");
  const audit = sql(
    `select operation from clinical.audit_events where actor_user_id='${owner.id}'`,
  );
  for (const operation of [
    "attachment.created",
    "attachment.download",
    "attachment.metadata.updated",
    "attachment.retired",
  ])
    expect(audit).toContain(operation);
});

test("não expõe anexos de outro autor, bloqueia associação indevida e respeita retenção", async ({
  page,
}) => {
  const owner = await account(),
    other = await account(),
    outsider = await account();
  const target = athlete(owner),
    wrong = athlete(owner, "Outro atleta DEMO");
  sql(
    `insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_write) values('${target}','${other.id}',true,true),('${target}','${outsider.id}',false,false);`,
  );
  sql(
    `update public.profiles set can_read_audit=true where id='${outsider.id}'`,
  );
  await login(page, owner);
  const bytes = await pdfBytes();
  const id = randomUUID();
  expect(
    (await upload(page.request, target, bytes, "laudo-demo.pdf", { id })).ok(),
  ).toBe(true);
  expect(
    (await rpc(other.client, "attachment_list", { target })).items,
  ).toHaveLength(0);
  expect(
    (await rpc(other.client, "attachment_open", { attachment_key: id })).error,
  ).toBe("unavailable");
  expect(
    (await rpc(outsider.client, "attachment_list", { target })).error,
  ).toBe("denied");
  const direct = await other.client.storage
    .from("clinical-attachments")
    .download(`${id}/${randomUUID()}`);
  expect(direct.error).not.toBeNull();
  const record = randomUUID(),
    wrongRecord = randomUUID();
  sql(
    `insert into clinical.records(id,athlete_id,author_id,author_name,specialty,title,body,occurred_at,status,visibility) values('${record}','${target}','${owner.id}','DEMO','Medicina','Evolução DEMO','Texto fictício',now(),'finalized','care_team'),('${wrongRecord}','${wrong}','${owner.id}','DEMO','Medicina','Outro registro','Texto fictício',now(),'finalized','care_team');`,
  );
  expect(
    (
      await upload(page.request, target, bytes, "laudo-demo.pdf", {
        record_id: wrongRecord,
      })
    ).status(),
  ).toBe(400);
  const finalId = randomUUID();
  const otherFile = Buffer.concat([
    bytes,
    Buffer.from("\n% Outra fonte ficticia\n"),
  ]);
  expect(
    (
      await upload(page.request, target, otherFile, "laudo-demo.pdf", {
        id: finalId,
        record_id: record,
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await rpc(owner.client, "attachment_edit", {
        attachment_key: finalId,
        expected_version: 1,
        payload: {},
        retire: true,
      })
    ).error,
  ).toBe("retention");
  expect(
    (
      await rpc(owner.client, "attachment_edit", {
        attachment_key: finalId,
        expected_version: 1,
        payload: { title: "Retirar vínculo", category: "other" },
      })
    ).error,
  ).toBe("retention");
  sql(
    `update clinical.athlete_access set can_read_records=false where professional_id='${owner.id}' and athlete_id='${target}'`,
  );
  expect(
    (await page.request.get(`/api/anexos/${id}?download=1`)).status(),
  ).toBe(404);
  const anon = createClient(
    localSupabase.url,
    localSupabase.publishableKey,
    opts,
  );
  expect((await anon.rpc("attachment_list", { target })).error).not.toBeNull();
});

test("falha e revogação durante upload não deixam arquivo disponível e órfão é recuperável", async ({
  page,
}) => {
  const owner = await account();
  const target = athlete(owner);
  await login(page, owner);
  const bytes = await pdfBytes(),
    id = randomUUID();
  const payload = {
    title: "Envio interrompido DEMO",
    category: "imaging_report",
    original_filename: "laudo.pdf",
    mime_type: "application/pdf",
    size_bytes: bytes.length,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
  const attempt = await rpc(owner.client, "attachment_begin", {
    target,
    attachment_key: id,
    payload,
  });
  expect(attempt.status).toBe("pending");
  const stored = await admin.storage
    .from("clinical-attachments")
    .upload(attempt.path, bytes, { contentType: "application/pdf" });
  expect(stored.error).toBeNull();
  expect((await rpc(owner.client, "attachment_list", { target })).total).toBe(
    0,
  );
  expect((await page.request.get(`/api/anexos/${id}?file=1`)).status()).toBe(
    404,
  );
  sql(
    `update clinical.athlete_access set can_write=false where athlete_id='${target}' and professional_id='${owner.id}'`,
  );
  expect(
    (
      await rpc(owner.client, "attachment_finish", {
        attachment_key: id,
        attempt: attempt.token,
        success: true,
      })
    ).error,
  ).toBe("denied");
  expect(
    (
      await page.request.post("/api/anexos?cleanup=1", {
        headers: { Origin: "http://127.0.0.1:3100" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    sql(
      `select count(*) from storage.objects where bucket_id='clinical-attachments' and name='${attempt.path}'`,
    ),
  ).toBe("0");
  sql(
    `update clinical.athlete_access set can_write=true where athlete_id='${target}' and professional_id='${owner.id}'`,
  );
  expect(
    (
      await upload(page.request, target, bytes, "laudo.pdf", {
        id,
        title: payload.title,
      })
    ).ok(),
  ).toBe(true);
  expect(sql(`select status from clinical.attachments where id='${id}'`)).toBe(
    "ready",
  );
});

test("perfil permite PDF, imagem, associação a exame, edição, filtros e download", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  const owner = await account();
  const target = athlete(owner);
  const bytes = await pdfBytes();
  sql(
    `insert into clinical.medical_authors(professional_id,credential_label,enabled,granted_by) values('${owner.id}','CRM Fictício',true,'${owner.id}')`,
  );
  const exam = randomUUID();
  await rpc(owner.client, "document_save", {
    target,
    document_id: exam,
    expected_version: 0,
    kind: "exam_request",
    intent: "save",
    payload: {
      occurred_at: "2026-11-10",
      indication: "",
      justification: "Fictício",
      diagnosis: "",
      priority: "",
      additional: "",
      items: [
        {
          id: randomUUID(),
          name: "Ressonância DEMO",
          exam_type: "imaging",
          region: "Joelho",
          laterality: "right",
          technical_details: "",
          notes: "",
        },
      ],
    },
  });
  await login(page, owner);
  await page.goto(`/atletas/${target}?aba=anexos`);
  await page
    .getByRole("button", { name: "Adicionar anexo", exact: true })
    .click();
  const dialog = await fillUpload(page, bytes);
  await dialog
    .getByLabel("Associação clínica (opcional)")
    .selectOption(`exam_request:${exam}`);
  await dialog
    .getByRole("button", { name: "Confirmar upload", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "Laudo de imagem DEMO",
    exact: true,
  });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("canvas")).toBeVisible();
  await expect
    .poll(() => viewer.locator("canvas").evaluate((canvas) => canvas.width))
    .toBeGreaterThan(100);
  const originalWidth=(await viewer.locator("canvas").boundingBox()).width;
  await viewer.getByRole("combobox",{name:"Zoom",exact:true}).selectOption("2");
  await expect.poll(async()=>(await viewer.locator("canvas").boundingBox()).width).toBeGreaterThan(originalWidth*1.8);
  await viewer.getByRole("combobox",{name:"Zoom",exact:true}).selectOption("1");
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${shots}/pdf-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${shots}/pdf-mobile.png`, fullPage: true });
  await expect(
    viewer.getByRole("link", { name: "Abrir documento associado" }),
  ).toHaveAttribute("href", `/atletas/${target}/documentos/${exam}`);
  const dl = page.waitForEvent("download");
  await viewer
    .getByRole("link", { name: "Baixar arquivo", exact: true })
    .click();
  expect((await dl).suggestedFilename()).toContain("laudo-demo.pdf");
  await viewer.getByRole("button", { name: "Fechar visualização" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `${shots}/profile-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${shots}/profile-mobile.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Adicionar anexo", exact: true })
    .click();
  const png = await sharp({
    create: { width: 480, height: 180, channels: 3, background: "#102849" },
  })
    .png()
    .toBuffer();
  const image = await fillUpload(page, png, "imagem-demo.png");
  await image.getByLabel("Título", { exact: true }).fill("Imagem clínica DEMO");
  await image
    .getByLabel("Categoria", { exact: true })
    .selectOption("clinical_image");
  await image
    .getByRole("button", { name: "Confirmar upload", exact: true })
    .click();
  const imageViewer = page.getByRole("dialog", {
    name: "Imagem clínica DEMO",
    exact: true,
  });
  await expect(
    imageViewer.getByRole("img", { name: "Imagem clínica DEMO", exact: true }),
  ).toBeVisible();
  await imageViewer
    .getByRole("button", { name: "Fechar visualização" })
    .click();
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption("clinical_image");
  await expect(
    page.getByRole("button", { name: "Imagem clínica DEMO", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Laudo de imagem DEMO", exact: true }),
  ).toHaveCount(0);
});

test("chat anexa sem LLM, pede atleta sem contexto, persiste card e protege troca pendente", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  const owner = await account();
  const target = athlete(owner),
    second = athlete(owner, "Atleta DEMO Segundo");
  const bytes = await pdfBytes();
  let modelRequests = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/inteligencia") modelRequests++;
  });
  await login(page, owner);
  await page
    .getByRole("button", { name: "Anexar ao prontuário", exact: true })
    .click();
  await expect(
    page.getByText(
      "Selecione um atleta autorizado para confirmar o destino do arquivo.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Buscar atleta", { exact: true })
    .fill("Atleta DEMO Anexos");
  await page
    .getByRole("button", { name: "Buscar atleta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Atleta DEMO Anexos", exact: true })
    .click();
  const dialog = await fillUpload(page, bytes);
  await expect(
    dialog.getByText("Atleta DEMO Anexos", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Confirmar upload", exact: true })
    .click();
  const cards = page.getByRole("region", { name: "Anexos da conversa" });
  await expect(
    cards.getByText("Laudo de imagem DEMO", { exact: true }),
  ).toBeVisible();
  expect(modelRequests).toBe(0);
  await cards
    .getByRole("button", { name: "Visualizar anexo", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "Laudo de imagem DEMO",
    exact: true,
  });
  await expect(viewer.locator("canvas")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${shots}/chat-viewer.png`, fullPage: true });
  await viewer.getByRole("button", { name: "Fechar visualização" }).click();
  await expect
    .poll(() =>
      sql(
        `select count(*) from clinical.conversation_messages where attachments is not null and session_id in(select id from clinical.conversation_sessions where professional_id='${owner.id}')`,
      ),
    )
    .toBe("1");
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Anexos da conversa" })
      .getByText("Laudo de imagem DEMO", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${shots}/chat-desktop.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Anexar ao prontuário", exact: true })
    .click();
  await fillUpload(page, bytes);
  page.once("dialog", (d) => d.dismiss());
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Adicionar anexo", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Adicionar anexo", exact: true }),
  ).toHaveCount(0);
  const session = (await rpc(owner.client, "conversation_current")).session.id;
  const pendingBytes=Buffer.concat([bytes,Buffer.from("\n% Contexto pendente ficticio\n")]);
  const reserved = await rpc(owner.client, "attachment_begin", {
    target,
    attachment_key: randomUUID(),
    chat_session: session,
    payload: {
      title: "Contexto fictício",
      category: "other",
      original_filename: "laudo.pdf",
      mime_type: "application/pdf",
      size_bytes: pendingBytes.length,
      checksum: createHash("sha256").update(pendingBytes).digest("hex"),
    },
  });
  expect(reserved.status).toBe("pending");
  await rpc(owner.client, "conversation_set_context", {
    context_athlete: second,
  });
  await admin.storage
    .from("clinical-attachments")
    .upload(reserved.path, pendingBytes, { contentType: "application/pdf" });
  expect(
    (
      await rpc(owner.client, "attachment_finish", {
        attachment_key: reserved.id,
        attempt: reserved.token,
        success: true,
      })
    ).error,
  ).toBe("denied");
  const listed = await page.request.post("/api/inteligencia", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: {
      messages: [{ role: "user", content: "Quais anexos estão disponíveis?" }],
      contextAthleteId: target,
    },
  });
  expect(listed.ok()).toBe(true);
  expect(await listed.text()).toContain("attachments");
  const audit = sql(
    `select origin_channel||':'||execution_method from clinical.audit_events where actor_user_id='${owner.id}' and operation='attachment.created'`,
  );
  expect(audit).toContain("ai_chat:human_ui");
  await page
    .getByRole("button", { name: "Nova conversa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Anexar ao prontuário", exact: true })
    .click();
  await expect(
    page.getByText(
      "Selecione um atleta autorizado para confirmar o destino do arquivo.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
});
