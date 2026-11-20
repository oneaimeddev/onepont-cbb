import { createClient } from "@supabase/supabase-js";
import { reconcileDeliveries } from "../src/features/delivery/engine.ts";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Explicit environment is also supported. */
}
if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
)
  throw new Error("Configure o ambiente de backend.");
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const documentId = process.argv
  .find((x) => x.startsWith("--document="))
  ?.slice("--document=".length);
if (documentId && !/^[0-9a-f-]{36}$/i.test(documentId))
  throw new Error("Identificador inválido.");
const result = await reconcileDeliveries(client, process.env, {
  limit: 20,
  documentId,
});
console.log(JSON.stringify(result));
