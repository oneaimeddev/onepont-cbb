import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { supabaseServer } from "../../../../../lib/supabase";
import { getAccess } from "../../../../../lib/profile";
import { uuidPattern } from "../../../../../features/athletes/data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess();
  if (access.status !== 200) return new Response(null, { status: access.status });
  const { id } = await params;
  if (!uuidPattern.test(id)) return new Response(null, { status: 404 });
  const client = await supabaseServer();
  const { data, error } = await client.rpc("athlete_photo", { target: id });
  if (error) return new Response(null, { status: 503 });
  if (!data?.content) return new Response(null, { status: 404 });
  return new Response(Buffer.from(data.content, "base64"), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let originHost = "";
  try { originHost = new URL(request.headers.get("origin") ?? "").host; } catch { /* Invalid origins are rejected. */ }
  if (!originHost || originHost !== request.headers.get("host")) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const access = await getAccess();
  if (access.status !== 200) return Response.json({ error: "Acesso indisponível." }, { status: access.status });
  const { id } = await params;
  if (!uuidPattern.test(id)) return Response.json({ error: "Atleta indisponível." }, { status: 404 });
  if (Number(request.headers.get("content-length")) > 5300000) return Response.json({ error: "Limite de 5 MB." }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Arquivo ausente." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > 5300000) {
      await reader.cancel();
      return Response.json({ error: "Limite de 5 MB." }, { status: 413 });
    }
    chunks.push(value);
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return Response.json({ error: "Upload inválido." }, { status: 400 });
  }
  const remove = form.get("remove") === "yes";
  let content: string | null = null;
  if (!remove) {
    const file = form.get("photo");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
      return Response.json({ error: "Escolha uma imagem de até 5 MB." }, { status: 400 });
    try {
      const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25000000, animated: false });
      const metadata = await image.metadata();
      if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error("Formato inválido");
      content = (await image.rotate().resize(512, 512, { fit: "cover", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()).toString("base64");
    } catch {
      return Response.json({ error: "Envie uma imagem JPEG, PNG ou WebP válida." }, { status: 400 });
    }
  }
  const client = await supabaseServer();
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return Response.json({ error: "Armazenamento indisponível." }, { status: 503 });
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await storage.rpc("athlete_photo_store", { target: id, actor: identity.user.id, content, remove });
  if (error) return Response.json({ error: "Não foi possível salvar a foto." }, { status: 503 });
  if (!data) return Response.json({ error: "Permissão insuficiente." }, { status: 403 });
  return Response.json({ saved: true });
}
