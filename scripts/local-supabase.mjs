import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}));
const url = new URL(status.API_URL);
if (url.hostname !== "127.0.0.1") throw new Error("Use uma instância local do Supabase.");

const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!publishableKey) throw new Error("A chave publicável local está indisponível.");

if (process.argv.includes("--env")) {
  writeFileSync(".env.local", `NEXT_PUBLIC_SUPABASE_URL=${url.origin}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}

export const localSupabase = {
  url: url.origin,
  publishableKey,
  adminKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
};
