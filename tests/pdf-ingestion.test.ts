import assert from "node:assert/strict";
import { test } from "node:test";
import { createPdfInputAdapter, pdfInputAdapter } from "../src/lib/ingestion/pdf/adapter";
import { textPdf, unicodePdf, imageOnlyPdf, encryptedPdf } from "./fixtures/pdf";
import type { IngestionResult, IngestedMaterial } from "../src/lib/ingestion/types";
const input = (bytes: Uint8Array) => ({ bytes, mediaType: "application/pdf", displayName: "synthetic-lesson.pdf" });
function material(result: IngestionResult): IngestedMaterial { if (!result.ok) assert.fail(result.error.code); return result.material; }
function failure(result: IngestionResult, code: string) { assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, code); }

test("real PDF bytes extract page-level text, tagged headings/list items, stable identifiers and page labels", async () => {
  const bytes = textPdf([["Learning together", "First complete statement. Second statement!", "1. Read the source.", "2. Explain the idea."], ["Next section", "Different page, same punctuation?"]], true);
  const original = Uint8Array.from(bytes);
  const first = material(await pdfInputAdapter.ingest(input(bytes)));
  const second = material(await pdfInputAdapter.ingest(input(bytes)));
  assert.deepEqual(bytes, original);
  assert.deepEqual(first, second);
  assert.equal(first.pages.length, 2);
  assert.equal(first.pages[0].pageLabel, "i");
  assert.equal(first.pages[1].pageLabel, "5");
  assert.equal(first.coverage, "supported");
  assert.equal(first.coverageScope, "selectable-text");
  assert.ok(first.blocks.some(block => block.kind === "heading" && block.structureBasis === "document-tags"));
  assert.ok(first.blocks.some(block => block.kind === "list-item" && block.structureBasis === "document-tags"));
  assert.ok(first.blocks.some(block => block.text === "First complete statement. Second statement!"));
  assert.equal(first.blocks.at(-1)!.locator.pageNumber, 2);
  assert.equal(new Set(first.blocks.map(block => block.id)).size, first.blocks.length);
  assert.ok(first.warnings.some(warning => warning.code === "TEXT_ONLY"));
  assert.ok(first.blocks.every(block => block.origin === "extracted"));
  assert.equal(first.extraction.libraryVersion, "1.8.1");
  assert.ok(first.extraction.pdfjsVersion);
});

test("Unicode, punctuation and non-Latin text survive a ToUnicode PDF font mapping", async () => {
  const result = material(await pdfInputAdapter.ingest(input(unicodePdf())));
  assert.equal(result.blocks[0].text, "Café — ‘complete’ sentences! Ω, β, and Ж survive.");
});

test("byte validation and parser rejection handle malformed, truncated, empty, encrypted and image-only PDFs honestly", async () => {
  failure(await pdfInputAdapter.ingest(input(new Uint8Array())), "EMPTY_INPUT");
  failure(await pdfInputAdapter.ingest(input(new TextEncoder().encode("<html>not a PDF</html>"))), "NOT_PDF");
  failure(await pdfInputAdapter.ingest(input(textPdf().slice(0, 400))), "INVALID_PDF");
  failure(await pdfInputAdapter.ingest(input(new TextEncoder().encode("%PDF-1.7\ngarbage\nstartxref\n0\n%%EOF\n"))), "INVALID_PDF");
  failure(await pdfInputAdapter.ingest(input(textPdf([[]]))), "NO_READABLE_TEXT");
  failure(await pdfInputAdapter.ingest(input(imageOnlyPdf())), "NO_READABLE_TEXT");
  failure(await pdfInputAdapter.ingest(input(encryptedPdf())), "PASSWORD_PROTECTED");
});

test("partial pages and heuristic structure are explicit, and filenames/metadata are untrusted", async () => {
  const result = material(await pdfInputAdapter.ingest({ ...input(textPdf([["A heading", "1. A complete list item."], []])), mediaType: "text/plain", displayName: "C:\\secret\\bad\u0000name.pdf" }));
  assert.equal(result.title, "badname.pdf");
  assert.equal(result.coverage, "partial");
  assert.ok(result.warnings.some(warning => warning.code === "NO_PAGE_TEXT" && warning.pageNumber === 2));
  assert.ok(result.warnings.some(warning => warning.code === "INFERRED_STRUCTURE"));
  assert.equal(pdfInputAdapter.supports("application/pdf; charset=binary"), true);
  assert.equal(pdfInputAdapter.supports("text/plain"), false);
});

test("byte, page, character, item and worker-deadline budgets are enforced; cancellation is recoverable", async () => {
  failure(await createPdfInputAdapter({ maxBytes: 1 }).ingest(input(textPdf())), "RESOURCE_LIMIT");
  failure(await createPdfInputAdapter({ maxPages: 1 }).ingest(input(textPdf([["One"], ["Two"]]))), "RESOURCE_LIMIT");
  failure(await createPdfInputAdapter({ maxCharacters: 5 }).ingest(input(textPdf())), "RESOURCE_LIMIT");
  failure(await createPdfInputAdapter({ maxItems: 1 }).ingest(input(textPdf())), "RESOURCE_LIMIT");
  failure(await createPdfInputAdapter({ timeoutMs: 1 }).ingest(input(textPdf())), "TIMEOUT");
  const controller = new AbortController();
  const pending = pdfInputAdapter.ingest(input(textPdf()), controller.signal); controller.abort();
  failure(await pending, "ABORTED");
  failure(await pdfInputAdapter.ingest(input(textPdf()), AbortSignal.abort()), "ABORTED");
  assert.throws(() => createPdfInputAdapter({ maxBytes: Infinity }));
  assert.throws(() => createPdfInputAdapter({ maxPages: 101 }));
  assert.equal((await pdfInputAdapter.ingest(input(textPdf()))).ok, true);
});

test("bounded concurrency rejects excess work and releases slots after completion", async () => {
  const first = pdfInputAdapter.ingest(input(textPdf()));
  const second = pdfInputAdapter.ingest(input(textPdf()));
  failure(await pdfInputAdapter.ingest(input(textPdf())), "BUSY");
  assert.equal((await first).ok, true); assert.equal((await second).ok, true);
  assert.equal((await pdfInputAdapter.ingest(input(textPdf()))).ok, true);
});
