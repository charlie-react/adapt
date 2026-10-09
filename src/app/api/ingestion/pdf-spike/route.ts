import { pdfInputAdapter } from "@/lib/ingestion/pdf/adapter";
import { PDF_SPIKE_LIMITS } from "@/lib/ingestion/pdf/contracts";
import { ingestionFailure } from "@/lib/ingestion/errors";
import type { IngestionResult } from "@/lib/ingestion/types";

export const runtime = "nodejs";
let activeRequests = 0;
function response(result: IngestionResult): Response {
  const status = result.ok ? 200 : ({ RESOURCE_LIMIT: 413, BUSY: 429, TIMEOUT: 408, ABORTED: 408, EXTRACTION_FAILED: 500 }[result.error.code as string] || 422);
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

// Opt-in, raw-byte compatibility probe. This is not the future upload workflow.
export async function POST(request: Request): Promise<Response> {
  if (process.env.ADAPT_PDF_SPIKE !== "1") return new Response(null, { status: 404 });
  if (activeRequests >= 2) return response(ingestionFailure("BUSY"));
  if (Number(request.headers.get("content-length")) > PDF_SPIKE_LIMITS.maxBytes) return response(ingestionFailure("RESOURCE_LIMIT"));
  if (!request.body) return response(ingestionFailure("EMPTY_INPUT"));
  activeRequests++;
  const reader = request.body.getReader();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(PDF_SPIKE_LIMITS.timeoutMs)]);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (signal.aborted) cancel();
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PDF_SPIKE_LIMITS.maxBytes) {
        await reader.cancel();
        return response(ingestionFailure("RESOURCE_LIMIT"));
      }
      chunks.push(value);
    }
    if (signal.aborted) return response(ingestionFailure(request.signal.aborted ? "ABORTED" : "TIMEOUT"));
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return response(await pdfInputAdapter.ingest({ bytes, mediaType: request.headers.get("content-type") || "application/octet-stream" }, signal));
  } catch {
    return response(ingestionFailure(signal.aborted ? request.signal.aborted ? "ABORTED" : "TIMEOUT" : "INVALID_PDF"));
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
    activeRequests--;
  }
}
