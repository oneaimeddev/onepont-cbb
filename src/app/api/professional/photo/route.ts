import { sameSigningOrigin } from "../../../../features/signing/request";
import sharp from "sharp";
import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
async function context() {
  const access = await getAccess();
  if (access.status !== 200) return null;
  const client = await supabaseServer();
  const { data } = await client.auth.getUser();
  return data.user ? { client, path: `${data.user.id}/avatar.png` } : null;
}
export async function GET() {
  const c = await context();
  if (!c) return new Response(null, { status: 401, headers });
  const { data, error } = await c.client.storage
    .from("professional-photos")
    .download(c.path);
  if (error || !data) return new Response(null, { status: 404, headers });
  return new Response(await data.arrayBuffer(), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
}
export async function POST(request: Request) {
  const c = await context();
  if (!c)
    return Response.json(
      { error: "unauthenticated" },
      { status: 401, headers },
    );
  if (!sameSigningOrigin(request))
    return Response.json({ error: "denied" }, { status: 403, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 2200000)
    return Response.json({ error: "invalid" }, { status: 413, headers });
  try {
    const file = (await request.formData()).get("photo");
    if (
      !(file instanceof File) ||
      file.size > 2097152 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      return Response.json({ error: "invalid" }, { status: 400, headers });
    const bytes = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20000000,
    })
      .rotate()
      .resize(512, 512, { fit: "cover" })
      .png()
      .toBuffer();
    const { error } = await c.client.storage
      .from("professional-photos")
      .upload(c.path, bytes, { contentType: "image/png", upsert: true });
    if (error) throw error;
    // Record only the operation, never image bytes.
    const { error: auditError } = await c.client.rpc(
      "professional_photo_record",
    );
    if (auditError) throw auditError;
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers });
  }
}
