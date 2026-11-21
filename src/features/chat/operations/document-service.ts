import "server-only";
import { createHash } from "node:crypto";
import { supabaseServer } from "../../../lib/supabase";
import { presentedDocument } from "../document-draft";
import {
  proposalIntent,
  proposalSaveIntent,
  resolveProposalEdit,
  type DisplayedProposal,
} from "./document-intent";

export async function documentConversation(input: {
  message: string;
  athleteId: string | null;
  proposals: DisplayedProposal[];
  messageId?: string;
  inputMode?: "text" | "voice";
}) {
  const intent =
    proposalSaveIntent(input.message) ?? proposalIntent(input.message);
  if (!intent) return null;
  const save = intent.action === "save";
  if (!input.proposals.length && intent.action === "review") return null;
  const answer = (
    text: string,
    document: ReturnType<typeof presentedDocument> = null,
  ) => ({ text, document });
  if (intent.mixed)
    return answer(
      "Qual documento deseja alterar: prescrição, solicitação de exames ou pedido cirúrgico?",
    );
  const candidates = input.proposals.filter(
    (p) =>
      p.athleteId === input.athleteId &&
      (!intent.kind || p.kind === intent.kind),
  );
  const distinct = [
    ...new Map(candidates.map((p) => [p.requestId, p])).values(),
  ];
  if (distinct.length !== 1)
    return answer(
      distinct.length > 1
        ? "Há mais de uma proposta compatível nesta conversa. Indique o documento desejado no cartão antes de alterá-lo."
        : "Abra a proposta e confirme o atleta em contexto antes de solicitar a alteração.",
    );
  const shown = distinct[0];
  if (shown.dirty)
    return answer(
      "Há alterações locais no cartão. Revise ou salve essas alterações antes de pedir outra mudança pelo chat.",
    );
  const client = await supabaseServer();
  const current = await client.rpc("chat_document_proposal_read", {
    request_id: shown.requestId,
    kind: shown.kind,
  });
  const document = presentedDocument(current.data?.document);
  if (current.error || !document)
    return answer(
      "Esta proposta não está disponível na conversa atual. Confira o contexto e seu acesso.",
    );
  if (document.athleteId !== input.athleteId)
    return answer("Confirme o atleta em contexto antes de continuar.");
  if (document.readOnlyReason)
    return answer(
      document.readOnlyReason === "finalized"
        ? "Esta versão foi finalizada e não pode ser alterada. Para criar um novo rascunho vinculado à origem, diga “Confirmo criar um documento derivado” neste chat. O original será preservado."
        : "Este documento está somente para consulta. Acompanhe o processamento e o histórico no cartão desta conversa.",
      document,
    );
  if (
    document.version !== shown.version ||
    document.contentHash !== shown.contentHash
  )
    return answer(
      "A proposta mudou desde a versão exibida. Atualizei o cartão; confira a versão atual e repita a alteração.",
      document,
    );
  if (save) {
    const r = await client.rpc("chat_document_save_message", {
      request_id: shown.requestId,
      expected_version: shown.version,
      expected_hash: shown.contentHash,
      message_key: input.messageId ?? crypto.randomUUID(),
      utterance: input.message,
      input_mode: input.inputMode ?? "text",
    });
    if (r.error || r.data?.error)
      return answer(
        r.data?.error === "conflict"
          ? "A versão mudou. Confira a proposta atual antes de confirmar novamente."
          : "Para salvar somente este rascunho, confirme o tipo do documento e diga “Pode confirmar e salvar a prescrição”, “o pedido cirúrgico” ou “a solicitação de exames”. Assinatura e emissão não estão autorizadas.",
      );
    return answer(
      "Salvei esta versão como rascunho. O documento não foi assinado nem emitido.",
      presentedDocument(r.data?.document),
    );
  }
  const key = input.messageId ?? crypto.randomUUID();
  if (intent.action === "review") {
    const r = await client.rpc("chat_document_proposal_review", {
      request_id: shown.requestId,
      expected_version: shown.version,
      expected_hash: shown.contentHash,
      idempotency_key: key,
    });
    if (r.error || r.data?.error)
      return answer(
        r.data?.error === "incomplete"
          ? "Faltam campos obrigatórios para preparar a revisão documental. Confira os campos indicados no cartão."
          : "Não foi possível preparar esta revisão. Confira a versão atual da proposta.",
        document,
      );
    return answer(
      "Preparei a revisão documental desta versão. Confira o conteúdo apresentado; ele continua sem assinatura e sem emissão.",
      presentedDocument({
        ...r.data.document,
        preview: r.data.review?.material,
      }),
    );
  }
  let itemNumber = 0;
  const resolved = resolveProposalEdit(input.message, document, () => {
    const hash = createHash("sha256")
      .update(`${shown.requestId}:${key}:${itemNumber++}`)
      .digest("hex");
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  });
  if ("clarification" in resolved) return answer(resolved.clarification);
  const patched = await client.rpc("chat_document_proposal_patch", {
    request_id: shown.requestId,
    expected_version: shown.version,
    expected_hash: shown.contentHash,
    changes: resolved.changes,
    idempotency_key: key,
  });
  const next = presentedDocument({
    ...patched.data?.document,
    preview: patched.data?.review?.material,
  });
  if (patched.error || !next)
    return answer(
      patched.data?.error === "conflict"
        ? "A proposta foi alterada em outra requisição. Reabra o cartão e repita a alteração sobre a versão atual."
        : "Não foi possível aplicar a alteração. Confira o item, o campo e os limites do documento.",
    );
  return answer(
    "Atualizei a proposta e preservei os campos não mencionados. Confira o cartão antes de salvar. O documento não foi assinado nem emitido.",
    next,
  );
}
