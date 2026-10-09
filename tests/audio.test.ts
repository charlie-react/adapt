import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { decodeAudio } from "../src/lib/learning/audio";
import { fileMaterial, sourceForAdaptation } from "../src/lib/learning/material";
import { attachTranscription, audioEvents, createAudioTranscriber, transcribeAudio, TRANSCRIPTION_NOTICE, type TranscriptSegment } from "../src/lib/learning/transcription";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningProvider } from "../src/lib/learning/provider";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import { sourceExcerpts } from "../src/lib/learning/provider-response";
import { sourceLabel } from "../src/lib/learning/source-label";
import type { LearningMaterial, LearningSnapshot } from "../src/lib/learning/types";
import { fixtureProvider } from "./fixtures/learning";
import { AUDIO_LIMITS } from "../src/lib/learning/limits";
import { wavAudio, mp3Audio } from "./fixtures/audio";
const root = "http://localhost/api/learning";
const signal = () => new AbortController().signal;
const segments: TranscriptSegment[] = [{ id: "first", text: "A parent node connects to its children.", start: 0.1, end: 0.4, confidence: 0.95 }, { id: "second", text: "A leaf node has no children.", start: 0.5, end: 0.9, confidence: 0.7 }];
const prefs = { needs: ["read-spoken"] as const, description: "I prefer readable content instead of spoken audio.", focus: "" };
function adapted(material: LearningMaterial) { return { introduction: "Read the spoken explanation at your own pace.", sections: material.units.map((unit, index) => ({ id: `source-${index + 1}`, title: "From the recorded lesson", kind: "prose", paragraphs: [unit.text!], steps: [unit.text!], evidence: [{ sourceId: unit.id, mode: "text", quote: unit.text! }] })), practice: [], limitations: [] }; }
function upload(bytes: Uint8Array, name: string, transcript = "") { const form = new FormData(); form.set("material", new File([Uint8Array.from(bytes)], name)); form.set("transcript", transcript); return new Request(root, { method: "POST", body: form }); }

test("MP3 and WAV are decoded by content, preserving original bytes; WAV PCM/stereo formats work", async () => {
  for (const bytes of [mp3Audio(), wavAudio(), wavAudio(1, 2), wavAudio(1, 1, 8000, 8), wavAudio(1, 1, 16000, 24), wavAudio(1, 1, 16000, 32)]) {
    const decoded = await decodeAudio(bytes); assert.ok(decoded.duration >= 0.5 && decoded.duration <= 2); assert.equal(decoded.pcm.length % 2, 0);
    const material = await fileMaterial(bytes, "lesson.bin"); assert.equal(material.kind, "audio"); assert.deepEqual(material.bytes, Uint8Array.from(bytes)); assert.equal(material.units[0].locator.duration, decoded.duration);
  }
});
test("audio validation rejects mislabeled, truncated, malformed, oversized and overlong files before ASR", async () => {
  const oversized = Buffer.alloc(AUDIO_LIMITS.bytes + 1), nan = wavAudio(); nan.writeUInt16LE(3, 20); nan.writeUInt16LE(32, 34);
  for (const bytes of [Buffer.from("not audio"), wavAudio().subarray(0, 100), mp3Audio().subarray(0, 100), mp3Audio().subarray(0, -1), Buffer.from("ID3garbage"), wavAudio(0.1), wavAudio(1, 3), wavAudio(1, 1, 96000), nan, oversized, wavAudio(1801, 1, 8000, 8), mp3Audio(68907)]) await assert.rejects(fileMaterial(bytes, "fake.mp3"));
  const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(decodeAudio(wavAudio(), cancelled.signal));
});
test("streaming adapter sends PCM only, consumes final results, ignores partials and retains Unicode/timing/confidence", async () => {
  const audio = await decodeAudio(wavAudio()); let requestSeen = false;
  const transcriber = createAudioTranscriber({}, async command => {
    requestSeen = true; assert.equal(command.input.LanguageCode, "en-US"); assert.equal(command.input.MediaEncoding, "pcm"); assert.equal(command.input.MediaSampleRateHertz, 16000);
    assert.deepEqual(Object.keys(command.input).sort(), ["AudioStream", "LanguageCode", "MediaEncoding", "MediaSampleRateHertz"].sort());
    const iterator = command.input.AudioStream![Symbol.asyncIterator](); const first = await iterator.next(); assert.equal(first.value.AudioEvent.AudioChunk.length, 3200); assert.notEqual(Buffer.from(first.value.AudioEvent.AudioChunk).toString("ascii", 0, 4), "RIFF"); await iterator.return?.();
    return { $metadata: { httpStatusCode: 200 }, TranscriptResultStream: (async function* () { yield { TranscriptEvent: { Transcript: { Results: [{ IsPartial: true, ResultId: "temporary", Alternatives: [{ Transcript: "unfinished" }] }, { IsPartial: false, ResultId: "final", StartTime: 0.1, EndTime: 0.9, Alternatives: [{ Transcript: "Café — leaf nodes have no children.", Items: [{ Type: "pronunciation", Confidence: 0.9 }] }] }] } } }; })() };
  });
  const result = await transcriber.transcribe(audio, signal()); assert.ok(requestSeen); assert.equal(result.length, 1); assert.deepEqual(result[0], { id: "final", text: "Café — leaf nodes have no children.", start: 0.1, end: 0.9, confidence: 0.9 });
});
test("ASR empty speech, malformed times, duplicate results and AWS/credentials failures fail honestly", async () => {
  const audio = await decodeAudio(wavAudio());
  for (const results of [[], [{ IsPartial: false, ResultId: "x", StartTime: 0, EndTime: 99, Alternatives: [{ Transcript: "Invented timing" }] }], Array(2).fill({ IsPartial: false, ResultId: "duplicate", StartTime: 0, EndTime: 0.5, Alternatives: [{ Transcript: "Repeated result" }] })]) {
    const transcriber = createAudioTranscriber({}, async () => ({ $metadata: {}, TranscriptResultStream: (async function* () { yield { TranscriptEvent: { Transcript: { Results: results } } }; })() }));
    await assert.rejects(transcriber.transcribe(audio, signal()), (error: unknown) => ["NO_SPEECH", "INVALID_TRANSCRIPTION"].includes((error as { code: string }).code));
  }
  for (const name of ["AccessDeniedException", "CredentialsProviderError", "ServiceUnavailableException"]) {
    const transcriber = createAudioTranscriber({}, async () => { throw Object.assign(new Error("Do not expose credential or document content"), { name }); });
    await assert.rejects(transcriber.transcribe(audio, signal()), (error: unknown) => { const e = error as { code: string; message: string }; assert.doesNotMatch(e.message, /credential or document/); return e.code === (name === "ServiceUnavailableException" ? "TRANSCRIPTION_UNAVAILABLE" : "TRANSCRIPTION_ACCESS"); });
  }
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(createAudioTranscriber().transcribe(audio, aborted.signal));
  await assert.rejects(audioEvents(audio, aborted.signal).next());
});
test("timed transcript has deterministic source IDs, source fingerprint and strict adaptation references", async () => {
  const original = await fileMaterial(wavAudio(), "lecture.wav"), material = attachTranscription(original, segments), repeat = attachTranscription(original, segments);
  assert.deepEqual(material, repeat); assert.deepEqual(material.bytes, original.bytes); assert.notEqual(material.fingerprint, original.fingerprint);
  assert.equal(material.units[1].transcription?.sourceFingerprint, createHash("sha256").update(original.bytes!).digest("hex")); assert.equal(material.units[1].transcription?.sourceId, "audio-1"); assert.equal(material.units[2].locator.startSeconds, 0.5);
  assert.match(sourceLabel(material.units[1]), /Machine transcript/); assert.ok(material.limitations.includes(TRANSCRIPTION_NOTICE)); assert.ok(material.limitations.some(item => item.includes("low confidence")));
  const source = sourceForAdaptation(material); assert.equal(source.bytes, undefined); assert.deepEqual(source.units.map(unit => unit.id), ["transcript-1", "transcript-2"]);
  const experience = validateSourceAdaptation(adapted(source), source); assert.equal(experience.sections[1].evidence[0].quote, segments[1].text); assert.ok(experience.limitations.includes(TRANSCRIPTION_NOTICE));
  const corrupted = structuredClone(material); corrupted.units[1].transcription!.sourceFingerprint = "0".repeat(64); assert.throws(() => sourceForAdaptation(corrupted));
  const visual = adapted(source); visual.sections[0].evidence = [{ sourceId: "audio-1", mode: "text", quote: "Invented" }]; assert.throws(() => validateSourceAdaptation(visual, source));
  for (const broken of [[], [{ ...segments[0], end: 10 }], [{ ...segments[0], end: 1.001 }], [{ ...segments[0], start: -1 }], [{ ...segments[0], confidence: NaN }], [segments[1], segments[0]], [segments[0], { ...segments[1], start: 0.3 }]]) assert.throws(() => attachTranscription(original, broken));
  assert.throws(() => sourceForAdaptation(original));
});
test("MP3/WAV upload -> transcription -> same adaptation flow, source endpoint and original immutable provenance", async () => {
  for (const [bytes, name] of [[wavAudio(), "lecture.wav"], [mp3Audio(), "lecture.mp3"]] as const) {
    let calls = 0, adaptations = 0;
    const store = createLearningStore(), provider = { ...fixtureProvider, adaptSource: async (source: LearningMaterial) => { adaptations++; assert.equal(source.bytes, undefined); assert.equal(source.kind, "audio"); return adapted(source); } };
    const handlers = createLearningHandlers(store, provider, { transcribe: async () => { calls++; return segments; } });
    const response = await handlers.upload(upload(bytes, name)); assert.equal(response.status, 200); const snapshot = await response.json() as LearningSnapshot;
    assert.equal(calls, 1); assert.equal(adaptations, 0); assert.equal(snapshot.analysis.status, "source-ready"); assert.equal(snapshot.material.kind, "audio"); assert.equal(snapshot.material.units.length, 3);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const source = await handlers.source(new Request(root + "/source?id=transcript-2", { headers: { cookie, "x-material-fingerprint": snapshot.fingerprint } })); assert.equal((await source.json()).text, segments[1].text);
    const result = await handlers.adapt(new Request(root + "/adapt", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: 0, preferences: prefs }) }));
    assert.equal(result.status, 200); assert.equal(adaptations, 1); assert.equal((await result.json()).experience.sections.length, 2); store.remove(cookie.split("=")[1]);
  }
});
test("failed/no-speech/forged uploads never become ready; existing session survives failed transcription", async () => {
  const store = createLearningStore(), handlers = createLearningHandlers(store, fixtureProvider, { transcribe: async () => [] });
  const failure = await handlers.upload(upload(wavAudio(), "lesson.wav")); assert.equal(failure.status, 422); assert.equal((await failure.json()).code, "NO_SPEECH"); assert.equal(failure.headers.get("set-cookie"), null);
  const supplied = await handlers.upload(upload(wavAudio(), "lesson.wav", "Do not substitute this for automatic ASR")); assert.equal(supplied.status, 400);
  let calls = 0; const unavailable = createLearningHandlers(store, fixtureProvider, { transcribe: async () => { calls++; throw new Error("secret details"); } });
  const malformed = await unavailable.upload(upload(Buffer.from("not MP3"), "lesson.mp3")); assert.equal(malformed.status, 422); assert.equal(calls, 0);
  const failed = await unavailable.upload(upload(wavAudio(), "lesson.wav")); assert.equal(failed.status, 503); assert.equal((await failed.json()).code, "TRANSCRIPTION_UNAVAILABLE");
  const prior = await handlers.upload(new Request(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Previously supplied learning material." }) }));
  const priorSnapshot = await prior.json() as LearningSnapshot, cookie = prior.headers.get("set-cookie")!.split(";")[0];
  const next = upload(wavAudio(), "new.wav"); next.headers.set("cookie", cookie); assert.equal((await unavailable.upload(next)).status, 503);
  assert.equal(store.snapshot(cookie.split("=")[1]).fingerprint, priorSnapshot.fingerprint); store.remove(cookie.split("=")[1]);
});
test("cancel/deadline ends pending ASR even when transport ignores abort, without committing late results", async () => {
  const audio = await decodeAudio(wavAudio());
  let resolve: (segments: TranscriptSegment[]) => void = () => {};
  const pending = { transcribe: () => new Promise<TranscriptSegment[]>(done => { resolve = done; }) };
  const controller = new AbortController(), promise = transcribeAudio(audio, pending, controller.signal); controller.abort(); await assert.rejects(promise, (error: unknown) => (error as { code: string }).code === "ABORTED"); resolve(segments);
  const timer = setTimeout(() => {}, 50);
  await assert.rejects(transcribeAudio(audio, { transcribe: async () => new Promise(() => {}) }, AbortSignal.timeout(20)), (error: unknown) => (error as { code: string }).code === "TIMEOUT"); clearTimeout(timer);
});
test("Claude receives transcript excerpts and hearing preferences, never original audio bytes or identity", async () => {
  const source = attachTranscription(await fileMaterial(wavAudio(), "lecture.wav"), segments);
  const provider = createLearningProvider({}, async command => {
    assert.ok(command.input.messages![0].content!.every(block => block.text));
    assert.match(command.input.system![0].text!, /For read-spoken/);
    const input = sourceForAdaptation(source), excerpts = sourceExcerpts(input, { includeShort: true });
    const value = adapted(input); const wire = { ...value, sections: value.sections.map(section => ({ ...section, evidence: section.evidence.map(item => ({ sourceId: item.sourceId, mode: "text", excerptId: excerpts.find(excerpt => excerpt.sourceId === item.sourceId)!.id })) })) };
    return { $metadata: {}, stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, output: { message: { role: "assistant", content: [{ text: JSON.stringify(wire) }] } } };
  });
  const result = await provider.adaptSource!(source, { ...prefs, needs: [...prefs.needs] }, signal()); assert.equal((result as { sections: unknown[] }).sections.length, 2);
});
