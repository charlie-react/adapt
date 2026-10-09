import assert from "node:assert/strict";
import { test } from "node:test";
import { ReadAloudController, speechChunks, type SpeechPort } from "../src/lib/accessibility/read-aloud";
import { experienceSpeech, practiceSpeech } from "../src/lib/accessibility/speech-content";
import { accommodate } from "../src/lib/engine/pipeline";
import { binaryTreeAdapter, objective } from "../src/lib/fixtures/binary-tree";

function speechMock() {
  const spoken: SpeechSynthesisUtterance[] = [];
  const calls: string[] = [];
  const port: SpeechPort = {
    createUtterance: (text) => ({ text, lang: "", onend: null, onerror: null }) as SpeechSynthesisUtterance,
    speak: (utterance) => { spoken.push(utterance); calls.push("speak"); },
    pause: () => { calls.push("pause"); },
    resume: () => { calls.push("resume"); },
    cancel: () => { calls.push("cancel"); },
  };
  function end(utterance = spoken.at(-1)!) {
    utterance.onend?.call(utterance, {} as SpeechSynthesisEvent);
  }
  return { port, calls, spoken, end };
}

test("speech starts only on request, pauses/resumes without restarting, and finishes all supplied content", () => {
  const mock = speechMock();
  const reader = new ReadAloudController(() => mock.port);
  const unsubscribe = reader.subscribe(() => {});
  assert.equal(mock.spoken.length, 0);
  reader.play(["Learning objective.", "The relationships remain unchanged."], "en");
  assert.equal(reader.getSnapshot(), "playing");
  assert.equal(mock.spoken[0].lang, "en");
  reader.pause();
  assert.equal(reader.getSnapshot(), "paused");
  assert.ok(mock.calls.includes("pause"));
  reader.resume();
  assert.equal(reader.getSnapshot(), "playing");
  assert.equal(mock.spoken.length, 1);
  mock.end();
  assert.equal(mock.spoken[1].text, "The relationships remain unchanged.");
  mock.end();
  assert.equal(reader.getSnapshot(), "finished");
  unsubscribe();
});

test("stop, control switching, and unsubscription cancel only the owned session; obsolete events cannot resume it", () => {
  const mock = speechMock();
  const first = new ReadAloudController(() => mock.port);
  const second = new ReadAloudController(() => mock.port);
  const unsubscribeFirst = first.subscribe(() => {});
  const unsubscribeSecond = second.subscribe(() => {});
  first.play(["Lesson one.", "Must not continue after cancellation."]);
  const obsolete = mock.spoken[0];
  const lateEnd = obsolete.onend;
  first.pause();
  second.play(["Practice question."]);
  assert.equal(first.getSnapshot(), "stopped");
  assert.equal(second.getSnapshot(), "playing");
  lateEnd?.call(obsolete, {} as SpeechSynthesisEvent);
  assert.equal(mock.spoken.length, 2);
  first.stop();
  assert.equal(second.getSnapshot(), "playing");
  unsubscribeFirst();
  unsubscribeSecond();
  assert.equal(second.getSnapshot(), "stopped");
  assert.equal(mock.calls.filter((call) => call === "cancel").length, 2);
});

test("resuming across a completed chunk does not lose the next paragraph", () => {
  const mock = speechMock();
  const reader = new ReadAloudController(() => mock.port);
  const unsubscribe = reader.subscribe(() => {});
  reader.play(["First paragraph.", "Second paragraph."]);
  reader.pause();
  mock.end();
  assert.equal(mock.spoken.length, 1);
  reader.resume();
  assert.equal(mock.spoken[1].text, "Second paragraph.");
  unsubscribe();
});

test("unsupported speech and speech-service failures remain recoverable without throwing", () => {
  const unsupported = new ReadAloudController(() => null);
  const remove = unsupported.subscribe(() => {});
  unsupported.play(["Text remains available."]);
  assert.equal(unsupported.getSnapshot(), "unsupported");
  remove();
  const mock = speechMock();
  const reader = new ReadAloudController(() => mock.port);
  const unsubscribe = reader.subscribe(() => {});
  reader.play(["First attempt."]);
  mock.spoken[0].onerror?.call(mock.spoken[0], {} as SpeechSynthesisErrorEvent);
  assert.equal(reader.getSnapshot(), "error");
  reader.play(["Retry."]);
  assert.equal(reader.getSnapshot(), "playing");
  mock.port.pause = () => { throw new Error("Audio service failed"); };
  reader.pause();
  assert.equal(reader.getSnapshot(), "error");
  unsubscribe();
});

test("long learning content preserves its semantic unit without dropping words", () => {
  const text = "A longer source-grounded explanation. ".repeat(100).trim();
  const chunks = speechChunks(["", text]);
  assert.deepEqual(chunks, [text]);
  assert.equal(chunks.join(" "), text);
});

test("spoken experience includes the unchanged objective, every relationship, and validated explanation without UI boilerplate", async () => {
  const result = await accommodate(binaryTreeAdapter, { barriers: ["visual-diagram-interpretation"], representation: "structured-text" }, {
    origin: "ai-generated", explain: async () => [{ sourceId: "definitions", text: "The root has no parent." }],
  });
  const before = JSON.stringify(result);
  const speech = experienceSpeech(result);
  assert.ok(speech.includes(objective.text));
  for (const item of result.experience.items) for (const fact of item.facts) assert.ok(speech.join(" ").includes(fact));
  assert.ok(speech.includes("AI-selected explanation, grounded in the source."));
  assert.ok(speech.includes("The root has no parent."));
  assert.ok(!/source-node|node-A|Amazon Bedrock|Create accessible representation|Check my reasoning/.test(speech.join(" ")));
  assert.equal(JSON.stringify(result), before);
  const fallback = { ...result, explanations: { status: "unavailable" as const, message: "Implementation-only provider error." } };
  assert.ok(!experienceSpeech(fallback).join(" ").includes("provider error"));
});

test("practice speech includes the original objective, prompt, selection instructions, and choices without grading or answers", () => {
  for (const question of binaryTreeAdapter.practice([objective])) {
    const spoken = practiceSpeech(question, objective);
    assert.ok(spoken.includes(question.prompt));
    assert.ok(spoken.includes(objective.text));
    assert.ok(spoken.includes(question.multiple ? "You may select more than one answer." : "Select one answer."));
    for (const option of question.options) assert.ok(spoken.join(" ").includes(option.label));
    assert.ok(!/correct answer|grade|score/i.test(spoken.join(" ")));
  }
});
