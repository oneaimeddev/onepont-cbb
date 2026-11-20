import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "./local-supabase.mjs";
const mode = process.argv[2];
if (!["enable", "disable"].includes(mode))
  throw new Error("Use enable ou disable; exclusivamente na instância local.");
const client = createClient(localSupabase.url, localSupabase.adminKey, {
  auth: { persistSession: false },
});
const { error } = await client.rpc("configure_signing_demo", {
  enabled: mode === "enable",
});
if (error)
  throw new Error(
    "Aplique as migrations de assinatura antes de configurar a demonstração.",
  );
const configured=await client.rpc("configure_document_delivery_demo",{enabled:mode==="enable"});
if(configured.error)throw new Error("Aplique a migration do ciclo documental antes de habilitar a entrega fictícia.");
let env = readFileSync(".env.local", "utf8")
  .replace(/^CBB_SIGNING_MODE=.*\n?/gm, "")
  .replace(/^CBB_DEPLOYMENT_ENV=.*\n?/gm, "");
env += `\nCBB_SIGNING_MODE=${mode === "enable" ? "demo" : "off"}\nCBB_DEPLOYMENT_ENV=local\n`;
writeFileSync(".env.local", env, { mode: 0o600 });
console.log(
  `Simulação ${mode === "enable" ? "habilitada" : "desabilitada"} apenas na instância local. Nenhum conector real configurado.`,
);
