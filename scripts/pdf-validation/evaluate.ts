import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pdfInputAdapter } from "../../src/lib/ingestion/pdf/adapter";
import { PDF_SPIKE_LIMITS } from "../../src/lib/ingestion/pdf/contracts";
import { extractionMetrics, type ExpectedProfile } from "./metrics";

type Document = { id: string; file: string; sha256: string; bytes: number; categories: string[]; sourcePageMap: number[]; sourcePageCount: number; expected: ExpectedProfile; source: object; independentInventory: object };
const root = process.cwd();
const manifestPath = path.join(root, "docs/pdf-validation/manifest.json");
async function sourceFingerprint() {
  const files = (await readdir(path.join(root, "src"), { recursive: true })).filter(file => /\.(tsx?|css)$/.test(file)).sort();
  const hash = createHash("sha256");
  for (const file of files) { hash.update(file.replaceAll("\\", "/")); hash.update(await readFile(path.join(root, "src", file))); }
  return hash.digest("hex");
}
async function documentRun(document: Document) {
  const filename = path.resolve(root, document.file);
  if (!filename.startsWith(path.join(root, ".pdf-corpus-cache") + path.sep)) throw new Error("Corpus input is outside the dedicated public/synthetic cache.");
  const bytes = new Uint8Array(await readFile(filename));
  if (createHash("sha256").update(bytes).digest("hex") !== document.sha256) throw new Error("Corpus bytes differ from the reviewed manifest.");
  const baselineRssBytes = process.memoryUsage().rss;
  let sampledPeakRssBytes = baselineRssBytes;
  const sample = setInterval(() => { sampledPeakRssBytes = Math.max(sampledPeakRssBytes, process.memoryUsage().rss); }, 10);
  const start = performance.now();
  const first = await pdfInputAdapter.ingest({ bytes, mediaType: "application/pdf", displayName: `${document.id}.pdf` });
  const firstLatencyMs = performance.now() - start;
  const firstMetrics = extractionMetrics(first, document.expected, document.sourcePageMap);
  const repeatStart = performance.now();
  const second = await pdfInputAdapter.ingest({ bytes, mediaType: "application/pdf", displayName: `${document.id}.pdf` });
  const repeatLatencyMs = performance.now() - repeatStart;
  sampledPeakRssBytes = Math.max(sampledPeakRssBytes, process.memoryUsage().rss);
  clearInterval(sample);
  const maxRssKiB = process.resourceUsage().maxRSS;
  return { id: document.id, sha256: document.sha256, sourcePageCount: document.sourcePageCount, categories: document.categories,
    firstLatencyMs: Math.round(firstLatencyMs * 100) / 100, repeatLatencyMs: Math.round(repeatLatencyMs * 100) / 100,
    memory: { baselineRssBytes, sampledPeakRssBytes, sampledRssDeltaBytes: sampledPeakRssBytes - baselineRssBytes,
      processHighWaterRssBytes: maxRssKiB > 0 ? maxRssKiB * 1024 : null, samplingIntervalMs: 10 },
    repeatDeterministic: firstMetrics.fingerprint === extractionMetrics(second, document.expected, document.sourcePageMap).fingerprint,
    ...firstMetrics };
}
async function isolated(document: Document): Promise<Awaited<ReturnType<typeof documentRun>>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/pdf-validation/evaluate.ts", "--document", document.id], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "", stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Diagnostic deadline exceeded: ${document.id}`)); }, 35000);
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code !== 0 || stderr) { reject(new Error(`Diagnostic process failed for ${document.id}; no source contents printed.`)); return; }
      try { resolve(JSON.parse(output)); } catch { reject(new Error("Invalid diagnostic JSON")); }
    });
  });
}
async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { documents: Document[] };
  const childId = process.argv[2] === "--document" ? process.argv[3] : undefined;
  if (childId) {
    const document = manifest.documents.find(document => document.id === childId);
    if (!document) throw new Error("Unknown corpus document");
    process.stdout.write(JSON.stringify(await documentRun(document)));
    return;
  }
  const before = await sourceFingerprint();
  const results = [];
  for (const document of manifest.documents) {
    const result = await isolated(document);
    results.push(result);
    console.log(`${document.id}: ${result.outcome}; ${result.firstLatencyMs} ms; ${result.pages ?? "not extracted"} pages`);
  }
  const after = await sourceFingerprint();
  if (before !== after) throw new Error("Application source changed during evaluation");
  const report = { schemaVersion: 1, evaluatedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, architecture: process.arch,
    next: JSON.parse(await readFile("node_modules/next/package.json", "utf8")).version,
    unpdf: JSON.parse(await readFile("node_modules/unpdf/package.json", "utf8")).version },
    limits: PDF_SPIKE_LIMITS, sourceTreeSha256: before, sourceTreeUnchanged: before === after,
    measurementMethod: "One fresh Node process per document; two adapter calls; latency excludes Node startup and file reading; 10ms process-RSS sampling includes worker/native allocations and both calls. RSS is not worker heap and sampling may miss peaks. resourceUsage maxRSS may be unavailable on Windows. No contents logged or stored in this report.", results };
  await writeFile("docs/pdf-validation/results.json", JSON.stringify(report, null, 2) + "\n");
  console.log(`Recorded ${results.length} evaluations in docs/pdf-validation/results.json.`);
}
void main().catch(() => { console.error("Corpus diagnostic failed. Check preparation, hashes, and local runtime; no document contents printed."); process.exitCode = 1; });
