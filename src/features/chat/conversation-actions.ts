"use server";

import { redirect } from "next/navigation";
import { getAccess } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";

export async function endConversationContext() {
  const access = await getAccess();
  if (access.status !== 200) redirect("/login");
  const client = await supabaseServer();
  const { data, error } = await client.rpc("conversation_set_context", { context_athlete: null });
  const result = data as { ok?: boolean } | null;
  if (error || !result?.ok) throw new Error("Não foi possível encerrar o contexto.");
  redirect("/");
}
