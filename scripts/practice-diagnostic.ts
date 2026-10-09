// Diagnostic only: production handlers/provider are imported without changing behavior.
// Raw educational content is saved locally only, never printed with credentials/cookies.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { createLearningProvider } from "../src/lib/learning/provider";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import { parseProviderResponse, resolveProviderEvidence, sourceExcerpts, ProviderResponseError } from "../src/lib/learning/provider-response";
import { validatePractice } from "../src/lib/learning/practice";
import { fileMaterial } from "../src/lib/learning/material";
import { safeDiagnostic } from "./bedrock-smoke";
import type { LearningMaterial, LearningSnapshot, LearningProvider, SourceUnit } from "../src/lib/learning/types";

async function main() {
  const file = process.argv[2], slug = process.argv[3];
  if (!file || !slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error("Pass material path and diagnostic slug");
  const directory = join("docs", "practice-diagnosis-2026-10-08", slug);
  await mkdir(directory, { recursive: true });
  const save = (name: string, value: unknown) => writeFile(join(directory, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  async function hashes(path = "src"): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = join(path, entry.name);
      if (entry.isDirectory()) Object.assign(result, await hashes(name));
      else result[name] = createHash("sha256").update(await readFile(name)).digest("hex");
    }
    return result;
  }
  const before = await hashes(); await save("production-before.json", before);
  const bytes = new Uint8Array(await readFile(file));
  const form = () => { const body = new FormData(); body.set("material", new File([bytes], basename(file))); body.set("transcript", ""); return body; };
  const current = "http://127.0.0.1:3000/api/learning";
  const upload = await fetch(current, { method: "POST", body: form(), signal: AbortSignal.timeout(120000) });
  const prepared = await upload.json() as LearningSnapshot;
  await save("local-upload.json", { status: upload.status, body: prepared });
  if (!upload.ok) throw new Error(`Local upload failed: ${upload.status}`);
  const cookie = upload.headers.get("set-cookie")!.split(";")[0];
  const preferences = { needs: [prepared.material.kind === "audio" ? "read-spoken" : "stepwise"], description: "", focus: "" };
  const adaptation = await fetch(current + "/adapt", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: prepared.fingerprint, revision: prepared.revision, preferences }), signal: AbortSignal.timeout(600000) });
  const snapshot = await adaptation.json() as LearningSnapshot;
  await save("local-adaptation.json", { status: adaptation.status, body: snapshot });
  if (!adaptation.ok || !snapshot.experience) throw new Error(`Local adaptation failed: ${adaptation.status}`);
  console.log(JSON.stringify({ stage: "local-adaptation", status: adaptation.status, pages: snapshot.material.units.length, sections: snapshot.experience.sections.length }));
  const body = { fingerprint: snapshot.fingerprint, revision: snapshot.revision };
  const practice = await fetch(current + "/practice", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const localPractice = { status: practice.status, body: await practice.json() };
  await save("local-practice.json", { request: body, ...localPractice });
  console.log(JSON.stringify({ stage: "local-practice", status: localPractice.status, code: localPractice.body.code, questions: localPractice.body.questions?.length }));

  // Reuse this *actual live* adapted lesson, not a synthetic/generated fixture.
  // Re-ingest the same source, revalidate the saved
  // adaptation, then capture a live practice response through the current provider.
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, maxAttempts: 1 });
  let source: LearningMaterial | undefined, raw = "", failure: unknown;
  const provider = createLearningProvider({ modelId: process.env.BEDROCK_ADAPTATION_MODEL_ID }, async (command, signal) => {
    await save("claude-request.json", { ...command.input, messages: command.input.messages?.map(message => ({ ...message, content: message.content?.map(block => block.document ? { document: { ...block.document, source: { bytes: `<${bytes.length} bytes; original PDF omitted>` } } } : block) })) });
    try {
      const response = await client.send(command, { abortSignal: signal });
      await save("claude-response.json", response.output);
      await save("claude-metadata.json", { httpStatus: response.$metadata.httpStatusCode, requestId: response.$metadata.requestId, stopReason: response.stopReason, usage: response.usage, metrics: response.metrics });
      raw = response.output?.message?.content?.map(block => block.text ?? block.citationsContent?.content?.map(part => part.text).join("") ?? "").join("") ?? "";
      await writeFile(join(directory, "claude-response.txt"), raw, "utf8");
      return response;
    } catch (error) { await save("bedrock-error.json", safeDiagnostic(error)); throw error; }
  });
  const wrapped: LearningProvider = { ...provider, adaptSource: async () => structuredClone(snapshot.experience!), createPractice: async (material, experience, preferences, signal) => {
    source = material;
    await save("source.json", { ...material, bytes: material.bytes ? `<${material.bytes.length} original bytes omitted>` : undefined });
    await save("practice-input.json", { experience, preferences });
    try { return await provider.createPractice!(material, experience, preferences, signal); }
    catch (error) { failure = { ...safeDiagnostic(error), stage: error instanceof ProviderResponseError ? error.stage : undefined }; await save("provider-failure.json", failure); throw error; }
  } };
  const store = createLearningStore(), handlers = createLearningHandlers(store, wrapped);
  const material = await fileMaterial(bytes, basename(file));
  if (material.kind === "audio") {
    // Reuse this upload's real ASR result rather than paying to transcribe twice.
    // All unit text/timestamps/provenance come from the existing protected source endpoint.
    const units: SourceUnit[] = [];
    for (const unit of prepared.material.units) {
      const response = await fetch(current + "/source?id=" + encodeURIComponent(unit.id), { headers: { cookie, "x-material-fingerprint": prepared.fingerprint } });
      if (!response.ok) throw new Error("Recorded audio source unavailable");
      units.push(await response.json() as SourceUnit);
    }
    const transcriptHash = createHash("sha256").update(material.fingerprint).update(JSON.stringify(units.filter(unit => unit.locator.kind === "transcript"))).digest("hex");
    if (transcriptHash !== prepared.fingerprint) throw new Error("Recorded transcript fingerprint differs from the actual source");
    material.units = units; material.limitations = prepared.material.limitations;
    material.fingerprint = transcriptHash; material.id = prepared.material.id;
  }
  if (material.fingerprint !== snapshot.fingerprint) throw new Error("Fresh source differs from actual local lesson");
  const created = store.create(material, { sourceOnly: true });
  const freshPrepared = created.snapshot, freshCookie = `adapt-learning=${created.key}`;
  const request = (path: string, body: unknown) => new Request(current + path, { method: "POST", headers: { cookie: freshCookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  const validated = await handlers.adapt(request("/adapt", { fingerprint: freshPrepared.fingerprint, revision: freshPrepared.revision, preferences }));
  const fresh = await validated.json() as LearningSnapshot;
  if (!validated.ok || JSON.stringify(fresh.experience) !== JSON.stringify(snapshot.experience)) throw new Error("Actual lesson failed unchanged validation replay");
  const result = await handlers.practice(request("/practice", { fingerprint: fresh.fingerprint, revision: fresh.revision }));
  const freshResult = { status: result.status, body: await result.json() };
  await save("fresh-practice.json", freshResult);
  let replay: unknown;
  if (raw && source) {
    try {
      const parsed = parseProviderResponse(raw);
      await save("parsed-response.json", parsed);
      const resolved = resolveProviderEvidence(parsed, "practice", source, sourceExcerpts(source, { includeShort: true }));
      await save("resolved-response.json", resolved);
      const questions = validatePractice(resolved, source, fresh.experience!);
      replay = { parsing: "passed", evidence: "passed", validation: "passed", count: questions.length };
    } catch (error) { replay = { failure: safeDiagnostic(error) }; }
  }
  await save("replay.json", replay ?? { rawResponseAvailable: false });
  const integrity = { sourceUnchanged: JSON.stringify(before) === JSON.stringify(await hashes()) };
  const summary = { localAdaptationStatus: adaptation.status, localPracticeStatus: practice.status, freshPracticeStatus: result.status, providerFailure: failure, replay, ...integrity };
  await save("summary.json", summary);
  console.log(JSON.stringify(summary));
  store.remove(freshCookie.split("=")[1]);
  await fetch(current, { method: "DELETE", headers: { cookie } });
}
void main().catch(error => { console.error(JSON.stringify(safeDiagnostic(error))); process.exitCode = 1; });
