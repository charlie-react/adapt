import "server-only";
import { createHash } from "node:crypto";
import { qualityMessages } from "./policy";
import type { MaterialQualityReport, MaterialReview, QualityInput, QualityMaterial, QualityReasonCode, TextScopeAcceptance } from "./types";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function fingerprint(input: QualityInput) { return createHash("sha256").update(JSON.stringify(canonical({ policyVersion: "1", input }))).digest("hex"); }
function validProvenance(material: QualityMaterial): boolean {
  if (material.sourceIntegrity !== "valid" || !material.id || !material.source.fingerprint || !material.source.kind || !material.extractionVersion || !material.coverage.scope || !["supported", "partial"].includes(material.coverage.declared) || !Number.isSafeInteger(material.coverage.expectedUnits) || material.coverage.expectedUnits < 1 || material.units.length !== material.coverage.expectedUnits) return false;
  const units = new Map(material.units.map(unit => [unit.id, unit]));
  const blocks = new Map(material.blocks.map(block => [block.id, block]));
  if (units.size !== material.units.length || blocks.size !== material.blocks.length) return false;
  const linked = new Set<string>();
  for (const [index, unit] of material.units.entries()) {
    if (!unit.id || !unit.locator.kind || unit.locator.index !== index + 1 || new Set(unit.blockIds).size !== unit.blockIds.length) return false;
    for (const [blockIndex, id] of unit.blockIds.entries()) {
      const block = blocks.get(id);
      if (!id || !block || linked.has(id) || block.sourceUnitId !== unit.id || block.sourceIndex !== blockIndex + 1 || block.origin !== "extracted" || typeof block.text !== "string" || !["document-tags", "layout-heuristic", "unknown"].includes(block.structureBasis)) return false;
      linked.add(id);
    }
  }
  return linked.size === blocks.size && material.signals.every(signal => signal.unitId === undefined || units.has(signal.unitId));
}
export function assessMaterial(input: QualityInput): MaterialQualityReport {
  const report: MaterialQualityReport = { policyVersion: "1", materialId: input.status === "extracted" ? input.material.id : null, fingerprint: fingerprint(input), readiness: "not-ready", canConfirm: false, scope: input.status === "extracted" ? input.material.coverage.scope : null, reasons: [], coverage: null, units: [], provenance: "unavailable", diagnostics: { signals: [], lowContentRule: "Review signal only: fewer than 40 non-whitespace characters or 8 whitespace-delimited words; not a competency score." } };
  const add = (code: QualityReasonCode, unitIds: string[] = []) => {
    const id = JSON.stringify([code, unitIds]);
    if (report.reasons.some(reason => reason.id === id)) return;
    const policy = qualityMessages[code];
    report.reasons.push({ id, code, severity: policy.severity, unitIds, learnerMessage: policy.message });
  };
  if (input.status === "failed") { add("EXTRACTION_FAILED"); report.diagnostics.failureCode = input.failureCode; return report; }
  const material = input.material;
  report.diagnostics.signals = structuredClone(material.signals);
  report.provenance = validProvenance(material) ? "valid" : "invalid";
  if (report.provenance === "invalid") { add("INVALID_PROVENANCE"); return report; }
  const blocks = new Map(material.blocks.map(block => [block.id, block]));
  const empty: string[] = [];
  for (const unit of material.units) {
    const content = unit.blockIds.map(id => blocks.get(id)!.text).join(" ").trim();
    const characters = content.replace(/\s/g, "").length;
    const lowContent = characters > 0 && (characters < 40 || content.split(/\s+/).length < 8);
    report.units.push({ id: unit.id, locator: structuredClone(unit.locator), characters, blocks: unit.blockIds.length, lowContent });
    if (!characters) { empty.push(unit.id); add("EMPTY_UNIT", [unit.id]); }
    else if (lowContent) add("LOW_CONTENT_UNIT", [unit.id]);
    if (content.includes("\uFFFD")) add("TEXT_DECODE_WARNING", [unit.id]);
  }
  report.coverage = { expectedUnits: material.coverage.expectedUnits, extractedUnits: material.units.length, textUnits: material.units.length - empty.length, emptyUnitIds: empty, textUnitRatio: (material.units.length - empty.length) / material.units.length };
  if (!material.blocks.length || empty.length === material.units.length) add("NO_READABLE_CONTENT");
  if (material.coverage.declared === "partial") add("PARTIAL_COVERAGE");
  for (const block of material.blocks) if (block.structureBasis !== "document-tags") add("INFERRED_STRUCTURE", [block.sourceUnitId]);
  for (const signal of material.signals) {
    const code = Object.hasOwn(qualityMessages, signal.code) ? signal.code as QualityReasonCode : "UNRECOGNIZED_WARNING";
    add(code, signal.unitId ? [signal.unitId] : []);
  }
  report.readiness = report.reasons.some(reason => reason.severity === "blocking") ? "not-ready" : report.reasons.length ? "ready-with-warnings" : "ready";
  report.canConfirm = report.readiness !== "not-ready";
  return report;
}

const confirmedBrand: unique symbol = Symbol("Confirmed usable extracted material");
export type ConfirmedUsableMaterial = { readonly [confirmedBrand]: true; readonly origin: "extracted"; readonly material: QualityMaterial; readonly quality: MaterialQualityReport; readonly review: MaterialReview | TextScopeAcceptance };
const issued = new WeakSet<object>();
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
export function isConfirmedUsableMaterial(value: unknown): value is ConfirmedUsableMaterial { return typeof value === "object" && value !== null && issued.has(value); }
export function confirmUsableMaterial(input: QualityInput, review: MaterialReview): { ok: true; material: ConfirmedUsableMaterial } | { ok: false; code: "NOT_READY" | "STALE_REVIEW" | "REVIEW_REQUIRED" } {
  return issueMaterial(input, review);
}
// Explicit new basis: system validation + learner acceptance of limited text scope.
// Does not claim human source comparison or promote extracted text to authority.
export function confirmTextScope(input: QualityInput, review: TextScopeAcceptance) {
  if (review.basis !== "system-validated-text-scope") return { ok: false as const, code: "REVIEW_REQUIRED" as const };
  return issueMaterial(input, review);
}
function issueMaterial(input: QualityInput, review: MaterialReview | TextScopeAcceptance): { ok: true; material: ConfirmedUsableMaterial } | { ok: false; code: "NOT_READY" | "STALE_REVIEW" | "REVIEW_REQUIRED" } {
  const snapshot = structuredClone(input);
  const quality = assessMaterial(snapshot);
  if (snapshot.status !== "extracted" || !quality.canConfirm) return { ok: false, code: "NOT_READY" };
  if (review.assessmentFingerprint !== quality.fingerprint) return { ok: false, code: "STALE_REVIEW" };
  const required = quality.reasons.map(reason => reason.id);
  if (("sourceReviewed" in review && review.sourceReviewed !== true) || review.acceptedScope !== quality.scope || !Array.isArray(review.acknowledgedReasonIds) || required.some(id => !review.acknowledgedReasonIds.includes(id)) || review.acknowledgedReasonIds.some(id => !required.includes(id))) return { ok: false, code: "REVIEW_REQUIRED" };
  const result: ConfirmedUsableMaterial = { [confirmedBrand]: true, origin: "extracted", material: snapshot.material, quality, review: structuredClone(review) };
  issued.add(result);
  return { ok: true, material: freeze(result) };
}
