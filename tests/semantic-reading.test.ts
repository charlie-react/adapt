import assert from "node:assert/strict";
import { test } from "node:test";
import { ReadAloudController, type SpeechPort } from "../src/lib/accessibility/read-aloud";
import { SemanticReadingEngine, readingUnits } from "../src/lib/accessibility/semantic-reading";
import { canonicalTree, spokenNode } from "../src/lib/fixtures/binary-tree";

function setup() {
  const utterances: SpeechSynthesisUtterance[] = [];
  let cancels = 0;
  const port: SpeechPort = {
    createUtterance: text => ({ text, onend: null, onerror: null }) as SpeechSynthesisUtterance,
    speak: utterance => { utterances.push(utterance); },
    cancel: () => { cancels++; }, pause: () => {}, resume: () => {},
  };
  const speech = new ReadAloudController(() => port);
  const unsubscribe = speech.subscribe(() => {});
  const engine = new SemanticReadingEngine(speech);
  const finish = () => {
    for (let index = 0; index < utterances.length; index++) {
      const utterance = utterances[index];
      utterance.onend?.call(utterance, {} as SpeechSynthesisEvent);
    }
  };
  return { engine, utterances, finish, unsubscribe, cancels: () => cancels };
}

test("explicit semantic boundaries prevent Node B C fragments and preserve full long sentences", () => {
  const mock = setup();
  mock.engine.register("example", { label: "Relationships", units: ["This is Node B", "C is its child."] });
  mock.engine.enter("example");
  assert.equal(mock.utterances.length, 0);
  mock.engine.setEnabled(true);
  assert.equal(mock.utterances.length, 0);
  mock.engine.enter("example"); mock.finish();
  assert.deepEqual(mock.utterances.map(u => u.text), ["This is Node B.", "C is its child."]);
  const sentence = `${"An intact sentence with many words ".repeat(30)}ends here.`;
  mock.engine.register("long", { label: "Long explanation", units: [sentence] });
  mock.engine.enter("long");
  assert.equal(mock.utterances.at(-1)!.text, sentence);
  assert.deepEqual(readingUnits(["", " Which answer? ", "Answer A", "A heading!"]), ["Which answer?", "Answer A.", "A heading!"]);
  mock.unsubscribe();
});

test("same region does not restart, transition cancels, Stop suppresses same region, Off prevents all reads", () => {
  const mock = setup();
  const remove = mock.engine.register("a", { label: "A", units: ["First."] });
  mock.engine.register("b", { label: "B", units: ["Second."] });
  mock.engine.setEnabled(true);
  mock.engine.enter("a"); mock.engine.enter("a");
  assert.equal(mock.utterances.length, 1);
  mock.engine.stop(); mock.engine.enter("a");
  assert.equal(mock.utterances.length, 1);
  mock.engine.enter("b");
  assert.equal(mock.utterances.length, 2);
  mock.engine.enter("a");
  assert.equal(mock.cancels(), 2);
  mock.engine.leave("a"); // Blur precedes unmount; speech still belongs to A.
  remove();
  assert.equal(mock.cancels(), 3);
  mock.engine.setEnabled(false); mock.engine.enter("b");
  assert.equal(mock.utterances.length, 3);
  mock.unsubscribe();
});

test("brief hover, leaving, and disabling cancel pending speech; sustained hover reads once", async () => {
  const mock = setup();
  mock.engine.register("a", { label: "A", units: ["Full statement."] });
  mock.engine.setEnabled(true);
  mock.engine.enter("a", 20); mock.engine.leave("a");
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(mock.utterances.length, 0);
  mock.engine.enter("a", 20); mock.engine.setEnabled(false);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(mock.utterances.length, 0);
  mock.engine.setEnabled(true); mock.engine.enter("a", 20);
  await new Promise(resolve => setTimeout(resolve, 40));
  mock.engine.enter("a", 20);
  assert.equal(mock.utterances.length, 1);
  mock.unsubscribe();
});

test("tree spoken statements preserve canonical relationships using natural complete descriptions", () => {
  for (const node of canonicalTree.nodes) {
    const units = spokenNode(canonicalTree, node);
    assert.ok(units.every(unit => unit.endsWith(".")));
    assert.equal(units[0], `This is Node ${node.id}.`);
    assert.ok(units.includes(node.left ? `${node.left} is the left child of ${node.id}.` : `${node.id} has no left child.`));
    assert.ok(units.includes(node.right ? `${node.right} is the right child of ${node.id}.` : `${node.id} has no right child.`));
  }
});
