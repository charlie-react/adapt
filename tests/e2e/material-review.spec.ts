import { test, expect } from "@playwright/test";
import { textPdf } from "../fixtures/pdf";
test.afterEach(async ({ page }) => { await page.request.delete("/api/material-review"); });
test("legacy PDF quality boundary still blocks a partly empty whole document", async ({ page }) => {
  const result = await page.request.post("/api/material-review", { data: Buffer.from(textPdf([["Learning uses evidence."], []])), headers: { "content-type": "application/pdf" } });
  expect(result.ok()).toBe(true); const snapshot = await result.json(); expect(snapshot.quality.readiness).toBe("not-ready");
  const review = { assessmentFingerprint: snapshot.quality.fingerprint, sourceReviewed: true, acceptedScope: snapshot.quality.scope, acknowledgedReasonIds: snapshot.quality.reasons.map((reason: { id: string }) => reason.id) };
  expect((await page.request.post("/api/material-review/confirm", { data: review })).status()).toBe(409);
  expect((await page.request.post("/api/material-review/proceed", { headers: { "x-review-fingerprint": snapshot.quality.fingerprint } })).status()).toBe(409);
});
test("legacy confirmation still requires source review and exact warnings; page provenance remains intact", async ({ page }) => {
  const uploaded = await page.request.post("/api/material-review", { data: Buffer.from(textPdf([["Learning uses evidence."], ["Compare a claim with its source."]])), headers: { "content-type": "application/pdf" } });
  expect(uploaded.ok()).toBe(true); const snapshot = await uploaded.json();
  const review = { assessmentFingerprint: snapshot.quality.fingerprint, sourceReviewed: true, acceptedScope: snapshot.quality.scope, acknowledgedReasonIds: snapshot.quality.reasons.map((reason: { id: string }) => reason.id) };
  expect((await page.request.post("/api/material-review/confirm", { data: review })).status()).toBe(409);
  for (const number of [1, 2]) { const source = await (await page.request.get("/api/material-review?page=" + number)).json(); expect(source.unit.locator.index).toBe(number); expect(source.blocks[0].origin).toBe("extracted"); }
  expect((await page.request.post("/api/material-review/confirm", { data: review })).ok()).toBe(true);
  expect((await page.request.post("/api/material-review/proceed", { headers: { "x-review-fingerprint": snapshot.quality.fingerprint } })).ok()).toBe(true);
});
