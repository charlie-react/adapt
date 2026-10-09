import assert from "node:assert/strict";
import test from "node:test";
import { createLearningProvider } from "../src/lib/learning/provider";
import { sourceExcerpts } from "../src/lib/learning/provider-response";
import { validatePractice } from "../src/lib/learning/practice";
import { textMaterial, fileMaterial, sourceForAdaptation } from "../src/lib/learning/material";
import { attachTranscription } from "../src/lib/learning/transcription";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import type { AccessPreferences, AdaptedExperience, LearningMaterial, LearningSnapshot } from "../src/lib/learning/types";
import { lessonText, fixtureProvider } from "./fixtures/learning";
import { wavAudio } from "./fixtures/audio";
import { textPdf } from "./fixtures/pdf";
const prefs: AccessPreferences = { needs: ["plain-language"], description: "Use short clear questions.", focus: "" };
function lesson(material: LearningMaterial): AdaptedExperience {
  return { introduction: "Explore at your pace.", sections: material.units.map((unit, index) => ({ id: `section-${index}`, title: "Your lesson", kind: "prose", paragraphs: [unit.text!], steps: [], evidence: [{ sourceId: unit.id, mode: "text", quote: unit.text! }] })), practice: [], limitations: [] };
}
function questions(experience: AdaptedExperience) {
  const section = experience.sections[0];
  return { questions: ["How can you identify the root?", "What makes a node a leaf?", "Describe the relationship in the example."].map((prompt, index) => ({ id: `q-${index}`, prompt, sectionId: section.id, answerQuote: section.paragraphs[0], evidence: section.evidence })) };
}
test("practice requires 3–5 distinct questions with exact presented answers and verified section evidence", () => {
  const material = textMaterial(lessonText), experience = lesson(material), valid = questions(experience);
  assert.equal(validatePractice(valid, material, experience).length, 3);
  const five = structuredClone(valid);
  five.questions.push({ ...five.questions[0], id: "q-4", prompt: "Describe the example’s root." }, { ...five.questions[1], id: "q-5", prompt: "Explain a parent-child relationship from the lesson." });
  assert.equal(validatePractice(five, material, experience).length, 5);
  for (const mutate of [
    (v: typeof valid) => { v.questions = v.questions.slice(0, 2); },
    (v: typeof valid) => { v.questions.push(...v.questions); },
    (v: typeof valid) => { v.questions[0].answerQuote = "A leaf always has two children."; },
    (v: typeof valid) => { v.questions[0].sectionId = "unseen-section"; },
    (v: typeof valid) => { v.questions[0].evidence[0].quote = "Invented source quotation"; },
    (v: typeof valid) => { v.questions[0].evidence[0].sourceId = "unknown-source"; },
    (v: typeof valid) => { v.questions[1].id = v.questions[0].id; },
    (v: typeof valid) => { v.questions[1].prompt = v.questions[0].prompt; },
    (v: typeof valid) => { v.questions[0].prompt = "What score did you get?"; },
  ]) { const invalid = structuredClone(valid); mutate(invalid); assert.throws(() => validatePractice(invalid, material, experience)); }
});
test("practice rejects a valid source reference borrowed from a different lesson section; mathematical wording stays exact", () => {
  const material = textMaterial("Source expression: μ(x) = e^(∫P(x)dx). Source result: y=2+Ce^(-2x)."), experience = lesson(material);
  const value = questions(experience);
  assert.equal(validatePractice(value, material, experience)[0].answerQuote, material.units[0].text);
  const changed = structuredClone(value); changed.questions[0].answerQuote = material.units[0].text!.replace("2x", "3x");
  assert.throws(() => validatePractice(changed, material, experience), /not presented/);
  material.units.push({ id: "other", text: "An unrelated source sentence.", locator: { kind: "text" } });
  value.questions[0].evidence = [{ sourceId: "other", mode: "text", quote: "An unrelated source sentence." }];
  assert.throws(() => validatePractice(value, material, experience), /does not support/);
});
test("replaceable provider uses the adapted lesson/preferences and exact source excerpts for text, PDF, and audio transcripts", async () => {
  const audio = await fileMaterial(wavAudio(), "lesson.wav");
  const transcript = attachTranscription(audio, [{ id: "segment", text: lessonText, start: 0, end: 0.9 }], { service: "gemini-transcribe", model: "gemini-3.5-transcribe" });
  for (const original of [textMaterial(lessonText), await fileMaterial(textPdf([[lessonText]]), "lesson.pdf"), transcript]) {
    const material = sourceForAdaptation(original), experience = lesson(material), value = questions(experience);
    const provider = createLearningProvider({}, async command => {
      assert.match(command.input.system![0].text!, /3-5 distinct short-answer questions/);
      assert.match(command.input.system![0].text!, /never solve or correct the source/);
      const content = command.input.messages![0].content!, context = JSON.parse(content.at(-1)!.text!);
      assert.deepEqual(context.context.experience.sections, experience.sections);
      assert.deepEqual(context.context.preferences, prefs);
      if (material.kind === "audio") { assert.equal(material.bytes, undefined); assert.ok(content.every(block => !block.video && !block.image && !block.document)); }
      const excerpts = sourceExcerpts(material, { includeShort: true });
      const wire = { questions: value.questions.map(question => ({ ...question, evidence: [{ sourceId: material.units[0].id, mode: "text", excerptId: excerpts[0].id }] })) };
      return { $metadata: { httpStatusCode: 200 }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: "```json\n" + JSON.stringify(wire) + "\n```" }] } } };
    });
    const result = await provider.createPractice!(material, experience, prefs, new AbortController().signal);
    assert.equal(validatePractice(result, material, experience).length, 3);
  }
});
test("practice request is opt-in, session/revision protected, cached, and cannot alter the adapted lesson", async () => {
  let calls = 0;
  const provider = { ...fixtureProvider, adaptSource: async (material: LearningMaterial) => lesson(material), createPractice: async (_material: LearningMaterial, experience: AdaptedExperience) => { calls++; return questions(experience); } };
  const store = createLearningStore(), handlers = createLearningHandlers(store, provider), root = "http://localhost/api/learning";
  const upload = await handlers.upload(new Request(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: lessonText }) }));
  const initial = await upload.json() as LearningSnapshot, cookie = upload.headers.get("set-cookie")!.split(";")[0], key = cookie.split("=")[1];
  function request(body: unknown, authenticated = true) { return new Request(root + "/practice", { method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { cookie } : {}) }, body: JSON.stringify(body) }); }
  assert.equal((await handlers.practice(request({ fingerprint: initial.fingerprint, revision: 0 }))).status, 409);
  const adapted = await store.adapt(key, initial.fingerprint, 0, prefs, provider); assert.equal(calls, 0);
  const body = { fingerprint: adapted.fingerprint, revision: adapted.revision };
  for (let index = 0; index < 2; index++) { const response = await handlers.practice(request(body)); assert.equal(response.status, 200); assert.equal((await response.json()).questions.length, 3); }
  assert.equal(calls, 1); assert.deepEqual(store.snapshot(key), adapted);
  assert.equal((await handlers.practice(request(body, false))).status, 410);
  assert.equal((await handlers.practice(request({ ...body, revision: 0 }))).status, 409);
  assert.equal((await handlers.practice(request({ ...body, answer: "Do not transmit learner answers" }))).status, 400);
  assert.equal((await handlers.practice(request({ ...body, fingerprint: "invalid" }))).status, 400);
  store.remove(key);
});
test("provider/malformed/ungrounded failures preserve the lesson and permit a later retry", async () => {
  const material = textMaterial(lessonText), store = createLearningStore(), created = store.create(material, { sourceOnly: true });
  const provider = { ...fixtureProvider, adaptSource: async () => lesson(material) };
  const adapted = await store.adapt(created.key, material.fingerprint, 0, prefs, provider);
  for (const createPractice of [async () => { throw new Error("Provider unavailable"); }, async () => ({ questions: [] }), async () => { const value = questions(lesson(material)); value.questions[0].answerQuote = "Unsupported explanation"; return value; }]) {
    await assert.rejects(store.practice(created.key, material.fingerprint, adapted.revision, { ...provider, createPractice }));
    assert.deepEqual(store.snapshot(created.key), adapted);
  }
  assert.equal((await store.practice(created.key, material.fingerprint, adapted.revision, { ...provider, createPractice: async () => questions(lesson(material)) })).questions.length, 3);
  store.remove(created.key);
});
