import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

export function attachmentLimit() {
  const configured = Number(process.env.CBB_ATTACHMENT_MAX_MB ?? 20);
  return Math.floor(
    (Number.isFinite(configured) && configured > 0
      ? Math.min(configured, 20)
      : 20) *
      1024 *
      1024,
  );
}
export async function validateAttachment(file: File) {
  if (!file.size || file.size > attachmentLimit()) throw new Error("size");
  const bytes = Buffer.from(await file.arrayBuffer());
  let mime: string;
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    if (!bytes.subarray(-2048).includes(Buffer.from("%%EOF")))
      throw new Error("format");
    const pdf = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (pdf.isEncrypted || !pdf.getPageCount() || pdf.getPageCount() > 2000)
      throw new Error("format");
    mime = "application/pdf";
  } else {
    const image = sharp(bytes, { limitInputPixels: 30000000, animated: false });
    const info = await image.metadata();
    if (
      !info.format ||
      !["jpeg", "png", "webp"].includes(info.format) ||
      (info.pages ?? 1) > 1
    )
      throw new Error("format");
    await image.stats();
    mime = `image/${info.format}`;
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const extensions: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
  };
  if (!extension || !extensions[mime].includes(extension))
    throw new Error("format");
  return {
    bytes,
    mime,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    name: file.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 200),
  };
}
