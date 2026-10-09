// Isolated direct-model diagnostic. No ADAPT imports, providers or validators.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const key = process.env.GEMINI_API_KEY;
if (!key?.trim()) throw new Error("GEMINI_API_KEY is not configured; no request sent.");
if (!process.argv[2]) throw new Error("Supply the local educational MP3 path.");
const bytes = await readFile(resolve(process.argv[2]));
if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Diagnostic audio must be nonempty and at most 10 MiB.");
if (!(bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224))) throw new Error("Input has no MP3 signature.");
const model = "gemini-3.5-transcribe", endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";
const generationConfig = { transcription_config: { mode: { type: "verbatim", timestamp_granularities: ["word"] } } };
const source = { filename: basename(process.argv[2]), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "audio/mp3" };
const redact = text => text.split(key).join("[REDACTED_API_KEY]");
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, "request-metadata.json"), JSON.stringify({ modelRequested: model, endpoint, source, generationConfig, startedAt: new Date().toISOString(), transport: "REST inline original MP3; x-goog-api-key from environment, not recorded", store: false, instructions: "Dedicated verbatim transcription only; no text prompt, summary, adaptation, vocabulary hints or smart formatting.", bypassesADAPT: true }, null, 2) + "\n");
const started = performance.now();
try {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ model, input: [{ type: "audio", mime_type: "audio/mp3", data: bytes.toString("base64") }], generation_config: generationConfig, store: false }), signal: AbortSignal.timeout(120000) });
  const raw = await response.text(), safe = redact(raw);
  await writeFile(resolve(directory, "raw-response.json"), safe);
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
  // Extract content for convenience without modifying the raw response or repairing output.
  const parts = (parsed?.steps || []).filter(step => step.type === "model_output").flatMap(step => step.content || []);
  const transcript = typeof parsed?.output_text === "string" ? parsed.output_text : parts.filter(part => part.type === "text" && typeof part.text === "string").map(part => part.text).join("\n");
  const words = parts.flatMap(part => (part.annotations || []).filter(annotation => annotation.type === "word_info"));
  if (transcript) await writeFile(resolve(directory, "transcript.txt"), redact(transcript));
  await writeFile(resolve(directory, "word-annotations.json"), redact(JSON.stringify(words, null, 2)) + "\n");
  const summary = { modelRequested: model, modelReturned: parsed?.model, httpStatus: response.status, interactionStatus: parsed?.status, latencyMs: Math.round(performance.now() - started), transcriptCharacters: transcript.length, wordAnnotations: words.length, usage: parsed?.usage, redactionsApplied: safe !== raw, error: parsed?.error ? JSON.parse(redact(JSON.stringify(parsed.error))) : undefined, outcome: response.ok && parsed?.status === "completed" && transcript.trim() ? "transcript-returned" : response.ok ? "empty-or-incomplete-response" : "api-error", source, fidelityStatus: "Not checked against an independent verbatim listening/reference transcript." };
  await writeFile(resolve(directory, "run-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary));
  if (summary.outcome !== "transcript-returned") process.exitCode = 1;
} catch (error) {
  const diagnostic = { modelRequested: model, outcome: "transport-error", latencyMs: Math.round(performance.now() - started), name: error?.name || "Error", message: "Request could not finish; no exception/request object or credentials logged", transportCode: typeof error?.cause?.code === "string" ? error.cause.code : undefined };
  await writeFile(resolve(directory, "transport-error.json"), JSON.stringify(diagnostic, null, 2) + "\n"); console.log(JSON.stringify(diagnostic)); process.exitCode = 1;
}
// Single requested model only. Availability/access errors stop; no automatic fallback.
