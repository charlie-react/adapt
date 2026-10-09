import "server-only";
export class RequestFailure extends Error { constructor(public code: string, public status = 400) { super(code); } }
export function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin"); if (!origin) return true;
  const url = new URL(request.url);
  try { const incoming = new URL(origin); return incoming.protocol === url.protocol && incoming.host === (request.headers.get("host") || url.host).toLowerCase(); } catch { return false; }
}
export async function boundedBody(request: Request, maxBytes: number, signal: AbortSignal) {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RequestFailure("RESOURCE_LIMIT", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (!signal.aborted) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new RequestFailure("RESOURCE_LIMIT", 413); } chunks.push(value); }
    if (signal.aborted) throw new RequestFailure(request.signal.aborted ? "ABORTED" : "TIMEOUT", 408);
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
export async function requestJson(request: Request, maxBytes = 64000): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new RequestFailure("INVALID_REQUEST");
  const bytes = await boundedBody(request, maxBytes, AbortSignal.any([request.signal, AbortSignal.timeout(10000)]));
  let value: unknown; try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new RequestFailure("INVALID_REQUEST"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestFailure("INVALID_REQUEST"); return value as Record<string, unknown>;
}
