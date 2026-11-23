import "server-only";
import { supabaseServer } from "../../../lib/supabase";
import { signingCommand, signingDemoEnabled } from "../../signing/server";
import type { WorkflowDetail } from "../../documents/workflow-types";
import { reconcileDocumentDelivery } from "../../delivery/server";
import {
  signatureLabel,
  deliveryLabel,
  signatureNeedsNewReview,
} from "../../documents/workflow-types";
import { presentedDocument } from "../document-draft";
import { creationPatientMatches } from "./document-creation";
import { foldName } from "../athlete-resolution";
import { operationGateway } from "./server";
import type { DisplayedProposal } from "./document-intent";
import type { DocumentWorkspaceState } from "./contracts";
import type { SigningInventory } from "../../signing/contracts";

export async function inspectDocumentJourney(scope: DisplayedProposal) {
  const client = await supabaseServer();
  const current = await client.rpc("conversation_current");
  if (
    current.error ||
    !current.data?.ok ||
    current.data.session?.athleteId !== scope.athleteId
  )
    return { error: "denied" };
  const read = await client.rpc("chat_document_proposal_read", {
    request_id: scope.requestId,
    kind: scope.kind,
  });
  const document = presentedDocument(read.data?.document);
  if (read.error || !document || document.athleteId !== scope.athleteId)
    return { error: "denied" };
  if (
    document.version !== scope.version ||
    document.contentHash !== scope.contentHash
  )
    return { error: "conflict" };
  const raw = await client.rpc("chat_document_state", {
    session_id: current.data.session.id,
  });
  const state: DocumentWorkspaceState | null =
    !raw.error &&
    !raw.data?.error &&
    raw.data?.workspace?.documentId === scope.requestId
      ? raw.data
      : null;
  const inventory: SigningInventory | null = signingDemoEnabled()
    ? await signingCommand("list")
    : null;
  let workflow: WorkflowDetail | null = null;
  let effectiveDocument = document;
  if (document.documentId) {
    const args = {
      request_id: scope.requestId,
      expected_version: scope.version,
      expected_hash: scope.contentHash,
    };
    const before = await client.rpc("chat_document_status", {
      ...args,
      advance: signingDemoEnabled(),
    });
    if (before.error || before.data?.error) return { error: "denied" };
    await reconcileDocumentDelivery(document.documentId);
    const after = await client.rpc("chat_document_status", {
      ...args,
      advance: false,
    });
    if (after.error || after.data?.error) return { error: "denied" };
    workflow = after.data as WorkflowDetail;
    effectiveDocument = presentedDocument(after.data.document) ?? document;
  }
  return {
    document: effectiveDocument,
    sessionId: current.data.session.id,
    state,
    inventory,
    workflow,
    demoEnabled: signingDemoEnabled(),
  };
}
function statusText(detail: WorkflowDetail | null) {
  if (!detail) return "O documento ainda não foi salvo nem assinado.";
  const w = detail.workflow;
  return [
    w.signature ? signatureLabel(w.signature) : "Documento sem assinatura",
    w.lifecycle === "finalized" ? "Versão finalizada e somente leitura." : "",
    ...w.deliveries.map((d) => deliveryLabel(d.state, d.provenance)),
  ]
    .filter(Boolean)
    .join(". ");
}
export function workflowIntent(message: string) {
  const header = foldName(message.split(/[:;\n]/u)[0]);
  if (
    /^(altere|troque|adicione|inclua|remova|crie|prepare|salve)\b/.test(
      header,
    ) ||
    /\b(confirmar e salvar|salvar)\b/.test(header)
  )
    return false;
  return /^(?:sim|confirmo)\b/.test(header) || /\b(assine|assinar|assinatura|identidade|certificado|envie|enviar|envio|enviado|whatsapp|entrega|derivado|reenviar|reenvie|conectar assinatura|tente novamente|cancelar operacao|cancele a operacao|retome a operacao autorizada|retomar a operacao autorizada)\b/.test(
    header,
  );
}
const recipientBlocked = "Ainda falta um destinatário autorizado para esta entrega.";
const recipientHelp = "Abra o cadastro existente para conferir os dados do atleta ou responsável. Depois volte e diga “Retomar a preparação do envio”.";

export async function workflowConversation(input: {
  message: string;
  athleteId: string | null;
  proposals: DisplayedProposal[];
  messageId?: string;
  inputMode?: "text" | "voice";
  previousReply?: string;
}) {
  const text = foldName(input.message);
  const blockedRecipient = input.previousReply?.startsWith(recipientBlocked) === true;
  const followRecipient = blockedRecipient && /^(?:(?:certo|ok|sim) )?(?:vamos resolver(?: isso)?|como (?:corrijo|resolvo)(?: isso)?)$/.test(text);
  const resumeRecipient = /^retom(?:e|ar) a preparacao do envio$/.test(text);
  if (!followRecipient && !workflowIntent(input.message)) return null;
  if (
    !input.proposals.length &&
    !/\b(assine|assinar|assinatura|identidade|certificado|documento|prescricao|receita|exames|cirurgico|whatsapp|entrega|derivado)\b/.test(
      text,
    )
  )
    return null;
  const reply = (
    text: string,
    document: ReturnType<typeof presentedDocument> = null,
  ) => ({ text, document });
  const kinds = [
    /\b(prescricao|receita)\b/.test(text) ? "prescription" : null,
    /\bexames?\b/.test(text) ? "exam_request" : null,
    /\bcirurgico\b/.test(text) ? "surgical_order" : null,
    /\batestado\b/.test(text) ? "certificate" : null,
    /\bencaminhamento\b/.test(text) ? "referral" : null,
  ].filter(Boolean);
  const candidates = [
    ...new Map(
      input.proposals
        .filter(
          (p) =>
            p.athleteId === input.athleteId &&
            (!kinds.length || kinds.includes(p.kind)),
        )
        .map((p) => [p.requestId, p]),
    ).values(),
  ];
  if (kinds.length > 1 || candidates.length !== 1)
    return reply(
      "Selecione no cartão o documento desejado e confirme o atleta em contexto antes de continuar.",
    );
  const scope = candidates[0];
  if (scope.dirty)
    return reply(
      "Revise ou salve as alterações locais do cartão antes de preparar a assinatura.",
    );
  const view = await inspectDocumentJourney(scope);
  if ("error" in view)
    return reply(
      "Esta versão não está disponível. Confira seu acesso, o contexto e a versão atual do cartão.",
    );
  const { document, sessionId } = view;
  const recipientGuidance = () => ({
    ...reply(recipientBlocked + " " + recipientHelp, document),
    navigation: { id: document.athleteId, name: document.athleteName, href: `/atletas/${document.athleteId}?aba=cadastro` },
  });
  if (followRecipient || (blockedRecipient && /^(sim|confirmo|retom(?:e|ar) a operacao autorizada)\b/.test(text)))
    return recipientGuidance();
  if (
    /\b(assine|assinar)\b/.test(text) &&
    !creationPatientMatches(input.message, document.athleteName) &&
    !/\bpara (o atleta|a atleta|o responsavel|a responsavel)\b/.test(text)
  )
    return reply(
      "O nome informado não corresponde ao atleta em contexto. Confirme o atleta antes de continuar.",
      document,
    );
  const client = await supabaseServer();
  const key = input.messageId ?? crypto.randomUUID();
  if (
    /^(consult|mostre|ver|qual|como|acompanhe|atualize|status|historico)/.test(
      text,
    ) ||
    /\b(ja foi|foi enviado)\b/.test(text)
  )
    return reply(statusText(view.workflow), document);
  if (input.inputMode === "voice" && /^(sim|confirmo|retom(?:e|ar) a operacao autorizada)\b/.test(text))
    return reply(
      "Confira a versão e o resumo no cartão. Para autorizar assinatura, entrega, reenvio ou derivação, envie a confirmação por texto neste chat.",
      document,
    );
  if (/\b(derivado|corrigir|corrija)\b/.test(text)) {
    if (text !== "confirmo criar um documento derivado")
      return reply(
        "A versão finalizada não pode ser alterada. Para criar outro rascunho vinculado à origem, sem cancelar o original, diga: Confirmo criar um documento derivado.",
        document,
      );
    const r = await client.rpc("chat_document_workflow", {
      request_id: scope.requestId,
      expected_version: scope.version,
      expected_hash: scope.contentHash,
      action: "derive",
      message_key: key,
      utterance: input.message,
    });
    return reply(
      r.error || r.data?.error
        ? "Não foi possível criar o derivado. Confira se a origem está finalizada."
        : "Criei um novo rascunho vinculado à origem. A versão finalizada foi preservada; o novo documento exige outra revisão e assinatura.",
      presentedDocument(r.data?.document) ?? document,
    );
  }
  const retryingSignature =
    /\bassinatura\b/.test(text) &&
    /\b(tentar novamente|tente novamente)\b/.test(text);
  if (
    !retryingSignature &&
    /\b(tentar novamente|tente novamente|reenviar|reenvie)\b/.test(text)
  ) {
    const action = /\b(reenviar|reenvie)\b/.test(text) ? "resend" : "retry";
    if (!text.startsWith("confirmo "))
      return reply(
        `${statusText(view.workflow)}. Confira o destinatário apresentado no cartão. Para confirmar, envie “${action === "retry" ? "Confirmo tentar novamente a entrega" : "Confirmo reenviar o documento"}; justificativa: SUA JUSTIFICATIVA” (mínimo 8 caracteres). Isso não cria outra assinatura.`,
        document,
      );
    const r = await client.rpc("chat_document_workflow", {
      request_id: scope.requestId,
      expected_version: scope.version,
      expected_hash: scope.contentHash,
      action,
      message_key: key,
      utterance: input.message,
    });
    return reply(
      r.error || r.data?.error
        ? "A entrega não está elegível ou a confirmação/justificativa não é válida. Consulte o estado atual; nenhum reenvio foi presumido."
        : "Solicitação registrada no motor de entrega simulada, sem outra assinatura. Consulte o resultado no cartão.",
      document,
    );
  }
  const requiresNewReview = signatureNeedsNewReview(
    view.workflow?.workflow.signature,
  );
  if (view.workflow?.workflow.signature && !requiresNewReview)
    return reply(statusText(view.workflow), document);
  if (!signingDemoEnabled())
    return reply(
      "Assinatura demonstrativa indisponível neste ambiente. O rascunho foi preservado.",
      document,
    );
  if (text === "conectar assinatura demonstrativa") {
    await signingCommand("connect");
    return reply(
      "Conexão demonstrativa solicitada. Peça para listar identidades e escolha explicitamente uma delas.",
      document,
    );
  }
  if (!view.inventory?.connected)
    return reply(
      "Não há identidade conectada. Diga “Conectar assinatura demonstrativa” para habilitar somente o adaptador de demonstração.",
      document,
    );
  let state = view.state;
  if ((requiresNewReview || resumeRecipient) && state?.authorization) state = null;
  if (/^retom(?:e|ar) a operacao autorizada$/.test(text)) {
    const authorization = state?.authorization;
    if (!authorization)
      return reply(
        "Não há uma autorização válida para retomar. Prepare uma nova revisão.",
        document,
      );
    const r = await operationGateway({
      action: "execute",
      sessionId,
      authorizationId: authorization.authorizationId,
    });
    return reply(
      r?.error
        ? "Esta autorização não pôde ser retomada. Confira se o contexto e o resumo ainda são válidos."
        : "Consultei a autorização e o motor existente. Acompanhe o resultado no cartão, sem repetir assinatura ou envio.",
      document,
    );
  }
  const confirming = /^(sim|confirmo)(?:\b|$)/.test(text);
  if (confirming) {
    const c = state?.challenge;
    if (!c || c.phase !== "pending" || !c.presentedAt)
      return reply(
        "Não há uma operação pendente apresentada e válida. Peça a assinatura e confira o resumo antes de confirmar.",
        document,
      );
    const r = await operationGateway({
      action: "confirm",
      sessionId,
      challengeId: c.id,
      nonce: c.nonce,
      messageId: key,
      message: input.message,
      inputMode: "text",
    });
    return reply(
      r?.error
        ? "A confirmação não foi executada. O resumo pode ter mudado ou expirado; confira a versão, a identidade e os efeitos antes de tentar novamente."
        : "Autorização humana validada. O motor iniciou a assinatura demonstrativa. Consulte o resultado no cartão; não há assinatura digital real nem envio real pelo WhatsApp.",
      document,
    );
  }
  if (
    /^(cancele a operacao|cancelar operacao)$/.test(text) &&
    state?.challenge
  ) {
    await operationGateway({
      action: "cancel",
      sessionId,
      challengeId: state.challenge.id,
    });
    return reply(
      "Operação pendente cancelada. O rascunho foi preservado.",
      document,
    );
  }
  if (!state) {
    const r = await client.rpc("chat_document_proposal_review", {
      request_id: scope.requestId,
      expected_version: scope.version,
      expected_hash: scope.contentHash,
      idempotency_key: key,
    });
    if (r.error || r.data?.error)
      return reply(
        "Complete os campos essenciais e prepare novamente a revisão antes de assinar.",
        document,
      );
    state = r.data as DocumentWorkspaceState;
  }
  const identities = view.inventory.identities;
  if (/\b(usar|use|escolho|selecione|identidade|certificado)\b/.test(text)) {
    const matches = identities.filter((i) => text.includes(foldName(i.label)));
    if (matches.length !== 1)
      return reply(
        `Escolha uma identidade pelo nome completo: ${identities.map((i) => i.label).join("; ")}. Nenhuma identidade foi selecionada automaticamente.`,
        document,
      );
    const r = await operationGateway({
      action: "identity",
      workspaceId: state!.workspace.id,
      revision: state!.workspace.revision,
      identityId: matches[0].id,
    });
    if (r?.error)
      return reply(
        "A escolha ficou desatualizada. Consulte o cartão e escolha novamente.",
        document,
      );
    state = r;
  }
  if (!state?.workspace)
    return reply(
      "Não foi possível recuperar a revisão atual. Peça uma nova revisão.",
      document,
    );
  if (resumeRecipient || /\b(envie|enviar|whatsapp|sem envio|nao envie|nao enviar|preparar o envio)\b/.test(text)) {
    if (
      /\bpara\b/.test(text) &&
      !/\bpara (o atleta|a atleta|o responsavel|a responsavel|o destinatario apresentado)\b/.test(
        text,
      )
    )
      return reply(
        "O envio só pode usar o destinatário autorizado e apresentado no cartão. Não vou inferir outro telefone ou destinatário.",
        document,
      );
    if (
      (/\bpara (o responsavel|a responsavel)\b/.test(text) &&
        state.review.recipient.category !== "guardian") ||
      (/\bpara (o atleta|a atleta)\b/.test(text) &&
        state.review.recipient.category !== "athlete")
    )
      return reply(
        "O destinatário pedido difere do destinatário elegível apresentado. Confira o responsável e a política de menores antes de continuar.",
        document,
      );
    const requested = !/\b(sem envio|nao envie|nao enviar)\b/.test(text);
    const r = await operationGateway({
      action: "delivery",
      workspaceId: state.workspace.id,
      revision: state.workspace.revision,
      requested,
    });
    if (r?.error === "recipient_unavailable") return recipientGuidance();
    if (!r || r.error)
      return reply("Não foi possível atualizar a entrega. Abra a revisão e retome a preparação do envio.", document);
    state = r;
  }
  if (!state?.workspace.identityId)
    return reply(
      `Escolha a identidade antes de preparar a assinatura: ${identities.map((i) => i.label).join("; ")}. Diga “Use a identidade NOME COMPLETO”.`,
      document,
    );
  const prepared = await operationGateway({
    action: "prepare",
    workspaceId: state!.workspace.id,
    revision: state!.workspace.revision,
    key,
  });
  if (prepared?.error)
    return reply(
      "Não foi possível preparar esta autorização. Atualize a revisão e confira identidade e destinatário.",
      document,
    );
  return reply(
    "Preparei o resumo de autorização no cartão. Confira o documento, identidade, modo demonstrativo e destinatário. Só depois confirme por texto; preparar não assina nem envia.",
    { ...document, preview: state!.review.material },
  );
}
