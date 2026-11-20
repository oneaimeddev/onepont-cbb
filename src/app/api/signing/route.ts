import {
  sameSigningOrigin,
  signingJson,
} from "../../../features/signing/request";
import { getAccess } from "../../../lib/profile";
import { dispatchSigning } from "../../../features/signing/server";
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
  if (Number(request.headers.get("content-length") ?? 0) > 16000)
    return Response.json({ error: "invalid" }, { status: 413, headers });
  try {
    const body = await signingJson(request);
    if (
      !body ||
      ![
        "connect",
        "disconnect",
        "list",
        "prefer",
        "prepare",
        "snapshot",
        "confirm",
        "status",
        "cancel",
      ].includes(body.action) ||
      typeof body.payload !== "object" ||
      !body.payload
    )
      return Response.json({ error: "invalid" }, { status: 400, headers });
    const data = await dispatchSigning(body.action, body.payload);
    return Response.json(data, { status: data.error ? 409 : 200, headers });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
