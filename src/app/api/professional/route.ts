import {
  sameSigningOrigin,
  signingJson,
} from "../../../features/signing/request";
import { getAccess } from "../../../lib/profile";
import { supabaseServer } from "../../../lib/supabase";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const access = await getAccess();
  if (access.status !== 200)
    return Response.json(
      { error: "unauthenticated" },
      { status: access.status, headers },
    );
  if (!sameSigningOrigin(request))
    return Response.json({ error: "denied" }, { status: 403, headers });
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 16000)
      return Response.json({ error: "invalid" }, { status: 413, headers });
    const { action, payload } = await signingJson(request);
    if (!["save", "registration_add", "registration_remove"].includes(action))
      return Response.json({ error: "invalid" }, { status: 400, headers });
    const client = await supabaseServer();
    const { data, error } = await client.rpc("professional_profile_command", {
      action,
      payload,
    });
    if (error)
      return Response.json({ error: "unavailable" }, { status: 409, headers });
    return Response.json(data, { status: data.error ? 409 : 200, headers });
  } catch {
    return Response.json({ error: "invalid" }, { status: 400, headers });
  }
}
