import test from "node:test";
import assert from "node:assert/strict";
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { checkBudget, reserveUsd, costFromUsage, responsesPayload, responseEnvelope } from "../scripts/lib/openai-responses-transport";

test("benchmark budget reserves before calling and stops at $5 including outstanding requests", () => {
  assert.equal(reserveUsd(10000), .43);
  checkBudget(4.5, 0, .5);
  assert.throws(() => checkBudget(4.5, .1, .5), /ceiling/);
  assert.throws(() => checkBudget(5, 0, .000001), /ceiling/);
  assert.throws(() => checkBudget(NaN, 0, .1));
  assert.throws(() => reserveUsd(0));
  assert.throws(() => reserveUsd(undefined as unknown as number));
});
test("usage reconciliation includes reasoning output, caching and conservative unitemized cache-write reserve", () => {
  const cost = costFromUsage({ input_tokens: 10000, output_tokens: 4000, input_tokens_details: { cached_tokens: 2000 }, output_tokens_details: { reasoning_tokens: 3000 } });
  assert.equal(cost.baseUsd, .0562);
  assert.equal(cost.upperUsd, .065);
  assert.equal(costFromUsage({ input_tokens: 5796, output_tokens: 1935, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 5793 } }).baseUsd, .0338385);
  assert.ok(costFromUsage({ input_tokens: 300000, output_tokens: 10000 }).upperUsd > 1);
  assert.throws(() => costFromUsage({ input_tokens: 2, output_tokens: 2, input_tokens_details: { cached_tokens: 3 } }));
});
function command(kind = "pdf", pages = 7) {
  return new ConverseCommand({ modelId: "unchanged-claude-model", system: [{ text: "Existing source-grounding instructions" }], messages: [{ role: "user", content: [{ text: JSON.stringify({ inputKind: kind, sourceUnits: Array.from({ length: pages }, (_, index) => ({ id: `p${index + 1}` })), sourceExcerpts: [{ id: "excerpt-1", text: "y=2+Ce^(-2x)" }] }) }, { document: { format: "pdf", name: "Learning material", source: { bytes: new Uint8Array([1, 2, 3]) }, citations: { enabled: true } } }, { text: JSON.stringify({ context: { preferences: { needs: ["stepwise"] } } }) }] }] });
}
test("isolated transport preserves native PDF and exact instructions/evidence, fixes model/tier and cannot test 28 pages or audio", () => {
  const input = command(), payload = responsesPayload(input);
  assert.equal(input.input.modelId, "unchanged-claude-model");
  assert.equal(payload.model, "gpt-6.1-sol");
  assert.equal(payload.store, false);
  assert.equal(payload.reasoning.effort, "low");
  assert.deepEqual(responsesPayload(input, "high"), { ...payload, reasoning: { effort: "high" } });
  assert.equal(payload.service_tier, "default");
  assert.equal(payload.instructions, input.input.system![0].text);
  assert.deepEqual(payload.input[0].content[0], { type: "input_text", text: input.input.messages![0].content![0].text });
  assert.match(JSON.stringify(payload), /data:application\/pdf;base64,AQID/);
  assert.throws(() => responsesPayload(command("pdf", 28)), /seven-page/);
  assert.throws(() => responsesPayload(command("audio")), /seven-page/);
  assert.equal("temperature" in payload, false);
});
test("only completed final message text reaches existing validators; reasoning/refusal/incomplete output cannot be a lesson", () => {
  const raw = { status: "completed", usage: { input_tokens: 100, output_tokens: 200 }, output: [{ type: "reasoning", summary: [{ text: "Never lesson content" }] }, { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"introduction":"Exact source"}' }] }] };
  assert.equal(responseEnvelope(raw, 123).output!.message!.content![0].text, '{"introduction":"Exact source"}');
  for (const invalid of [{ ...raw, status: "incomplete" }, { ...raw, output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "Refused" }] }] }, { ...raw, output: [] }, { ...raw, usage: undefined }]) assert.throws(() => responseEnvelope(invalid, 1));
});
