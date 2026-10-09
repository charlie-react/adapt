import type { QualityReasonCode } from "./types";
export const qualityMessages: Record<QualityReasonCode, { severity: "warning" | "blocking"; message: string }> = {
  EXTRACTION_FAILED: { severity: "blocking", message: "The material could not be extracted. Try a supported, readable source." },
  INVALID_PROVENANCE: { severity: "blocking", message: "Some extracted content cannot be reliably traced to its source. This material cannot proceed." },
  NO_READABLE_CONTENT: { severity: "blocking", message: "No usable text is available. An image or scan may need another extraction method." },
  EMPTY_UNIT: { severity: "blocking", message: "A source page or section has no readable text. Important content may be missing." },
  LOW_CONTENT_UNIT: { severity: "warning", message: "A page or section contains little text. Compare it with the original before continuing." },
  PARTIAL_COVERAGE: { severity: "blocking", message: "Extraction covers only part of this material. A usable subset has not yet been confirmed." },
  TEXT_ONLY: { severity: "warning", message: "Only selectable text is available. Diagrams, tables, equations and scans have not been understood. Compare the original before using this text." },
  INFERRED_STRUCTURE: { severity: "warning", message: "Headings and text boundaries may be inferred from layout. Check them against the source." },
  READING_ORDER_UNCERTAIN: { severity: "blocking", message: "Text may be in the wrong reading order, including across columns. This needs correction before continuing." },
  NO_PAGE_TEXT: { severity: "blocking", message: "A page has no selectable text. Its visual content has not been extracted." },
  UNSUPPORTED_STRUCTURE: { severity: "blocking", message: "The source contains structures this extraction cannot preserve, such as tables, diagrams or equations." },
  TEXT_DECODE_WARNING: { severity: "blocking", message: "Some characters could not be read reliably. Compare and correct the extraction before continuing." },
  CODE_FORMATTING_UNCERTAIN: { severity: "blocking", message: "Possible source code was found. Its indentation and line boundaries are not reliably preserved." },
  FORMATTING_NOT_PRESERVED: { severity: "warning", message: "Line breaks and indentation are not guaranteed to match the original. Check any formatting that matters to the lesson." },
  UNRECOGNIZED_WARNING: { severity: "blocking", message: "The extractor reported a limitation this review gate does not yet support." },
};
