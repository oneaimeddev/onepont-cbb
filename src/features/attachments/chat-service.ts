import "server-only";
import { supabaseServer } from "../../lib/supabase";
import { uuidPattern } from "../chat/guards";
import { attachmentIntent } from "./conversation";
import type { Attachment, AttachmentBoard } from "./types";

export async function attachmentConversation(input: {
  message: string;
  athleteId: string | null;
  ids?: string[];
  mode?: "text" | "voice";
  agent?: boolean;
}) {
  const intent = attachmentIntent(input.message, Boolean(input.ids?.length));
  if (!intent) return null;
  const empty = {
    board: null as AttachmentBoard | null,
    summary: [] as {
      id: string;
      title: string;
      category: string;
      date: string | null;
    }[],
  };
  if (!input.athleteId || !uuidPattern.test(input.athleteId))
    return {
      ...empty,
      text: "Selecione um atleta autorizado para consultar seus anexos.",
    };
  const client = await supabaseServer();
  const filters: Record<string, unknown> = { category: intent.category };
  const ids = (input.ids ?? [])
    .filter((id) => uuidPattern.test(id))
    .slice(0, 25);
  // The reference is always reauthorized. Never resolve an ordinal from another athlete's roster.
  if (intent.ordinal && ids.length) filters.ids = ids;
  const { data, error } = await client.rpc("attachment_list", {
    target: input.athleteId,
    filters,
    channel: input.mode === "voice" ? "ai_voice" : "ai_chat",
    method: input.agent
      ? "agent_tool"
      : input.mode === "voice"
        ? "human_voice"
        : "human_message",
  });
  if (error || data?.error)
    return {
      ...empty,
      text: "Não foi possível consultar anexos autorizados deste atleta.",
    };
  let items = (data.items ?? []) as Attachment[];
  if (intent.ordinal && ids.length) {
    const requested = ids[intent.ordinal - 1];
    items = items.filter((item) => item.id === requested);
  } else if (intent.ordinal)
    items = items.slice(intent.ordinal - 1, intent.ordinal);
  else if (intent.open && intent.latest) items = items.slice(0, 1);
  const openId = intent.open && items.length === 1 ? items[0].id : null;
  return {
    text: items.length
      ? `Encontrei ${items.length} ${items.length === 1 ? "anexo autorizado" : "anexos autorizados"}. Os cartões permitem visualizar o arquivo. Seu conteúdo não foi interpretado pela IA.`
      : "Nenhum anexo desta referência está disponível para você.",
    board: {
      athleteId: input.athleteId,
      ids: items.map((item) => item.id),
      openId,
    } satisfies AttachmentBoard,
    summary: items.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      date: item.document_date,
    })),
  };
}
