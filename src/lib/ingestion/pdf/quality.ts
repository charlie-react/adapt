import "server-only";
import type { IngestionResult, UploadInput } from "../types";
import { pdfInputAdapter } from "./adapter";
import { assessMaterial } from "../../material-quality/gate";
import type { QualityInput } from "../../material-quality/types";

// Translation only; readiness policy belongs to the generic material gate.
export function pdfQualityInput(result: IngestionResult): QualityInput {
  if (!result.ok) return { status: "failed", failureCode: result.error.code };
  const material = result.material;
  const unitId = (page: number) => `${material.id}:page:${page}`;
  const integrity = material.originalSource.mediaType === "application/pdf" && /^[a-f0-9]{64}$/.test(material.originalSource.sha256) && Number.isSafeInteger(material.originalSource.byteLength) && material.originalSource.byteLength > 0 && material.id === `pdf-v${material.extraction.version}:${material.originalSource.sha256}` && material.blocks.every(block => block.locator.kind === "page" && block.locator.pageLabel === material.pages.find(page => page.pageNumber === block.locator.pageNumber)?.pageLabel);
  return { status: "extracted", material: {
    id: material.id, source: { fingerprint: material.originalSource.sha256, kind: material.originalSource.mediaType }, sourceIntegrity: integrity ? "valid" : "invalid", extractionVersion: material.extraction.version,
    coverage: { scope: material.coverageScope, declared: material.coverage, expectedUnits: material.originalSource.unitCount },
    units: material.pages.map(page => ({ id: unitId(page.pageNumber), locator: { kind: "page", index: page.pageNumber, label: page.pageLabel }, blockIds: [...page.blockIds] })),
    blocks: material.blocks.map(block => ({ id: block.id, text: block.text, origin: block.origin, sourceUnitId: unitId(block.locator.pageNumber), sourceIndex: block.locator.blockIndex, structureBasis: block.structureBasis })),
    signals: [...material.warnings.map(warning => ({ code: warning.code, unitId: warning.pageNumber === undefined ? undefined : unitId(warning.pageNumber), diagnostic: warning.message })),
      { code: "TEXT_ONLY", diagnostic: "PDF adapter coverage is selectable-text only, even if a producer omits the warning." },
      { code: "FORMATTING_NOT_PRESERVED", diagnostic: "PDF text normalization does not certify line boundaries or indentation." }],
  } };
}
export function assessPdfMaterial(result: IngestionResult) { return assessMaterial(pdfQualityInput(result)); }
export async function ingestAndAssessPdf(input: UploadInput, signal?: AbortSignal) {
  const extraction = await pdfInputAdapter.ingest(input, signal);
  return { extraction, quality: assessPdfMaterial(extraction) };
}
