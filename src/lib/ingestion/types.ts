// Format-neutral contracts. Extraction does not supply learning objectives or AI analysis.
export type UploadInput = { bytes: Uint8Array; mediaType: string; displayName?: string };
export type SourceLocator = { kind: "page"; pageNumber: number; pageLabel?: string; blockIndex: number };
export type ExtractionWarning = {
  code: "TEXT_ONLY" | "INFERRED_STRUCTURE" | "READING_ORDER_UNCERTAIN" | "NO_PAGE_TEXT" | "UNSUPPORTED_STRUCTURE" | "TEXT_DECODE_WARNING" | "CODE_FORMATTING_UNCERTAIN";
  message: string;
  pageNumber?: number;
};
export type ExtractedBlock = {
  id: string;
  text: string;
  origin: "extracted";
  kind: "paragraph" | "heading" | "list-item" | "unclassified";
  structureBasis: "document-tags" | "layout-heuristic" | "unknown";
  locator: SourceLocator;
};
export type IngestedMaterial = {
  id: string;
  title: string;
  language?: string;
  originalSource: { mediaType: string; sha256: string; byteLength: number; unitCount: number };
  extraction: { adapter: string; version: string; libraryVersion: string; pdfjsVersion: string };
  pages: { pageNumber: number; pageLabel?: string; blockIds: string[] }[];
  blocks: ExtractedBlock[];
  warnings: ExtractionWarning[];
  coverage: "supported" | "partial";
  coverageScope: "selectable-text";
};
export type IngestionErrorCode = "EMPTY_INPUT" | "NOT_PDF" | "INVALID_PDF" | "PASSWORD_PROTECTED" | "NO_READABLE_TEXT" | "RESOURCE_LIMIT" | "TIMEOUT" | "ABORTED" | "BUSY" | "EXTRACTION_FAILED";
export type IngestionResult = { ok: true; material: IngestedMaterial } | { ok: false; error: { code: IngestionErrorCode; message: string } };
export interface InputAdapter {
  supports(mediaType: string): boolean;
  ingest(input: UploadInput, signal?: AbortSignal): Promise<IngestionResult>;
}
