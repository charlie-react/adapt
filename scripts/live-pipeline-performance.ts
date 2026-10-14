// Developer-only live measurement. No prepared learner/demo path.
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { createLearningProvider, CLAUDE_ADAPTATION_MODEL_ID } from "../src/lib/learning/provider";
import { createGeminiTranscriber } from "../src/lib/learning/gemini-transcription";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningHandlers } from "../src/lib/learning/http";
import { fileMaterial } from "../src/lib/learning/material";
import { decodeAudio } from "../src/lib/learning/audio";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import { parseProviderResponse } from "../src/lib/learning/provider-response";
import type { LearningMaterial, AccessPreferences } from "../src/lib/learning/types";

const kind = process.argv[2], label = process.argv[3];
if (!["pdf", "audio"].includes(kind) || !/^[a-z0-9-]+$/.test(label ?? "")) throw new Error("Use pdf|audio and a unique run label");
const path = kind === "pdf" ? "C:/users/besle/Downloads/LAN_WAN_MAN_10_Page_Study_Material.pdf" : "C:/users/besle/Downloads/Entrepreneurship_5_Minute_Lecture.wav";
const directory = "docs/live-pipeline-performance-2026-10-13", root = "http://127.0.0.1:3206";
const timing: Record<string, unknown> = { kind, label, model: process.env.BEDROCK_ADAPTATION_MODEL_ID || CLAUDE_ADAPTATION_MODEL_ID };
const prefs: AccessPreferences = { needs: kind === "audio" ? ["read-spoken"] : ["stepwise"], description: "", focus: "" };
const safe = (error: unknown) => error instanceof Error ? { name: error.name, message: error.message.replace(/(?:sk-|AKIA|ASIA|AIza)[A-Za-z0-9_-]+/g,"[REDACTED]").replace(/\b\d{12}\b/g,"[ACCOUNT]").slice(0, 180) } : { name: "Unknown" };
async function main() {
  await mkdir(directory, { recursive: true });
  const resultPath = join(directory, `${kind}-${label}.json`);
  try { await readFile(resultPath); throw new Error("Result exists; choose a new label, never overwrite"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const review = await mkdtemp(join(tmpdir(), "adapt-live-performance-"));
  timing.reviewDirectory = review; timing.preferences = prefs;
  const bytes = new Uint8Array(await readFile(path));
  timing.bytes = bytes.length; timing.sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  let start = performance.now(); const prepared = await fileMaterial(bytes, basename(path)); timing.directPreparationMs = performance.now() - start;
  if (kind === "audio") { start = performance.now(); const decoded = await decodeAudio(bytes, new AbortController().signal); timing.directDecodeMs = performance.now() - start; timing.audioSeconds = decoded.duration; }
  let source: LearningMaterial | undefined;
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, maxAttempts: 1 });
  const actual = createLearningProvider({ transcriptReferences: label.startsWith("references") }, async (command, signal) => {
    if (kind === "pdf" && label.startsWith("lean")) command = new ConverseCommand({ ...command.input, system: command.input.system?.map(block => ({ text: (block.text ?? "") + "\nSTEPWISE PRESENTATION: Give each source-page section a short orienting paragraph, then connected key points carrying the source details. Avoid stating the same fact twice across paragraphs and key points. Preserve every important concept, example, qualification, comparison and source-stated objective, source order, and all page slots; do not shorten by dropping information. If six points are insufficient, keep the remaining details in paragraphs. Keep visible visual information and uncertainty. Do not invent or independently solve anything. All existing field limits and validation requirements remain in force." })) });
    const before = performance.now();
    try { const raw = await client.send(command, { abortSignal: signal }); timing.claudeMs = performance.now() - before; timing.claudeReportedMs = raw.metrics?.latencyMs; timing.usage = raw.usage; timing.stopReason = raw.stopReason;
      try { const parsed = parseProviderResponse(raw.output?.message?.content?.map(b => b.text ?? b.citationsContent?.content?.map(c => c.text).join("") ?? "").join("") ?? "") as { sections?: Record<string, unknown>[] }; timing.responseShape = parsed.sections?.map(s => ({ keys: Object.keys(s), refs: Array.isArray(s.paragraphRefs) ? s.paragraphRefs.map(r => typeof r === "string" && /^transcript-paragraph-\d+-\d+$/.test(r) ? r : "INVALID_REFERENCE") : undefined })); } catch {}
      return raw; }
    catch (error) { timing.claudeMs = performance.now() - before; timing.providerFailure = safe(error); throw error; }
  });
  const provider = { ...actual, adaptSource: async (material: LearningMaterial, preferences: AccessPreferences, signal: AbortSignal) => {
    source = material; const before = performance.now();
    await writeFile(join(review, "adaptation-source.json"), JSON.stringify(material)); // private comparison input, not a log/report
    let experience;
    try { experience = validateSourceAdaptation(await actual.adaptSource!(material, preferences, signal), material, preferences); }
    catch (error) { timing.adaptationFailure = safe(error); throw error; }
    timing.providerWithValidationMs = performance.now() - before;
    timing.sections = experience.sections.length; timing.paragraphCharacters = experience.sections.flatMap(s => s.paragraphs).join("\n").length;
    await writeFile(join(review, "lesson.json"), JSON.stringify({ ...experience, sections: experience.sections.map(({ evidence, ...s }) => ({ ...s, references: evidence.map(e => ({ sourceId: e.sourceId, mode: e.mode })) })) }));
    return experience;
  } };
  const gemini = createGeminiTranscriber();
  const transcriber = { ...gemini, transcribe: async (...args: Parameters<typeof gemini.transcribe>) => { const before = performance.now(); try { return await gemini.transcribe(...args); } finally { timing.geminiTranscriptionMs = performance.now() - before; } } };
  const store = createLearningStore(), handlers = createLearningHandlers(store, provider, transcriber);
  if (label.endsWith("control")) {
    if (!process.argv[4]) throw new Error("Control needs the prior private source file; no fabricated transcript");
    const material = JSON.parse(await readFile(process.argv[4], "utf8")) as LearningMaterial;
    timing.transcriptSha256 = createHash("sha256").update(material.units.map(u => u.text ?? "").join("\n")).digest("hex");
    try { await provider.adaptSource(material, prefs, new AbortController().signal); timing.validated = true; }
    catch (error) { timing.failure = safe(error); }
    finally { client.destroy(); await writeFile(resultPath, JSON.stringify({ ...timing, measurement: "Same exact baseline transcript, adaptation only; no Gemini/browser run." }, null, 2)); console.log(JSON.stringify(timing)); }
    return;
  }
  const ui = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3206"], { windowsHide: true, stdio: "ignore", env: { ...process.env, ADAPT_AI_DISABLE: "1" } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, session: string | undefined;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(root)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
    browser = await chromium.launch({ channel: "msedge", headless: true }); const page = await browser.newPage(); page.setDefaultTimeout(660000);
    await page.route("**/api/learning**", async route => {
      const original = route.request(), url = new URL(original.url()), headers = new Headers(await original.allHeaders());
      let body: BodyInit | undefined = original.postDataBuffer() ? Uint8Array.from(original.postDataBuffer()!) : undefined;
      if (url.pathname === "/api/learning" && original.method() === "POST") { const form = new FormData(); form.set("material", new File([bytes], basename(path))); form.set("transcript", ""); body = form; headers.delete("content-type"); headers.delete("content-length"); }
      const req = new Request(original.url(), { method: original.method(), headers, ...(original.method() !== "GET" ? { body } : {}) });
      const before = performance.now();
      const response = url.pathname.endsWith("/adapt") ? await handlers.adapt(req) : original.method() === "POST" ? await handlers.upload(req) : await handlers.read(req);
      timing[url.pathname.endsWith("/adapt") ? "adaptHandlerMs" : "uploadHandlerMs"] = performance.now() - before;
      timing[url.pathname.endsWith("/adapt") ? "adaptStatus" : "uploadStatus"] = response.status;
      session ??= response.headers.get("set-cookie")?.split(";")[0].split("=")[1];
      if (!response.ok) timing.failureCode = (await response.clone().json()).code;
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.goto(root); await page.locator("#learning-file").setInputFiles(path);
    start = performance.now(); await page.getByRole("button", { name: /Continue with my material/ }).click();
    const ready = await Promise.race([page.getByRole("heading", { name: "What would make learning more comfortable?" }).waitFor().then(() => true), page.locator(".adapt-error").waitFor().then(() => false)]);
    timing.uploadClickToSupportMs = performance.now() - start; if (!ready) throw new Error("Upload failed; see safe stage metrics");
    if (kind === "audio") { await page.getByRole("checkbox", { name: /Guide me step by step/ }).uncheck(); await page.getByRole("checkbox", { name: /Make spoken content readable/ }).check(); }
    start = performance.now(); await page.getByRole("button", { name: /Create my learning experience/ }).click();
    const learned = await Promise.race([page.locator(".adapt-lesson").waitFor().then(() => true), page.locator(".adapt-error").waitFor().then(() => false)]);
    if (!learned) throw new Error("Adaptation failed; see safe stage metrics");
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    timing.adaptClickToVisibleMs = performance.now() - start; timing.totalWaitingMs = Number(timing.uploadClickToSupportMs) + Number(timing.adaptClickToVisibleMs);
    timing.validatedVisible = true; timing.sourceUnits = source?.units.length; timing.pages = prepared.units.length;
  } catch (error) { timing.failure = safe(error); }
  finally { await browser?.close(); ui.kill(); client.destroy(); store.remove(session); await writeFile(resultPath, JSON.stringify({ ...timing, measurement: "Current production UI with current injected HTTP/service/providers. Local visible lesson plus two frames, not deployed first-paint." }, null, 2)); console.log(JSON.stringify(timing)); }
}
void main().catch(error => { console.error(JSON.stringify(safe(error))); process.exitCode = 1; });
