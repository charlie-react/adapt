import assert from "node:assert/strict";
import { test } from "node:test";
import { safeDiagnostic } from "../scripts/bedrock-smoke";

test("local diagnostics preserve actionable AWS errors and metadata without credential fields", () => {
  const result = safeDiagnostic({ name: "ValidationException", message: "On-demand throughput isn't supported. Use an inference profile.", $metadata: { httpStatusCode: 400, requestId: "safe-request-id" }, credentials: { secretAccessKey: "never-print-this" } });
  assert.equal(result.name, "ValidationException");
  assert.match(result.message, /inference profile/);
  assert.equal(result.httpStatusCode, 400);
  assert.equal(result.requestId, "safe-request-id");
  assert.ok(!JSON.stringify(result).includes("never-print-this"));
});

test("local diagnostics redact secrets and account identifiers from error messages", () => {
  const previous = process.env.AWS_SECRET_ACCESS_KEY;
  process.env.AWS_SECRET_ACCESS_KEY = "synthetic-test-secret";
  try {
    const result = safeDiagnostic(new Error("Access denied for arn:aws:iam::123456789012:role/example; synthetic-test-secret sessionToken=synthetic-token ASIAABCDEFGHIJKLMNOP"));
    assert.ok(!/123456789012|synthetic-test-secret|synthetic-token|ASIAABCDEFGHIJKLMNOP/.test(result.message));
    assert.match(result.message, /Access denied/);
  } finally {
    if (previous === undefined) delete process.env.AWS_SECRET_ACCESS_KEY;
    else process.env.AWS_SECRET_ACCESS_KEY = previous;
  }
});
