import assert from "node:assert/strict";
import { test } from "node:test";
import { createReviewHandlers } from "../src/lib/material-review/http";
import { createReviewStore, ReviewError } from "../src/lib/material-review/service";
import type { ReviewSummary } from "../src/lib/material-review/types";
import { textPdf, imageOnlyPdf, encryptedPdf } from "./fixtures/pdf";
import { PDF_SPIKE_LIMITS } from "../src/lib/ingestion/pdf/contracts";

const root = "http://localhost/api/material-review";
const lesson = "Learning uses evidence. Compare each claim with its source.";
function req(url = root, method = "GET", cookie = "", body?: BodyInit, headers: Record<string, string> = {}) { return new Request(url, { method, headers: { ...(cookie ? { cookie } : {}), ...headers }, body }); }
function review(summary: ReviewSummary) { return { assessmentFingerprint: summary.quality.fingerprint, sourceReviewed: true, acceptedScope: summary.quality.scope, acknowledgedReasonIds: summary.quality.reasons.map(reason => reason.id) }; }
async function upload(handlers: ReturnType<typeof createReviewHandlers>, bytes = textPdf([["First page", lesson], ["Second page", lesson]])) {
  const result = await handlers.upload(req(root, "POST", "", bytes as BodyInit, { "content-type": "application/pdf" }));
  return { response: result, summary: await result.json() as ReviewSummary, cookie: result.headers.get("set-cookie")!.split(";")[0] };
}

test("actual upload uses source-owned snapshots, page provenance and exact guarded confirmation", async () => {
  const store = createReviewStore(), handlers = createReviewHandlers(store);
  const { response, summary, cookie } = await upload(handlers);
  assert.equal(response.status, 200); assert.match(response.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(summary.quality.readiness, "ready-with-warnings");
  assert.equal("diagnostics" in summary.quality, false); assert.equal(JSON.stringify(summary).includes(lesson), false);
  assert.equal((await handlers.read(req())).status, 410);
  assert.equal((await handlers.proceed(req(root + "/proceed", "POST", cookie, undefined, { "x-review-fingerprint": summary.quality.fingerprint }))).status, 409);
  const confirm = (body: unknown) => handlers.confirm(req(root + "/confirm", "POST", cookie, JSON.stringify(body), { "content-type": "application/json" }));
  assert.equal((await confirm(review(summary))).status, 409);
  for (const index of [1, 2]) {
    const page = await (await handlers.read(req(root + `?page=${index}`, "GET", cookie))).json();
    assert.equal(page.unit.locator.index, index); assert.equal(page.unit.locator.kind, "page");
    assert.ok(page.blocks.every((block: { origin: string; sourceUnitId: string }) => block.origin === "extracted" && block.sourceUnitId === page.unit.id));
    assert.equal(page.assessmentFingerprint, summary.quality.fingerprint);
    assert.ok(page.blocks.some((block: { text: string }) => block.text.includes(lesson)));
  }
  assert.equal((await confirm({ ...review(summary), acknowledgedReasonIds: [] })).status, 409);
  assert.equal((await confirm({ ...review(summary), sourceReviewed: false })).status, 409);
  assert.equal((await confirm({ ...review(summary), assessmentFingerprint: "forged" })).status, 409);
  assert.equal((await confirm({ ...review(summary), material: { text: "Browser substitution" } })).status, 400);
  assert.equal((await confirm(review(summary))).status, 200);
  const handoff = await (await handlers.proceed(req(root + "/proceed", "POST", cookie, undefined, { "x-review-fingerprint": summary.quality.fingerprint }))).json();
  assert.equal(handoff.status, "awaiting-accommodation-support"); assert.match(handoff.message, /No objective has been inferred/);
  assert.equal(JSON.stringify(handoff).includes(lesson), false);
  await handlers.remove(req(root, "DELETE", cookie)); assert.equal((await handlers.read(req(root, "GET", cookie))).status, 410);
});

test("partial material remains reviewable but cannot be confirmed or bypass the whole-document gate", async () => {
  const handlers = createReviewHandlers(createReviewStore());
  const { summary, cookie } = await upload(handlers, textPdf([[lesson], []]));
  assert.equal(summary.quality.readiness, "not-ready"); assert.equal(summary.quality.coverage!.textUnitRatio, .5);
  assert.ok(summary.quality.reasons.some(reason => reason.code === "EMPTY_UNIT"));
  for (const index of [1, 2]) assert.equal((await handlers.read(req(root + `?page=${index}`, "GET", cookie))).status, 200);
  const confirmation = await handlers.confirm(req(root + "/confirm", "POST", cookie, JSON.stringify(review(summary)), { "content-type": "application/json" }));
  assert.equal(confirmation.status, 409); assert.equal((await confirmation.json()).code, "NOT_READY");
  assert.equal((await handlers.proceed(req(root + "/proceed", "POST", cookie, undefined, { "x-review-fingerprint": summary.quality.fingerprint }))).status, 409);
  await handlers.remove(req(root, "DELETE", cookie));
});

test("upload errors are meaningful, bounded and do not expose parser diagnostics", async () => {
  const handlers = createReviewHandlers(createReviewStore());
  for (const [bytes, code] of [[new Uint8Array(), "EMPTY_INPUT"], [new TextEncoder().encode("not a PDF"), "NOT_PDF"], [textPdf().slice(0, -20), "INVALID_PDF"], [imageOnlyPdf(), "NO_READABLE_TEXT"], [encryptedPdf(), "PASSWORD_PROTECTED"]] as const) {
    const result = await handlers.upload(req(root, "POST", "", bytes as BodyInit, { "content-type": "application/pdf" }));
    const body = await result.json(); assert.equal(result.status, 422); assert.equal(body.code, code); assert.equal(body.readiness, "not-ready"); assert.equal("diagnostics" in body, false);
  }
  const tooLarge = await handlers.upload(req(root, "POST", "", "small", { "content-length": String(PDF_SPIKE_LIMITS.maxBytes + 1) })); assert.equal(tooLarge.status, 413);
  const streamedLarge = await handlers.upload(req(root, "POST", "", new Uint8Array(PDF_SPIKE_LIMITS.maxBytes + 1))); assert.equal(streamedLarge.status, 413);
  // Valid PDF bytes remain valid even with a missing/browser-inaccurate MIME type.
  const valid = await handlers.upload(req(root, "POST", "", textPdf([[lesson]]) as BodyInit, { "content-type": "text/plain" })); assert.equal(valid.status, 200);
  await handlers.remove(req(root, "DELETE", valid.headers.get("set-cookie")!.split(";")[0]));
});

test("review requests reject cross-origin, malformed bodies, wrong pages and another browser's absent capability", async () => {
  const handlers = createReviewHandlers(createReviewStore()); const { cookie } = await upload(handlers);
  assert.equal((await handlers.upload(req(root, "POST", "", "test", { origin: "https://other.example" }))).status, 403);
  const normalizedHost = await handlers.read(req(root, "GET", cookie, undefined, { host: "127.0.0.1", origin: "http://127.0.0.1" })); assert.equal(normalizedHost.status, 200);
  assert.equal((await handlers.read(req(root, "GET", cookie, undefined, { "sec-fetch-site": "cross-site" }))).status, 403);
  for (const index of ["0", "99", "NaN", "1.5"]) assert.equal((await handlers.read(req(root + `?page=${index}`, "GET", cookie))).status, 400);
  for (const body of ["{", "[]", "null", JSON.stringify({ sourceReviewed: "true" })]) assert.equal((await handlers.confirm(req(root, "POST", cookie, body, { "content-type": "application/json" }))).status, 400);
  assert.equal((await handlers.read(req(root, "GET", "adapt-material-review=forged"))).status, 410);
  const replacement = await handlers.upload(req(root, "POST", cookie, textPdf([[lesson]]) as BodyInit)); assert.equal(replacement.status, 200);
  assert.equal((await handlers.read(req(root, "GET", cookie))).status, 410);
  await handlers.remove(req(root, "DELETE", replacement.headers.get("set-cookie")!.split(";")[0]));
});

test("generic review lifetime and capacity are bounded without persistence or caller mutation", () => {
  let time = 1000; const store = createReviewStore({ maxSessions: 1, ttlMs: 100, now: () => time });
  const material = { status: "extracted" as const, material: { id: "text-source", source: { fingerprint: "revision-1", kind: "text/plain" }, sourceIntegrity: "valid" as const, extractionVersion: "1", coverage: { scope: "plain-text", declared: "supported" as const, expectedUnits: 1 }, units: [{ id: "section", locator: { kind: "section", index: 1 }, blockIds: ["block"] }], blocks: [{ id: "block", text: lesson, origin: "extracted" as const, sourceUnitId: "section", sourceIndex: 1, structureBasis: "document-tags" as const }], signals: [] } };
  const created = store.create(material); material.material.blocks[0].text = "Caller mutation";
  assert.equal(store.page(created.key, 1).blocks[0].text, lesson);
  assert.throws(() => store.create(material), (error: unknown) => error instanceof ReviewError && error.code === "BUSY");
  time += 101; assert.throws(() => store.summary(created.key), (error: unknown) => error instanceof ReviewError && error.code === "EXPIRED");
  const replacement = store.create(material); assert.notEqual(replacement.key, created.key); store.remove(replacement.key);
});
