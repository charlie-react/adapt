import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseSessionGoal, sourceGoals, suggestedGoal } from "../src/lib/learning-session/goals";
import { createBedrockGoalProvider, understandGoals } from "../src/lib/ai/learning-goal";
import { assessMaterial, confirmTextScope, isConfirmedUsableMaterial } from "../src/lib/material-quality/gate";
import type { QualityMaterial } from "../src/lib/material-quality/types";
import { createReviewStore } from "../src/lib/material-review/service";
import { createReviewHandlers } from "../src/lib/material-review/http";

const text = "Learning uses evidence. Compare each claim with its source.";
function material(content = text): QualityMaterial { return { id: "material", source: { kind: "text", fingerprint: "source-1" }, sourceIntegrity: "valid", extractionVersion: "1", coverage: { scope: "text", declared: "supported", expectedUnits: 1 }, units: [{ id: "u1", locator: { kind: "section", index: 1 }, blockIds: ["b1"] }], blocks: [{ id: "b1", text: content, origin: "extracted", sourceUnitId: "u1", sourceIndex: 1, structureBasis: "document-tags" }], signals: [] }; }
const input = (value = material()) => ({ status: "extracted" as const, material: value });
function accept(value = input()) { const report = assessMaterial(value); return { basis: "system-validated-text-scope" as const, assessmentFingerprint: report.fingerprint, acceptedScope: report.scope!, acknowledgedReasonIds: report.reasons.map(reason => reason.id) }; }

test("source-stated goals are traceable; learner intent wins without changing source goals", () => {
  const value = material("Objective: Identify the main idea."); const candidates = sourceGoals(value);
  assert.equal(candidates[0].origin, "source-stated"); assert.deepEqual(candidates[0].evidence, [{ blockId: "b1", unitId: "u1", quote: value.blocks[0].text }]);
  const understanding = { candidates, status: "suggestions" as const };
  assert.equal(chooseSessionGoal(understanding, "Explain supporting evidence", candidates[0].id).origin, "learner-provided");
  assert.equal(chooseSessionGoal(understanding, "Explain supporting evidence").text, "Explain supporting evidence");
  assert.equal(candidates[0].text, "Identify the main idea.");
  assert.equal(chooseSessionGoal(understanding, "", candidates[0].id).origin, "source-stated");
  assert.deepEqual(sourceGoals(material("This chapter appears to teach evidence.")), []);
  assert.throws(() => chooseSessionGoal({ candidates: [], status: "ask-learner" }, ""));
  assert.throws(() => chooseSessionGoal(understanding, "123"));
});

test("inferred goals require exact complete supplied evidence and remain explicitly inferred", async () => {
  const candidate = suggestedGoal({ sourceId: "b1", quote: "Learning uses evidence." }, material())!;
  assert.equal(candidate.origin, "ai-inferred"); assert.equal(candidate.evidence[0].quote, "Learning uses evidence.");
  assert.equal(chooseSessionGoal({ candidates: [candidate], status: "suggestions" }, "", candidate.id).origin, "ai-inferred");
  for (const output of [{ sourceId: "other", quote: text }, { sourceId: "b1", quote: "Compare each claim" }, { sourceId: "b1", quote: "An invented useful learning objective." }, { sourceId: "b1", quote: text, authority: true }, "not structured"]) assert.throws(() => suggestedGoal(output, material()));
  assert.equal(suggestedGoal(null, material()), undefined);
  const good = await understandGoals(material(), { suggest: async () => ({ sourceId: "b1", quote: text }) });
  assert.equal(good.candidates[0].origin, "ai-inferred");
  for (const provider of [{ suggest: async () => { throw new Error("unavailable"); } }, { suggest: async () => ({ sourceId: "b1", quote: "Invented explanation" }) }, { suggest: async () => null }]) assert.deepEqual(await understandGoals(material(), provider), { candidates: [], status: "ask-learner" });
  const oversized = material("A".repeat(360));
  assert.deepEqual(await understandGoals(oversized, { suggest: async () => { throw new Error("must not call"); } }), { candidates: [], status: "ask-learner" });
  const twelve = material(); twelve.blocks = Array.from({ length: 13 }, (_, index) => ({ ...twelve.blocks[0], id: `b${index}`, sourceIndex: index + 1 }));
  assert.deepEqual(await understandGoals(twelve, { suggest: async () => ({ sourceId: "b12", quote: text }) }), { candidates: [], status: "ask-learner" });
});

test("Bedrock goal boundary sends source excerpts only and rejects incomplete or malformed output", async () => {
  const sources = [{ id: "b1", text }]; let calls = 0;
  const provider = createBedrockGoalProvider({ region: "eu-north-1" }, async command => {
    calls++; const payload = JSON.parse(command.input.messages![0].content![0].text!);
    assert.deepEqual(payload, { sources }); assert.equal(command.input.modelId, "amazon.nova-lite-v1:0");
    return { $metadata: {}, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "end_turn" as const, output: { message: { role: "assistant", content: [{ text: JSON.stringify({ sourceId: "b1", quote: text }) }] } } };
  });
  assert.deepEqual(await provider.suggest(sources, new AbortController().signal), { sourceId: "b1", quote: text }); assert.equal(calls, 1);
  assert.equal((await understandGoals(material("Objective: Identify the main idea."), provider)).candidates[0].origin, "source-stated"); assert.equal(calls, 1);
  for (const response of [{ $metadata: {}, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "max_tokens" as const, output: undefined }, { $metadata: {}, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, stopReason: "end_turn" as const, output: { message: { role: "assistant" as const, content: [{ text: "not JSON" }] } } }]) {
    const invalid = createBedrockGoalProvider({ region: "eu-north-1" }, async () => response);
    await assert.rejects(invalid.suggest(sources, new AbortController().signal));
  }
});

test("text-scope acceptance preserves quality blockers, provenance and exact warning acknowledgements", () => {
  const value = input(); const result = confirmTextScope(value, accept(value)); assert.equal(result.ok, true);
  if (result.ok) { assert.ok(isConfirmedUsableMaterial(result.material)); assert.equal("sourceReviewed" in result.material.review, false); assert.ok(Object.isFrozen(result.material)); }
  for (const change of [(m: QualityMaterial) => { m.blocks[0].sourceUnitId = "forged"; }, (m: QualityMaterial) => { m.units.push({ id: "u2", locator: { kind: "page", index: 2 }, blockIds: [] }); m.coverage.expectedUnits = 2; }, (m: QualityMaterial) => { m.signals.push({ code: "READING_ORDER_UNCERTAIN", diagnostic: "Test uncertainty" }); }]) { const altered = material(); change(altered); const v = input(altered); assert.deepEqual(confirmTextScope(v, accept(v)), { ok: false, code: "NOT_READY" }); }
  const warned = material();
  // Test a known warning rather than an unrecognised signal.
  warned.signals = []; warned.blocks[0].structureBasis = "layout-heuristic"; const v = input(warned);
  assert.deepEqual(confirmTextScope(v, { ...accept(v), acknowledgedReasonIds: [] }), { ok: false, code: "REVIEW_REQUIRED" });
  assert.deepEqual(confirmTextScope(value, { ...accept(value), assessmentFingerprint: "old" }), { ok: false, code: "STALE_REVIEW" });
});

test("generic session does not require page auditing; goal changes invalidate preferences and preserve source intent", async () => {
  const store = createReviewStore(); const made = store.create(input(material("Objective: Identify the main idea.")));
  const understood = await store.goals(made.key, made.summary.quality.fingerprint);
  const request = { assessmentFingerprint: made.summary.quality.fingerprint, intent: "Explain supporting evidence", candidateId: understood.understanding!.candidates[0].id, acceptTextScope: true, acknowledgedReasonIds: made.summary.quality.reasons.map(reason => reason.id) };
  assert.throws(() => store.setGoal(made.key, { ...request, acceptTextScope: false }));
  const session = store.setGoal(made.key, request); assert.deepEqual(session.reviewedUnitIds, []); assert.equal(session.reviewStatus, "confirmed");
  assert.equal(session.session!.goal.text, request.intent); assert.equal(session.session!.sourceGoals[0].text, "Identify the main idea.");
  const prefs = store.preferences(made.key, session.quality.fingerprint, session.session!.revision, { readingStyle: "one-section" }); assert.equal(prefs.session!.preferences!.readingStyle, "one-section");
  const changed = store.setGoal(made.key, { ...request, intent: "Describe the main idea" }); assert.equal(changed.session!.preferences, undefined);
  assert.throws(() => store.preferences(made.key, session.quality.fingerprint, session.session!.revision, { readingStyle: "continuous" }));
  const broken = material(); broken.blocks[0].text = ""; const blocked = store.create(input(broken)); let calls = 0;
  await assert.rejects(store.goals(blocked.key, blocked.summary.quality.fingerprint, { suggest: async () => { calls++; return null; } })); assert.equal(calls, 0);
  const inferred = store.create(input()); const suggestion = await store.goals(inferred.key, inferred.summary.quality.fingerprint, { suggest: async () => ({ sourceId: "b1", quote: text }) });
  const accepted = store.setGoal(inferred.key, { ...request, intent: "", assessmentFingerprint: inferred.summary.quality.fingerprint, acknowledgedReasonIds: [], candidateId: suggestion.understanding!.candidates[0].id });
  assert.equal(accepted.session!.goal.origin, "ai-inferred"); assert.deepEqual(accepted.session!.sourceGoals, []); assert.equal(accepted.session!.suggestedGoals.length, 1);
  assert.match(store.proceed(inferred.key, accepted.quality.fingerprint).message, /session goal/);
  store.remove(inferred.key); store.remove(made.key); store.remove(blocked.key);
});

test("session HTTP rejects fabricated candidates, extra authority fields and stale fingerprints", async () => {
  const store = createReviewStore(); const made = store.create(input()); const handlers = createReviewHandlers(store);
  const root = "http://localhost/api/material-review"; const cookie = `adapt-material-review=${made.key}`;
  const understood = await handlers.goals(new Request(root + "/goals", { method: "POST", headers: { cookie, "x-review-fingerprint": made.summary.quality.fingerprint } })); assert.equal(understood.status, 200);
  const body = { assessmentFingerprint: made.summary.quality.fingerprint, intent: "Understand supporting evidence", candidateId: "", acceptTextScope: true, acknowledgedReasonIds: [] };
  const session = (value: unknown) => handlers.session(new Request(root + "/session", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(value) }));
  assert.equal((await session({ ...body, authoritative: true })).status, 400);
  assert.equal((await session({ ...body, intent: "", candidateId: "forged" })).status, 400);
  assert.equal((await session({ ...body, assessmentFingerprint: "stale" })).status, 409);
  const result = await session(body); assert.equal(result.status, 200); assert.equal((await result.json()).session.goal.origin, "learner-provided");
  store.remove(made.key);
});




