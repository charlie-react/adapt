import "server-only";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { IngestionErrorCode, IngestionResult, InputAdapter, UploadInput } from "../types";
import { ingestionFailure } from "../errors";
import { PDF_SPIKE_LIMITS, type ParsedPdf, type PdfSpikeLimits } from "./contracts";
import { pageBlocks } from "./normalize";
import { pdfWorkerSource } from "./worker-source";
// Resolve at runtime. Turbopack's static require.resolve becomes a module ID,
// which cannot be imported by a separate Node worker.
const nodeRequire = createRequire(import.meta.url);
const resolvePackagePath = nodeRequire.resolve.bind(nodeRequire);
let activeWorkers = 0;
const knownCodes = new Set<IngestionErrorCode>(["RESOURCE_LIMIT", "PASSWORD_PROTECTED", "INVALID_PDF", "EXTRACTION_FAILED", "NO_READABLE_TEXT"]);
type WorkerResult = { ok: true; pdf: ParsedPdf } | { ok: false; code: IngestionErrorCode };
// The original-document path uses the same isolated parser and budgets, including
// PDFs with no selectable text. It does not certify selectable-text quality.
export async function inspectPdfSource(input: UploadInput, signal?: AbortSignal): Promise<WorkerResult> {
  const limits = PDF_SPIKE_LIMITS;
  if (signal?.aborted) return { ok: false, code: "ABORTED" };
  if (!input.bytes.byteLength) return { ok: false, code: "EMPTY_INPUT" };
  if (input.bytes.byteLength > limits.maxBytes) return { ok: false, code: "RESOURCE_LIMIT" };
  if (!/^%PDF-(?:1\.\d|2\.0)(?:\r|\n|\s)/.test(new TextDecoder("latin1").decode(input.bytes.subarray(0, 1024)))) return { ok: false, code: "NOT_PDF" };
  if (!/startxref\s+\d+\s+%%EOF\s*$/.test(new TextDecoder("latin1").decode(input.bytes.subarray(Math.max(0, input.bytes.length - 2048))))) return { ok: false, code: "INVALID_PDF" };
  if (activeWorkers >= 2) return { ok: false, code: "BUSY" };
  activeWorkers++;
  try { return await extract(Uint8Array.from(input.bytes), limits, signal); }
  finally { activeWorkers--; }
}
function extract(bytes: Uint8Array, limits: PdfSpikeLimits, signal?: AbortSignal): Promise<WorkerResult> {
  return new Promise(resolve => {
    let worker: Worker;
    try {
      worker = new Worker(pdfWorkerSource, { eval: true, workerData: { bytes, limits, moduleUrl: pathToFileURL(resolvePackagePath("unpdf")).href }, resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 }, stdout: true, stderr: true });
    } catch { resolve({ ok: false, code: "EXTRACTION_FAILED" }); return; }
    // Parser diagnostics can contain source-derived strings. Never forward them.
    worker.stdout?.resume(); worker.stderr?.resume();
    let settled = false;
    const finish = async (result: WorkerResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      await worker.terminate();
      resolve(result);
    };
    const abort = () => { void finish({ ok: false, code: "ABORTED" }); };
    const timer = setTimeout(() => { void finish({ ok: false, code: "TIMEOUT" }); }, limits.timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    worker.once("message", (message: WorkerResult) => { void finish(message.ok || knownCodes.has(message.code) ? message : { ok: false, code: "EXTRACTION_FAILED" }); });
    worker.once("error", error => { void finish({ ok: false, code: (error as NodeJS.ErrnoException).code === "ERR_WORKER_OUT_OF_MEMORY" ? "RESOURCE_LIMIT" : "EXTRACTION_FAILED" }); });
    worker.once("exit", () => { if (!settled) void finish({ ok: false, code: "EXTRACTION_FAILED" }); });
  });
}
export function createPdfInputAdapter(overrides: Partial<PdfSpikeLimits> = {}): InputAdapter {
  const limits = { ...PDF_SPIKE_LIMITS, ...overrides };
  for (const key of Object.keys(limits) as (keyof PdfSpikeLimits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > PDF_SPIKE_LIMITS[key]) throw new Error("Invalid PDF spike budget");
  }
  return {
    supports: mediaType => mediaType.toLowerCase().split(";")[0].trim() === "application/pdf",
    async ingest(input: UploadInput, signal?: AbortSignal): Promise<IngestionResult> {
      if (signal?.aborted) return ingestionFailure("ABORTED");
      if (!input.bytes.byteLength) return ingestionFailure("EMPTY_INPUT");
      if (input.bytes.byteLength > limits.maxBytes) return ingestionFailure("RESOURCE_LIMIT");
      const header = new TextDecoder("latin1").decode(input.bytes.subarray(0, 1024));
      if (!/^%PDF-(?:1\.\d|2\.0)(?:\r|\n|\s)/.test(header)) return ingestionFailure("NOT_PDF");
      const tail = new TextDecoder("latin1").decode(input.bytes.subarray(Math.max(0, input.bytes.length - 2048)));
      if (!/startxref\s+\d+\s+%%EOF\s*$/.test(tail)) return ingestionFailure("INVALID_PDF");
      if (activeWorkers >= 2) return ingestionFailure("BUSY");
      activeWorkers++;
      let parsed: WorkerResult;
      // Own a copy: PDF.js may transfer buffers; caller bytes must remain intact.
      try { parsed = await extract(Uint8Array.from(input.bytes), limits, signal); }
      finally { activeWorkers--; }
      if (!parsed.ok) return ingestionFailure(parsed.code);
      const sha256 = createHash("sha256").update(input.bytes).digest("hex");
      const id = `pdf-v2:${sha256}`;
      const pages = parsed.pdf.pages.map(page => ({ page, ...pageBlocks(page, id) }));
      const blocks = pages.flatMap(page => page.blocks);
      if (!blocks.length) return ingestionFailure("NO_READABLE_TEXT");
      if (blocks.reduce((count, block) => count + block.text.length, 0) > limits.maxCharacters) return ingestionFailure("RESOURCE_LIMIT");
      return { ok: true, material: {
        id, title: (input.displayName || "Uploaded PDF").split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || "Uploaded PDF",
        language: parsed.pdf.language,
        originalSource: { mediaType: "application/pdf", sha256, byteLength: input.bytes.byteLength, unitCount: parsed.pdf.sourcePageCount },
        extraction: { adapter: "pdf", version: "2", libraryVersion: "1.8.1", pdfjsVersion: parsed.pdf.pdfjsVersion },
        pages: pages.map(({ page, blocks }) => ({ pageNumber: page.pageNumber, pageLabel: page.pageLabel, blockIds: blocks.map(block => block.id) })),
        blocks, warnings: [{ code: "TEXT_ONLY", message: "Selectable-text extraction only. Diagrams, images, tables, mathematics, and scanned content are not understood." }, ...pages.flatMap(page => page.warnings)],
        coverage: pages.some(page => page.partial) ? "partial" : "supported", coverageScope: "selectable-text",
      } };
    },
  };
}
export const pdfInputAdapter = createPdfInputAdapter();
