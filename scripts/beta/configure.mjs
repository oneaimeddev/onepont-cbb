import { cli, keys, remoteUrl, projectRef, authConfig } from "./remote.mjs";
try { process.loadEnvFile(".env.local"); } catch { /* Optional AI configuration. */ }
const { service, publishable } = keys();
await authConfig({ disable_signup: true, mailer_autoconfirm: false,
  site_url: "https://prontuario-cbb-beta.vercel.app", uri_allow_list: "https://prontuario-cbb-beta.vercel.app/**" });
const env = {
  NEXT_PUBLIC_SUPABASE_URL: remoteUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SERVICE_ROLE_KEY: service, CBB_SIGNING_MODE: "demo", CBB_DEPLOYMENT_ENV: "controlled-demo",
  CBB_DEMO_SUPABASE_PROJECT_REF: projectRef,
};
if (process.env.CBB_INTELLIGENCE_API_KEY && !process.env.CBB_INTELLIGENCE_API_KEY.startsWith("offline")) {
  env.CBB_INTELLIGENCE_API_KEY = process.env.CBB_INTELLIGENCE_API_KEY;
  env.CBB_INTELLIGENCE_MODEL = process.env.CBB_INTELLIGENCE_MODEL || "gemini-3.5-flash";
  if (process.env.CBB_INTELLIGENCE_BASE_URL) {
    const url = new URL(process.env.CBB_INTELLIGENCE_BASE_URL);
    if (url.protocol !== "https:") throw new Error("Endpoint local/inseguro de IA recusado no beta.");
    env.CBB_INTELLIGENCE_BASE_URL = url.href;
  }
} else console.log("CBB Intelligence indisponível: credencial real ausente.");
for (const [name, value] of Object.entries(env)) {
  cli(["vercel", "env", "add", name, "--environment", "production", "--project", "prontuario-cbb-beta", "--force", "--yes",
    ...(["SUPABASE_SERVICE_ROLE_KEY", "CBB_INTELLIGENCE_API_KEY"].includes(name) ? ["--sensitive"] : ["--no-sensitive"])], value);
  console.log(`Configurada: ${name}`);
}
console.log("Cadastro público desabilitado. Configuração restrita ao projeto beta.");
