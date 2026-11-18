import {
  attachmentRead,
  attachmentEdit,
} from "../../../../../features/attachments/service";
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) =>
  attachmentRead(request, (await context.params).id, "ai_chat");
export const PATCH = async (request: Request, context: Context) =>
  attachmentEdit(request, (await context.params).id, "ai_chat");
