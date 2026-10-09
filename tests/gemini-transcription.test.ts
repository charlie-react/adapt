import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGeminiTranscriber, GEMINI_TRANSCRIPTION_MODEL, parseGeminiTranscript } from "../src/lib/learning/gemini-transcription";
import { attachTranscription } from "../src/lib/learning/transcription";
import { decodeAudio } from "../src/lib/learning/audio";
import { fileMaterial, sourceForAdaptation } from "../src/lib/learning/material";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningProvider } from "../src/lib/learning/provider";
import { sourceExcerpts } from "../src/lib/learning/provider-response";
import { fixtureProvider } from "./fixtures/learning";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import { wavAudio, mp3Audio } from "./fixtures/audio";
import type { LearningSnapshot } from "../src/lib/learning/types";

function response(text = "Café — speech.") {
  const annotations = [...text.matchAll(/\S+/gu)].map((match, index) => ({ type: "word_info", text: match[0], start_index: match.index, end_index: match.index + match[0].length, start_offset: `${index * 0.2}s`, end_offset: `${index * 0.2 + 0.1}s` }));
  return { status: "completed", model: GEMINI_TRANSCRIPTION_MODEL, steps: [{ type: "model_output", content: [{ type: "text", text, annotations }] }] };
}
const signal = () => new AbortController().signal;
test("Gemini sends validated original MP3/WAV only, verbatim mode and no stored interaction; Unicode survives", async () => {
  for (const bytes of [mp3Audio(), wavAudio()]) {
    const decoded = await decodeAudio(bytes);
    const provider = createGeminiTranscriber({ apiKey: "test-server-secret" }, async (url, init) => {
      assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
      assert.equal((init!.headers as Record<string, string>)["x-goog-api-key"], "test-server-secret");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, GEMINI_TRANSCRIPTION_MODEL); assert.equal(body.store, false);
      assert.deepEqual(Object.keys(body).sort(), ["model", "input", "generation_config", "store"].sort());
      assert.equal(body.input[0].mime_type, decoded.format === "mp3" ? "audio/mp3" : "audio/wav");
      assert.deepEqual(Buffer.from(body.input[0].data, "base64"), Buffer.from(bytes));
      assert.deepEqual(body.generation_config.transcription_config.mode, { type: "verbatim", timestamp_granularities: ["word"] });
      assert.equal(init!.signal instanceof AbortSignal, true); assert.equal(init!.redirect, "error");
      return Response.json(response());
    });
    const segments = await provider.transcribe(decoded, signal(), bytes);
    const original = await fileMaterial(bytes, "source.audio"), material = attachTranscription(original, segments, provider);
    assert.equal(segments[0].text, "Café — speech."); assert.equal(segments[0].words!.length, 3);
    assert.deepEqual(material.bytes, original.bytes); assert.equal(material.units[1].transcription!.service, "gemini-transcribe");
    assert.equal(material.units[1].transcription!.model, GEMINI_TRANSCRIPTION_MODEL); assert.equal(material.units[1].transcription!.language, "und");
    assert.equal(material.units[1].transcription!.sourceFingerprint, original.fingerprint);
    assert.deepEqual(material.units[1].transcription!.words, segments[0].words);
    assert.deepEqual(material, attachTranscription(original, segments, provider));
    assert.equal(sourceForAdaptation(material).bytes, undefined);
  }
});
test("recorded real Gemini response preserves full transcript and all word timestamps", async () => {
  const raw = JSON.parse(await readFile("docs/gemini-3.5-transcribe-2026-10-07/raw-response.json", "utf8"));
  const original = await readFile("docs/gemini-3.5-transcribe-2026-10-07/transcript.txt", "utf8");
  const segments = parseGeminiTranscript(raw, 57.910566);
  assert.equal(segments[0].text, original); assert.equal(segments[0].words!.length, 144);
  assert.equal(segments[0].start, 0.1); assert.equal(segments[0].end, 57.7);
  assert.equal(segments[0].words!.filter(word => word.timing === "point").length, 3);
});
test("source-preserving hearing adaptations reject changed wording, omissions and regenerated key points", async () => {
  const original = await fileMaterial(wavAudio(), "lecture.wav");
  const provider = createGeminiTranscriber({ apiKey: "test" });
  const source = sourceForAdaptation(attachTranscription(original, parseGeminiTranscript(response(), 1), provider));
  const value = { introduction: "Readable lecture.", sections: [{ id: "source-1", kind: "prose", title: "Speech", paragraphs: ["Café — speech."], steps: ["Café — speech."], evidence: [{ sourceId: "transcript-1", mode: "text", quote: "Café — speech." }] }], practice: [], limitations: [] };
  const preferences = { needs: ["read-spoken"] as ("read-spoken" | "plain-language")[], description: "Keep original wording", focus: "" };
  assert.doesNotThrow(() => validateSourceAdaptation(value, source, preferences));
  const changed = structuredClone(value); changed.sections[0].paragraphs = ["Speech about café."];
  assert.throws(() => validateSourceAdaptation(changed, source, preferences), /changed or omitted/);
  const keyPoint = structuredClone(value); keyPoint.sections[0].steps = ["The café teaches speech."];
  assert.throws(() => validateSourceAdaptation(keyPoint, source, preferences), /exact source excerpts/);
  assert.doesNotThrow(() => validateSourceAdaptation(changed, source, { ...preferences, needs: ["read-spoken", "plain-language"] }));
});
test("Gemini rejects incomplete, malformed, missing/forged timing, altered wording and excess response size", async () => {
  const invalid = [ { ...response(), status: "in_progress" }, { ...response(), model: "other-model" }, { ...response(), output_text: "Changed text" } ];
  for (const tweak of ["missing", "overlap", "range", "offset", "text"] as const) {
    const value = response(), words = value.steps[0].content[0].annotations;
    if (tweak === "missing") words.pop();
    if (tweak === "overlap") words[1].start_offset = "0s";
    if (tweak === "range") words[2].end_offset = "99s";
    if (tweak === "offset") words[0].end_index = 100;
    if (tweak === "text") words[0].text = "Invented";
    invalid.push(value);
  }
  for (const value of invalid) assert.throws(() => parseGeminiTranscript(value, 1));
  assert.throws(() => parseGeminiTranscript(response(""), 1), (e: unknown) => (e as { code: string }).code === "NO_SPEECH");
  for (const body of ["not JSON", "x".repeat(2 * 1024 * 1024 + 1)]) {
    const provider = createGeminiTranscriber({ apiKey: "test" }, async () => new Response(body));
    await assert.rejects(provider.transcribe(await decodeAudio(wavAudio()), signal(), wavAudio()));
  }
});
test("Gemini failures never expose provider bodies or secrets, and missing key/disabled/cancelled states fail honestly", async () => {
  const audio = await decodeAudio(wavAudio());
  for (const status of [401, 403, 404, 429, 500]) {
    const provider = createGeminiTranscriber({ apiKey: "secret" }, async () => new Response("secret uploaded content", { status }));
    const handlers = createLearningHandlers(createLearningStore(), fixtureProvider, provider);
    const form = new FormData(); form.set("material", new File([wavAudio()], "lesson.wav")); form.set("transcript", "");
    const result = await handlers.upload(new Request("http://localhost/api/learning", { method: "POST", body: form }));
    assert.equal(result.status, 503); assert.equal(result.headers.get("set-cookie"), null);
    const body = await result.text(); assert.doesNotMatch(body, /secret|AWS|Gemini|uploaded content/); assert.match(body, /transcription is unavailable/);
  }
  for (const config of [{ apiKey: "" }, { apiKey: "key", disabled: true }]) await assert.rejects(createGeminiTranscriber(config).transcribe(audio, signal(), wavAudio()));
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(createGeminiTranscriber({ apiKey: "key" }).transcribe(audio, aborted.signal, wavAudio()));
});
test("Gemini upload -> existing Claude adaptation and source controls retain exact transcript/provenance", async () => {
  const transcriber = createGeminiTranscriber({ apiKey: "test" }, async () => Response.json(response()));
  const provider = createLearningProvider({}, async command => {
    assert.ok(command.input.messages![0].content!.every(item => item.text));
    assert.match(command.input.system![0].text!, /preserve complete transcript sentences verbatim/i);
    assert.doesNotMatch(JSON.stringify(command.input), /test-server-secret|x-goog-api-key/);
    const source = sourceForAdaptation(attachTranscription(await fileMaterial(wavAudio(), "lecture.wav"), parseGeminiTranscript(response(), 1), transcriber));
    const excerpt = sourceExcerpts(source, { includeShort: true })[0];
    const output = { introduction: "Read the lecture.", sections: [{ id: "source-1", kind: "prose", title: "Spoken lesson", paragraphs: ["Café — speech."], steps: ["Café — speech."], evidence: [{ sourceId: excerpt.sourceId, mode: "text", excerptId: excerpt.id }] }], practice: [], limitations: [] };
    return { $metadata: {}, stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, output: { message: { role: "assistant", content: [{ text: JSON.stringify(output) }] } } };
  });
  let providerError: unknown;
  const observed = { ...provider, adaptSource: async (...args: Parameters<NonNullable<typeof provider.adaptSource>>) => { try { return await provider.adaptSource!(...args); } catch (error) { providerError = error; throw error; } } };
  const store = createLearningStore(), handlers = createLearningHandlers(store, observed, transcriber);
  const form = new FormData(); form.set("material", new File([wavAudio()], "lecture.wav")); form.set("transcript", "");
  const upload = await handlers.upload(new Request("http://localhost/api/learning", { method: "POST", body: form })); assert.equal(upload.status, 200);
  const snapshot = await upload.json() as LearningSnapshot, cookie = upload.headers.get("set-cookie")!.split(";")[0];
  try {
    assert.equal(snapshot.material.units[1].transcription!.service, "gemini-transcribe");
    const adapted = await handlers.adapt(new Request("http://localhost/api/learning/adapt", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: 0, preferences: { needs: ["read-spoken"], description: "Keep source wording.", focus: "" } }) }));
    assert.equal(adapted.status, 200, providerError instanceof Error ? providerError.message : undefined); assert.equal((await adapted.json()).experience.sections[0].paragraphs[0], "Café — speech.");
    const source = await handlers.source(new Request("http://localhost/api/learning/source?id=transcript-1", { headers: { cookie, "x-material-fingerprint": snapshot.fingerprint } }));
    const unit = await source.json(); assert.equal(unit.text, "Café — speech."); assert.equal(unit.transcription.words.length, 3);
  } finally { store.remove(cookie.split("=")[1]); }
});


test("long-audio provider timestamps with a missing leading digit are rejected without repair", () => {
  const value = response("Source wording remains intact.");
  value.steps[0].content[0].annotations[0].start_offset = "1179.9s";
  value.steps[0].content[0].annotations[0].end_offset = "180.3s";
  assert.throws(() => parseGeminiTranscript(value, 1800), (error: unknown) => (error as { code: string }).code === "INVALID_TRANSCRIPTION");
});
