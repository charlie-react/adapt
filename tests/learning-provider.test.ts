import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { createLearningProvider, modelContent } from "../src/lib/learning/provider";
import { parseProviderResponse, ProviderResponseError, resolveProviderEvidence, sourceExcerpts } from "../src/lib/learning/provider-response";
import { fileMaterial, textMaterial } from "../src/lib/learning/material";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import { validateExperience, validateReflection, validateUnderstanding } from "../src/lib/learning/validation";
import type { LearningMaterial, LearningSnapshot } from "../src/lib/learning/types";
import { diagramPng, experience, lessonText, understanding } from "./fixtures/learning";
import { textPdf } from "./fixtures/pdf";
const fence = String.fromCharCode(96).repeat(3);
const signal = () => new AbortController().signal;
const preferences = { needs: ["stepwise"] as const, description: "", focus: "Understand the supplied example" };
const output = (text: string): ConverseCommandOutput => ({ $metadata: { httpStatusCode: 200 }, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text }] } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } });
// Test inputs use the provider wire contract, not prevalidated domain quotations.
function referenced<T>(value: T, material: LearningMaterial): T {
  const excerpts = sourceExcerpts(material);
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && item.mode === "text" && typeof item.quote === "string") {
      const excerpt = excerpts.find(e => e.sourceId === item.sourceId)!;
      return { sourceId: item.sourceId, mode: "text", excerptId: excerpt.id };
    }
    return item;
  })) as T;
}
const wire = (material: LearningMaterial) => referenced(understanding(material), material);
const failingStage = (stage: ProviderResponseError["stage"], reason: RegExp) => (error: unknown) => error instanceof ProviderResponseError && error.stage === stage && reason.test(error.message);

test("provider accepts bare JSON and one complete outer JSON fence without changing content", () => {
  const value = { paragraphs: ["Café — Ω. Keep inline " + fence + " code punctuation."], quote: "One.\n  Two." };
  const json = JSON.stringify(value);
  for (const text of [json, `  ${json}\n`, `${fence}json\n${json}\n${fence}`, `${fence}\r\n${json}\r\n${fence}`, `${fence}JSON\n${json}\n${fence}`]) assert.deepEqual(parseProviderResponse(text), value);
});
test("provider rejects invalid JSON, prose, wrong-language, incomplete and multiple fences safely", () => {
  for (const text of [
    "Source-private-content is not JSON", '{"private-content":', `Here is JSON:\n${fence}json\n{}\n${fence}`,
    `${fence}json\n{}\n${fence}\nAfterword`, `${fence}json\n{}`, `${fence}javascript\n{}\n${fence}`,
    `${fence}json\n{}\n${fence}\n${fence}json\n{}\n${fence}`,
  ]) assert.throws(() => parseProviderResponse(text), error => error instanceof ProviderResponseError && !error.message.includes("private-content"));
  assert.throws(() => parseProviderResponse(" ".repeat(240001)), failingStage("envelope", /Oversized/));
});
test("server excerpts preserve all text, indentation, Unicode and punctuation with deterministic bounded IDs", () => {
  for (const text of [lessonText, "x".repeat(1199) + "🌍" + "y".repeat(8), "Café — Ω.\nif condition:\n    preserve_indentation()\n".repeat(80)]) {
    const material = textMaterial(text), excerpts = sourceExcerpts(material);
    assert.deepEqual(excerpts, sourceExcerpts(material)); assert.equal(excerpts.map(e => e.text).join(""), text);
    for (const excerpt of excerpts) {
      assert.equal(excerpt.text, text.slice(excerpt.start, excerpt.end)); assert.ok(excerpt.text.length >= 10 && excerpt.text.length <= 1200);
      assert.match(excerpt.id, /^[a-zA-Z0-9-]+$/); assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(excerpt.text));
    }
    const sent = JSON.parse(modelContent(material)[0].text!);
    assert.deepEqual(sent.sourceExcerpts, excerpts); assert.equal("text" in sent.sourceUnits[0], false);
  }
  assert.deepEqual(sourceExcerpts(textMaterial("short")), []);
  assert.equal(JSON.parse(modelContent(textMaterial("short"))[0].text!).sourceUnits[0].text, "short");
});
test("text Nova responses resolve server evidence then pass the unchanged validator with a complete explicit contract", async () => {
  const material = textMaterial(lessonText), original = wire(material); let inspected = false;
  const provider = createLearningProvider({}, async command => {
    const rules = command.input.system![0].text!;
    for (const contract of [/section.kind is ONLY/, /evidence.mode is ONLY/, /coverage.status is ONLY/, /excerptId/, /no objective is required/]) assert.match(rules, contract);
    assert.ok(!JSON.stringify(command.input).includes("learnerIdentity")); inspected = true;
    return output(`${fence}json\n${JSON.stringify(original)}\n${fence}`);
  });
  const actual = validateUnderstanding(await provider.understand(material, signal()), material);
  assert.equal(actual.sections[0].evidence[0].quote, material.units[0].text); assert.equal("excerptId" in actual.sections[0].evidence[0], false); assert.ok(inspected);
  assert.equal("quote" in original.sections[0].evidence[0], false);
});
test("image requests retain native bytes and valid visual evidence; visual remains an evidence mode, not a section kind", async () => {
  const material = await fileMaterial(diagramPng(), "diagram.png"), valid = wire(material);
  valid.sections[0].kind = "diagram";
  const provider = createLearningProvider({}, async command => { assert.deepEqual(command.input.messages![0].content!.find(block => block.image)?.image?.source?.bytes, material.bytes); return output(JSON.stringify(valid)); });
  assert.equal(validateUnderstanding(await provider.understand(material, signal()), material).sections[0].evidence[0].mode, "visual");
  const bad = { ...valid, sections: [{ ...valid.sections[0], kind: "visual" }, valid.sections[1]] };
  await assert.rejects(createLearningProvider({}, async () => output(JSON.stringify(bad))).understand(material, signal()), failingStage("validation", /Unknown content kind/));
});
test("PDF references resolve only server-owned text and retain native document/page provenance through all three tasks", async () => {
  const material = await fileMaterial(textPdf([["Learning objective: identify the root node.", "A is the root. B is its child."], ["A leaf has no children."]], true), "lesson.pdf");
  const analysis = understanding(material), adapted = experience(material, analysis, { ...preferences, needs: [...preferences.needs] });
  const reflection = { message: "Look at the supplied root relationship.", nextStep: "Describe its child.", evidence: analysis.sections[0].evidence };
  const responses = [referenced(analysis, material), referenced(adapted, material), referenced(reflection, material)];
  let calls = 0;
  const provider = createLearningProvider({}, async command => {
    const blocks = command.input.messages![0].content!;
    assert.deepEqual(blocks.find(block => block.document)?.document?.source?.bytes, material.bytes);
    const sent = JSON.parse(blocks[0].text!); assert.equal(sent.sourceUnits[0].locator.page, 1); assert.equal(sent.sourceUnits[1].locator.page, 2);
    return output(`${fence}json\n${JSON.stringify(responses[calls++])}\n${fence}`);
  });
  const actual = validateUnderstanding(await provider.understand(material, signal()), material);
  const accessible = validateExperience(await provider.adapt(material, actual, { ...preferences, needs: [...preferences.needs] }, signal()), material, actual);
  validateReflection(await provider.reflect(material, accessible.practice[0], "A has no parent.", signal()), material);
  assert.equal(calls, 3); assert.equal(actual.sections[0].evidence[0].quote, material.units[0].text);
  assert.deepEqual(actual.coverage.map(item => item.sourceId), material.units.map(unit => unit.id));
});
test("invalid evidence aliases, extra fields, unknown IDs, cross-page refs and timestamps are never repaired", async () => {
  const material = await fileMaterial(textPdf([["First page: A is the root."], ["Second page: B is its child."]], true), "lesson.pdf");
  const first = sourceExcerpts(material)[0];
  for (const bad of [
    { sourceId: first.sourceId, status: "text", excerptId: first.id },
    { sourceId: first.sourceId, mode: "text", excerptId: "invented-excerpt" },
    { sourceId: material.units[1].id, mode: "text", excerptId: first.id },
    { sourceId: "invented-page", mode: "text", excerptId: first.id },
    { sourceId: first.sourceId, mode: "text", excerptId: first.id, quote: first.text },
    { sourceId: first.sourceId, mode: "text", excerptId: first.id, time: 0 },
    { sourceId: first.sourceId, mode: "visual", quote: "Invented quotation" },
    { sourceId: first.sourceId, mode: "visual", quote: "", time: 0 },
  ]) {
    const candidate = structuredClone(wire(material)); candidate.sections[0].evidence = [bad] as never;
    await assert.rejects(createLearningProvider({}, async () => output(JSON.stringify(candidate))).understand(material, signal()), failingStage("evidence", /evidence\[0\]/));
  }
  const stale = structuredClone(sourceExcerpts(material)); stale[0].text = "Invented source text.";
  assert.throws(() => resolveProviderEvidence(wire(material), "understanding", material, stale), failingStage("evidence", /mismatched source excerpt/));
});
test("PDF quotations must match exactly: no whitespace, punctuation or truncation repair; safe failure identifies evidence path", async () => {
  const material = await fileMaterial(textPdf([["A is the root. B is its child."]], true), "lesson.pdf"), exact = material.units[0].text!;
  for (const quote of [exact + " Missing source words.", exact.replace("A", "Z"), exact.replace(" ", "  ")]) {
    const candidate = understanding(material); candidate.sections[0].evidence[0].quote = quote;
    await assert.rejects(createLearningProvider({}, async () => output(JSON.stringify(candidate))).understand(material, signal()), failingStage("evidence", /sections\[0\].evidence\[0\]: Ungrounded quotation; exact source match required/));
    assert.throws(() => validateUnderstanding(candidate, material), /Ungrounded quotation/);
  }
  const legacy = understanding(material);
  assert.equal(validateUnderstanding(await createLearningProvider({}, async () => output(JSON.stringify(legacy))).understand(material, signal()), material).sections[0].evidence[0].quote, legacy.sections[0].evidence[0].quote);
});
test("coverage contract and extra root fields remain strict after provider normalization", async () => {
  const material = textMaterial(lessonText), valid = wire(material);
  for (const candidate of [
    { ...valid, coverage: [{ sourceId: material.units[0].id, mode: "clear" }] },
    { ...valid, coverage: [{ sourceId: material.units[0].id, status: "text" }] },
    { ...valid, coverage: [] }, { ...valid, internalNotes: "Unrequested output" },
    { ...valid, coverage: [{ sourceId: material.units[0].id, status: "limited" }], limitations: [] },
  ]) await assert.rejects(createLearningProvider({}, async () => output(JSON.stringify(candidate))).understand(material, signal()), failingStage("validation", /Invalid|Missing/));
});
test("provider errors stay visible, and HTTP failures retain honest unavailable state without substituted content", async () => {
  const material = textMaterial(lessonText);
  const awsError = Object.assign(new Error("InvokeModel permission denied"), { name: "AccessDeniedException", $metadata: { httpStatusCode: 403, requestId: "synthetic-request-id" } });
  await assert.rejects(createLearningProvider({}, async () => { throw awsError; }).understand(material, signal()), error => error === awsError);
  const bad = wire(material); bad.sections[0].evidence = [{ sourceId: material.units[0].id, mode: "text", excerptId: "missing" }] as never;
  const store = createLearningStore(), handlers = createLearningHandlers(store, createLearningProvider({}, async () => output(JSON.stringify(bad))));
  const response = await handlers.upload(new Request("http://localhost/api/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: lessonText }) }));
  const snapshot = await response.json() as LearningSnapshot; assert.equal(snapshot.analysis.status, "source-ready"); assert.equal(snapshot.experience, undefined);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const adaptation = await handlers.adapt(new Request("http://localhost/api/learning/adapt", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: snapshot.revision, preferences }) }));
  assert.equal(adaptation.status, 503); assert.equal(store.snapshot(cookie.split("=")[1]).experience, undefined);
  await handlers.remove(new Request("http://localhost/api/learning", { method: "DELETE", headers: { cookie: response.headers.get("set-cookie")!.split(";")[0] } }));
});
test("real HTTP handler prepares text and native-image sources before any model request", async () => {
  for (const material of [textMaterial(lessonText), await fileMaterial(diagramPng(), "diagram.png")]) {
    const store = createLearningStore(), handlers = createLearningHandlers(store, createLearningProvider({}, async () => output(`${fence}json\n${JSON.stringify(wire(material))}\n${fence}`)));
    const image = material.kind === "image";
    const response = await handlers.upload(new Request("http://localhost/api/learning", { method: "POST", headers: { "content-type": image ? "image/png" : "application/json", ...(image ? { "x-material-name": "diagram.png" } : {}) }, body: image ? material.bytes as BodyInit : JSON.stringify({ text: lessonText }) }));
    const snapshot = await response.json() as LearningSnapshot; assert.equal(response.status, 200); assert.equal(snapshot.analysis.status, "source-ready");
    await handlers.remove(new Request("http://localhost/api/learning", { method: "DELETE", headers: { cookie: response.headers.get("set-cookie")!.split(";")[0] } }));
  }
});
