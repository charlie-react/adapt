import test from "node:test";
import assert from "node:assert/strict";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningProvider } from "../src/lib/learning/provider";
import { RequestFailure } from "../src/lib/server/request";
import { wavAudio } from "./fixtures/audio";

test("expired AWS login fails only adaptation, retains its server cause and permits grounded audio/practice retry", async t => {
  const diagnostic = t.mock.method(console, "error", () => {});
  const root = "http://localhost/api/learning";
  const text = "Entrepreneurs identify opportunities. Planning helps organise resources. Customers provide feedback.";
  const expired = Object.assign(new Error("Your session has expired. Please reauthenticate."), { name: "CredentialsProviderError", credentials: { secretAccessKey: "synthetic-secret-never-log" } });
  let authenticated = false, transcriptions = 0;
  const provider = createLearningProvider({ transcriptReferences: true }, async command => {
    if (!authenticated) throw expired;
    const practice = command.input.system![0].text!.includes("Create a small optional self-check");
    const evidence = [{ sourceId: "transcript-1", mode: "text", excerptId: "excerpt-1-1" }];
    const value = practice ? { questions: ["What do entrepreneurs identify?", "What does planning help organise?", "What do customers provide?"].map((prompt, index) => ({ id: `q-${index}`, prompt, sectionId: "source-1", answerRef: `answer-1-step-${index + 1}`, evidence })) }
      : { introduction: "Read at your pace.", sections: [{ id: "source-1", title: "Entrepreneurs", kind: "prose", paragraphSourceId: "transcript-1", stepRefs: ["transcript-point-1-1", "transcript-point-1-2", "transcript-point-1-3"], evidence }], practice: [], limitations: [] };
    return { $metadata: { httpStatusCode: 200 }, stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 }, output: { message: { role: "assistant", content: [{ text: JSON.stringify(value) }] } } };
  });
  const store = createLearningStore();
  const handlers = createLearningHandlers(store, provider, { service: "gemini-transcribe", model: "gemini-3.5-transcribe", async transcribe() { transcriptions++; return [{ id: "recorded", text, start: 0.1, end: 0.9 }]; } }, false);
  const uploaded = await handlers.upload(new Request(root, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-material-name": "lecture.wav" }, body: wavAudio() }));
  assert.equal(uploaded.status, 200);
  const snapshot = await uploaded.json(), cookie = uploaded.headers.get("set-cookie")!.split(";")[0], key = cookie.split("=")[1];
  const preferences = { needs: ["read-spoken"] as ["read-spoken"], description: "", focus: "" };
  const request = () => new Request(root + "/adapt", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: snapshot.revision, preferences }) });
  try {
    const failed = await handlers.adapt(request());
    assert.equal(failed.status, 503);
    const failureText = await failed.text();
    assert.equal(JSON.parse(failureText).code, "AI_UNAVAILABLE");
    assert.equal(/CredentialsProviderError|session has expired|reauthenticate/.test(failureText), false);
    assert.equal(failureText.includes("synthetic-secret-never-log"), false);
    assert.equal(store.snapshot(key).experience, undefined);
    assert.equal(store.snapshot(key).revision, snapshot.revision);
    await assert.rejects(store.adapt(key, snapshot.fingerprint, snapshot.revision, preferences, provider), error => error instanceof RequestFailure && error.code === "AI_UNAVAILABLE" && error.cause === expired);
    assert.equal(diagnostic.mock.calls.length, 2);
    const logs = JSON.stringify(diagnostic.mock.calls.map(call => call.arguments));
    assert.ok(logs.includes("AWS login session expired"));
    assert.equal(logs.includes("synthetic-secret-never-log"), false);
    assert.equal(logs.includes(text), false);
    authenticated = true; // Mock restored credential availability, never change real credentials.
    const retried = await handlers.adapt(request());
    assert.equal(retried.status, 200);
    const lesson = await retried.json();
    assert.equal(lesson.experience.sections.flatMap((s: { paragraphs: string[] }) => s.paragraphs).join(" "), text);
    assert.deepEqual(lesson.experience.sections[0].steps, ["Entrepreneurs identify opportunities.", "Planning helps organise resources.", "Customers provide feedback."]);
    assert.equal(transcriptions, 1);
    assert.equal(lesson.fingerprint, snapshot.fingerprint);
    const practice = await handlers.practice(new Request(root + "/practice", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ fingerprint: lesson.fingerprint, revision: lesson.revision }) }));
    assert.equal(practice.status, 200);
    const questions = (await practice.json()).questions;
    assert.equal(questions.length, 3);
    assert.deepEqual(questions.map((q: { answerQuote: string }) => q.answerQuote), lesson.experience.sections[0].steps);
  } finally { store.remove(key); }
});
