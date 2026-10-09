import type { ExtractedBlock, ExtractionWarning } from "../types";
import type { ParsedPage, TextItem } from "./contracts";
type Line = { text: string; x: number; y: number; end: number; size: number; role?: string; structureId?: string };
export function pageBlocks(page: ParsedPage, documentId: string): { blocks: ExtractedBlock[]; warnings: ExtractionWarning[]; partial: boolean } {
  const warnings: ExtractionWarning[] = [];
  let partial = false;
  const warn = (code: ExtractionWarning["code"], message: string) => { if (!warnings.some(w => w.code === code)) warnings.push({ code, message, pageNumber: page.pageNumber }); };
  const sizes = page.items.filter(item => item.text.trim()).map(item => item.fontSize).sort((a, b) => a - b);
  const ordinarySize = sizes[Math.floor(sizes.length / 2)] || 12;
  const lines: Line[] = [];
  let line: Line | undefined;
  let previousText: TextItem | undefined;
  const finish = () => { if (line?.text.trim()) lines.push({ ...line, text: line.text.trim() }); line = undefined; };
  for (const item of page.items) {
    if (item.rotated || item.direction !== "ltr") { partial = true; warn("READING_ORDER_UNCERTAIN", "Rotated or non-left-to-right text order is not verified by this spike."); }
    if (item.text.includes("\uFFFD")) { partial = true; warn("TEXT_DECODE_WARNING", "Some text could not be decoded reliably."); }
    if (!item.text) { if (item.hasEOL) finish(); continue; }
    // PDF.js can bridge columns with a synthetic whitespace item. It must not
    // hide the gap by extending line.end, even when the words all survive.
    if ((!item.text.trim() && item.width > ordinarySize * 4) || (item.text.trim() && previousText && item.x > previousText.x + previousText.width + ordinarySize * 4 && (Math.abs(item.y - previousText.y) < ordinarySize * .2 || item.y > previousText.y + ordinarySize))) {
      partial = true; warn("READING_ORDER_UNCERTAIN", "Wide spacing or column transitions make the reading order uncertain.");
    }
    if (item.text.trim()) previousText = item;
    if (line && (Math.abs(item.y - line.y) > Math.max(2, item.fontSize * .2) || item.role !== line.role || item.structureId !== line.structureId || Math.abs(item.fontSize - line.size) > 2)) finish();
    if (line && (item.x < line.x - 2 || item.x - line.end > ordinarySize * 4)) {
      partial = true; warn("READING_ORDER_UNCERTAIN", "Separated columns or unusual text placement may have an unreliable reading order."); finish();
    }
    if (!line) line = { text: "", x: item.x, y: item.y, end: item.x, size: item.fontSize, role: item.role, structureId: item.structureId };
    const gap = item.x - line.end;
    const separator = line.text && !/\s$/.test(line.text) && !/^\s/.test(item.text) && gap > item.fontSize * .1 ? " " : "";
    line.text += separator + item.text;
    line.end = item.x + item.width;
    if (item.hasEOL) finish();
  }
  finish();
  // A conservative signal, not code understanding or formatting repair.
  if (lines.some(current => /^(?:def\s+\w+\s*\(|class\s+\w+\s*[:(]|(?:async\s+)?function\s+\w*\s*\(|(?:const|let|var)\s+\w+\s*=|for\s+.+\s+in\s+.+:)/.test(current.text))) {
    partial = true; warn("CODE_FORMATTING_UNCERTAIN", "Possible source code may have lost indentation or line boundaries during text normalization.");
  }
  const chunks: { text: string; kind: ExtractedBlock["kind"]; basis: ExtractedBlock["structureBasis"]; line: Line }[] = [];
  for (const current of lines) {
    const taggedHeading = /^H[1-6]$/.test(current.role || "");
    const taggedList = /^(LI|LBody)$/.test(current.role || "");
    const heading = taggedHeading || current.size >= ordinarySize * 1.25;
    const list = taggedList || /^(?:[•*-]|\d+[.)])\s/.test(current.text);
    const tagged = taggedHeading || taggedList || current.role === "P";
    const kind = heading ? "heading" : list ? "list-item" : "paragraph";
    const previous = chunks.at(-1);
    // Consecutive prose lines can form a paragraph; headings/lists never merge.
    if (previous && kind === "paragraph" && previous.kind === "paragraph" && previous.line.structureId === current.structureId && Math.abs(previous.line.size - current.size) < 2 && previous.line.y > current.y && previous.line.y - current.y <= current.size * 1.5 && Math.abs(previous.line.x - current.x) < current.size) {
      previous.text += ` ${current.text}`;
      previous.line = current;
    } else chunks.push({ text: current.text, kind, basis: tagged ? "document-tags" : "layout-heuristic", line: current });
  }
  if (chunks.some(chunk => chunk.basis === "layout-heuristic")) warn("INFERRED_STRUCTURE", "Block boundaries and headings/list labels use layout heuristics; they are not author-confirmed semantic structure.");
  if (page.unsupportedStructure) { partial = true; warn("UNSUPPORTED_STRUCTURE", "The document tags include figures, tables, code, or formulas whose meaning this spike does not interpret."); }
  if (!chunks.length) { partial = true; warn("NO_PAGE_TEXT", "This page has no selectable text; its visual content has not been extracted."); }
  return { blocks: chunks.map((chunk, index) => ({ id: `${documentId}:p${page.pageNumber}:b${index + 1}`, text: chunk.text, origin: "extracted", kind: chunk.kind, structureBasis: chunk.basis, locator: { kind: "page", pageNumber: page.pageNumber, pageLabel: page.pageLabel, blockIndex: index + 1 } })), warnings, partial };
}
export type { TextItem };
