// Read-only production-path diagnostic. Raw educational content stays in local evidence files.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { createLearningProvider } from "../src/lib/learning/provider";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import { inspectPdfSource } from "../src/lib/ingestion/pdf/adapter";
import { pageBlocks } from "../src/lib/ingestion/pdf/normalize";
import { ProviderResponseError } from "../src/lib/learning/provider-response";
import { safeDiagnostic } from "./bedrock-smoke";
import type { LearningProvider } from "../src/lib/learning/types";

async function main() {
  const path = process.argv[2];
  const name = process.argv[3];
  if (!path || !name || !/^[a-z0-9-]+$/.test(name)) throw new Error("Pass PDF path and evidence slug");
  const directory = join("docs", "math-pdf-diagnosis-2026-10-08", name);
  await mkdir(directory, { recursive: true });
  const save = (file: string, value: unknown) => writeFile(join(directory, file), JSON.stringify(value, null, 2) + "\n", "utf8");
  const bytes = new Uint8Array(await readFile(path));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const inspected = await inspectPdfSource({ bytes, mediaType: "application/pdf" });
  if (inspected.ok) await save("extracted-pages.json", inspected.pdf.pages.map(page => ({ ...pageBlocks(page, `pdf-v2:${hash}`), pageNumber: page.pageNumber, rawItems: page.items })));
  else await save("extraction-error.json", inspected);
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, maxAttempts: 1 });
  let providerFailure: unknown;
  let metadata: unknown;
  const provider = createLearningProvider({ modelId: process.env.BEDROCK_ADAPTATION_MODEL_ID }, async (command, signal) => {
    await save("request.json", { ...command.input, messages: command.input.messages?.map(message => ({ ...message, content: message.content?.map(block => block.document ? { document: { ...block.document, source: { bytes: `<${bytes.length} bytes; SHA256 ${hash}>` } } } : block) })) });
    const start = performance.now();
    try {
      const response = await client.send(command, { abortSignal: signal });
      metadata = { elapsedMs: performance.now() - start, stopReason: response.stopReason, usage: response.usage, metrics: response.metrics, httpStatus: response.$metadata.httpStatusCode, requestId: response.$metadata.requestId };
      await save("response-metadata.json", metadata);
      await save("raw-response.json", response.output);
      const text = response.output?.message?.content?.map(block => block.text ?? block.citationsContent?.content?.map(part => part.text).join("") ?? "").join("") ?? "";
      await writeFile(join(directory, "raw-response.txt"), text, "utf8");
      return response;
    } catch (error) { await save("bedrock-error.json", safeDiagnostic(error)); throw error; }
  });
  const wrapped: LearningProvider = { ...provider, adaptSource: async (material, preferences, signal) => {
    await save("prepared-source.json", { ...material, bytes: `<${material.bytes?.length} original bytes>` });
    try { return await provider.adaptSource!(material, preferences, signal); }
    catch (error) { providerFailure = { ...safeDiagnostic(error), stage: error instanceof ProviderResponseError ? error.stage : undefined }; throw error; }
  } };
  const handlers = createLearningHandlers(createLearningStore(), wrapped);
  const form = new FormData();
  form.set("material", new File([bytes], basename(path), { type: "application/pdf" }));
  form.set("transcript", "");
  const upload = await handlers.upload(new Request("http://localhost:3000/api/learning", { method: "POST", headers: { origin: "http://localhost:3000" }, body: form }));
  const snapshot = await upload.json();
  await save("upload-result.json", { status: upload.status, body: snapshot });
  if (!upload.ok) { console.log(JSON.stringify({ name, stage: "upload", status: upload.status, code: snapshot.code })); return; }
  const response = await handlers.adapt(new Request("http://localhost:3000/api/learning/adapt", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie: upload.headers.get("set-cookie")!.split(";")[0] }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: snapshot.revision, preferences: { needs: ["stepwise"], description: "", focus: "" } }) }));
  const body = await response.json();
  await save("adapt-result.json", { status: response.status, body });
  const result = { name, sha256: hash, uploadStatus: upload.status, pages: snapshot.material.units.length, adaptStatus: response.status, providerFailure, metadata, sections: body.experience?.sections?.length, code: body.code };
  await save("result.json", result);
  console.log(JSON.stringify(result));
}
void main().catch(error => { console.error(JSON.stringify(safeDiagnostic(error))); process.exitCode = 1; });
