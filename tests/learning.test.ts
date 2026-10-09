import assert from "node:assert/strict";
import { test } from "node:test";
import { fileMaterial, MATERIAL_LIMITS, mp4Duration, textMaterial, withTranscript } from "../src/lib/learning/material";
import { CLAUDE_ADAPTATION_MODEL_ID, createLearningProvider, modelContent } from "../src/lib/learning/provider";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningHandlers } from "../src/lib/learning/http";
import { evidence, validateExperience, validatePreferences, validateReflection, validateUnderstanding } from "../src/lib/learning/validation";
import type { LearningProvider, LearningSnapshot } from "../src/lib/learning/types";
import { RequestFailure } from "../src/lib/server/request";
import { diagramPng, experience, fixtureProvider, lessonText, mp4Container, understanding } from "./fixtures/learning";
import { encryptedPdf, imageOnlyPdf, textPdf } from "./fixtures/pdf";
const preferences = { needs: ["stepwise", "visual-description"] as const, description: "Describe connections without relying on sight.", focus: "Identify relationships" };
const prefs = () => ({ ...preferences, needs: [...preferences.needs] });
const errorCode = (code: string) => (e: unknown) => e instanceof RequestFailure && e.code === code;
const root = "http://localhost/api/learning";
const request = (path = "", method = "GET", cookie = "", body?: unknown) => new Request(root + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });

test("text source preserves Unicode, punctuation, indentation and fingerprints without an objective", async () => {
  const source = "Café — Ω.\nif condition:\n    preserve_indentation()"; const material = textMaterial(source);
  assert.equal(material.units[0].text, source); assert.equal(material.fingerprint, textMaterial(source).fingerprint);
  assert.equal(material.units[0].locator.end, source.length);
  assert.throws(() => textMaterial(""), errorCode("EMPTY_INPUT")); assert.throws(() => textMaterial("\0"), errorCode("INVALID_TEXT"));
  assert.throws(() => textMaterial("x".repeat(MATERIAL_LIMITS.textCharacters + 1)), errorCode("RESOURCE_LIMIT"));
  assert.equal((await fileMaterial(new TextEncoder().encode(source), "notes.md")).units[0].text, source);
  await assert.rejects(fileMaterial(new Uint8Array([0xff]), "notes.txt"), errorCode("INVALID_TEXT"));
});
test("PDF native source retains original bytes, page labels and honest scan coverage without certifying extraction", async () => {
  const bytes = textPdf([[lessonText], [lessonText]]), material = await fileMaterial(bytes, "chapter.pdf");
  assert.deepEqual(material.bytes, bytes); assert.deepEqual(material.units.map(unit => unit.id), ["p1", "p2"]);
  assert.equal(material.units[1].locator.page, 2); assert.equal(material.units[1].locator.label, "5");
  assert.ok(modelContent(material).some(block => block.document?.source?.bytes));
  const scan = await fileMaterial(imageOnlyPdf(), "scan.pdf"); assert.equal(scan.units[0].text, undefined); assert.equal(scan.format, "pdf");
  const ai = understanding(scan); ai.coverage[0].status = "unreadable"; assert.equal(validateUnderstanding(ai, scan).coverage[0].status, "unreadable");
  await assert.rejects(fileMaterial(encryptedPdf(), "locked.pdf"), errorCode("PASSWORD_PROTECTED"));
  await assert.rejects(fileMaterial(bytes.slice(0, -20), "truncated.pdf"), errorCode("INVALID_PDF"));
  await assert.rejects(fileMaterial(textPdf(Array.from({ length: 101 }, () => [lessonText])), "long.pdf"), errorCode("RESOURCE_LIMIT"));
});
test("image/video input validates containers and budgets; native modalities and transcript provenance stay separate", async () => {
  const image = await fileMaterial(diagramPng(), "diagram.pdf"); assert.equal(image.kind, "image"); assert.ok(modelContent(image).some(block => block.image?.source?.bytes));
  await assert.rejects(fileMaterial(diagramPng().slice(0, -5), "truncated.png"), errorCode("INVALID_IMAGE"));
  const tooWide = diagramPng(); Buffer.from(tooWide.buffer).writeUInt32BE(4097, 16); await assert.rejects(fileMaterial(tooWide, "wide.png"), errorCode("RESOURCE_LIMIT"));
  assert.equal(mp4Duration(mp4Container(12)), 12); assert.throws(() => mp4Duration(mp4Container(121)), errorCode("RESOURCE_LIMIT"));
  assert.throws(() => mp4Duration(mp4Container().slice(0, -1)), errorCode("INVALID_VIDEO"));
  const video = await fileMaterial(mp4Container(), "clip.mp4"); assert.ok(modelContent(video).some(block => block.video?.source?.bytes));
  const transcript = withTranscript(video, lessonText); assert.equal(transcript.units[1].locator.kind, "transcript"); assert.equal(transcript.units[1].text, lessonText);
  assert.match(transcript.limitations.join(" "), /not been verified/);
  assert.throws(() => withTranscript(image, lessonText), errorCode("INVALID_REQUEST"));
  await assert.rejects(fileMaterial(new TextEncoder().encode("not really an image"), "fake.png"), errorCode("UNSUPPORTED_FORMAT"));
});
test("structured understanding requires complete coverage, known sources, exact quotes and plain output", async () => {
  const material = textMaterial(lessonText), valid = understanding(material);
  assert.equal(validateUnderstanding(valid, material).sections.length, 2);
  for (const mutate of [
    (v: typeof valid) => { v.sections[0].evidence[0].quote = "Invented source text."; },
    (v: typeof valid) => { v.sections[0].evidence[0].sourceId = "unknown"; },
    (v: typeof valid) => { v.coverage = []; },
    (v: typeof valid) => { v.sections[0].paragraphs = ["<script>unsafe()</script>"]; },
    (v: typeof valid) => { v.coverage[0].status = "limited"; },
  ]) { const candidate = structuredClone(valid); mutate(candidate); assert.throws(() => validateUnderstanding(candidate, material)); }
  const limited = structuredClone(valid); limited.coverage[0].status = "limited"; limited.limitations = ["A source detail is uncertain."]; assert.equal(validateUnderstanding(limited, material).coverage[0].status, "limited");
  const image = await fileMaterial(diagramPng(), "diagram.png"); assert.throws(() => evidence([{ sourceId: "image-1", mode: "visual", quote: "false quotation" }], image));
  const video = await fileMaterial(mp4Container(), "clip.mp4"); assert.throws(() => evidence([{ sourceId: "video-1", mode: "visual", quote: "", time: 3 }], video));
});
test("adaptation retains all source topics and uncertainty; feedback is grounded and non-graded", () => {
  const material = textMaterial(lessonText), analysis = understanding(material), adapted = experience(material, analysis, prefs());
  assert.equal(validateExperience(adapted, material, analysis).sections.length, 2);
  assert.throws(() => validateExperience({ ...adapted, sections: adapted.sections.slice(0, 1) }, material, analysis));
  const substituted = structuredClone(adapted); substituted.sections[0].id = "new-topic"; assert.throws(() => validateExperience(substituted, material, analysis));
  analysis.coverage[0].status = "limited"; analysis.limitations = ["Uncertainty"]; assert.throws(() => validateExperience({ ...adapted, limitations: [] }, material, analysis));
  assert.throws(() => validatePreferences({ ...prefs(), identity: "do not send identity" }));
  assert.throws(() => validatePreferences({ needs: [], description: "", focus: "" }));
  assert.throws(() => validateReflection({ message: "Your score: 100", nextStep: "Continue", evidence: analysis.sections[0].evidence }, material));
});
test("replaceable Bedrock boundary uses Sonnet 4.5, actual material and no identity; failures remain visible", async () => {
  const material = textMaterial(lessonText); let calls = 0;
  const provider = createLearningProvider({}, async command => {
    calls++; assert.equal(command.input.modelId, CLAUDE_ADAPTATION_MODEL_ID); assert.equal(command.input.inferenceConfig?.temperature, 0);
    assert.match(command.input.system![0].text!, /no objective is required/); assert.ok(!JSON.stringify(command.input).includes("learnerIdentity"));
    return { $metadata: {}, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: JSON.stringify(understanding(material)) }] } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } };
  });
  validateUnderstanding(await provider.understand(material, new AbortController().signal), material); assert.equal(calls, 1);
  const failed = createLearningProvider({}, async () => { throw new Error("AWS unavailable"); }); await assert.rejects(failed.understand(material, new AbortController().signal), /AWS unavailable/);
  const malformed = createLearningProvider({}, async () => ({ $metadata: {}, output: undefined, stopReason: "max_tokens", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } }));
  await assert.rejects(malformed.understand(material, new AbortController().signal), /Incomplete/);
});
test("real HTTP flow owns source data, establishes needs without an objective, adapts and reflects using a protected session", async () => {
  const store = createLearningStore(), handlers = createLearningHandlers(store, fixtureProvider);
  const uploaded = await handlers.upload(request("", "POST", "", { text: lessonText })); assert.equal(uploaded.status, 200);
  const snapshot = await uploaded.json() as LearningSnapshot, cookie = uploaded.headers.get("set-cookie")!.split(";")[0];
  assert.match(uploaded.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/); assert.equal(snapshot.analysis.status, "source-ready");
  assert.equal("text" in snapshot.material.units[0], false); assert.equal("bytes" in snapshot.material, false);
  const source = await handlers.source(new Request(root + "?id=text-1", { headers: { cookie, "x-material-fingerprint": snapshot.fingerprint } })); assert.equal((await source.json()).text, lessonText);
  const adaptation = await handlers.adapt(request("/adapt", "POST", cookie, { fingerprint: snapshot.fingerprint, revision: snapshot.revision, preferences: prefs() }));
  assert.equal(adaptation.status, 200); const learning = await adaptation.json() as LearningSnapshot; assert.equal(learning.preferences?.focus, preferences.focus); assert.equal(learning.experience?.sections.length, 2);
  assert.equal((await handlers.adapt(request("/adapt", "POST", cookie, { fingerprint: snapshot.fingerprint, revision: snapshot.revision, preferences: prefs() }))).status, 409);
  const reflection = await handlers.reflect(request("/reflect", "POST", cookie, { fingerprint: learning.fingerprint, revision: learning.revision, questionId: "reflect-1", answer: "The root has no parent." })); assert.equal(reflection.status, 200); assert.equal((await reflection.json()).evidence[0].sourceId, "text-1");
  assert.equal((await handlers.read(request())).status, 410);
  assert.equal((await handlers.upload(new Request(root, { method: "POST", headers: { origin: "https://other.example" }, body: "test" }))).status, 403);
  assert.equal((await handlers.adapt(request("/adapt", "POST", cookie, { fingerprint: learning.fingerprint, revision: learning.revision, preferences: prefs(), material: "browser replacement" }))).status, 400);
  await handlers.remove(request("", "DELETE", cookie)); assert.equal((await handlers.read(request("", "GET", cookie))).status, 410);
});
test("invalid or unavailable AI cannot substitute content; unreadable pages block the whole material", async () => {
  for (const mode of ["failure", "invalid", "unreadable"] as const) {
    const store = createLearningStore(), material = textMaterial(lessonText), created = store.create(material);
    const provider: LearningProvider = { ...fixtureProvider, understand: async input => { if (mode === "failure") throw new Error("provider failed"); if (mode === "invalid") return {}; const v = understanding(input); v.coverage[0].status = "unreadable"; v.limitations = ["Unreadable source"]; return v; } };
    const result = await store.analyze(created.key, material.fingerprint, 0, provider);
    assert.equal(result.analysis.status, mode === "unreadable" ? "unusable" : "unavailable"); assert.equal(result.experience, undefined);
    await assert.rejects(store.adapt(created.key, material.fingerprint, result.revision, prefs(), fixtureProvider), errorCode("NOT_READY")); store.remove(created.key);
  }
});
test("multipart media keep page and transcript source coverage; malformed requests and oversized streams are rejected", async () => {
  const store = createLearningStore(), handlers = createLearningHandlers(store, fixtureProvider), form = new FormData();
  form.set("material", new File([mp4Container() as BlobPart], "clip.mp4")); form.set("transcript", lessonText);
  const result = await handlers.upload(new Request(root, { method: "POST", body: form })), snapshot = await result.json() as LearningSnapshot;
  assert.equal(result.status, 200); assert.equal(snapshot.material.units.length, 2); assert.match(snapshot.material.id, /transcript/);
  await handlers.remove(request("", "DELETE", result.headers.get("set-cookie")!.split(";")[0]));
  const badForm = new FormData(); badForm.set("material", new File([diagramPng() as BlobPart], "x.png")); badForm.set("transcript", ""); badForm.set("identity", "unexpected");
  assert.equal((await handlers.upload(new Request(root, { method: "POST", body: badForm }))).status, 400);
  assert.equal((await handlers.upload(new Request(root, { method: "POST", headers: { "content-length": String(64 * 1024 * 1024 + 1) }, body: "small" }))).status, 413);
});
test("session capacity, expiry, deadline and cancellation protect immutable source and ignore late provider writes", async () => {
  let clock = 0; const store = createLearningStore({ now: () => clock, ttlMs: 1000, maxSessions: 1, deadlineMs: 5 });
  const material = textMaterial(lessonText), created = store.create(material); material.units[0].text = "mutated caller";
  assert.equal(store.source(created.key, material.fingerprint, "text-1").text, lessonText); assert.throws(() => store.create(material), errorCode("BUSY"));
  let release!: (value: unknown) => void; const delayed = new Promise<unknown>(resolve => { release = resolve; });
  await assert.rejects(store.analyze(created.key, material.fingerprint, 0, { ...fixtureProvider, understand: async () => delayed }), errorCode("AI_UNAVAILABLE"));
  release(understanding(textMaterial(lessonText))); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(store.snapshot(created.key).revision, 0);
  clock = 1001; assert.throws(() => store.snapshot(created.key), errorCode("EXPIRED"));
  const small = createLearningStore({ maxBytes: 1 }); assert.throws(() => small.create(textMaterial(lessonText)), errorCode("BUSY"));
});
test("source-stated objectives remain source context when learner focus differs; cancelled work cannot create an experience", async () => {
  const original = "Learning objective: identify the root and leaf nodes. " + lessonText;
  const material = textMaterial(original), store = createLearningStore(), created = store.create(material);
  const analysis = await store.analyze(created.key, material.fingerprint, 0, fixtureProvider);
  const changedFocus = { ...prefs(), focus: "Explore parent-to-child connections" };
  const adapted = await store.adapt(created.key, material.fingerprint, analysis.revision, changedFocus, fixtureProvider);
  assert.equal(adapted.preferences?.focus, changedFocus.focus);
  assert.equal(store.source(created.key, material.fingerprint, "text-1").text, original);
  assert.match(adapted.experience!.sections[0].evidence[0].quote, /Learning objective/);
  let release!: (value: unknown) => void; const pending = new Promise<unknown>(resolve => { release = resolve; });
  const signal = new AbortController();
  const work = store.adapt(created.key, material.fingerprint, adapted.revision, changedFocus, { ...fixtureProvider, adapt: async () => pending }, signal.signal);
  signal.abort(); await assert.rejects(work, errorCode("AI_UNAVAILABLE"));
  release(experience(material, understanding(material), changedFocus)); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(store.snapshot(created.key).revision, adapted.revision); store.remove(created.key);
});
