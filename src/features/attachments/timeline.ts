import "server-only";
import { supabaseServer } from "../../lib/supabase";
import { attachmentCategories, type Attachment, type AttachmentPage } from "./types";

export type TimelineAttachment = {
  id: string;
  title: string;
  category: string;
  author: string;
  /** Clinical date of the file when informed; otherwise the upload time. */
  occurred_at: string;
};

const maxPages = 8;

/**
 * Attachments the professional can open for this athlete, for the profile timeline. The
 * listing RPC applies the same access rules as the attachments tab (author and references).
 */
export async function timelineAttachments(athleteId: string): Promise<TimelineAttachment[]> {
  const client = await supabaseServer();
  const items: Attachment[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await client.rpc("attachment_list", { target: athleteId, filters: { page: String(page) }, channel: "traditional_ui" });
    const result = data as (AttachmentPage & { error?: string }) | null;
    if (error || !result || result.error || !Array.isArray(result.items)) break;
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) break;
  }
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    category: attachmentCategories[item.category] ?? "Anexo",
    author: item.uploaded_by_name ?? "",
    occurred_at: item.document_date && /^\d{4}-\d{2}-\d{2}$/.test(item.document_date)
      ? new Date(`${item.document_date}T12:00:00-03:00`).toISOString()
      : item.created_at,
  }));
}
