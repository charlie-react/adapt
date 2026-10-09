import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { createLearningHandlers } from "../src/lib/learning/http";
import { fileMaterial, sourceForAdaptation, textMaterial, withTranscript } from "../src/lib/learning/material";
import { CLAUDE_ADAPTATION_MODEL_ID, createLearningProvider } from "../src/lib/learning/provider";
import { ProviderResponseError, sourceExcerpts } from "../src/lib/learning/provider-response";
import { createLearningStore } from "../src/lib/learning/service";
import { accessOptions, type AccessNeed, type LearningMaterial, type LearningSnapshot } from "../src/lib/learning/types";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import { diagramPng, fixtureProvider, lessonText, mp4Container } from "./fixtures/learning";
import { textPdf } from "./fixtures/pdf";
const prefs = (need: AccessNeed = "stepwise") => ({ needs: [need], description: "Use complete statements.", focus: "" });
const signal = () => new AbortController().signal;
const root = "http://localhost/api/learning";
function adaptation(material: LearningMaterial) {
  return { introduction: "Explore the supplied material in a more comfortable way.", sections: material.units.map((unit, index) => ({ id: `source-${index + 1}`, title: "From your material", kind: unit.text ? "prose" : "image", paragraphs: [unit.text ? "Read the original explanation alongside these connected statements." : "The source image is available alongside this description. Unclear details remain uncertain."], steps: ["Start with the supplied source.", "Follow its explanation at your pace."], evidence: [unit.text ? { sourceId: unit.id, mode: "text", quote: unit.text.slice(0, 100) } : { sourceId: unit.id, mode: "visual", quote: "" }] })), practice: [], limitations: [] };
}
function wire(material: LearningMaterial) {
  const value = adaptation(material), excerpts = sourceExcerpts(material, { includeShort: true });
  return { ...value, sections: value.sections.map(section => ({ ...section, evidence: section.evidence.map(item => item.mode === "visual" ? item : { sourceId: item.sourceId, mode: "text", excerptId: excerpts.find(excerpt => excerpt.sourceId === item.sourceId)!.id }) })) };
}
function output(text: string, citations = false): ConverseCommandOutput {
  return { $metadata: { httpStatusCode: 200 }, stopReason: "end_turn", output: { message: { role: "assistant", content: citations ? [{ citationsContent: { content: [{ text }], citations: [] } }] : [{ text }] } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } };
}

test("upload -> need -> source adaptation uses one AI call, no understanding/objective gate, and immutable provenance", async () => {
  for (const mode of accessOptions) {
    let calls = 0;
    const provider = { ...fixtureProvider, understand: async () => { throw new Error("An understanding call must never occur"); }, adaptSource: async (material: LearningMaterial) => { calls++; return adaptation(material); } };
    const store = createLearningStore(), handlers = createLearningHandlers(store, provider);
    const uploaded = await handlers.upload(new Request(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: lessonText }) }));
    assert.equal(uploaded.status, 200); const prepared = await uploaded.json() as LearningSnapshot;
    assert.equal(prepared.analysis.status, "source-ready"); assert.equal(calls, 0); assert.equal(prepared.experience, undefined);
    const cookie = uploaded.headers.get("set-cookie")!.split(";")[0], key = cookie.split("=")[1];
    const refreshed = await handlers.analyze(new Request(root + "/analyze", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: prepared.fingerprint, revision: prepared.revision }) }));
    assert.equal(refreshed.status, 200); assert.equal(calls, 0);
    const result = await handlers.adapt(new Request(root + "/adapt", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: prepared.fingerprint, revision: prepared.revision, preferences: prefs(mode.id) }) }));
    assert.equal(result.status, 200); const snapshot = await result.json() as LearningSnapshot;
    assert.equal(calls, 1); assert.deepEqual(snapshot.preferences?.needs, [mode.id]); assert.equal(snapshot.experience?.practice.length, 0);
    assert.equal(store.source(key, snapshot.fingerprint, "text-1").text, lessonText); assert.equal(snapshot.experience?.sections[0].evidence[0].quote, lessonText.slice(0, 100));
    store.remove(key);
  }
});

test("one-step Claude contract supports text, native PDF and image without an analysis summary or generated assessment", async () => {
  for (const material of [textMaterial(lessonText), await fileMaterial(textPdf([[lessonText], [lessonText]], true), "source.pdf"), await fileMaterial(diagramPng(), "source.png")]) {
    const provider = createLearningProvider({}, async command => {
      assert.equal(command.input.modelId, CLAUDE_ADAPTATION_MODEL_ID);
      const system = command.input.system![0].text!;
      for (const constraint of [/NOT an independent material-understanding task/, /No learning objective is required/, /never infer or invent relationships/, /Do not regenerate or modify source code, equations or calculations/, /Practice MUST be \[\]/]) assert.match(system, constraint);
      const context = JSON.parse(command.input.messages![0].content!.at(-1)!.text!);
      assert.deepEqual(Object.keys(context.context), ["preferences"]); assert.equal("understanding" in context.context, false);
      if (material.kind === "pdf") { const document = command.input.messages![0].content!.find(block => block.document)!.document!; assert.deepEqual(document.source!.bytes, material.bytes); assert.equal(document.citations?.enabled, true); }
      if (material.kind === "image") assert.deepEqual(command.input.messages![0].content!.find(block => block.image)!.image!.source!.bytes, material.bytes);
      return output("```json\n" + JSON.stringify(wire(material)) + "\n```", material.kind === "pdf");
    });
    const experience = validateSourceAdaptation(await provider.adaptSource!(material, prefs(), signal()), material);
    assert.equal(experience.sections.length, material.units.length); assert.equal(experience.practice.length, 0);
    assert.deepEqual(experience.sections.flatMap(section => section.evidence).map(item => item.sourceId), material.units.map(unit => unit.id));
  }
});

test("source code, equations, numbers and optional source objectives are preserved rather than repaired", async () => {
  const source = "Learning objective: follow the supplied example.\nSource answer: -870912x^3y^5.\nreturn n * factorial(n - 1);\nThe source labels this the fifth term.";
  const material = textMaterial(source), store = createLearningStore(), prepared = store.create(material, { sourceOnly: true });
  const preferences = { ...prefs("plain-language"), focus: "Read the original code without changing it" };
  const snapshot = await store.adapt(prepared.key, material.fingerprint, 0, preferences, { ...fixtureProvider, adaptSource: async input => adaptation(input) });
  assert.equal(snapshot.preferences?.focus, preferences.focus); assert.equal(store.source(prepared.key, material.fingerprint, "text-1").text, source);
  const invalid = adaptation(material); invalid.sections[0].paragraphs = ["The answer is -871424x^3y^5."];
  assert.throws(() => validateSourceAdaptation(invalid, material), /changed a source number/);
  invalid.sections[0].paragraphs = ["```java\nreturn n * factorial(n - 2);\n```"];
  assert.throws(() => validateSourceAdaptation(invalid, material)); store.remove(prepared.key);
});

test("six grouped key points preserve source mathematics; seven and eight still fail strict provider validation", async () => {
  const points = ["Read the source example.", "Identify its stated method.", "Follow the original explanation.", "Retain the source conditions.", "Keep the given example order.", "Review the original result.", "Keep the source qualification.", "Return to the original expression."];
  const exactMath = "Source expression: μ(x) = e^(∫P(x)dx). Source result: y=2+Ce^(-2x).";
  const material = textMaterial([...points, exactMath].join("\n"));
  const value = wire(material);
  value.sections[0].paragraphs = [exactMath];
  value.sections[0].steps = [points.slice(0, 2).join(" "), points.slice(2, 4).join(" "), ...points.slice(4)];
  const provider = createLearningProvider({}, async command => {
    const instructions = command.input.system![0].text!;
    assert.match(instructions, /HARD OUTPUT LIMIT: Each section.steps array contains at most SIX/);
    assert.match(instructions, /combine related source points.*rather than dropping important information/);
    assert.match(instructions, /Do not reconstruct, solve, independently verify, correct or reformat mathematical expressions/);
    return output(JSON.stringify(value));
  });
  const result = validateSourceAdaptation(await provider.adaptSource!(material, prefs(), signal()), material);
  assert.equal(result.sections[0].steps.length, 6);
  assert.equal(result.sections[0].steps.join(" "), points.join(" "));
  assert.equal(result.sections[0].paragraphs[0], exactMath);
  assert.equal(result.sections[0].evidence[0].quote, material.units[0].text);
  for (const count of [7, 8]) {
    const overLimit = structuredClone(value); overLimit.sections[0].steps = points.slice(0, count);
    const invalidProvider = createLearningProvider({}, async () => output(JSON.stringify(overLimit)));
    await assert.rejects(invalidProvider.adaptSource!(material, prefs(), signal()), error => error instanceof ProviderResponseError && error.stage === "validation" && error.message === "Invalid list");
  }
});
test("short source snippets receive exact server-owned references without pretending to infer a learning objective", async () => {
  const material = textMaterial("n = 5;");
  const provider = createLearningProvider({}, async command => {
    const payload = JSON.parse(command.input.messages![0].content![0].text!);
    assert.equal(payload.sourceExcerpts[0].text, "n = 5;");
    return output(JSON.stringify(wire(material)));
  });
  const result = await provider.adaptSource!(material, prefs("listen"), signal());
  assert.equal(validateSourceAdaptation(result, material).sections[0].evidence[0].quote, "n = 5;");
  const bad = adaptation(material); bad.sections[0].evidence[0].quote = "n = 2;";
  assert.throws(() => validateSourceAdaptation(bad, material), /Ungrounded quotation/);
});

test("missing pages, invented source IDs, invalid evidence and disappeared source limitations fail closed", async () => {
  const material = await fileMaterial(textPdf([[lessonText], [lessonText]], true), "source.pdf"), valid = adaptation(material);
  assert.throws(() => validateSourceAdaptation({ ...valid, sections: valid.sections.slice(0, 1) }, material), /Missing source references/);
  const bad = structuredClone(valid); bad.sections[0].evidence[0].sourceId = "invented"; assert.throws(() => validateSourceAdaptation(bad, material));
  const quotes = structuredClone(valid); quotes.sections[0].evidence[0].quote = "An invented source quotation."; assert.throws(() => validateSourceAdaptation(quotes, material));
  const actual = validateSourceAdaptation(valid, material); assert.deepEqual(actual.limitations, material.limitations);
});

test("provider failure and malformed response leave source and prior adaptation intact without fabricated output", async () => {
  const material = textMaterial(lessonText), store = createLearningStore(), prepared = store.create(material, { sourceOnly: true });
  for (const transport of [async () => { throw new Error("AWS unavailable"); }, async () => output("invalid JSON"), async () => output('{"introduction":"incomplete"}')]) {
    await assert.rejects(store.adapt(prepared.key, material.fingerprint, 0, prefs(), createLearningProvider({}, transport)));
    assert.equal(store.snapshot(prepared.key).experience, undefined); assert.equal(store.snapshot(prepared.key).revision, 0); assert.equal(store.source(prepared.key, material.fingerprint, "text-1").text, lessonText);
  }
  const adapted = await store.adapt(prepared.key, material.fingerprint, 0, prefs(), { ...fixtureProvider, adaptSource: async input => adaptation(input) });
  await assert.rejects(store.adapt(prepared.key, material.fingerprint, adapted.revision, prefs(), { ...fixtureProvider, adaptSource: async () => { throw new ProviderResponseError("evidence", "Unknown source reference"); } }));
  assert.deepEqual(store.snapshot(prepared.key).experience, adapted.experience); store.remove(prepared.key);
});

test("video bytes stay original; transcript adaptation does not pretend Claude can read native video", async () => {
  const video = await fileMaterial(mp4Container(), "clip.mp4"); assert.throws(() => sourceForAdaptation(video), error => !!error && typeof error === "object" && "code" in error && error.code === "TRANSCRIPT_REQUIRED");
  const material = withTranscript(video, lessonText), prepared = sourceForAdaptation(material);
  assert.equal(prepared.bytes, undefined); assert.equal(prepared.format, undefined); assert.equal(prepared.units[0].id, "transcript-1"); assert.deepEqual(material.bytes, video.bytes);
  const provider = createLearningProvider({}, async command => { assert.equal(command.input.messages![0].content!.some(block => block.video), false); return output(JSON.stringify(wire(prepared))); });
  const adapted = await provider.adaptSource!(material, prefs("listen"), signal()); assert.equal(validateSourceAdaptation(adapted, prepared).sections[0].evidence[0].sourceId, "transcript-1");
});
