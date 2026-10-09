import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ingestAndAssessPdf } from "../../src/lib/ingestion/pdf/quality";

// Follow-on evidence, deliberately separate from the historical extraction corpus.
// Only public/synthetic cached inputs are accepted; no text or metadata is printed.
async function main() {
  const manifestBytes = await readFile("docs/pdf-validation/manifest.json");
  const manifest = JSON.parse(manifestBytes.toString()) as { documents: { id: string; file: string; sha256: string }[] };
  const results = [];
  for (const document of manifest.documents) {
    const filename = path.resolve(document.file);
    if (!filename.startsWith(path.resolve(".pdf-corpus-cache") + path.sep)) throw new Error("Invalid corpus path");
    const bytes = new Uint8Array(await readFile(filename));
    if (createHash("sha256").update(bytes).digest("hex") !== document.sha256) throw new Error("Corpus hash mismatch");
    const first = await ingestAndAssessPdf({ bytes, mediaType: "application/pdf" });
    const second = await ingestAndAssessPdf({ bytes, mediaType: "application/pdf" });
    const deterministic = JSON.stringify(first.quality) === JSON.stringify(second.quality);
    if (!deterministic) throw new Error("Non-deterministic quality report");
    results.push({ id: document.id, sourceSha256: document.sha256, extractionVersion: first.extraction.ok ? first.extraction.material.extraction.version : null,
      extractionFailure: first.extraction.ok ? null : first.extraction.error.code, deterministic,
      quality: { ...first.quality, diagnostics: { ...first.quality.diagnostics, signals: first.quality.diagnostics.signals.map(({ code, unitId }) => ({ code, unitId })) } } });
    console.log(`${document.id}: ${first.quality.readiness}`);
  }
  await writeFile("docs/pdf-validation/quality-gate-results.json", JSON.stringify({ schemaVersion: 1, policyVersion: "1", node: process.version,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    method: "Two sequential adapter/gate calls per cached document, unchanged source hashes. No text stored. This is decision regression evidence, not a new latency/memory benchmark.", results }, null, 2) + "\n");
}
void main().catch(() => { console.error("Quality corpus check failed; no document contents printed."); process.exitCode = 1; });
