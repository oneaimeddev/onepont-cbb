import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { localSupabase } from "./local-supabase.mjs";
import sharp from "sharp";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const destination = process.argv[2];
if (!destination) throw new Error("Informe a pasta de capturas.");
await mkdir(destination, { recursive: true });
const sql = (statement) => execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb",
  "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: statement, stdio: ["pipe", "pipe", "pipe"] });
const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false } });
const email = `visual-${randomUUID()}@example.com`;
const password = randomUUID();
const athlete = randomUUID();
const second = randomUUID();
const draft = randomUUID();
const encounter = randomUUID();
const photo = await sharp({ create: { width: 128, height: 128, channels: 3, background: "#147c75" } }).webp().toBuffer();
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const user = data.user.id;
let browser;
try {
  const profile = await admin.from("profiles").insert({ id: user, display_name: "Profissional DEMO", profession: "Medicina esportiva", can_read_audit: true });
  if (profile.error) throw profile.error;
  sql(`
    insert into clinical.athletes(id, full_name, social_name, team, category, birth_date, source) values
      ('${athlete}', 'Atleta Visual DEMO', null, 'Equipe DEMO', 'Sub-19', '2008-03-14', 'demo'),
      ('${second}', 'Segunda Atleta DEMO', null, 'Equipe DEMO', 'Adulto', null, 'demo');
    insert into clinical.athlete_creators(professional_id,can_write_created,can_finalize_created) values ('${user}',true,true);
    insert into clinical.athlete_access(athlete_id,professional_id,can_read_records,can_edit,can_write,can_finalize)
    values ('${athlete}', '${user}', true,true,true,true), ('${second}', '${user}', true,true,true,true);
    update clinical.athletes set photo=decode('${photo.toString("hex")}','hex'),photo_version=gen_random_uuid() where id='${athlete}';
    insert into clinical.sport_links(athlete_id,option_id,club,starts_on)
    select '${athlete}',id,'Equipe DEMO','2026-01-01' from clinical.sport_options
    where season=2026 and category='Sub-19' and modality='5x5' and division='Feminino';
    insert into clinical.encounters(id,athlete_id,author_id,specialty) values('${encounter}','${athlete}','${user}','Medicina esportiva');
    insert into clinical.records(athlete_id, author_id, author_name, specialty, title, body, occurred_at, status, visibility) values
      ('${athlete}', '${user}', 'Autor DEMO', 'Medicina', 'Avaliação pré-temporada DEMO', 'Conteúdo fictício para captura.', '2026-11-01', 'finalized', 'care_team'),
      ('${athlete}', '${user}', 'Autor DEMO', 'Fisioterapia', 'Retorno de treino DEMO', 'Conteúdo fictício para captura.', '2026-11-10', 'draft', 'care_team');
    update clinical.records set id='${draft}',encounter_id='${encounter}' where athlete_id='${athlete}' and status='draft';
  `);
  browser = await chromium.launch();
  for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(base + "/login");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${destination}/login-${size}.png`, fullPage: true });
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(base + "/");
    for (const [name, path] of [
      ["chat", "/"], ["chat-context", `/?atleta=${athlete}`], ["atletas", "/atletas"], ["perfil", `/atletas/${athlete}`],
      ["timeline", `/atletas/${athlete}?aba=timeline`], ["cadastro", "/atletas/novo"], ["foto", `/atletas/${athlete}?aba=cadastro`],
      ["evolucao", `/atletas/${athlete}/evolucao?registro=${draft}`], ["auditoria", "/auditoria"], ["evolucoes", "/evolucoes"],
    ]) {
      await page.goto(base + path);
      await page.evaluate(() => document.fonts.ready);
      if (name === "timeline") await page.locator("summary").first().click();
      await page.screenshot({ path: `${destination}/${name}-${size}.png`, fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Overflow em ${name} ${size}`);
    }
    if (viewport.width <= 700) {
      await page.goto(base + "/atletas");
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.screenshot({ path: `${destination}/navigation-${size}.png`, fullPage: true });
    }
    await context.close();
  }
} finally {
  await browser?.close();
  sql(`
    delete from clinical.audit_events where actor_user_id = '${user}';
    delete from clinical.records where athlete_id in ('${athlete}', '${second}');
    delete from clinical.encounters where athlete_id in ('${athlete}', '${second}');
    delete from clinical.athlete_access where professional_id = '${user}';
    delete from clinical.athlete_creators where professional_id = '${user}';
    delete from clinical.athletes where id in ('${athlete}', '${second}');
  `);
  const { error: cleanupError } = await admin.auth.admin.deleteUser(user);
  if (cleanupError) throw cleanupError;
}
console.log("Capturas concluídas em " + destination);
