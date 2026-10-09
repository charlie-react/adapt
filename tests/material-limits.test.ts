import test from "node:test";
import assert from "node:assert/strict";
import { AUDIO_LIMITS, LEARNING_LIMITS } from "../src/lib/learning/limits";
import { decodeAudio } from "../src/lib/learning/audio";
import { fileMaterial, MATERIAL_LIMITS } from "../src/lib/learning/material";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningProvider, modelContent } from "../src/lib/learning/provider";
import { createGeminiTranscriber, GEMINI_TRANSCRIPTION_MODEL, parseGeminiTranscript } from "../src/lib/learning/gemini-transcription";
import { parseProviderResponse, sourceExcerpts } from "../src/lib/learning/provider-response";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import { textPdf } from "./fixtures/pdf";
import { wavAudio, mp3Audio } from "./fixtures/audio";
import type { AccessPreferences, LearningMaterial, LearningSnapshot } from "../src/lib/learning/types";
const root = "http://localhost/api/learning";
const limit = (error: unknown) => (error as { code: string }).code === "RESOURCE_LIMIT";
const preferences: AccessPreferences = { needs: ["read-spoken"], description: "Readable lecture", focus: "" };
function upload(bytes: Uint8Array, name: string) {
  return new Request(root, { method: "POST", headers: { "x-material-name": encodeURIComponent(name) }, body: Uint8Array.from(bytes) });
}
function wire(source: LearningMaterial, paragraphs?: string[]) {
  const excerpts = sourceExcerpts(source, { includeShort: true });
  return { introduction: "Learn at your own pace.", sections: source.units.map((unit, index) => ({ id: `source-${index + 1}`, title: "Learning material", kind: "prose", paragraphs: paragraphs ?? [unit.text!], steps: [], evidence: [{ sourceId: unit.id, mode: "text", excerptId: excerpts.find(excerpt => excerpt.sourceId === unit.id)!.id }] })), practice: [], limitations: [] };
}

test("100 PDF pages pass upload, source references and strict adaptation; 101 pages are rejected", async () => {
  const bytes = textPdf(Array.from({ length: 100 }, () => ["Educational material remains available."]));
  const store = createLearningStore();
  let calls = 0;
  const provider = createLearningProvider({}, async command => {
    calls++; assert.equal(command.input.inferenceConfig!.maxTokens, 16000);
    const native = command.input.messages![0].content!.find(block => block.document)?.document;
    assert.equal(native!.source!.bytes!.length, bytes.length);
    const source = await fileMaterial(bytes, "lecture.pdf");
    return {  $metadata: {}, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: JSON.stringify(wire(source)) }] } } };
  });
  const handlers = createLearningHandlers(store, provider);
  const accepted = await handlers.upload(upload(bytes, "lecture.pdf")); assert.equal(accepted.status, 200);
  const snapshot = await accepted.json() as LearningSnapshot;
  assert.equal(snapshot.material.units.length, 100); assert.equal(snapshot.material.units[99].locator.page, 100);
  const cookie = accepted.headers.get("set-cookie")!.split(";")[0];
  try {
    const result = await handlers.adapt(new Request(root + "/adapt", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: 0, preferences }) }));
    assert.equal(result.status, 200); assert.equal((await result.json()).experience.sections.length, 100); assert.equal(calls, 1);
    const blocked = await handlers.upload(upload(textPdf(Array.from({ length: 101 }, () => ["Another page."])), "too-long.pdf"));
    assert.equal(blocked.status, 413); assert.equal((await blocked.json()).code, "RESOURCE_LIMIT"); assert.equal(calls, 1);
  } finally { store.remove(cookie.split("=")[1]); }
});

test("30-minute WAV passes real decoding, Gemini request, full transcript validation and Claude adaptation", async () => {
  // Genuine 30-minute PCM file exceeding the old byte cap, with synthetic ASR/model responses (no paid calls).
  const bytes = wavAudio(1800, 1, 8000, 8);
  assert.ok(bytes.length > 8 * 1024 * 1024 && bytes.length < AUDIO_LIMITS.bytes);
  const sentence = "Educational content remains available in readable form. ";
  const paragraphs = Array.from({ length: 37 }, () => sentence.repeat(25).trim());
  const text = paragraphs.join("\n\n"); assert.ok(text.length > 45000 && text.length < AUDIO_LIMITS.transcriptCharacters);
  const matches = [...text.matchAll(/\S+/gu)], interval = 1799 / matches.length;
  const raw = { status: "completed", model: GEMINI_TRANSCRIPTION_MODEL, steps: [{ type: "model_output", content: [{ type: "text", text, annotations: matches.map((match, index) => ({ type: "word_info", text: match[0], start_index: match.index, end_index: match.index + match[0].length, start_offset: `${index * interval}s`, end_offset: `${(index + 0.5) * interval}s` })) }] }] };
  let transcribed = 0, adapted = 0;
  const transcriber = createGeminiTranscriber({ apiKey: "test-only" }, async (_url, init) => {
    transcribed++; const body = JSON.parse(init!.body as string);
    assert.equal(body.model, GEMINI_TRANSCRIPTION_MODEL); assert.equal(Buffer.from(body.input[0].data, "base64").length, bytes.length);
    return Response.json(raw);
  });
  const sourceUnits = { id: "transcript-1", text, locator: { kind: "transcript" as const, startSeconds: 0, endSeconds: 1799 } };
  const source: LearningMaterial = { id: "audio:test", title: "Lecture", kind: "audio", fingerprint: "a".repeat(64), units: [sourceUnits], limitations: [] };
  const provider = createLearningProvider({}, async command => {
    adapted++; assert.equal(command.input.inferenceConfig!.maxTokens, 64000);
    assert.equal(JSON.parse(command.input.messages![0].content![0].text!).sourceUnits[0].text, text);
    assert.doesNotMatch(command.input.messages![0].content![0].text!, /startIndex|endIndex|word_info/);
    return {  $metadata: {}, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: JSON.stringify(wire(source, paragraphs)) }] } } };
  });
  const store = createLearningStore(), handlers = createLearningHandlers(store, provider, transcriber);
  const accepted = await handlers.upload(upload(bytes, "lecture.wav")); assert.equal(accepted.status, 200);
  const snapshot = await accepted.json() as LearningSnapshot, cookie = accepted.headers.get("set-cookie")!.split(";")[0];
  try {
    assert.equal(snapshot.material.units[0].locator.duration, 1800);
    assert.equal(snapshot.material.units[1].transcription!.words!.length, matches.length);
    assert.equal(snapshot.material.units[1].transcription!.sourceId, "audio-1");
    const result = await handlers.adapt(new Request(root + "/adapt", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: 0, preferences }) }));
    assert.equal(result.status, 200);
    const lesson = (await result.json()).experience;
    assert.deepEqual(lesson.sections[0].paragraphs, paragraphs); assert.equal(transcribed, 1); assert.equal(adapted, 1);
    const changed = structuredClone(lesson); changed.sections[0].paragraphs.pop(); assert.throws(() => validateSourceAdaptation(changed, source, preferences));
  } finally { store.remove(cookie.split("=")[1]); }
});

test("exactly 30-minute MP3 decodes without accumulated timing error; duration and bytes remain bounded before providers run", async () => {
  const decoded = await decodeAudio(mp3Audio(75000, 48000));
  assert.equal(decoded.duration, 1800);
  await assert.rejects(decodeAudio(mp3Audio(Math.ceil(1800 * 44100 / 1152))), limit);
  await assert.rejects(decodeAudio(wavAudio(1800.1, 1, 8000, 8)), limit);
  const handlers = createLearningHandlers();
  const tooLarge = await handlers.upload(new Request(root, { method: "POST", headers: { "content-length": String(LEARNING_LIMITS.uploadBytes + 1) }, body: "small" }));
  assert.equal(tooLarge.status, 413);
  assert.throws(() => parseGeminiTranscript({ status: "completed", model: GEMINI_TRANSCRIPTION_MODEL, steps: [{ type: "model_output", content: [{ type: "text", text: "a".repeat(AUDIO_LIMITS.transcriptCharacters + 1), annotations: [] }] }] }, 1800), limit);
  assert.throws(() => parseProviderResponse(" ".repeat(LEARNING_LIMITS.responseCharacters + 1)));
  assert.equal(MATERIAL_LIMITS.textCharacters, 30000); assert.equal(MATERIAL_LIMITS.imageBytes, 3 * 1024 * 1024);
  const safe = modelContent({ id: "audio:test", title: "Test", kind: "audio", fingerprint: "a".repeat(64), limitations: [], units: [] }); assert.ok(safe.every(block => block.text));
});


test("provider context overflow becomes an actionable size limit without dropping pages", async () => {
  const source = await fileMaterial(textPdf([["A source paragraph remains intact."]]), "dense.pdf");
  const store = createLearningStore(), created = store.create(source, { sourceOnly: true });
  const provider = createLearningProvider({}, async () => { throw Object.assign(new Error("The model returned the following errors: Input is too long for requested model."), { name: "ValidationException" }); });
  const handlers = createLearningHandlers(store, provider);
  try {
    const response = await handlers.adapt(new Request(root + "/adapt", { method: "POST", headers: { cookie: `adapt-learning=${created.key}`, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: source.fingerprint, revision: 0, preferences }) }));
    assert.equal(response.status, 413); assert.equal((await response.json()).code, "RESOURCE_LIMIT");
    assert.equal(store.snapshot(created.key).experience, undefined); assert.equal(store.snapshot(created.key).material.units.length, 1);
  } finally { store.remove(created.key); }
});
