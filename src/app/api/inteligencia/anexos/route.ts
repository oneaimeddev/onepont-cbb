import { attachmentList } from "../../../../features/attachments/service";
export const GET = (request: Request) => attachmentList(request, "ai_chat");
