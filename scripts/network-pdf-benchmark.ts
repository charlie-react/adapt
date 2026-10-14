// Approved, Claude-only, diagnostic experiment. No production imports of this module.
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { chromium, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BedrockRuntimeClient, type ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { createLearningProvider, CLAUDE_ADAPTATION_MODEL_ID } from "../src/lib/learning/provider";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningHandlers } from "../src/lib/learning/http";
import { fileMaterial } from "../src/lib/learning/material";
import type { LearningSnapshot, LearningProvider } from "../src/lib/learning/types";
import { compactPdfPrompt, resolveTimedAdaptation } from "./lib/pdf-prompt-experiment";
import { parseProviderResponse, resolveProviderEvidence, sourceExcerpts } from "../src/lib/learning/provider-response";
import { validateSourceAdaptation } from "../src/lib/learning/validation";

const sourcePath = "C:/users/besle/Downloads/LAN_WAN_MAN_10_Page_Study_Material.pdf";
const directory = join("docs", "network-pdf-performance-2026-10-13");
const root = "http://127.0.0.1:3205";
const modelId = process.env.BEDROCK_ADAPTATION_MODEL_ID || CLAUDE_ADAPTATION_MODEL_ID;
const preferences = { needs: ["stepwise"] as ["stepwise"], description: "", focus: "" };
const save = async (name: string, value: unknown) => writeFile(join(directory, name), JSON.stringify(value, null, 2) + "\n");
function safeError(error: unknown) { return error instanceof Error ? { name: error.name, message: error.message.replace(/(?:sk-|AKIA|ASIA)[A-Za-z0-9_-]+/g, "[REDACTED]").replace(/\b\d{12}\b/g, "[ACCOUNT]").slice(0, 240) } : { name: "UnknownError" }; }

async function main() {
  const mode = process.argv[2] || "pair";
  if (!["pair", "retry", "diagnose", "live", "fresh", "practice", "repeat"].includes(mode)) throw new Error("Use pair, retry, diagnose, live, fresh, practice or repeat");
  await mkdir(directory, { recursive: true });
  const reviewDirectory = await mkdtemp(join(tmpdir(), "adapt-network-review-"));
  const sourceBytes = new Uint8Array(await readFile(sourcePath));
  const fingerprint = createHash("sha256").update(sourceBytes).digest("hex");
  const measuredStart = performance.now(), material = await fileMaterial(sourceBytes, "Networking study material.pdf");
  if (material.kind !== "pdf" || fingerprint !== "cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01") throw new Error("Approved networking PDF differs; stop before live calls");
  await save("environment.json", { node: process.version, modelId, preferences, bytes: sourceBytes.length, physicalPages: material.units.length, reliableTextPages: material.units.filter(unit => unit.text).length, sourceFingerprint: fingerprint, directPreparationMs: performance.now() - measuredStart, browserBuildId: (await readFile(".next/BUILD_ID", "utf8")).trim(), noOpenaiOrAudioCalls: true });
  const tracked = ["src/lib/learning/provider.ts", "src/lib/learning/service.ts", "src/lib/learning/http.ts", "src/lib/learning/provider-response.ts", "src/lib/learning/validation.ts", "src/lib/learning/gemini-transcription.ts", "src/components/adapt-workspace.tsx", "src/components/adapted-learning.tsx"];
  const integrity = Object.fromEntries(await Promise.all(tracked.map(async path => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, maxAttempts: 1 });
  const ui = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3205"], { windowsHide: true, stdio: "ignore", env: { ...process.env, ADAPT_AI_DISABLE: "1", AWS_REGION: "", AWS_DEFAULT_REGION: "", NEXT_TELEMETRY_DISABLED: "1" } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(root, { signal: AbortSignal.timeout(1500) })).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Temporary production UI did not start; no live benchmark calls");
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
    const trials = mode === "pair" ? [["baseline", 1], ["compact", 1]] as const : mode === "retry" ? [["baseline", 2], ["compact", 2]] as const : mode === "diagnose" ? [["baseline", 3], ["compact", 3]] as const : mode === "live" ? [["baseline", 4], ["compact", 4]] as const : mode === "fresh" || mode === "practice" ? [["baseline", 5], ["compact", 5]] as const : [["compact", 6], ["baseline", 6]] as const;
    if (mode === "repeat") {
      const review = JSON.parse(await readFile(join(directory, "quality-review.json"), "utf8"));
      if (review.baseline.verdict !== "pass" || review.compact.verdict !== "pass") throw new Error("Initial pair must pass coverage/fidelity review before repeats");
    }
    for (const [variant, index] of trials) {
      const slug = `${variant}-${index}${mode === "practice" ? "-practice-replay" : ""}`;
      try { await readFile(join(directory, `${slug}-result.json`)); console.log(JSON.stringify({ slug, status: "existing-result-preserved" })); continue; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const timing: Record<string, unknown> = {}, store = createLearningStore();
      let snapshot: LearningSnapshot | undefined;
      let sessionKey: string | undefined;
      const capture = new Error("Benchmark captured request");
      let command: ConverseCommand | undefined;
      const builder = createLearningProvider({ modelId }, async request => { command = request; throw capture; });
      const standard = createLearningProvider({ modelId }, async (request, signal) => {
        const start = performance.now(), raw = await client.send(request, { abortSignal: signal });
        timing.practiceProviderMs = performance.now() - start;
        timing.practiceUsage = raw.usage;
        return raw; // Practice response handling remains wholly in the production provider.
      });
      const provider: LearningProvider = { ...standard, adaptSource: async (source, prefs, signal) => {
        if (mode === "practice") {
          if (!process.argv[3]) throw new Error("Practice replay requires the temporary lesson review directory");
          const saved = JSON.parse(await readFile(join(process.argv[3], `${variant}-${index}-lesson.json`), "utf8"));
          const excerpts = sourceExcerpts(source, { includeShort: true });
          // Reuse the exact previously generated/displayed prose and key points.
          // Review artifacts omit source quotations; link the same page IDs to
          // real server excerpts, then re-run all production evidence validation.
          // This tests lesson-answer compatibility, not an exact-session replay.
          const sections = saved.sections.map(({ sourceReferences, ...section }: { sourceReferences: {sourceId: string; mode: string}[]; [key: string]: unknown }) => ({ ...section, evidence: sourceReferences.map(ref => ref.mode === "visual" ? { ...ref, quote: "" } : { ...ref, excerptId: excerpts.find(item => item.sourceId === ref.sourceId)!.id }) }));
          const wire = parseProviderResponse(JSON.stringify({ introduction: saved.introduction, sections, practice: [], limitations: saved.limitations }));
          const experience = validateSourceAdaptation(resolveProviderEvidence(wire, "source-adaptation", source, excerpts), source, prefs);
          timing.adaptationReplayedWithoutModelCall = true;
          timing.replayEvidence = "Same page IDs; first real server excerpt per text page. Not original response quotation objects or exact-session replay.";
          return experience;
        }
        const started = performance.now();
        try { await builder.adaptSource!(source, prefs, signal); } catch (error) { if (error !== capture) throw error; }
        if (!command) throw new Error("No production request captured");
        const request = variant === "compact" ? compactPdfPrompt(command) : command;
        timing.requestConstructionMs = performance.now() - started;
        timing.systemCharacters = request.input.system!.reduce((n, block) => n + (block.text?.length ?? 0), 0);
        timing.userTextCharacters = request.input.messages![0].content!.reduce((n, block) => n + (block.text?.length ?? 0), 0);
        timing.originalPdfBytes = source.bytes!.length;
        const before = performance.now();
        let raw;
        try { raw = await client.send(request, { abortSignal: signal }); }
        catch (error) { timing.providerMs = performance.now() - before; timing.providerFailure = safeError(error); throw error; }
        timing.providerMs = performance.now() - before;
        timing.providerReportedMs = raw.metrics?.latencyMs;
        timing.usage = raw.usage;
        timing.stopReason = raw.stopReason;
        let result;
        try { result = resolveTimedAdaptation(raw, source, prefs); }
        catch (error) { timing.responseFailure = safeError(error); throw error; }
        timing.parseMs = result.parseMs; timing.evidenceMs = result.evidenceMs; timing.providerValidationMs = result.validationMs;
        const review = { introduction: result.experience.introduction, sections: result.experience.sections.map(({ evidence, ...section }) => ({ ...section, sourceReferences: evidence.map(item => ({ sourceId: item.sourceId, mode: item.mode })) })), limitations: result.experience.limitations, note: "Temporary generated-lesson review; source quotations and raw source content omitted. Not the domain contract." };
        await writeFile(join(reviewDirectory, `${slug}-lesson.json`), JSON.stringify(review, null, 2));
        return result.experience;
      } };
      const handlers = createLearningHandlers(store, provider);
      const context = await browser.newContext(), page = await context.newPage();
      page.setDefaultTimeout(180000);
      await page.addInitScript(() => {
        const target = window as unknown as Window & { __benchmarkSpeech: string[] };
        target.__benchmarkSpeech = [];
        class Utterance { text: string; lang = ""; onstart?: (event: Event) => void; onend?: (event: Event) => void; constructor(text: string) { this.text = text; } }
        Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
        Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
          speak(utterance: { text: string; onstart?: (event: Event) => void; onend?: (event: Event) => void }) { target.__benchmarkSpeech.push(utterance.text); utterance.onstart?.(new Event("start")); queueMicrotask(() => utterance.onend?.(new Event("end"))); },
          cancel() {}, pause() {}, resume() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {},
        } });
      });
      await page.route("**/api/learning**", async route => {
        const original = route.request(), path = new URL(original.url()).pathname;
        const body = original.postDataBuffer();
        const headers = new Headers(await original.allHeaders());
        let requestBody: BodyInit | undefined = body ? Uint8Array.from(body) : undefined;
        if (path === "/api/learning" && original.method() === "POST") {
          // CDP omits file bytes from captured multipart bodies. Recreate the exact
          // approved upload; all extraction/validation still runs in the real handler.
          const form = new FormData();
          form.set("material", new File([sourceBytes], "LAN_WAN_MAN_10_Page_Study_Material.pdf", { type: "application/pdf" }));
          form.set("transcript", "");
          headers.delete("content-type"); headers.delete("content-length");
          requestBody = form;
        }
        const request = new Request(original.url(), { method: original.method(), headers, ...(original.method() !== "GET" ? { body: requestBody } : {}) });
        let response: Response;
        const start = performance.now();
        if (path.endsWith("/adapt")) {
          response = await handlers.adapt(request);
          timing.adaptHandlerMs = performance.now() - start;
          timing.adaptHttpStatus = response.status;
          if (response.ok) snapshot = await response.clone().json();
        } else if (path.endsWith("/practice")) {
          response = await handlers.practice(request);
          timing.practiceHandlerMs = performance.now() - start;
          timing.practiceHttpStatus = response.status;
          const result = await response.clone().json();
          timing.practiceQuestions = result.questions?.length;
          if (result.questions) await writeFile(join(reviewDirectory, `${slug}-practice.json`), JSON.stringify({ questions: result.questions.map(({ evidence, ...question }: { evidence: unknown[]; [key: string]: unknown }) => { void evidence; return question; }) }, null, 2));
        } else if (original.method() === "POST") {
          response = await handlers.upload(request);
          timing.uploadHandlerPreparationMs = performance.now() - start;
          timing.uploadHttpStatus = response.status;
          sessionKey = response.headers.get("set-cookie")?.split(";")[0].split("=")[1];
        } else if (original.method() === "DELETE") response = await handlers.remove(request);
        else response = await handlers.read(request);
        if (!response.ok) timing.lastHttpFailure = { status: response.status, code: (await response.clone().json()).code };
        await save(`${slug}-progress.json`, timing);
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      });
      let failure: unknown;
      try {
        await page.goto(root);
        await page.locator("#learning-file").setInputFiles(sourcePath);
        const uploadStart = performance.now();
        await page.getByRole("button", { name: /Continue with my material/ }).click();
        await page.getByRole("heading", { name: "What would make learning more comfortable?" }).waitFor({ timeout: 15000 });
        timing.uploadClickToSupportMs = performance.now() - uploadStart;
        const adaptStart = performance.now();
        await page.getByRole("button", { name: /Create my learning experience/ }).click();
        const lessonState = await Promise.race([page.locator(".adapt-lesson").waitFor().then(() => "lesson"), page.locator(".adapt-error").waitFor().then(() => "failed")]);
        if (lessonState !== "lesson") throw new Error("Adaptation rejected; see stage metrics");
        await twoFrames(page);
        timing.adaptClickToVisibleLessonMs = performance.now() - adaptStart;
        timing.browserTotalWaitingMs = Number(timing.uploadClickToSupportMs) + Number(timing.adaptClickToVisibleLessonMs);
        if (!snapshot?.experience) throw new Error("No validated session snapshot");
        timing.sections = snapshot.experience.sections.length;
        timing.sourcePageIds = [...new Set(snapshot.experience.sections.flatMap(section => section.evidence.map(item => item.sourceId)))];
        timing.visibleParagraphs = snapshot.experience.sections.reduce((n, section) => n + section.paragraphs.length, 0);
        timing.keyPoints = snapshot.experience.sections.reduce((n, section) => n + section.steps.length, 0);
        timing.experienceHeadingFocused = await page.locator("#adapt-section-title").evaluate(element => document.activeElement === element);
        timing.axeViolations = (await new AxeBuilder({ page }).analyze()).violations.map(v => ({ id: v.id, impact: v.impact }));
        await page.setViewportSize({ width: 320, height: 800 });
        timing.narrowNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.getByRole("button", { name: "Read Aloud: Off", exact: true }).click();
        await page.locator(".adapt-lesson .reading-region[data-reading-enabled]").first().waitFor();
        await page.locator(".adapt-lesson .reading-region").first().focus();
        try {
          await page.waitForFunction(() => (window as unknown as Window & { __benchmarkSpeech: string[] }).__benchmarkSpeech.length > 0, undefined, { timeout: 3000 });
          timing.focusReadingWorksWithSilentSpeechSpy = true;
        } catch { timing.focusReadingWorksWithSilentSpeechSpy = false; }
        await page.getByRole("button", { name: /^Read Aloud:.*On$/ }).click();
        while (await page.getByRole("button", { name: "Next section", exact: true }).isEnabled()) await page.getByRole("button", { name: "Next section", exact: true }).click();
        await page.getByRole("button", { name: "Check my understanding", exact: true }).focus();
        await page.keyboard.press("Enter");
        const completed = await Promise.race([page.getByRole("heading", { name: "A moment to reflect", exact: true }).waitFor().then(() => "practice"), page.getByRole("alert").filter({ hasText: "We couldn’t prepare" }).waitFor().then(() => "failed")]);
        timing.practiceUiState = completed;
        if (completed === "practice") {
          await page.getByLabel("Your response", { exact: true }).fill("I will compare my explanation with the lesson.");
          await page.getByRole("button", { name: "Explore my response", exact: true }).focus();
          await page.keyboard.press("Enter");
          await page.locator(".reflection-response blockquote").waitFor();
          timing.practiceFeedbackVisible = true;
          await page.getByRole("button", { name: "Finish for now", exact: true }).focus();
          await page.keyboard.press("Enter");
          await page.getByRole("heading", { name: "Keep learning at your pace", exact: true }).waitFor();
          timing.keyboardPracticeFinish = true;
        }
      } catch (error) { failure = safeError(error); }
      finally {
        store.remove(sessionKey); // Remove only this isolated harness's temporary session.
        await context.close();
        const result = { slug, variant, trial: index, status: failure ? "failed" : "validated-and-rendered", failure, ...timing, browserMeasurement: "Unchanged production UI; intercepted local API requests run current handlers/store/live Claude. Visible lesson plus two animation frames, not deployed-network first-paint timing.", reviewDirectory };
        await save(`${slug}-result.json`, result);
        console.log(JSON.stringify(result));
      }
    }
  } finally { await browser?.close(); ui.kill(); }
  const after = Object.fromEntries(await Promise.all(tracked.map(async path => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
  if (JSON.stringify(integrity) !== JSON.stringify(after)) throw new Error("Application source changed during experiment");
  await save("production-integrity.json", { unchanged: true, hashes: after });
}
async function twoFrames(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
void main().catch(error => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
