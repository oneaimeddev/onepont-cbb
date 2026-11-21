import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "../../../lib/supabase";
import { signingDemoEnabled } from "../../signing/server";
import { inspectDocumentJourney } from "./workflow-service";
import type { OperationGatewayInput } from "./capabilities";

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend de autorização indisponível.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    },
  });
}

/** No model tool calls this gateway. The original confirmation message is taken directly from the authenticated HTTP request. */
export async function operationGateway(input: OperationGatewayInput) {
  const client = await supabaseServer();
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) return { error: "denied" };
  const actor = auth.data.user.id;
  if (
    ["prepare", "present", "confirm", "execute"].includes(input.action) &&
    !signingDemoEnabled()
  )
    return { error: "mode_unavailable" };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await client.rpc(name, args);
    return result.error ? { error: "unavailable" } : result.data;
  };
  switch (input.action) {
    case "inspect":
      return inspectDocumentJourney(input);
    case "execute":
      return rpc("chat_operation_execute", {
        authorization_id: input.authorizationId,
      });
    case "state":
      return rpc("chat_document_state", { session_id: input.sessionId });
    case "bind":
      return rpc("chat_document_bind", {
        session_id: input.sessionId,
        review_id: input.reviewId,
        expected_revision: input.revision,
        idempotency_key: input.key,
      });
    case "identity":
      return rpc("chat_document_select_identity", {
        workspace_id: input.workspaceId,
        expected_revision: input.revision,
        identity_id: input.identityId,
      });
    case "delivery":
      return rpc("chat_document_select_delivery", {
        workspace_id: input.workspaceId,
        expected_revision: input.revision,
        requested: input.requested,
      });
    case "prepare":
      return rpc("chat_operation_prepare", {
        workspace_id: input.workspaceId,
        expected_revision: input.revision,
        idempotency_key: input.key,
      });
    case "cancel":
      return rpc("chat_operation_cancel", {
        session_id: input.sessionId,
        challenge_id: input.challengeId,
      });
    case "present": {
      const result = await trustedClient().rpc("chat_operation_present", {
        actor,
        session_id: input.sessionId,
        challenge_id: input.challengeId,
        nonce: input.nonce,
        summary_hash: input.summaryHash,
      });
      return result.error ? { error: "unavailable" } : result.data;
    }
    case "confirm": {
      // Voice confirmation is intentionally unavailable until its full UX/intent validation in E.
      if (input.inputMode !== "text")
        return { error: "voice_confirmation_unavailable" };
      const captured = await trustedClient().rpc("chat_capture_human_input", {
        actor,
        session_id: input.sessionId,
        challenge_id: input.challengeId,
        message_key: input.messageId,
        original_text: input.message,
        input_mode: "text",
      });
      if (captured.error || captured.data?.error)
        return captured.data ?? { error: "unavailable" };
      return rpc("chat_operation_confirm_execute", {
        session_id: input.sessionId,
        challenge_id: input.challengeId,
        nonce: input.nonce,
        input_id: captured.data.inputId,
      });
    }
  }
}
