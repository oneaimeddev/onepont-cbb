"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAccess, requireProfile } from "../../../../../lib/profile";
import { supabaseServer } from "../../../../../lib/supabase";
import { uuidPattern } from "../../../../../features/athletes/data";

export type EvolutionSubmitResult =
  | {
      ok: true;
      id: string;
      version: number;
      status: "draft" | "finalized";
      replayed: boolean;
    }
  | {
      ok: false;
      error: "invalid" | "denied" | "conflict" | "reused" | "unavailable";
    };

export async function submitEvolution(
  form: FormData,
): Promise<EvolutionSubmitResult> {
  try {
    const access = await getAccess();
    if (access.status !== 200) return { ok: false, error: "denied" };
    const athlete = String(form.get("athlete") ?? ""),
      record = String(form.get("record") ?? ""),
      request = String(form.get("request") ?? ""),
      capture = String(form.get("capture") ?? "");
    const version = Number(form.get("version")),
      intent = String(form.get("intent") ?? "");
    const title = String(form.get("title") ?? "").trim(),
      body = String(form.get("body") ?? "");
    if (
      !uuidPattern.test(athlete) ||
      !uuidPattern.test(request) ||
      (record && !uuidPattern.test(record)) ||
      (capture && (!uuidPattern.test(capture) || process.env.CONSULTATION_VOICE_BETA !== "1")) ||
      !Number.isInteger(version) ||
      version < 0 ||
      (intent !== "draft" && intent !== "finalize") ||
      title.length < 1 ||
      title.length > 160 ||
      !body.trim() ||
      body.length > 20000
    )
      return { ok: false, error: "invalid" };
    const client = await supabaseServer();
    const result = await client.rpc(capture ? "consultation_submit" : "evolution_submit", {
      ...(capture ? { capture_id: capture } : {}),
      target: athlete,
      record_id: record || null,
      request_id: request,
      expected_version: version,
      entry_title: title,
      entry_body: body,
      restricted: form.get("restricted") === "yes",
      intent,
    });
    if (result.error || !result.data)
      return { ok: false, error: "unavailable" };
    if (result.data.error) {
      const error = result.data.error;
      return {
        ok: false,
        error:
          error === "invalid" ||
          error === "denied" ||
          error === "conflict" ||
          error === "reused"
            ? error
            : "unavailable",
      };
    }
    if (
      !uuidPattern.test(result.data.id) ||
      !Number.isInteger(result.data.version) ||
      (result.data.status !== "draft" && result.data.status !== "finalized")
    )
      return { ok: false, error: "unavailable" };
    revalidatePath(`/atletas/${athlete}`);
    revalidatePath(`/atletas/${athlete}/evolucao`);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      status: result.data.status,
      replayed: result.data.replayed === true,
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function correctEvolution(form: FormData) {
  await requireProfile();
  const athlete = String(form.get("athlete") ?? ""),
    record = String(form.get("record") ?? ""),
    request = String(form.get("request") ?? "");
  if (
    !uuidPattern.test(athlete) ||
    !uuidPattern.test(record) ||
    !uuidPattern.test(request)
  )
    throw new Error("Identificador inválido.");
  if (form.get("confirm") !== "yes")
    throw new Error("Confirme a revisão da correção.");
  const client = await supabaseServer();
  const result = await client.rpc("evolution_correct", {
    target: athlete,
    record_id: record,
    request_id: request,
    expected_version: Number(form.get("version")),
    entry_title: String(form.get("title") ?? ""),
    entry_body: String(form.get("body") ?? ""),
    reason: String(form.get("reason") ?? ""),
  });
  if (result.error || result.data?.error)
    redirect(`/atletas/${athlete}/evolucao?registro=${record}&erro=1`);
  redirect(`/atletas/${athlete}/evolucao?registro=${record}&salvo=1`);
}
