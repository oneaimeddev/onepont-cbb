import { attachmentUpload } from "../../../../../features/attachments/service";
export const maxDuration = 60;
export const POST = (request: Request) => attachmentUpload(request, "ai_chat");
