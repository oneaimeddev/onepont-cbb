import "server-only";
import { supabaseServer } from "../../lib/supabase";
import { signingCommand, signingDemoEnabled } from "../signing/server";
import { reconcileDocumentDelivery } from "../delivery/server";
import type { WorkflowDetail } from "./workflow-types";
export async function getDocumentWorkflow(documentId: string) {
  const client = await supabaseServer();
  const first = await client.rpc("document_workflow_get", {
    target: documentId,
  });
  if (first.error || first.data?.error)
    throw new Error("Não foi possível consultar este documento.");
  const signature = first.data.workflow.signature;
  if (
    signature &&
    ["authorizing", "processing"].includes(signature.state) &&
    signingDemoEnabled()
  )
    await signingCommand("status", { attempt_id: signature.attemptId });
  await reconcileDocumentDelivery(documentId);
  const { data, error } = await client.rpc("document_workflow_get", {
    target: documentId,
  });
  if (error || data?.error)
    throw new Error("Não foi possível consultar este documento.");
  return data as WorkflowDetail;
}
