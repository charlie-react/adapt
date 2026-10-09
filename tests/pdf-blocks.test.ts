import assert from "node:assert/strict";
import { test } from "node:test";
import { pageBlocks } from "../src/lib/ingestion/pdf/normalize";
import type { TextItem } from "../src/lib/ingestion/pdf/contracts";
const item = (text: string, x: number, y: number, width: number, extra: Partial<TextItem> = {}): TextItem => ({ text, x, y, width, fontSize: 12, hasEOL: false, direction: "ltr", rotated: false, ...extra });

test("PDF text fragments form complete statements without merging headings or list items", () => {
  const result = pageBlocks({ pageNumber: 1, tagged: true, unsupportedStructure: false, items: [
    item("Title", 40, 700, 30, { role: "H1", fontSize: 18, hasEOL: true }),
    item("A complete", 40, 670, 60, { role: "P" }),
    item("statement", 104, 670, 54, { role: "P" }),
    item(".", 158, 670, 3, { role: "P", hasEOL: true }),
    item("Its continuation.", 40, 656, 90, { role: "P", hasEOL: true }),
    item("1. One item.", 40, 625, 80, { role: "LI", hasEOL: true }),
    item("2. Another item.", 40, 609, 90, { role: "LI", hasEOL: true }),
  ] }, "document");
  assert.deepEqual(result.blocks.map(block => block.text), ["Title", "A complete statement. Its continuation.", "1. One item.", "2. Another item."]);
  assert.deepEqual(result.blocks.map(block => block.kind), ["heading", "paragraph", "list-item", "list-item"]);
  assert.equal(result.partial, false);
});

test("uncertain columns, direction, decoding and unsupported structure are not silently treated as understood", () => {
  const result = pageBlocks({ pageNumber: 3, tagged: false, unsupportedStructure: true, items: [item("Column one.", 40, 700, 70), item("Other column.", 300, 700, 70, { hasEOL: true }), item("\uFFFD text", 40, 600, 60, { direction: "rtl", rotated: true })] }, "document");
  assert.equal(result.partial, true);
  assert.ok(result.warnings.some(warning => warning.code === "READING_ORDER_UNCERTAIN"));
  assert.ok(result.warnings.some(warning => warning.code === "TEXT_DECODE_WARNING"));
  assert.ok(result.warnings.some(warning => warning.code === "UNSUPPORTED_STRUCTURE"));
  assert.equal(result.blocks[0].text, "Column one.");
  assert.equal(result.blocks[1].text, "Other column.");
});

test("separate document-tagged paragraphs remain separate even when layout suggests a continuation", () => {
  const result = pageBlocks({ pageNumber: 1, tagged: true, unsupportedStructure: false, items: [item("First statement.", 40, 700, 90, { role: "P", structureId: "first", hasEOL: true }), item("Separate statement.", 40, 686, 110, { role: "P", structureId: "second", hasEOL: true })] }, "document");
  assert.deepEqual(result.blocks.map(block => block.text), ["First statement.", "Separate statement."]);
});
