"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";
import { uuidPattern } from "../athletes/data";
import { documentKinds, kindFromSlug, type DocumentKind } from "./content";

function returnPath(athlete: string, value: string) {
  const prefix = `/atletas/${athlete}/documentos`;
  const [path, query = ""] = value.split("?");
  if (!path || (path !== prefix && !path.startsWith(`${prefix}/`))) return prefix;
  const params = new URLSearchParams(query);
  const kept = new URLSearchParams();
  const kind = params.get("tipo");
  const documentId = params.get("documento");
  if (kind && kindFromSlug(kind)) kept.set("tipo", kind);
  if (documentId && uuidPattern.test(documentId)) kept.set("documento", documentId);
  const suffix = kept.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function saveDocument(form: FormData) {
  await requireProfile();
  const athlete = String(form.get("athlete") ?? "");
  const documentId = String(form.get("document") ?? "");
  const kind = String(form.get("kind") ?? "");
  const intent = form.get("intent") === "review" ? "review" : "save";
  const version = Number(form.get("version") ?? 0);
  const raw = String(form.get("content") ?? "");
  const back = returnPath(athlete, String(form.get("return") ?? ""));
  const fail = `${back}${back.includes("?") ? "&" : "?"}erro=`;
  if (!uuidPattern.test(athlete) || !uuidPattern.test(documentId) || !Object.hasOwn(documentKinds, kind) || !Number.isInteger(version) || version < 0 || raw.length > 30000) {
    redirect(`${fail}invalido`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    redirect(`${fail}invalido`);
  }
  const client = await supabaseServer();
  const { data, error } = await client.rpc("document_save", {
    target: athlete,
    document_id: documentId,
    expected_version: version,
    kind: kind as DocumentKind,
    payload,
    intent,
  });
  if (error || data?.error === "invalid") redirect(`${fail}invalido`);
  if (data?.error === "denied") redirect(`${fail}negado`);
  if (data?.error === "conflict") redirect(`/atletas/${athlete}/documentos/${documentId}?erro=conflito`);
  const saved = data.review === "blocked" ? "pendente" : data.status === "ready_for_review" ? "revisao" : "rascunho";
  redirect(`/atletas/${athlete}/documentos/${documentId}?salvo=${saved}`);
}
