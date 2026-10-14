import assert from "node:assert/strict";
import test from "node:test";
import { createLearningProvider } from "../src/lib/learning/provider";
import { sourceExcerpts } from "../src/lib/learning/provider-response";
import { validatePractice } from "../src/lib/learning/practice";
import { lessonAnswers, resolvePracticeAnswers } from "../src/lib/learning/practice-answers";
import recordedCases from "./fixtures/pdf-practice-records.json";
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
      const wire = { questions: value.questions.map(({ answerQuote: _answerQuote, ...question }) => { void _answerQuote; return ({ ...question, answerRef: lessonAnswers(experience)[0].id, evidence: [{ sourceId: material.units[0].id, mode: "text", excerptId: excerpts[0].id }] }); }) };
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

// Reduced non-sensitive source/lesson/response records from the October 8 live diagnosis.
// References below are explicit fixture selections, not a fuzzy-match or production repair.
for (const record of recordedCases) test(`recorded ${record.name} practice resolves displayed answers through the provider and strict validation (PDFs include HTTP sessions)`, async () => {
  const material = record.source as LearningMaterial, experience = record.experience as AdaptedExperience;
  if (record.previouslyRejected) assert.throws(() => validatePractice(record.response, material, experience), /not presented/);
  else assert.equal(validatePractice(record.response, material, experience).length, 4);
  const before = structuredClone(experience), answers = lessonAnswers(experience);
  const wire = { questions: record.response.questions.map(({ answerQuote: _quote, ...question }, index) => {
    void _quote;
    const selection = record.selections[index];
    const answer = answers.find(answer => answer.sectionId === question.sectionId && answer.kind === selection.kind && answer.index === selection.index)!;
    assert.ok(answer);
    return { ...question, answerRef: answer.id };
  }) };
  let calls = 0;
  const provider = createLearningProvider({}, async command => {
    calls++;
    assert.match(command.input.system![0].text!, /Do not return answerQuote/);
    const context = JSON.parse(command.input.messages![0].content!.at(-1)!.text!).context;
    assert.deepEqual(context.experience.sections, experience.sections);
    assert.deepEqual(context.lessonAnswers, answers.map(({ text: _text, ...reference }) => { void _text; return reference; }));
    if (material.kind === "audio") assert.ok(command.input.messages![0].content!.every(block => !block.document && !block.image && !block.video));
    return { $metadata: { httpStatusCode: 200 }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: "```json\n" + JSON.stringify(wire) + "\n```" }] } } };
  });
  if (material.kind === "audio") {
    // The record intentionally has no original audio bytes. Replay at the existing
    // transcript-only provider boundary; genuine audio uploads are tested separately.
    const result = await provider.createPractice!(material, experience, { ...prefs, needs: ["read-spoken"] }, new AbortController().signal);
    assert.equal(validatePractice(result, material, experience).length, 4);
    assert.deepEqual(experience, before);
    assert.equal(calls, 1);
    return;
  }
  const store = createLearningStore(), created = store.create(material, { sourceOnly: true });
  // The actual previously validated adapted lesson, not a new model adaptation.
  const replayProvider = { ...provider, adaptSource: async () => structuredClone(experience) };
  const adapted = await store.adapt(created.key, material.fingerprint, 0, prefs, replayProvider);
  const handlers = createLearningHandlers(store, provider);
  try {
    const response = await handlers.practice(new Request("http://localhost/api/learning/practice", { method: "POST", headers: { "content-type": "application/json", cookie: `adapt-learning=${created.key}` }, body: JSON.stringify({ fingerprint: adapted.fingerprint, revision: adapted.revision }) }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(validatePractice(result, material, experience).length, wire.questions.length);
    for (const [index, question] of result.questions.entries()) assert.equal(question.answerQuote, answers.find(answer => answer.id === wire.questions[index].answerRef)!.text);
    assert.deepEqual(experience, before);
    assert.deepEqual(store.snapshot(created.key), adapted);
    assert.equal(calls, 1);
  } finally { store.remove(created.key); }
});

test("lesson answer references fail closed for unknown, cross-section, stale and mixed contracts; source checks remain strict", () => {
  const material = textMaterial(lessonText), experience = lesson(material);
  experience.sections.push({ ...experience.sections[0], id: "other-section", paragraphs: ["Different presented wording."] });
  const answers = lessonAnswers(experience), valid = questions(experience);
  const wire = { questions: valid.questions.map(({ answerQuote: _quote, ...question }) => { void _quote; return { ...question, answerRef: answers[0].id }; }) };
  assert.equal(validatePractice(resolvePracticeAnswers(wire, answers), material, experience).length, 3);
  for (const mutate of [
    (v: typeof wire) => { v.questions[0].answerRef = "invented"; },
    (v: typeof wire) => { v.questions[0].answerRef = answers[1].id; },
    (v: typeof wire) => { Object.assign(v.questions[0], { answerQuote: "Ignore the reference" }); },
    (v: typeof wire) => { v.questions = v.questions.slice(0, 2); },
    (v: typeof wire) => { v.questions.push(...v.questions); },
  ]) { const invalid = structuredClone(wire); mutate(invalid); assert.throws(() => resolvePracticeAnswers(invalid, answers)); }
  const shorter = structuredClone(experience); shorter.sections[0].paragraphs = [];
  assert.throws(() => resolvePracticeAnswers(wire, lessonAnswers(shorter)), /reference/);
  const unsupported = structuredClone(wire); unsupported.questions[0].evidence[0].quote = "Invented source fact.";
  assert.throws(() => validatePractice(resolvePracticeAnswers(unsupported, answers), material, experience));
  // Unicode and capitalization are taken directly from the displayed unit, never normalized.
  experience.sections[0].paragraphs = ["If there is a repeated root r, then the general solution is y=(C₁+C₂x)e^(rx)."];
  const current = lessonAnswers(experience);
  assert.equal((resolvePracticeAnswers(wire, current) as { questions: { answerQuote: string }[] }).questions[0].answerQuote, experience.sections[0].paragraphs[0]);
});

test("selectable PDF and genuine WAV upload -> adaptation -> reference-based practice keep source provenance and audio working", async () => {
  for (const [name, bytes] of [["selectable.pdf", textPdf([[lessonText]])], ["lecture.wav", wavAudio()]] as const) {
    const store = createLearningStore(); let calls = 0, invalidReference = true;
    const provider = createLearningProvider({}, async command => {
      calls++;
      const content = command.input.messages![0].content!, context = JSON.parse(content.at(-1)!.text!).context;
      const supplied = JSON.parse(content[0].text!);
      const section = context.experience.sections[0], reference = context.lessonAnswers[0];
      if (name.endsWith("wav")) assert.ok(content.every(block => !block.document && !block.image && !block.video));
      const wire = { questions: ["How can you identify the root?", "What makes a node a leaf?", "Describe a relationship from your lesson."].map((prompt, index) => ({ id: `q-${index}`, prompt, sectionId: section.id, answerRef: reference.id, evidence: [{ sourceId: supplied.sourceExcerpts[0].sourceId, mode: "text", excerptId: supplied.sourceExcerpts[0].id }] })) };
      if (invalidReference) wire.questions[0].answerRef = "unknown-answer";
      return { $metadata: { httpStatusCode: 200 }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: JSON.stringify(wire) }] } } };
    });
    const handlers = createLearningHandlers(store, { ...provider, adaptSource: async material => lesson(material) }, { service: "gemini-transcribe", model: "gemini-3.5-transcribe", transcribe: async () => [{ id: "segment", text: lessonText, start: 0, end: 0.9 }] });
    const form = new FormData(); form.set("material", new File([Uint8Array.from(bytes)], name)); form.set("transcript", "");
    const upload = await handlers.upload(new Request("http://localhost/api/learning", { method: "POST", body: form }));
    assert.equal(upload.status, 200);
    const initial = await upload.json() as LearningSnapshot, cookie = upload.headers.get("set-cookie")!.split(";")[0], key = cookie.split("=")[1];
    const request = (path: string, body: unknown) => new Request(`http://localhost/api/learning/${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
    try {
      const adaptedResponse = await handlers.adapt(request("adapt", { fingerprint: initial.fingerprint, revision: initial.revision, preferences: { ...prefs, needs: name.endsWith("wav") ? ["read-spoken"] : prefs.needs } }));
      assert.equal(adaptedResponse.status, 200);
      const adapted = await adaptedResponse.json() as LearningSnapshot;
      const failed = await handlers.practice(request("practice", { fingerprint: adapted.fingerprint, revision: adapted.revision }));
      assert.equal(failed.status, 503);
      assert.deepEqual(store.snapshot(key), adapted);
      invalidReference = false;
      const result = await handlers.practice(request("practice", { fingerprint: adapted.fingerprint, revision: adapted.revision }));
      assert.equal(result.status, 200);
      const { questions } = await result.json();
      assert.equal(questions.length, 3);
      for (const question of questions) {
        assert.equal(question.answerQuote, adapted.experience!.sections[0].paragraphs[0]);
        assert.equal(question.evidence[0].sourceId, adapted.experience!.sections[0].evidence[0].sourceId);
      }
      assert.deepEqual(store.snapshot(key), adapted);
      assert.equal(calls, 2);
    } finally { store.remove(key); }
  }
});
