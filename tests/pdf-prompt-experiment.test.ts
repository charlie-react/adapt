import test from "node:test";
import assert from "node:assert/strict";
import { createLearningProvider } from "../src/lib/learning/provider";
import { fileMaterial } from "../src/lib/learning/material";
import { sourceExcerpts } from "../src/lib/learning/provider-response";
import { textPdf } from "./fixtures/pdf";
import { compactPdfPrompt, resolveTimedAdaptation } from "../scripts/lib/pdf-prompt-experiment";
import type { ConverseCommand, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";

test("compaction changes only PDF section scaffolding, retains every page/evidence and all model settings", async () => {
  const material = await fileMaterial(textPdf([["A local network connects nearby devices."], ["A wide area network connects networks over larger areas."], ["A metropolitan network serves a city."]]), "test.pdf");
  let captured: ConverseCommand | undefined;
  const capture = new Error("Captured request");
  const provider = createLearningProvider({}, async command => { captured = command; throw capture; });
  await assert.rejects(provider.adaptSource!(material, { needs: ["stepwise"], description: "", focus: "" }, new AbortController().signal), error => error === capture);
  assert.ok(captured);
  const compact = compactPdfPrompt(captured);
  assert.deepEqual({ ...compact.input, system: undefined }, { ...captured.input, system: undefined });
  const text = compact.input.system![0].text!;
  for (const [index, unit] of material.units.entries()) {
    assert.ok(text.includes(`"id":"source-${index + 1}"`));
    assert.ok(text.includes(`"sourceId":"${unit.id}"`));
  }
  assert.match(text, /fill ALL mapped slots in order/);
  assert.match(text, /at most SIX key points/);
  assert.match(text, /Do not invent unreadable content/);
  assert.ok(text.length < captured.input.system![0].text!.length);
});

test("instrumented resolution equals production validation and rejects bad coverage, evidence and incomplete responses", async () => {
  const material = await fileMaterial(textPdf([["A local network connects nearby devices."]]), "test.pdf");
  const preferences = { needs: ["stepwise"] as const, description: "", focus: "" };
  const prefs = { ...preferences, needs: [...preferences.needs] };
  const value = { introduction: "Read at your pace.", sections: [{ id: "source-1", title: "Local networks", kind: "prose", paragraphs: ["A local network connects nearby devices."], steps: [], evidence: [{ sourceId: "p1", mode: "text", excerptId: sourceExcerpts(material, { includeShort: true })[0].id }] }], practice: [], limitations: [] };
  const raw: ConverseCommandOutput = { $metadata: { httpStatusCode: 200 }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: JSON.stringify(value) }] } } };
  const actual = resolveTimedAdaptation(raw, material, prefs);
  const provider = createLearningProvider({}, async () => raw);
  assert.deepEqual(actual.experience, await provider.adaptSource!(material, prefs, new AbortController().signal));
  assert.ok([actual.parseMs, actual.evidenceMs, actual.validationMs].every(n => n >= 0));
  assert.throws(() => resolveTimedAdaptation({ ...raw, stopReason: "max_tokens" }, material, prefs));
  for (const invalid of [{ ...value, sections: [] }, { ...value, sections: [{ ...value.sections[0], evidence: [{ sourceId: "p1", mode: "text", excerptId: "unknown" }] }] }]) {
    assert.throws(() => resolveTimedAdaptation({ ...raw, output: { message: { role: "assistant", content: [{ text: JSON.stringify(invalid) }] } } }, material, prefs));
  }
});
