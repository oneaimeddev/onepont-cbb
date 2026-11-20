import "server-only";
import { createClient } from "@supabase/supabase-js";
import { reconcileDeliveries, deliveryEnvironmentAllowed } from "./engine";
export async function reconcileDocumentDelivery(documentId: string) {
  if (!deliveryEnvironmentAllowed(process.env)) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    },
  });
  await reconcileDeliveries(client, process.env, { documentId, limit: 1 });
}
