import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Production Beta by default; CBB_TARGET=homologacao with CBB_SUPABASE_PROJECT_REF selects the
// separate homologation project used by the preview link. The two never share data or secrets.
const productionRef = "noqixverpzgvfrcybrrt";
export const homologation = process.env.CBB_TARGET === "homologacao";
export const projectRef = homologation ? (process.env.CBB_SUPABASE_PROJECT_REF ?? "") : productionRef;
if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("Informe CBB_SUPABASE_PROJECT_REF com a referência do projeto de homologação.");
if (homologation && projectRef === productionRef) throw new Error("A homologação não pode usar o projeto de produção.");
export const environmentName = homologation ? "homologacao" : "beta";
export const siteUrl = homologation
  ? "https://prontuario-cbb-beta-git-homologacao-one-ai-dev.vercel.app"
  : "https://prontuario-cbb-beta.vercel.app";
export const remoteUrl = `https://${projectRef}.supabase.co`;
export const batch = "beta-008b-v1";
export function cli(args, input) {
  try {
    return execFileSync("npx", ["--no-install", ...args], {
      input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024,
    });
  } catch (cause) {
    const error = new Error(`Falha no comando ${args[0]} ${args[1]}; valores privados omitidos.`);
    error.detail = cause.stderr?.toString();
    throw error;
  }
}
export function query(sql, readOnly = false) {
  const dir = mkdtempSync(join(tmpdir(), "cbb-beta-"));
  try {
    const file = join(dir, "query.sql");
    writeFileSync(file, sql, { mode: 0o600 });
    try {
      return JSON.parse(cli(["supabase", "db", "query", `--remote=${projectRef}`, "--file", file,
        ...(readOnly ? ["--read-only"] : ["--yes"]), "-o", "json"]));
    } catch (error) { throw new Error(`Consulta SQL beta falhou: ${error.detail ?? "erro remoto"}`); }
  } finally { rmSync(dir, { recursive: true }); }
}
export function keys() {
  const data = JSON.parse(cli(["supabase", "projects", "api-keys", `--remote=${projectRef}`, "--reveal", "-o", "json"]));
  const list = Array.isArray(data) ? data : data.api_keys;
  const service = list.find(k => k.name === "service_role")?.api_key;
  const publishable = list.find(k => k.name === "anon")?.api_key;
  if (!service || !publishable) throw new Error("Chaves do projeto beta indisponíveis.");
  return { service, publishable };
}
export function client(key) {
  return createClient(remoteUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authConfig(patch) {
  const token = readFileSync(join(homedir(), ".supabase/access-token"), "utf8").trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: patch ? "PATCH" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(patch ? { body: JSON.stringify(patch) } : {}),
  });
  if (!res.ok) throw new Error(`Configuração Auth indisponível (${res.status}); credenciais omitidas.`);
  return res.json();
}
export const users = [
  { name: "Bruno Nicolaci Costa", profession: "Preparação Física", email: "bruno.nicolaci@cbb-demo.test", clinical: true },
  { name: "Carlos Vicente Andreoli", profession: "Medicina", email: "carlos.andreoli@cbb-demo.test", clinical: true, medical: true },
  { name: "Rafael Francis Plein", profession: "Fisioterapia", email: "rafael.plein@cbb-demo.test", clinical: true },
  { name: "Bruno de Lima Secco", profession: "Fisioterapia", email: "bruno.secco@cbb-demo.test", clinical: true },
  { name: "Denise Pereira", profession: "Nutrição", email: "denise.pereira@cbb-demo.test", clinical: true },
  { name: "Paulo Henrique Pereira Daniel da Silva", profession: "Apoio Técnico", email: "paulo.daniel@cbb-demo.test", clinical: false },
  { name: "OnePront", profession: "Administrador do Sistema", email: "onepront@cbb-demo.test", clinical: false, admin: true },
];
export const quote = value => `'${String(value).replaceAll("'", "''")}'`;
