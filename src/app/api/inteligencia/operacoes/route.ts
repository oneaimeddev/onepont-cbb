import { getAccess } from "../../../../lib/profile";
import {
  sameSigningOrigin,
  signingJson,
} from "../../../../features/signing/request";
import { operationGatewayInput } from "../../../../features/chat/operations/capabilities";
import { operationGateway } from "../../../../features/chat/operations/server";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!sameSigningOrigin(request))
    return Response.json({ error: "denied" }, { status: 403, headers });
  const access = await getAccess();
  if (access.status !== 200)
    return Response.json(
      { error: "denied" },
      { status: access.status, headers },
    );
  try {
    const parsed = operationGatewayInput.safeParse(await signingJson(request));
    if (!parsed.success)
      return Response.json({ error: "invalid" }, { status: 400, headers });
    const data = await operationGateway(parsed.data);
    return Response.json(data, { status: data?.error ? 409 : 200, headers });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
