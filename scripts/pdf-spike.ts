import assert from "node:assert/strict";
import { textPdf, unicodePdf, imageOnlyPdf, encryptedPdf } from "../tests/fixtures/pdf";

const base = process.argv[2] || "http://127.0.0.1:3101";
const url = new URL("/api/ingestion/pdf-spike", base);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("The spike diagnostic only sends synthetic fixtures to a loopback server.");
async function send(bytes: Uint8Array) {
  const response = await fetch(url, { method: "POST", body: Buffer.from(bytes), headers: { "content-type": "application/pdf" }, signal: AbortSignal.timeout(30000) });
  assert.notEqual(response.status, 404, "Enable ADAPT_PDF_SPIKE=1 on the local server.");
  return await response.json();
}
async function main() {
const result = await send(textPdf([["First heading", "1. One item."], ["Next heading", "Complete statement!"]], true));
assert.equal(result.ok, true);
assert.equal(result.material.pages.length, 2);
assert.ok(result.material.blocks.some((block: { kind: string }) => block.kind === "list-item"));
assert.deepEqual(await send(textPdf([["First heading", "1. One item."], ["Next heading", "Complete statement!"]], true)), result);
const unicode = await send(unicodePdf());
assert.equal(unicode.material.blocks[0].text, "Café — ‘complete’ sentences! Ω, β, and Ж survive.");
for (const [bytes, code] of [[new Uint8Array(), "EMPTY_INPUT"], [new TextEncoder().encode("not a PDF"), "NOT_PDF"], [textPdf().slice(0, 400), "INVALID_PDF"], [textPdf([[]]), "NO_READABLE_TEXT"], [imageOnlyPdf(), "NO_READABLE_TEXT"], [encryptedPdf(), "PASSWORD_PROTECTED"]] as const) assert.equal((await send(bytes)).error.code, code);
// Counts and versions only: never print extracted document contents.
console.log(`PDF runtime spike passed: unpdf ${result.material.extraction.libraryVersion}, PDF.js ${result.material.extraction.pdfjsVersion}; two-page text, tags, stable IDs, Unicode and six failure cases verified.`);
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "PDF runtime diagnostic failed."); process.exitCode = 1; });
