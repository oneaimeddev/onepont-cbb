import {
  signingCommand,
  signingDemoEnabled,
} from "../../../../features/signing/server";
import { getAccess } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import {
  sameSigningOrigin,
  signingJson,
} from "../../../../features/signing/request";
import { reconcileDocumentDelivery } from "../../../../features/delivery/server";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const access = await getAccess();
  if (access.status !== 200)
    return Response.json(
      { error: "unavailable" },
      { status: access.status, headers },
    );
  if (!sameSigningOrigin(request))
    return Response.json({ error: "denied" }, { status: 403, headers });
  try {
    const { action, payload } = await signingJson(request);
    if (
      ![
        "get",
        "derive",
        "retry",
        "resend",
        "cancel",
        "cancel_signature",
      ].includes(action) ||
      !payload
    )
      return Response.json({ error: "invalid" }, { status: 400, headers });
    const client = await supabaseServer();
    if (action === "cancel_signature") {
      const checked = await client.rpc("document_workflow_get", {
        target: payload.document_id,
      });
      if (checked.error || checked.data?.error)
        return Response.json(
          { error: "unavailable" },
          { status: 404, headers },
        );
      const result = await signingCommand("cancel", {
        attempt_id: checked.data.workflow.signature?.attemptId,
      });
      return Response.json(result, {
        status: result.error ? 409 : 200,
        headers,
      });
    }
    if (action !== "get") {
      const { data, error } = await client.rpc("document_workflow_action", {
        action,
        payload,
      });
      if (error || data?.error)
        return Response.json(data ?? { error: "unavailable" }, {
          status: 409,
          headers,
        });
      return Response.json(data, { headers });
    }
    const before = await client.rpc("document_workflow_get", {
      target: payload.document_id,
    });
    if (before.error || before.data?.error)
      return Response.json({ error: "unavailable" }, { status: 404, headers });
    const signature = before.data.workflow.signature;
    if (
      signature &&
      ["authorizing", "processing"].includes(signature.state) &&
      signingDemoEnabled()
    )
      await signingCommand("status", { attempt_id: signature.attemptId });
    // Read authorization precedes privileged background reconciliation.
    await reconcileDocumentDelivery(payload.document_id);
    const { data, error } = await client.rpc("document_workflow_get", {
      target: payload.document_id,
    });
    if (error || data?.error)
      return Response.json({ error: "unavailable" }, { status: 404, headers });
    return Response.json(data, { headers });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
