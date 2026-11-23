import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";

const ids = z.object({ target: z.uuid(), session_id: z.uuid() });
const captureCommand = z.discriminatedUnion("operation", [
  ids.extend({ operation: z.literal("start"), authorization_code: z.literal("staged_fictional_v1") }),
  ids.extend({ operation: z.literal("status") }),
  ids.extend({ operation: z.literal("discard") }),
  ids.extend({ operation: z.literal("finish"), segment_count: z.number().int().min(0).max(3600), interrupted: z.boolean() }),
]);

function response(result: { data: unknown; error: unknown }) {
  if (result.error || !result.data || typeof result.data !== "object")
    return Response.json({ error: "unavailable" }, { status: 503 });
  const code = "error" in result.data ? result.data.error : null;
  const status = code === "denied" ? 403 : code === "invalid" ? 400 : code ? 409 : 200;
  return Response.json(result.data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (process.env.CONSULTATION_VOICE_BETA !== "1")
    return Response.json({ error: "unavailable" }, { status: 404 });
  const access = await getAccess();
  if (access.status !== 200)
    return Response.json({ error: "denied" }, { status: 403 });

  const client = await supabaseServer();
  if (request.headers.get("Content-Type")?.split(";")[0] !== "audio/wav") {
    const parsed = captureCommand.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
    if (parsed.data.operation === "discard") {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!key || !url) return Response.json({ error: "unavailable" }, { status: 503 });
      const admin = createClient(url, key, { auth: { persistSession: false } });
      const bucket = admin.storage.from("consultation-audio");
      for (;;) {
        const result = await admin.rpc("consultation_discard", {
          actor: access.userId, target: parsed.data.target, capture_id: parsed.data.session_id,
        });
        if (result.error || !result.data || result.data.error) return response(result);
        const paths = result.data.paths as string[];
        if (!paths.length) return response({ data: { state: "discarded" }, error: null });
        const removed = await bucket.remove(paths);
        if (removed.error || removed.data.length !== paths.length)
          return Response.json({ error: "cleanup_pending" }, { status: 503 });
      }
    }
    return response(await client.rpc("consultation_capture", parsed.data));
  }

  const query = new URL(request.url).searchParams;
  const parsed = ids.extend({
    sequence: z.string().regex(/^\d{1,4}$/).transform(Number).pipe(z.number().max(3599)),
  }).safeParse(Object.fromEntries(query));
  const byteLength = Number(request.headers.get("Content-Length"));
  if (!parsed.success || !Number.isSafeInteger(byteLength) || byteLength < 76 || byteLength > 320044)
    return Response.json({ error: "invalid" }, { status: 400 });

  const { sequence, ...target } = parsed.data;
  const status = await client.rpc("consultation_capture", { ...target, operation: "status" });
  if (status.error || !status.data || status.data.error) return response(status);
  if (status.data.state !== "recording" || Date.parse(status.data.expiresAt) <= Date.now())
    return Response.json({ error: "conflict" }, { status: 409 });

  const audio = Buffer.from(await request.arrayBuffer());
  // Fixed mono PCM format. Every upload is independently decodable.
  if (audio.length !== byteLength || audio.toString("ascii", 0, 4) !== "RIFF"
    || audio.readUInt32LE(4) !== audio.length - 8 || audio.toString("ascii", 8, 16) !== "WAVEfmt "
    || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1
    || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000
    || audio.readUInt32LE(28) !== 32000 || audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16
    || audio.toString("ascii", 36, 40) !== "data" || audio.readUInt32LE(40) !== audio.length - 44
    || audio.length % 2 !== 0)
    return Response.json({ error: "invalid" }, { status: 400 });

  const hash = createHash("sha256").update(audio).digest("hex");
  const duration = Math.round((audio.length - 44) / 32);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return Response.json({ error: "unavailable" }, { status: 503 });

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const bucket = admin.storage.from("consultation-audio");
  const path = target.session_id + "/" + sequence + "-" + hash + ".wav";
  const uploaded = await bucket.upload(path, audio, { contentType: "audio/wav", upsert: false });
  // Confirmation checks for the object even if upload returned a conflict or lost its response.
  const confirmed = await client.rpc("consultation_capture", {
    ...target, operation: "confirm", segment_number: sequence,
    segment_duration: duration, segment_hash: hash,
  });
  if (!uploaded.error && confirmed.data?.error === "unavailable") {
    // A discard may have closed the session while Storage was accepting the segment.
    await bucket.remove([path]);
  }
  return response(confirmed);
}
