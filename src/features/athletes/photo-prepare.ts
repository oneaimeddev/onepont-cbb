"use client";

// Athlete photos are prepared in the browser before upload: any image the device can open
// (JPEG, PNG, WebP, HEIC from the iPhone, AVIF…) is decoded, reduced to at most 1024 px on the
// longest side, placed on a white background (transparent cut-outs) and sent as JPEG. This keeps
// the upload well under the hosting request limit, whatever the size of the original file.
export const photoAccept = "image/*,.heic,.heif";
const maxSide = 1024;

export class PhotoError extends Error {}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* Some formats decode only through an image element. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError("Não foi possível abrir esta imagem. Use uma foto em JPEG, PNG, WebP ou HEIC.");
  }
}

export async function preparePhoto(file: File): Promise<File> {
  if (file.type && !file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
    throw new PhotoError("Escolha um arquivo de imagem.");
  }
  const image = await decode(file);
  try {
    if (!image.width || !image.height) throw new PhotoError("A imagem está vazia.");
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoError("Este navegador não consegue preparar a foto.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new PhotoError("Não foi possível preparar a foto.");
    return new File([blob], "foto.jpg", { type: "image/jpeg" });
  } finally {
    image.close();
  }
}
