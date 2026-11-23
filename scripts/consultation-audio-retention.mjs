import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) throw new Error("Configure as credenciais Supabase do ambiente DEMO.");
const endpoint = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))
  throw new Error("O descarte desta versão só pode ser executado no Supabase local.");

const client = createClient(url, key, { auth: { persistSession: false } });
const apply = process.argv.includes("--apply");
let removed = 0;
for (;;) {
  const batch = await client.rpc("consultation_expired_audio");
  if (batch.error) throw new Error("Falha ao consultar o lote de áudio vencido.");
  if (!apply) {
    console.log(`Áudios vencidos no primeiro lote: ${batch.data.length}. Use --apply para descartar.`);
    break;
  }
  if (!batch.data.length) break;
  const result = await client.storage.from("consultation-audio").remove(batch.data);
  if (result.error || result.data.length !== batch.data.length)
    throw new Error("Descarte incompleto. Execute novamente para retomar.");
  removed += result.data.length;
}
if (apply) console.log(`Segmentos de áudio descartados: ${removed}.`);
