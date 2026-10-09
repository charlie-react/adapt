import assert from "node:assert/strict";
import { test } from "node:test";
import { assessMaterial, confirmUsableMaterial, isConfirmedUsableMaterial } from "../src/lib/material-quality/gate";
import type { QualityInput, QualityMaterial } from "../src/lib/material-quality/types";
import { assessPdfMaterial, ingestAndAssessPdf, pdfQualityInput } from "../src/lib/ingestion/pdf/quality";
import { textPdf, encryptedPdf, imageOnlyPdf } from "./fixtures/pdf";
import { pageBlocks } from "../src/lib/ingestion/pdf/normalize";
import type { TextItem } from "../src/lib/ingestion/pdf/contracts";

function normal(): QualityMaterial {
  return { id: "article", source: { fingerprint: "trusted-source-revision", kind: "text/plain" }, sourceIntegrity: "valid", extractionVersion: "1", coverage: { scope: "structured-text", declared: "supported", expectedUnits: 1 },
    units: [{ id: "section-1", locator: { kind: "section", index: 1 }, blockIds: ["block-1"] }],
    blocks: [{ id: "block-1", text: "This is a complete educational statement with enough content to explain the topic clearly and preserve a useful reading experience.", origin: "extracted", sourceUnitId: "section-1", sourceIndex: 1, structureBasis: "document-tags" }], signals: [] };
}
const input = (material: QualityMaterial): QualityInput => ({ status: "extracted", material });
function review(value: QualityInput) { const report = assessMaterial(value); return { assessmentFingerprint: report.fingerprint, sourceReviewed: true, acceptedScope: report.scope!, acknowledgedReasonIds: report.reasons.map(reason => reason.id) }; }

test("generic non-PDF material can be ready without a score, inference or provider", () => {
  const value = input(normal()), before = structuredClone(value);
  const result = assessMaterial(value);
  assert.equal(result.readiness, "ready"); assert.equal(result.provenance, "valid");
  assert.equal(result.coverage!.textUnitRatio, 1); assert.deepEqual(result.reasons, []);
  assert.deepEqual(assessMaterial(value), result); assert.deepEqual(value, before);
  const reordered = { material: value.status === "extracted" ? value.material : normal(), status: "extracted" as const };
  assert.equal(assessMaterial(reordered).fingerprint, result.fingerprint);
});

test("rejection, empty units, partial coverage and missing text cannot be confirmed", () => {
  for (const failureCode of ["EMPTY_INPUT", "PASSWORD_PROTECTED", "NO_READABLE_TEXT", "RESOURCE_LIMIT", "INVALID_PDF"]) {
    const value: QualityInput = { status: "failed", failureCode };
    const report = assessMaterial(value);
    assert.equal(report.readiness, "not-ready"); assert.equal(report.coverage, null);
    assert.equal(report.diagnostics.failureCode, failureCode);
    assert.deepEqual(confirmUsableMaterial(value, review(value)), { ok: false, code: "NOT_READY" });
  }
  const material = normal(); material.coverage.expectedUnits = 2; material.coverage.declared = "partial";
  material.units.push({ id: "section-2", locator: { kind: "section", index: 2 }, blockIds: [] });
  const report = assessMaterial(input(material));
  assert.equal(report.readiness, "not-ready"); assert.equal(report.coverage!.textUnitRatio, .5);
  assert.deepEqual(report.coverage!.emptyUnitIds, ["section-2"]);
  assert.ok(report.reasons.some(reason => reason.code === "EMPTY_UNIT" && reason.unitIds[0] === "section-2"));
  material.units[0].blockIds = []; material.blocks = [];
  assert.ok(assessMaterial(input(material)).reasons.some(reason => reason.code === "NO_READABLE_CONTENT"));
});

test("low-content and inferred structure are visible warnings rather than competency scores", () => {
  const material = normal(); material.blocks[0].text = "Introduction."; material.blocks[0].structureBasis = "layout-heuristic";
  const report = assessMaterial(input(material));
  assert.equal(report.readiness, "ready-with-warnings");
  assert.ok(report.reasons.some(reason => reason.code === "LOW_CONTENT_UNIT"));
  assert.ok(report.reasons.some(reason => reason.code === "INFERRED_STRUCTURE"));
  assert.equal(report.units[0].lowContent, true);
});

test("known uncertainty, decoding, unsupported structures and unknown warnings block confirmation", () => {
  for (const code of ["READING_ORDER_UNCERTAIN", "CODE_FORMATTING_UNCERTAIN", "TEXT_DECODE_WARNING", "UNSUPPORTED_STRUCTURE", "FUTURE_LIMITATION"]) {
    const material = normal(); material.signals.push({ code, unitId: "section-1", diagnostic: "Internal detail must not become learner text." });
    const report = assessMaterial(input(material));
    assert.equal(report.readiness, "not-ready");
    assert.ok(report.reasons.every(reason => !reason.learnerMessage.includes("Internal detail")));
    assert.equal(confirmUsableMaterial(input(material), review(input(material))).ok, false);
  }
  const material = normal(); material.blocks[0].text += " \uFFFD";
  assert.equal(assessMaterial(input(material)).readiness, "not-ready");
});

test("duplicate, orphan, misordered, missing and cross-source provenance fail closed", () => {
  const changes: ((material: QualityMaterial) => void)[] = [
    material => { material.blocks.push(structuredClone(material.blocks[0])); },
    material => { material.units[0].blockIds.push("missing"); },
    material => { material.blocks[0].sourceUnitId = "unknown-unit"; },
    material => { material.blocks[0].sourceIndex = 2; },
    material => { material.units[0].locator.index = 2; },
    material => { material.coverage.expectedUnits = 2; },
    material => { material.units[0].blockIds = []; },
    material => { material.units[0].blockIds.push("block-1"); },
    material => { material.sourceIntegrity = "invalid"; },
    material => { material.signals.push({ code: "TEXT_ONLY", unitId: "unknown-unit", diagnostic: "Unknown page" }); },
    material => { material.blocks[0].origin = "ai-generated" as "extracted"; },
    material => { material.blocks[0].id = ""; material.units[0].blockIds = [""]; },
  ];
  for (const change of changes) { const material = normal(); change(material); const report = assessMaterial(input(material)); assert.equal(report.provenance, "invalid"); assert.equal(report.readiness, "not-ready"); }
});

test("confirmation rechecks content, requires exact scope/acknowledgements, and issues an immutable server-only value", () => {
  const material = normal(); material.signals.push({ code: "FORMATTING_NOT_PRESERVED", diagnostic: "Layout limitation" });
  const value = input(material), request = review(value);
  assert.equal(confirmUsableMaterial(value, { ...request, sourceReviewed: false }).ok, false);
  assert.equal(confirmUsableMaterial(value, { ...request, acknowledgedReasonIds: [] }).ok, false);
  assert.equal(confirmUsableMaterial(value, { ...request, acceptedScope: "full-document-understanding" }).ok, false);
  material.blocks[0].text += " Changed content.";
  assert.deepEqual(confirmUsableMaterial(value, request), { ok: false, code: "STALE_REVIEW" });
  const result = confirmUsableMaterial(value, review(value)); assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.material.origin, "extracted"); assert.equal(isConfirmedUsableMaterial(result.material), true);
  assert.equal(isConfirmedUsableMaterial(JSON.parse(JSON.stringify(result.material))), false);
  material.blocks[0].text = "Caller mutation";
  assert.notEqual(result.material.material.blocks[0].text, material.blocks[0].text);
  assert.throws(() => { result.material.material.blocks[0].text = "Cannot mutate"; });
});

test("actual PDF ingestion yields scoped review, while failures and missing-page extraction stay blocked", async () => {
  const result = await ingestAndAssessPdf({ bytes: textPdf([["A lesson heading", "This is enough selectable text to describe a useful lesson clearly and completely, before the learner compares it with the original source."]], true), mediaType: "application/pdf" });
  assert.equal(result.quality.readiness, "ready-with-warnings");
  assert.equal(result.quality.scope, "selectable-text"); assert.equal(result.quality.provenance, "valid");
  assert.ok(result.quality.reasons.some(reason => reason.code === "TEXT_ONLY"));
  assert.ok(result.quality.reasons.some(reason => reason.code === "FORMATTING_NOT_PRESERVED"));
  const value = pdfQualityInput(result.extraction); assert.equal(confirmUsableMaterial(value, review(value)).ok, true);
  if (result.extraction.ok) {
    const missingPage = structuredClone(result.extraction); missingPage.material.originalSource.unitCount = 2;
    assert.equal(assessPdfMaterial(missingPage).provenance, "invalid");
    const modified = structuredClone(result.extraction); modified.material.blocks[0].locator.pageLabel = "wrong";
    assert.equal(assessPdfMaterial(modified).provenance, "invalid");
    modified.material.originalSource.sha256 = "invalid";
    assert.equal(assessPdfMaterial(modified).readiness, "not-ready");
  }
  for (const bytes of [encryptedPdf(), imageOnlyPdf(), new Uint8Array(), textPdf([["Readable lesson."], []]), textPdf([["def total(values):", "    result = 0", "    return result"]])]) {
    const rejected = await ingestAndAssessPdf({ bytes, mediaType: "application/pdf" }); assert.equal(rejected.quality.readiness, "not-ready");
  }
});

test("column bridges, transitions after line breaks and code are warned without pretending to repair them", () => {
  const item = (text: string, x: number, y: number, width: number, hasEOL = false): TextItem => ({ text, x, y, width, hasEOL, fontSize: 12, direction: "ltr", rotated: false });
  for (const items of [
    [item("Left statement.", 40, 700, 80), item(" ", 120, 700, 180), item("Right statement.", 300, 700, 90, true)],
    [item("Left statement.", 40, 700, 80, true), item("Right statement.", 300, 700, 90, true)],
    [item("Left bottom.", 40, 600, 80, true), item("Right top.", 300, 700, 90, true)],
  ]) {
    const page = pageBlocks({ pageNumber: 1, tagged: false, unsupportedStructure: false, items }, "source");
    assert.equal(page.partial, true); assert.ok(page.warnings.some(warning => warning.code === "READING_ORDER_UNCERTAIN"));
    assert.ok(page.blocks.some(block => block.text.includes("Left"))); assert.ok(page.blocks.some(block => block.text.includes("Right")));
  }
  const code = pageBlocks({ pageNumber: 1, tagged: false, unsupportedStructure: false, items: [item("def total(values):", 40, 700, 100, true), item("return 1", 64, 680, 60, true)] }, "source");
  assert.ok(code.warnings.some(warning => warning.code === "CODE_FORMATTING_UNCERTAIN")); assert.equal(code.partial, true);
});
