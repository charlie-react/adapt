export type TextItem = { text: string; x: number; y: number; width: number; fontSize: number; hasEOL: boolean; direction: string; role?: string; structureId?: string; rotated: boolean };
export type ParsedPage = { pageNumber: number; pageLabel?: string; items: TextItem[]; tagged: boolean; unsupportedStructure: boolean };
export type ParsedPdf = { pages: ParsedPage[]; sourcePageCount: number; language?: string; pdfjsVersion: string };
export type PdfSpikeLimits = { maxBytes: number; maxPages: number; maxCharacters: number; maxItems: number; timeoutMs: number };
// Provisional engineering budgets, not final product policy. Callers may lower them.
export const PDF_SPIKE_LIMITS: Readonly<PdfSpikeLimits> = Object.freeze({ maxBytes: 5 * 1024 * 1024, maxPages: 100, maxCharacters: 300000, maxItems: 100000, timeoutMs: 30000 });
