// Material-level contracts: no PDF, learner identity, objectives or AI output.
export type QualitySignalCode = "TEXT_ONLY" | "INFERRED_STRUCTURE" | "READING_ORDER_UNCERTAIN" | "NO_PAGE_TEXT" | "UNSUPPORTED_STRUCTURE" | "TEXT_DECODE_WARNING" | "CODE_FORMATTING_UNCERTAIN" | "FORMATTING_NOT_PRESERVED";
export type QualitySourceUnit = { id: string; locator: { kind: string; index: number; label?: string }; blockIds: string[] };
export type QualityBlock = { id: string; text: string; origin: "extracted"; sourceUnitId: string; sourceIndex: number; structureBasis: "document-tags" | "layout-heuristic" | "unknown" };
export type QualityMaterial = {
  id: string;
  source: { fingerprint: string; kind: string };
  sourceIntegrity: "valid" | "invalid";
  extractionVersion: string;
  coverage: { scope: string; declared: "supported" | "partial"; expectedUnits: number };
  units: QualitySourceUnit[];
  blocks: QualityBlock[];
  signals: { code: string; unitId?: string; diagnostic: string }[];
};
export type QualityInput = { status: "failed"; failureCode: string } | { status: "extracted"; material: QualityMaterial };
export type MaterialReadiness = "ready" | "ready-with-warnings" | "not-ready";
export type QualityReasonCode = QualitySignalCode | "EXTRACTION_FAILED" | "INVALID_PROVENANCE" | "NO_READABLE_CONTENT" | "EMPTY_UNIT" | "LOW_CONTENT_UNIT" | "PARTIAL_COVERAGE" | "UNRECOGNIZED_WARNING";
export type QualityReason = { id: string; code: QualityReasonCode; severity: "warning" | "blocking"; unitIds: string[]; learnerMessage: string };
export type MaterialQualityReport = {
  policyVersion: "1";
  materialId: string | null;
  fingerprint: string;
  readiness: MaterialReadiness;
  canConfirm: boolean;
  scope: string | null;
  reasons: QualityReason[];
  coverage: { expectedUnits: number; extractedUnits: number; textUnits: number; emptyUnitIds: string[]; textUnitRatio: number } | null;
  units: { id: string; locator: QualitySourceUnit["locator"]; characters: number; blocks: number; lowContent: boolean }[];
  provenance: "valid" | "invalid" | "unavailable";
  diagnostics: { failureCode?: string; signals: QualityMaterial["signals"]; lowContentRule: string };
};
export type MaterialReview = { assessmentFingerprint: string; sourceReviewed: boolean; acceptedScope: string; acknowledgedReasonIds: string[] };
export type TextScopeAcceptance = { basis: "system-validated-text-scope"; assessmentFingerprint: string; acceptedScope: string; acknowledgedReasonIds: string[] };
