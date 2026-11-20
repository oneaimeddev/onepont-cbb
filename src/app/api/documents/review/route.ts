import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import {
  sameSigningOrigin,
  signingJson,
} from "../../../../features/signing/request";
import {
  signingCommand,
  signingDemoEnabled,
} from "../../../../features/signing/server";
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
    const { action, payload } = await signingJson(request, 100000);
    if (
      !["open", "get", "save", "sign", "draft"].includes(action) ||
      !payload ||
      typeof payload !== "object"
    )
      return Response.json({ error: "invalid" }, { status: 400, headers });
    if (action === "sign" && !signingDemoEnabled())
      return Response.json({ error: "unavailable" }, { status: 409, headers });
    const client = await supabaseServer();
    const { data, error } =
      action === "draft"
        ? await client.rpc("document_save", {
            target: payload.athlete_id,
            document_id: payload.document_id,
            expected_version: payload.version,
            kind: payload.kind,
            payload: payload.content,
            intent: "save",
          })
        : await client.rpc("document_review_command", { action, payload });
    if (error)
      return Response.json({ error: "unavailable" }, { status: 409, headers });
    if (data?.error) return Response.json(data, { status: 409, headers });
    if (action === "open" || action === "get") {
      const inventory = signingDemoEnabled()
        ? await signingCommand("list")
        : null;
      return Response.json(
        {
          ...data,
          inventory: inventory?.error ? null : inventory,
          demo_enabled: !!inventory && !inventory.error,
        },
        { headers },
      );
    }
    return Response.json(data, { headers });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
