import assert from "node:assert/strict";
import { test } from "node:test";
import { extractionMetrics } from "../scripts/pdf-validation/metrics";
import type { IngestionResult } from "../src/lib/ingestion/types";

test("corpus failures do not masquerade as zero empty pages or successful coverage", () => {
  const metrics = extractionMetrics({ ok: false, error: { code: "NO_READABLE_TEXT", message: "No selectable text" } }, { outcome: "NO_READABLE_TEXT", pages: 1, profile: "Scanned lesson" }, [1]);
  assert.equal(metrics.expectedOutcomePassed, true);
  assert.equal(metrics.pages, null);
  assert.equal(metrics.emptyPageRate, null);
  assert.equal(metrics.textPageCoverage, null);
  assert.equal(metrics.quality, null);
});

test("corpus metrics distinguish word presence from ordering, boundaries and warning coverage", () => {
  const result: IngestionResult = { ok: true, material: { id: "document", title: "Fixture", originalSource: { mediaType: "application/pdf", sha256: "fixture", byteLength: 1, unitCount: 1 }, extraction: { adapter: "pdf", version: "1", libraryVersion: "1.8.1", pdfjsVersion: "6.1.200" }, pages: [{ pageNumber: 1, blockIds: ["b1", "b2"] }], blocks: [
    { id: "b1", text: "Right. Left.", origin: "extracted", kind: "paragraph", structureBasis: "layout-heuristic", locator: { kind: "page", pageNumber: 1, blockIndex: 1 } },
    { id: "b2", text: "Right. Left.", origin: "extracted", kind: "paragraph", structureBasis: "layout-heuristic", locator: { kind: "page", pageNumber: 1, blockIndex: 2 } },
  ], warnings: [{ code: "TEXT_ONLY", message: "Text only" }], coverage: "supported", coverageScope: "selectable-text" } };
  const metrics = extractionMetrics(result, { outcome: "text", pages: 1, anchors: ["Left.", "Right."], order: ["Left.", "Right."], exactBlocks: ["Left.", "Right."], requireWarning: "READING_ORDER_UNCERTAIN", profile: "Visual reading order" }, [28]);
  assert.equal(metrics.quality!.anchorRecall, 1);
  assert.equal(metrics.quality!.readingOrderPassed, false);
  assert.equal(metrics.quality!.exactBlockBoundariesPassed, false);
  assert.equal(metrics.quality!.requiredWarningPresent, false);
  assert.equal(metrics.quality!.repeatedBlocks, 1);
  assert.equal(metrics.provenance[0].originalSourcePage, 28);
  assert.equal(metrics.quality!.provenanceValid, true);
  assert.equal(JSON.stringify(metrics).includes("Right. Left."), false);
  result.material.pages[0].blockIds = ["unknown"];
  assert.equal(extractionMetrics(result, { outcome: "text", pages: 1, profile: "Invalid link" }, [28]).quality!.provenanceValid, false);
});
