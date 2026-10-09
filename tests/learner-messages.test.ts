import test from "node:test";
import assert from "node:assert/strict";
import { LearnerActionError, learnerFailure, learnerMessage } from "../src/lib/learning/learner-messages";

test("learner errors give short actions without provider, processing or diagnostic details", () => {
  for (const code of ["INVALID_AUDIO", "INVALID_TRANSCRIPTION", "TRANSCRIPTION_ACCESS", "TRANSCRIPTION_UNAVAILABLE", "PASSWORD_PROTECTED", "EXTRACTION_FAILED", "AI_UNAVAILABLE", "NOT_READY", "EXPIRED", "STALE_MATERIAL", "RESOURCE_LIMIT", "HTTP 503 AWS Gemini", "__proto__", "constructor", undefined]) {
    const message = learnerMessage(code);
    assert.equal(typeof message, "string"); assert.ok(message.length < 150);
    assert.doesNotMatch(message, /AWS|Gemini|Claude|Bedrock|HTTP|schema|provenance|validation|extraction|transcription|fallback|server|pipeline|\bAI\b/i);
  }
  assert.match(learnerMessage("PASSWORD_PROTECTED"), /without a password/);
  assert.match(learnerMessage("RESOURCE_LIMIT"), /smaller file/);
  assert.match(learnerMessage("EXPIRED"), /add your material again/);
});
test("network, provider and parsing exceptions never become visible learner error text", () => {
  for (const error of [new Error("AWS credentials / Gemini key / HTTP 403"), new SyntaxError("Invalid JSON schema"), { message: "Internal diagnostics", code: "SECRET" }]) assert.equal(learnerFailure(error), learnerMessage());
  assert.equal(learnerFailure(new LearnerActionError("INVALID_PDF")), learnerMessage("INVALID_PDF"));
  assert.equal(learnerFailure(Object.assign(new Error("Internal cancellation details"), { name: "AbortError" })), learnerMessage("ABORTED"));
});
