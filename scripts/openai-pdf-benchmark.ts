// Isolated approved experiment. No application configuration or default-provider changes.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { BedrockRuntimeClient, type ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { fileMaterial, sourceForAdaptation } from "../src/lib/learning/material";
import { createLearningProvider } from "../src/lib/learning/provider";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningHandlers } from "../src/lib/learning/http";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import type { AccessPreferences, AdaptedExperience } from "../src/lib/learning/types";
import { responsesPayload, responseEnvelope, reserveUsd, checkBudget, costFromUsage, type OpenAIUsage } from "./lib/openai-responses-transport";

const directory = join("docs", "openai-pdf-benchmark-2026-10-13");
const path = "C:/users/besle/Downloads/ODE_Mathematics_7_Page_Study_Material.pdf";
const preferences: AccessPreferences = { needs: ["stepwise"], description: "", focus: "" };
type Ledger = { ceilingUsd: number; spentUpperUsd: number; pendingUsd: number; attempts: number; calls: unknown[] };
function safeError(error: unknown) {
  const e = error instanceof Error ? error : new Error("Unknown failure");
  const message = e.message.replaceAll(process.env.OPENAI_API_KEY || "\0", "[REDACTED]").replace(/(?:sk-|AKIA|ASIA)[A-Za-z0-9_-]+/g, "[REDACTED]").replace(/\b\d{12}\b/g, "[ACCOUNT]");
  return { name: e.name, message: message.slice(0, 350), ...(Object.hasOwn(e, "stage") ? { stage: (e as Error & { stage: string }).stage } : {}) };
}
async function save(name: string, value: unknown) {
  const text = JSON.stringify(value, null, 2).replaceAll(process.env.OPENAI_API_KEY || "\0", "[REDACTED]");
  await writeFile(join(directory, name), text + "\n");
}
async function api(endpoint: string, payload: unknown, signal: AbortSignal) {
  const response = await fetch(`https://api.openai.com/v1/${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal, redirect: "error" });
  const text = await response.text();
  if (text.length > 4 * 1024 * 1024) throw new Error("Oversized OpenAI response; spending unreconciled");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text); } catch { throw new Error(`OpenAI HTTP ${response.status}; non-JSON body withheld`); }
  if (!response.ok) {
    const error = raw.error as { code?: string; type?: string; message?: string } | undefined;
    await save(`openai-${endpoint.replaceAll("/", "-")}-error.json`, { httpStatus: response.status, code: error?.code, type: error?.type, diagnostic: safeError(new Error(error?.message || "Provider error")) });
    throw new Error(`OpenAI HTTP ${response.status}: ${error?.code || error?.type || "provider_error"}`);
  }
  return raw;
}
async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured; no live calls made");
  const mode = process.argv[2] || "pair";
  if (!["pair", "practice", "repeat", "high"].includes(mode)) throw new Error("Use pair, practice, repeat or high");
  await mkdir(directory, { recursive: true });
  const integrity = Object.fromEntries(await Promise.all(["src/lib/learning/provider.ts", "src/lib/learning/service.ts", "src/lib/learning/http.ts", "src/lib/learning/validation.ts", "src/lib/learning/gemini-transcription.ts", "src/lib/learning/practice-answers.ts"].map(async p => [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
  const bytes = new Uint8Array(await readFile(path));
  const start = performance.now(), material = await fileMaterial(bytes, "ODE mathematics.pdf");
  const preparationMs = performance.now() - start;
  if (material.kind !== "pdf" || material.units.length !== 7) throw new Error("Only approved seven-page PDF permitted");
  const source = sourceForAdaptation(material);
  let ledger: Ledger;
  try { ledger = JSON.parse(await readFile(join(directory, "spend-ledger.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; ledger = { ceilingUsd: 5, spentUpperUsd: 0, pendingUsd: 0, attempts: 0, calls: [] }; }
  if (ledger.pendingUsd) throw new Error("Unreconciled previous OpenAI request; no further live calls");
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, maxAttempts: 1 });
  const run = async (providerName: "claude" | "openai", slug: string, effort: "low" | "high" = "low") => {
    let providerMs = 0, tokenCountMs = 0, usage: unknown, cost: unknown;
    const transport = async (command: ConverseCommand, signal: AbortSignal): Promise<ConverseCommandOutput> => {
      if (providerName === "claude") {
        const begun = performance.now(), raw = await client.send(command, { abortSignal: signal }); providerMs = performance.now() - begun; usage = raw.usage;
        await save(`${slug}-raw.json`, raw); return raw;
      }
      if (ledger.attempts >= 3) throw new Error("Approved experiment limited to three OpenAI adaptations");
      if (ledger.pendingUsd || ledger.spentUpperUsd >= 5) throw new Error("Unreconciled spending or exhausted budget: no further OpenAI API calls");
      const payload = responsesPayload(command, effort);
      const countStart = performance.now();
      const counted = await api("responses/input_tokens", { model: payload.model, instructions: payload.instructions, input: payload.input }, signal);
      tokenCountMs = performance.now() - countStart;
      const countedTokens = counted.input_tokens as number;
      const reserve = reserveUsd(countedTokens);
      checkBudget(ledger.spentUpperUsd, ledger.pendingUsd, reserve);
      ledger.pendingUsd = reserve; ledger.attempts++;
      await save("spend-ledger.json", ledger); // Durable reservation BEFORE submitting generation.
      await save(`${slug}-request-metadata.json`, { model: payload.model, reasoning: payload.reasoning, serviceTier: payload.service_tier, store: payload.store, outputTokenCap: payload.max_output_tokens, countedInputTokens: countedTokens, reservedUsd: reserve, pdfPages: 7, fileBytes: bytes.length, sourceFingerprint: material.fingerprint });
      const begun = performance.now(), raw = await api("responses", payload, signal); providerMs = performance.now() - begun;
      await save(`${slug}-raw.json`, raw);
      usage = raw.usage; cost = costFromUsage(raw.usage as OpenAIUsage);
      ledger.spentUpperUsd += (cost as ReturnType<typeof costFromUsage>).upperUsd;
      ledger.pendingUsd = 0; ledger.calls.push({ slug, usage, cost });
      await save("spend-ledger.json", ledger);
      return responseEnvelope(raw, providerMs);
    };
    const provider = createLearningProvider({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, modelId: process.env.BEDROCK_ADAPTATION_MODEL_ID }, transport);
    const begun = performance.now();
    try {
      const experience = validateSourceAdaptation(await provider.adaptSource!(source, preferences, AbortSignal.timeout(600000)), source, preferences);
      const totalMs = performance.now() - begun;
      await save(`${slug}-lesson.json`, experience);
      const result = { slug, status: "strictly-validated", preparationMs, providerMs, tokenCountMs, adaptationPipelineMs: totalMs, pipelineIncludingPreparationMs: totalMs + preparationMs, nonProviderMs: totalMs - providerMs - tokenCountMs, usage, cost, sections: experience.sections.length, sourcePages: material.units.length, browserPaintMeasured: false };
      await save(`${slug}-result.json`, result); console.log(JSON.stringify(result));
    } catch (error) {
      const result = { slug, status: "failed", preparationMs, providerMs, tokenCountMs, usage, cost, error: safeError(error), spentUpperUsd: ledger.spentUpperUsd, pendingUsd: ledger.pendingUsd };
      await save(`${slug}-result.json`, result); console.log(JSON.stringify(result));
    }
  };
  if (mode === "pair") {
    for (const [name, slug] of [["claude", "claude-1"], ["openai", "openai-1"]] as const) {
      try { await readFile(join(directory, `${slug}-result.json`)); console.log(JSON.stringify({ slug, status: "existing-result-preserved" })); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await run(name, slug); }
    }
  }
  if (mode === "high") {
    const slug = "openai-high-1";
    try { await readFile(join(directory, `${slug}-result.json`)); console.log(JSON.stringify({ slug, status: "existing-result-preserved" })); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await run("openai", slug, "high"); }
  }
  if (mode === "repeat") {
    const review = JSON.parse(await readFile(join(directory, "quality-review.json"), "utf8"));
    if (review.openai?.verdict !== "pass" || review.claude?.verdict !== "pass") throw new Error("Both initial lessons must pass source review before repeat calls");
    for (const index of [2, 3]) for (const name of ["claude", "openai"] as const) {
      const slug = `${name}-${index}`;
      try { await readFile(join(directory, `${slug}-result.json`)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await run(name, slug); }
    }
  }
  if (mode === "practice") for (const name of ["claude", "openai"] as const) {
    const experience = JSON.parse(await readFile(join(directory, `${name}-1-lesson.json`), "utf8")) as AdaptedExperience;
    const store = createLearningStore(), created = store.create(material, { sourceOnly: true });
    const practiceProvider = createLearningProvider({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, modelId: process.env.BEDROCK_ADAPTATION_MODEL_ID }, async (command, signal) => { const raw = await client.send(command, { abortSignal: signal }); await save(`${name}-practice-raw.json`, raw); return raw; });
    try {
      const snapshot = await store.adapt(created.key, material.fingerprint, 0, preferences, { ...practiceProvider, adaptSource: async () => structuredClone(experience) });
      const handlers = createLearningHandlers(store, practiceProvider);
      const begun = performance.now(), response = await handlers.practice(new Request("http://localhost/api/learning/practice", { method: "POST", headers: { "content-type": "application/json", cookie: `adapt-learning=${created.key}` }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: snapshot.revision }) }));
      const body = await response.json(); await save(`${name}-practice-result.json`, { httpStatus: response.status, elapsedMs: performance.now() - begun, body });
      console.log(JSON.stringify({ name, practiceHttpStatus: response.status, questions: body.questions?.length }));
    } finally { store.remove(created.key); }
  }
  const after = Object.fromEntries(await Promise.all(Object.keys(integrity).map(async p => [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
  if (JSON.stringify(integrity) !== JSON.stringify(after)) throw new Error("Application source changed during benchmark");
  await save("production-integrity.json", { unchanged: true, files: after });
}
void main().catch(error => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
