import {
  attachmentList,
  attachmentUpload,
} from "../../../features/attachments/service";
export const maxDuration = 60;
export const GET = (request: Request) =>
  attachmentList(request, "traditional_ui");
export const POST = (request: Request) =>
  attachmentUpload(request, "traditional_ui");
