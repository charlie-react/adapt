import "server-only";
import { PDF_SPIKE_LIMITS } from "../ingestion/pdf/contracts";
import { ingestAndAssessPdf, pdfQualityInput } from "../ingestion/pdf/quality";
import type { MaterialReview } from "../material-quality/types";
import { createReviewStore, materialReviews, ReviewError } from "./service";
import { goalSuggestionProvider, type GoalSuggestionProvider } from "../ai/learning-goal";

const cookieName = "adapt-material-review";
const errors: Record<string, string> = {
  EXPIRED: "This temporary review has expired or the server restarted. Upload the PDF again. Nothing was saved permanently.",
  BUSY: "The service is busy. Please try again shortly.", NOT_READY: "This material is not ready. Its extraction problems must be resolved before accommodation.",
  REVIEW_REQUIRED: "Review every extracted page, compare it with the original, and accept the stated limitations before confirming.",
  STALE_REVIEW: "The material or review changed. Upload it again and review the current result.", INVALID_REQUEST: "The request could not be accepted. Please try again.",
  EMPTY_INPUT: "This file is empty. Choose a PDF with selectable text.", NOT_PDF: "The selected file is not a PDF. Its contents, rather than its filename, are checked.",
  INVALID_PDF: "This PDF is malformed or incomplete. Try another copy of the source.", PASSWORD_PROTECTED: "Password-protected PDFs are not supported. Choose an accessible, unprotected copy; do not share passwords.",
  NO_READABLE_TEXT: "No selectable text was found. Scans and image-only PDFs need another extraction method; OCR is not available.",
  RESOURCE_LIMIT: "The PDF exceeds the current limits: 5 MiB, 100 pages or the extraction processing budget. Try a smaller source; ADAPT will not silently skip pages.",
  TIMEOUT: "Extraction took too long and was stopped. Try again or use a smaller source.", ABORTED: "Extraction was cancelled.",
  EXTRACTION_FAILED: "Extraction could not finish. Please try again. No usable material has been confirmed.",
};
function json(value: unknown, status = 200, cookie?: string) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } }); }
function key(request: Request) { return request.headers.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1); }
function cookie(request: Request, value: string, clear = false) { return `${cookieName}=${value}; Path=/api/material-review; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 900}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`; }
function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  // Next can reconstruct request.url using the server's internal hostname.
  // Compare the browser origin with the incoming Host, never a forwarded host.
  const url = new URL(request.url);
  try { const incoming = new URL(origin); return incoming.protocol === url.protocol && incoming.host === (request.headers.get("host") || url.host).toLowerCase(); }
  catch { return false; }
}
async function boundedBody(request: Request, maxBytes: number, signal: AbortSignal) {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ReviewError("RESOURCE_LIMIT", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (!signal.aborted) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ReviewError("RESOURCE_LIMIT", 413); }
      chunks.push(value);
    }
    if (signal.aborted) throw new ReviewError(request.signal.aborted ? "ABORTED" : "TIMEOUT", 408);
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
export function createReviewHandlers(store: ReturnType<typeof createReviewStore> = materialReviews, goalProvider?: GoalSuggestionProvider) {
  let activeUploads = 0;
  async function run(request: Request, action: () => Promise<Response> | Response) {
    if (!sameOrigin(request)) return json({ code: "INVALID_REQUEST", error: errors.INVALID_REQUEST }, 403);
    try { return await action(); }
    catch (error) { const failure = error instanceof ReviewError ? error : new ReviewError("INVALID_REQUEST", 400); return json({ code: failure.code, error: errors[failure.code] || errors.INVALID_REQUEST }, failure.status); }
  }
  async function input(request: Request): Promise<Record<string, unknown>> {
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new ReviewError("INVALID_REQUEST", 400);
    const bytes = await boundedBody(request, 64 * 1024, AbortSignal.any([request.signal, AbortSignal.timeout(10000)]));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewError("INVALID_REQUEST", 400);
    return value as Record<string, unknown>;
  }
  return {
    goals: (request: Request) => run(request, async () => {
      const expected = request.headers.get("x-review-fingerprint");
      if (!expected) throw new ReviewError("INVALID_REQUEST", 400);
      return json(await store.goals(key(request), expected, goalProvider));
    }),
    session: (request: Request) => run(request, async () => {
      const body = await input(request);
      if (Object.keys(body).sort().join(",") !== "acceptTextScope,acknowledgedReasonIds,assessmentFingerprint,candidateId,intent" || typeof body.assessmentFingerprint !== "string" || typeof body.intent !== "string" || body.intent.length > 500 || typeof body.candidateId !== "string" || body.candidateId.length > 300 || typeof body.acceptTextScope !== "boolean" || !Array.isArray(body.acknowledgedReasonIds) || body.acknowledgedReasonIds.length > 300 || body.acknowledgedReasonIds.some(item => typeof item !== "string" || item.length > 500)) throw new ReviewError("INVALID_REQUEST", 400);
      try { return json(store.setGoal(key(request), body as Parameters<typeof store.setGoal>[1])); }
      catch (error) { if (error instanceof ReviewError) throw error; return json({ error: "What would you like to learn from this material? Tell us in a few words." }, 400); }
    }),
    preferences: (request: Request) => run(request, async () => {
      const body = await input(request);
      if (Object.keys(body).sort().join(",") !== "assessmentFingerprint,readingStyle,revision" || typeof body.assessmentFingerprint !== "string" || !Number.isSafeInteger(body.revision) || !["continuous", "one-section"].includes(body.readingStyle as string)) throw new ReviewError("INVALID_REQUEST", 400);
      return json(store.preferences(key(request), body.assessmentFingerprint, body.revision as number, { readingStyle: body.readingStyle as "continuous" | "one-section" }));
    }),
    upload: (request: Request) => run(request, async () => {
      if (activeUploads >= 2) throw new ReviewError("BUSY", 429);
      store.remove(key(request));
      activeUploads++;
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
        const bytes = await boundedBody(request, PDF_SPIKE_LIMITS.maxBytes, signal);
        const nameHeader = request.headers.get("x-material-name") || "Uploaded PDF";
        if (nameHeader.length > 1500) throw new ReviewError("INVALID_REQUEST", 400);
        const result = await ingestAndAssessPdf({ bytes, mediaType: request.headers.get("content-type") || "application/octet-stream", displayName: decodeURIComponent(nameHeader) }, signal);
        if (!result.extraction.ok) return json({ code: result.extraction.error.code, error: errors[result.extraction.error.code], readiness: "not-ready" }, result.extraction.error.code === "RESOURCE_LIMIT" ? 413 : 422, cookie(request, "", true));
        const review = store.create(pdfQualityInput(result.extraction), result.extraction.material.title);
        return json(review.summary, 200, cookie(request, review.key));
      } finally { activeUploads--; }
    }),
    read: (request: Request) => run(request, () => {
      const page = new URL(request.url).searchParams.get("page");
      return json(page === null ? store.summary(key(request)) : store.page(key(request), Number(page)));
    }),
    remove: (request: Request) => run(request, () => {
      const expected = request.headers.get("x-review-fingerprint");
      if (expected && expected !== store.summary(key(request)).quality.fingerprint) throw new ReviewError("STALE_REVIEW");
      store.remove(key(request)); return json({ removed: true }, 200, cookie(request, "", true));
    }),
    confirm: (request: Request) => run(request, async () => {
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new ReviewError("INVALID_REQUEST", 400);
      const bytes = await boundedBody(request, 64 * 1024, AbortSignal.any([request.signal, AbortSignal.timeout(10000)]));
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewError("INVALID_REQUEST", 400);
      const body = value as Record<string, unknown>;
      if (Object.keys(body).sort().join(",") !== "acceptedScope,acknowledgedReasonIds,assessmentFingerprint,sourceReviewed" || typeof body.assessmentFingerprint !== "string" || typeof body.acceptedScope !== "string" || typeof body.sourceReviewed !== "boolean" || !Array.isArray(body.acknowledgedReasonIds) || body.acknowledgedReasonIds.length > 300 || body.acknowledgedReasonIds.some(id => typeof id !== "string" || id.length > 500)) throw new ReviewError("INVALID_REQUEST", 400);
      return json(store.confirm(key(request), body as MaterialReview));
    }),
    proceed: (request: Request) => run(request, () => {
      const expected = request.headers.get("x-review-fingerprint");
      if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new ReviewError("INVALID_REQUEST", 400);
      return json(store.proceed(key(request), expected));
    }),
  };
}
export const reviewHandlers = createReviewHandlers(materialReviews, goalSuggestionProvider);
