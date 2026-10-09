import assert from "node:assert/strict";
import { test } from "node:test";
import { createBedrockProvider } from "../src/lib/ai/bedrock";
import { validateExplanations, type ExplanationInput } from "../src/lib/ai/provider";
import { accommodate } from "../src/lib/engine/pipeline";
import { binaryTreeAdapter, createLesson, objective, semanticTree, canonicalTree } from "../src/lib/fixtures/binary-tree";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";

const input: ExplanationInput = { language: "en", objectives: [objective], sources: createLesson().segments, experience: semanticTree(canonicalTree, [objective]), barriers: [{ barrier: "visual-diagram-interpretation", explanation: "Structured text helps access visual relationships.", sourceIds: ["definitions"] }] };
const output = [{ sourceId: "definitions", text: "The root has no parent." }, { sourceId: "node-A", text: "A is the root and has no parent." }];
function response(text: string, stopReason: ConverseCommandOutput["stopReason"] = "end_turn"): ConverseCommandOutput {
  return { $metadata: {}, output: { message: { role: "assistant", content: [{ text }] } }, stopReason, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } };
}

test("Bedrock Converse uses Nova Lite, constrained supplied content, and abort signal", async () => {
  const signal = new AbortController().signal;
  const provider = createBedrockProvider({ region: "us-east-1" }, async (command, receivedSignal) => {
    assert.equal(receivedSignal, signal);
    assert.equal(command.input.modelId, "amazon.nova-lite-v1:0");
    assert.deepEqual(JSON.parse(command.input.messages![0].content![0].text!), input);
    assert.equal(command.input.inferenceConfig?.temperature, 0);
    assert.match(command.input.system![0].text!, /Never modify objectives/);
    return response(JSON.stringify(output));
  });
  assert.deepEqual(validateExplanations(await provider.explain(input, signal), createLesson()), output);
});

test("malformed, incomplete, fabricated, unavailable-credential, and denied Bedrock responses fail honestly", async () => {
  const transports = [
    async () => response("not JSON"),
    async () => response(JSON.stringify(output), "max_tokens"),
    async () => response(JSON.stringify([{ sourceId: "node-A", text: "A has no children." }])),
    async () => { throw new Error("Credentials unavailable"); },
    async () => { throw new Error("AccessDeniedException"); },
  ];
  for (const transport of transports) {
    const result = await accommodate(binaryTreeAdapter, { barriers: ["visual-diagram-interpretation"], representation: "structured-text" }, createBedrockProvider({ region: "us-east-1" }, transport));
    assert.equal(result.explanations.status, "unavailable");
    assert.equal(result.experience.items.length, 6);
  }
  await assert.rejects(createBedrockProvider({}, async () => response("[]")).explain(input, new AbortController().signal), /region not configured/);
  const unconfigured = createBedrockProvider({ region: "" });
  const fallback = await accommodate(binaryTreeAdapter, { barriers: ["visual-diagram-interpretation"], representation: "structured-text" }, unconfigured);
  assert.equal(fallback.explanations.status, "unavailable");
  assert.equal(fallback.practice.length, 4);
});
