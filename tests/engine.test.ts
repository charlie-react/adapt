import assert from "node:assert/strict";
import { test } from "node:test";
import { accommodate, identifyObjectives } from "../src/lib/engine/pipeline";
import { createHandlers } from "../src/lib/engine/http";
import type { MaterialAdapter } from "../src/lib/engine/types";
import { validateExplanations, type ExplanationProvider } from "../src/lib/ai/provider";
import { binaryTreeAdapter, canonicalTree, createLesson, objective, practiceQuestions, respondToPractice, semanticTree, validateTree, visualTree, type BinaryTree } from "../src/lib/fixtures/binary-tree";

const preferences = { barriers: ["visual-diagram-interpretation"], representation: "structured-text" as const };
const lesson = createLesson();
const validOutput = [{ sourceId: "definitions", text: "The root has no parent." }, { sourceId: "node-A", text: "A is the root and has no parent." }];
const provider: ExplanationProvider = { origin: "ai-generated", explain: async () => validOutput };

test("source validation rejects invalid roots, references, duplicates, cycles, and disconnected components", () => {
  const invalid: BinaryTree[] = [
    { root: "A", nodes: [] },
    { root: "X", nodes: canonicalTree.nodes },
    { root: "A", nodes: [...canonicalTree.nodes, canonicalTree.nodes[0]] },
    { root: "A", nodes: [{ id: "A", left: "X", right: null }] },
    { root: "A", nodes: [{ id: "A", left: "A", right: null }] },
    { root: "A", nodes: [{ id: "A", left: "B", right: "B" }, { id: "B", left: null, right: null }] },
    { root: "A", nodes: [{ id: "A", left: null, right: null }, { id: "B", left: "C", right: null }, { id: "C", left: "B", right: null }] },
  ];
  for (const tree of invalid) assert.throws(() => validateTree(tree));
  validateTree(canonicalTree);
});

test("visual and semantic conversions preserve every canonical edge, side, parent, and leaf", () => {
  const semantic = semanticTree(canonicalTree, [objective]);
  const visual = visualTree(canonicalTree);
  assert.equal(semantic.items.length, canonicalTree.nodes.length);
  for (const node of canonicalTree.nodes) {
    const item = semantic.items.find((candidate) => candidate.id === node.id)!;
    assert.ok(item.facts.includes(`Left child: ${node.left ?? "none"}.`));
    assert.ok(item.facts.includes(`Right child: ${node.right ?? "none"}.`));
    const parent = canonicalTree.nodes.find((candidate) => candidate.left === node.id || candidate.right === node.id);
    assert.ok(item.facts.includes(parent ? `Parent: ${parent.id}. ${node.id} is its ${parent.left === node.id ? "left" : "right"} child.` : "A is the root and has no parent."));
    assert.equal(item.facts.some((fact) => fact.includes("is a leaf")), node.left === null && node.right === null);
    for (const child of [node.left, node.right].filter(Boolean)) {
      assert.ok(item.related.some((relation) => relation.itemId === child));
      assert.ok(visual.edges.some((edge) => edge.from === node.id && edge.to === child));
    }
    assert.equal(item.sourceIds[0], `node-${node.id}`);
  }
  assert.equal(visual.edges.length, canonicalTree.nodes.length - 1);
  assert.equal(new Set(visual.positions.map((point) => `${point.x},${point.y}`)).size, canonicalTree.nodes.length);
});

test("semantic conversion handles an unrelated valid tree without hardcoded node answers", () => {
  const tree = { root: "X", nodes: [{ id: "X", left: null, right: "Y" }, { id: "Y", left: null, right: null }] };
  const result = semanticTree(tree, [objective]);
  assert.ok(result.items[0].facts.includes("Right child: Y."));
  assert.ok(result.items[1].facts.includes("Parent: X. Y is its right child."));
});

test("pipeline preserves exact authoritative objective and rejects missing or altered linkage", async () => {
  const result = await accommodate(binaryTreeAdapter, preferences, provider);
  assert.deepEqual(result.objectives, lesson.objectives);
  assert.deepEqual(result.experience.objectiveIds, [objective.id]);
  assert.ok(result.practice.every((question) => question.objectiveId === objective.id));
  assert.throws(() => identifyObjectives([]));
  assert.throws(() => practiceQuestions([{ ...objective, text: "Draw a tree" }]));
  const altered = { ...binaryTreeAdapter, strategies: [{ ...binaryTreeAdapter.strategies[0], adapt: () => ({ ...semanticTree(canonicalTree, [objective]), objectiveIds: ["other"] }) }] };
  await assert.rejects(accommodate(altered, preferences, provider), /objective linkage/);
});

test("barrier matching requires the learner's confirmed preference and visual access requirement", async () => {
  const result = await accommodate(binaryTreeAdapter, preferences, provider);
  assert.equal(result.barriers[0].barrier, preferences.barriers[0]);
  assert.ok(!JSON.stringify(result.barriers).includes("diagnosis"));
  await assert.rejects(accommodate(binaryTreeAdapter, { ...preferences, barriers: [] }, provider));
  await assert.rejects(accommodate({ ...binaryTreeAdapter, analyze: () => ({ concepts: [], accessRequirements: [] }) }, preferences, provider));
});

test("grounding accepts exact excerpts and rejects invented content, unknown sources, markup, and extra fields", () => {
  assert.deepEqual(validateExplanations(validOutput, lesson), validOutput);
  for (const output of [null, [], [{ sourceId: "missing", text: "The root has no parent." }], [{ sourceId: "node-A", text: "A is a leaf." }], [{ sourceId: "node-A", text: "has no parent" }], [{ sourceId: "definitions", text: "<script>" }], [{ ...validOutput[0], objective: "new goal" }]]) {
    assert.throws(() => validateExplanations(output, lesson));
  }
});

test("provider input excludes identity and cannot mutate objective or semantic source data", async () => {
  const result = await accommodate(binaryTreeAdapter, preferences, { origin: "ai-generated", async explain(input) {
    assert.deepEqual(Object.keys(input).sort(), ["barriers", "experience", "language", "objectives", "sources"]);
    assert.equal(input.objectives[0].text, objective.text);
    assert.ok(input.experience.items[0].facts.includes("Left child: B."));
    input.objectives[0].text = "Changed";
    input.experience.items[0].facts = ["Invented"];
    return validOutput;
  } });
  assert.equal(result.objectives[0].text, objective.text);
  assert.ok(result.experience.items[0].facts.includes("Left child: B."));
});

test("provider rejection, malformed response, and timeout retain deterministic experience and practice", async () => {
  const providers: ExplanationProvider[] = [
    { origin: "ai-generated", explain: async () => { throw new Error("secret diagnostic"); } },
    { origin: "ai-generated", explain: async () => [{ sourceId: "node-A", text: "Invented" }] },
    { origin: "ai-generated", explain: () => new Promise(() => {}) },
  ];
  for (const failed of providers) {
    const result = await accommodate(binaryTreeAdapter, preferences, failed, 10);
    assert.equal(result.explanations.status, "unavailable");
    assert.deepEqual(result.experience, semanticTree(canonicalTree, [objective]));
    assert.equal(result.practice.length, 4);
    assert.ok(!JSON.stringify(result).includes("secret diagnostic"));
  }
});

test("practice demonstrates roots, parents, children, and leaves without grades or persistent performance", () => {
  const responses: Record<string, string[]> = { root: ["A"], parent: ["B"], children: ["D", "E"], leaves: ["D", "E", "F"] };
  for (const [question, answers] of Object.entries(responses)) {
    const result = respondToPractice(question, answers);
    assert.match(result.message, /consistent with the source/);
    assert.deepEqual(Object.keys(result).sort(), ["message", "questionId", "sourceIds"]);
    assert.match(respondToPractice(question, ["C"]).message, /try again/);
  }
  for (const [id, answers] of [["unknown", ["A"]], ["root", []], ["root", ["A", "B"]], ["leaves", ["X"]], ["leaves", ["D", "D"]]] as [string, string[]][]) assert.throws(() => respondToPractice(id, answers));
});

const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const body = { materialId: lesson.id, preferences };
const handlers = createHandlers({ [lesson.id]: binaryTreeAdapter }, provider);

test("HTTP handlers accept supported requests and reject unknown materials, identity, malformed and oversized inputs", async () => {
  assert.equal((await handlers.adapt(request(body))).status, 200);
  for (const invalid of [null, { ...body, materialId: "toString" }, { ...body, identity: "private" }, { ...body, preferences: { ...preferences, barriers: [] } }, { ...body, preferences: { ...preferences, barriers: ["unknown"] } }, { ...body, preferences: { ...preferences, representation: "audio" } }, { ...body, materialId: "x".repeat(5000) }]) {
    assert.equal((await handlers.adapt(request(invalid))).status, 400);
  }
  assert.equal((await handlers.adapt(new Request("http://localhost", { method: "POST", body: "not-json" }))).status, 400);
  assert.equal((await handlers.adapt(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status, 400);
  assert.equal((await handlers.practice(request({ materialId: lesson.id, questionId: "root", answers: ["A"] }))).status, 200);
  assert.equal((await handlers.practice(request({ materialId: lesson.id, questionId: "root", answers: ["X"] }))).status, 400);
});

test("generic engine accommodates a different subject without any binary-tree contract", async () => {
  const material = { id: "chemistry", title: "States of matter", language: "en", synthetic: true, segments: [{ id: "source", title: "Source", text: "Compare solid and liquid states." }], objectives: [{ id: "compare", text: "Compare solid and liquid states.", authority: "source-explicit" as const, sourceIds: ["source"] }] };
  const adapter: MaterialAdapter = {
    ingest: () => material,
    analyze: () => ({ concepts: ["states"], accessRequirements: ["visual-comparison"] }),
    strategies: [{ id: "comparison-text", barrier: "visual-diagram-interpretation", accessRequirement: "visual-comparison", explanation: "Use text.", sourceIds: ["source"], adapt: () => ({ title: "Compare", summary: "Read the comparison.", objectiveIds: ["compare"], items: [{ id: "comparison", title: "Comparison", facts: ["Compare solid and liquid states."], related: [], sourceIds: ["source"] }] }) }],
    practice: () => [], respond: () => { throw new Error("No practice fixture"); },
  };
  const result = await accommodate(adapter, preferences, { origin: "ai-generated", explain: async () => [{ text: material.segments[0].text, sourceId: "source" }] });
  assert.equal(result.materialId, "chemistry");
  assert.equal(result.experience.items[0].id, "comparison");
});
