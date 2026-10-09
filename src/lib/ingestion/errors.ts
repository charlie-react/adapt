import type { IngestionErrorCode, IngestionResult } from "./types";
const messages: Record<IngestionErrorCode, string> = {
  EMPTY_INPUT: "The supplied file is empty.",
  NOT_PDF: "The supplied bytes do not identify a PDF document.",
  INVALID_PDF: "The PDF is malformed or incomplete and could not be extracted safely.",
  PASSWORD_PROTECTED: "Password-protected PDFs are not supported by this extraction spike.",
  NO_READABLE_TEXT: "No selectable text was found. The PDF may be blank, scanned, or image-only. OCR is not enabled.",
  RESOURCE_LIMIT: "The document exceeds an extraction spike resource limit.",
  TIMEOUT: "PDF extraction exceeded the spike time limit and was stopped.",
  ABORTED: "PDF extraction was cancelled.",
  BUSY: "The PDF extraction spike is busy. Please retry after the current extraction finishes.",
  EXTRACTION_FAILED: "The PDF extraction service could not complete this request.",
};
export function ingestionFailure(code: IngestionErrorCode): IngestionResult { return { ok: false, error: { code, message: messages[code] } }; }
