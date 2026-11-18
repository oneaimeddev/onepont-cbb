import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getAccess } from "../../lib/profile";
import { supabaseServer } from "../../lib/supabase";
import { uuidPattern } from "../athletes/data";
import { attachmentLimit, validateAttachment } from "./files";

type Channel = "traditional_ui" | "ai_chat";
const bucket = "clinical-attachments";
const noCache = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export function sameAttachmentOrigin(request: Request) {
  try {
    return (
      new URL(request.headers.get("origin") ?? "").host ===
      request.headers.get("host")
    );
  } catch {
    return false;
  }
}
function storageClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("storage");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    },
  }).storage.from(bucket);
}
async function cleanup(client: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data, error } = await client.rpc("attachment_cleanup");
  if (error) throw new Error("cleanup");
  const objects = data?.objects as
    | { token: string; path: string }[]
    | undefined;
  if (!objects?.length) return 0;
  const storage = storageClient();
  const removed = await storage.remove(objects.map((item) => item.path));
  if (removed.error) throw new Error("cleanup");
  const acknowledged = await client.rpc("attachment_cleanup", {
    cleaned: objects.map((item) => item.token),
  });
  if (acknowledged.error) throw new Error("cleanup");
  return objects.length;
}
export async function attachmentUpload(request: Request, channel: Channel) {
  if (!sameAttachmentOrigin(request))
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  const access = await getAccess();
  if (access.status !== 200)
    return Response.json(
      { error: "Sessão indisponível." },
      { status: access.status },
    );
  const client = await supabaseServer();
  if (new URL(request.url).searchParams.get("cleanup") === "1") {
    try {
      return Response.json({ cleaned: await cleanup(client) });
    } catch {
      return Response.json(
        { error: "Não foi possível recuperar os envios. Tente novamente." },
        { status: 503 },
      );
    }
  }
  const max = attachmentLimit() + 65536;
  if (Number(request.headers.get("content-length")) > max)
    return Response.json(
      { error: "Arquivo acima do limite permitido." },
      { status: 413 },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "Arquivo ausente." }, { status: 400 });
  let received = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > max) {
        await reader.cancel();
        return Response.json(
          { error: "Arquivo acima do limite permitido." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } catch {
    return Response.json(
      {
        error:
          "Envio interrompido. Selecione o mesmo arquivo para tentar novamente.",
      },
      { status: 400 },
    );
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }
  const target = String(form.get("athlete_id") ?? ""),
    id = String(form.get("id") ?? ""),
    session = String(form.get("session_id") ?? "");
  if (
    !uuidPattern.test(target) ||
    !uuidPattern.test(id) ||
    (channel === "ai_chat" && !uuidPattern.test(session))
  )
    return Response.json(
      { error: "Confirme o atleta e a conversa de destino." },
      { status: 400 },
    );
  // Authorize before parsing a clinical file; finish revalidates access and session after transfer.
  const allowed = await client.rpc("attachment_options", { target });
  if (allowed.error || allowed.data?.error)
    return Response.json(
      { error: "Você não tem permissão para anexar a este atleta." },
      { status: 403 },
    );
  const file = form.get("file");
  if (!(file instanceof File))
    return Response.json({ error: "Selecione um arquivo." }, { status: 400 });
  let validated: Awaited<ReturnType<typeof validateAttachment>>;
  try {
    validated = await validateAttachment(file);
  } catch {
    return Response.json(
      {
        error: `Envie PDF, JPEG, PNG ou WebP válido, com até ${Math.floor(attachmentLimit() / 1024 / 1024)} MB. PDF protegido e imagem animada não são aceitos.`,
      },
      { status: 400 },
    );
  }
  const payload = {
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    category: String(form.get("category") ?? ""),
    document_date: String(form.get("document_date") ?? ""),
    record_id: String(form.get("record_id") ?? ""),
    document_id: String(form.get("document_id") ?? ""),
    original_filename: validated.name,
    mime_type: validated.mime,
    size_bytes: file.size,
    checksum: validated.checksum,
  };
  try {
    await cleanup(client);
  } catch {
    /* Cleanup remains retryable and never removes confirmed files. */
  }
  const { data, error } = await client.rpc("attachment_begin", {
    target,
    attachment_key: id,
    payload,
    chat_session: channel === "ai_chat" ? session : null,
  });
  if (error || data?.error)
    return Response.json(
      {
        error:
          data?.error === "busy"
            ? "Este envio ainda está em processamento. Consulte a listagem e tente novamente após dez minutos se não aparecer."
            : "Não foi possível iniciar. Confira os metadados, o contexto e sua permissão.",
      },
      {
        status:
          data?.error === "busy" || data?.error === "conflict" ? 409 : 400,
      },
    );
  if (data?.status === "ready")
    return Response.json(
      { id: data.id, status: "ready", reused: true },
      { headers: noCache },
    );
  const canonicalId = data?.id;
  const token = data?.token,
    path = data?.path;
  if (!token || !path)
    return Response.json(
      { error: "Armazenamento indisponível." },
      { status: 503 },
    );
  let finished = false;
  try {
    if (request.signal.aborted) throw new Error("cancelled");
    const stored = await storageClient().upload(path, validated.bytes, {
      contentType: validated.mime,
      upsert: false,
      cacheControl: "0",
    });
    if (stored.error || request.signal.aborted) throw new Error("transfer");
    const confirmation = await client.rpc("attachment_finish", {
      attachment_key: canonicalId,
      attempt: token,
      success: true,
    });
    if (confirmation.error || confirmation.data?.status !== "ready")
      throw new Error("confirm");
    finished = true;
    return Response.json(
      { id: canonicalId, status: "ready" },
      { headers: noCache },
    );
  } catch {
    return Response.json(
      {
        error:
          "O upload não foi confirmado. Consulte a listagem antes de repetir; mantenha o mesmo arquivo e os metadados.",
      },
      { status: 503 },
    );
  } finally {
    if (!finished) {
      await client.rpc("attachment_finish", {
        attachment_key: canonicalId,
        attempt: token,
        success: false,
      });
      try {
        await cleanup(client);
      } catch {
        /* The attempt ledger retains the orphan for explicit cleanup. */
      }
    }
  }
}
export async function attachmentRead(
  request: Request,
  id: string,
  channel: Channel,
) {
  const access = await getAccess();
  if (access.status !== 200)
    return new Response(null, { status: access.status, headers: noCache });
  if (!uuidPattern.test(id))
    return new Response(null, { status: 404, headers: noCache });
  const client = await supabaseServer();
  const params = new URL(request.url).searchParams;
  const action =
    params.get("download") === "1"
      ? "download"
      : params.get("file") === "1"
        ? "view"
        : "metadata";
  const first = await client.rpc("attachment_open", {
    attachment_key: id,
    action: "metadata",
    channel,
  });
  if (first.error) return new Response(null, { status: 503, headers: noCache });
  if (!first.data || first.data.error)
    return new Response(null, { status: 404, headers: noCache });
  const { internal_path, ...metadata } = first.data;
  if (action === "metadata")
    return Response.json(metadata, { headers: noCache });
  try {
    const file = await storageClient().download(internal_path);
    if (file.error || !file.data)
      return new Response(null, { status: 503, headers: noCache });
    const second = await client.rpc("attachment_open", {
      attachment_key: id,
      action,
      channel,
    });
    if (second.error || !second.data || second.data.error)
      return new Response(null, { status: 404, headers: noCache });
    const filename = encodeURIComponent(metadata.original_filename).replace(
      /['()]/g,
      (c) => `%${c.charCodeAt(0).toString(16)}`,
    );
    return new Response(file.data, {
      headers: {
        ...noCache,
        "Content-Type": metadata.mime_type,
        "Content-Length": String(file.data.size),
        "Content-Disposition": `${action === "download" ? "attachment" : "inline"}; filename="documento"; filename*=UTF-8''${filename}`,
        "Content-Security-Policy":
          "sandbox; default-src 'none'; frame-ancestors 'self'",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return new Response(null, { status: 503, headers: noCache });
  }
}
export async function attachmentList(request: Request, channel: Channel) {
  const access = await getAccess();
  if (access.status !== 200)
    return new Response(null, { status: access.status });
  const client = await supabaseServer();
  const params = new URL(request.url).searchParams,
    target = params.get("athlete") ?? "";
  if (!uuidPattern.test(target))
    return Response.json(
      { error: "Selecione um atleta autorizado." },
      { status: 400 },
    );
  if (params.get("options") === "1") {
    const result = await client.rpc("attachment_options", { target });
    return Response.json(
      result.error
        ? { error: "Indisponível" }
        : { ...result.data, max_mb: attachmentLimit() / 1024 / 1024 },
      {
        status: result.error ? 503 : result.data?.error ? 403 : 200,
        headers: noCache,
      },
    );
  }
  const filters: Record<string, unknown> = Object.fromEntries(
    ["category", "q", "sort", "page"].map((key) => [
      key,
      (params.get(key) ?? "").slice(0, 160),
    ]),
  );
  if (!/^\d{1,6}$/.test(String(filters.page))) filters.page = "1";
  const ids = params
    .getAll("id")
    .filter((id) => uuidPattern.test(id))
    .slice(0, 25);
  if (params.has("id")) filters.ids = ids;
  const { data, error } = await client.rpc("attachment_list", {
    target,
    filters,
    channel,
  });
  return Response.json(error ? { error: "Consulta indisponível." } : data, {
    status: error ? 503 : data?.error ? 403 : 200,
    headers: noCache,
  });
}
export async function attachmentEdit(
  request: Request,
  id: string,
  channel: Channel,
) {
  if (!sameAttachmentOrigin(request))
    return new Response(null, { status: 403 });
  const access = await getAccess();
  if (access.status !== 200)
    return new Response(null, { status: access.status });
  if (!uuidPattern.test(id)) return new Response(null, { status: 404 });
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const client = await supabaseServer();
  const { data, error } = await client.rpc("attachment_edit", {
    attachment_key: id,
    expected_version: body.version,
    payload: body.payload ?? {},
    retire: body.retire === true,
    channel,
  });
  return Response.json(error ? { error: "Não foi possível salvar." } : data, {
    status: error ? 400 : data?.error ? 409 : 200,
    headers: noCache,
  });
}
