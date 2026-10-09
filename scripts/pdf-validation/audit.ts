// Content-free parser/normalizer comparison for issues observed in the corpus.
import { readFile, writeFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { pdfWorkerSource } from "../../src/lib/ingestion/pdf/worker-source";
import { PDF_SPIKE_LIMITS, type ParsedPdf } from "../../src/lib/ingestion/pdf/contracts";
import { pageBlocks } from "../../src/lib/ingestion/pdf/normalize";
const nodeRequire = createRequire(import.meta.url);
const resolvePackage = nodeRequire.resolve.bind(nodeRequire);
async function parsed(bytes: Uint8Array): Promise<ParsedPdf> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(pdfWorkerSource, { eval: true, workerData: { bytes, limits: PDF_SPIKE_LIMITS, moduleUrl: pathToFileURL(resolvePackage("unpdf")).href }, stdout: true, stderr: true });
    worker.stdout?.resume(); worker.stderr?.resume();
    const timeout = setTimeout(() => { void worker.terminate(); reject(new Error("Audit deadline")); }, 10000);
    worker.once("message", message => { clearTimeout(timeout); void worker.terminate(); if (message.ok) resolve(message.pdf); else reject(new Error("Audit parsing failed")); });
    worker.once("error", () => { clearTimeout(timeout); reject(new Error("Audit worker failed")); });
  });
}
async function main() {
  const cases = [];
  for (const id of ["code-indentation", "columns-interleaved", "mit-theory-slides"]) {
    const raw = await parsed(new Uint8Array(await readFile(`.pdf-corpus-cache/${id}.pdf`)));
    cases.push({ id, pages: raw.pages.map(page => {
      const normalized = pageBlocks(page, "audit");
      return { pageNumber: page.pageNumber, parserTextItems: page.items.filter(item => item.text.trim()).length,
        parserLeadingWhitespaceItems: page.items.filter(item => /^\s+\S/.test(item.text)).length,
        parserMinimumTextX: Math.min(...page.items.filter(item => item.text.trim()).map(item => item.x)),
        parserDistinctTextXPositions: new Set(page.items.filter(item => item.text.trim()).map(item => Math.round(item.x))).size,
        parserWhitespaceSpansOver48Points: page.items.filter(item => item.text && !item.text.trim() && item.width > 48).length,
        parserReplacementCharacters: page.items.reduce((count, item) => count + (item.text.match(/\uFFFD/g) || []).length, 0),
        blockLeadingWhitespaceCount: normalized.blocks.filter(block => /^\s/.test(block.text)).length,
        normalizedBlocks: normalized.blocks.length,
        normalizedReplacementCharacters: normalized.blocks.reduce((count, block) => count + (block.text.match(/\uFFFD/g) || []).length, 0),
        warningCodes: normalized.warnings.map(warning => warning.code) };
    }) });
  }
  await writeFile("docs/pdf-validation/parser-audit.json", JSON.stringify({ method: "Existing restricted PDF.js worker output compared with existing normalizer; counts/coordinates only, no document text.", cases }, null, 2) + "\n");
  console.log("Recorded parser/normalizer audit for three observed problem cases.");
}
void main().catch(() => { console.error("Content-free parser audit failed."); process.exitCode = 1; });
