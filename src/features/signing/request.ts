import "server-only";
export function sameSigningOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    return (
      ["http:", "https:"].includes(origin.protocol) &&
      origin.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
}
export async function signingJson(request: Request, maxBytes = 16000) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Invalid request");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error("Invalid request");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
