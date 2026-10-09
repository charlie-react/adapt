import { createHash } from "node:crypto";
import type { IngestionResult } from "../../src/lib/ingestion/types";

export type ExpectedProfile = { outcome: string; pages: number; anchors?: string[]; order?: string[]; exactBlocks?: string[]; coverage?: string; emptyPages?: number[]; requireWarning?: string; profile: string; unsupported?: string[] };
const normalize = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export function extractionMetrics(result: IngestionResult, expected: ExpectedProfile, sourcePageMap: number[]) {
  if (!result.ok) return { outcome: result.error.code, expectedOutcomePassed: expected.outcome === result.error.code, pages: null, textPageCoverage: null, emptyPageRate: null, characters: null, blockCount: null, provenance: [], warnings: [], fingerprint: sha(JSON.stringify(result)), quality: null };
  const material = result.material;
  const blocks = material.blocks;
  const text = normalize(blocks.map(block => block.text).join("\n"));
  const seen = new Map<string, number>();
  for (const block of blocks) { const key = normalize(block.text); seen.set(key, (seen.get(key) || 0) + 1); }
  const emptyPages = material.pages.filter(page => !page.blockIds.length).map(page => page.pageNumber);
  const anchorResults = (expected.anchors || []).map((anchor, index) => ({ index, present: text.includes(normalize(anchor)) }));
  const positions = expected.order?.map(anchor => text.indexOf(normalize(anchor)));
  const orderPassed = positions ? positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])) : null;
  const provenance = material.pages.map(page => {
    const pageBlocks = blocks.filter(block => block.locator.pageNumber === page.pageNumber);
    return { pageNumber: page.pageNumber, originalSourcePage: sourcePageMap[page.pageNumber - 1] ?? null, pageLabel: page.pageLabel ?? null,
      characters: pageBlocks.reduce((count, block) => count + block.text.length, 0), blockIds: page.blockIds,
      blocks: pageBlocks.map(block => ({ id: block.id, locator: block.locator, kind: block.kind, structureBasis: block.structureBasis, characters: block.text.length, textSha256: sha(block.text) })),
      warnings: material.warnings.filter(warning => warning.pageNumber === undefined || warning.pageNumber === page.pageNumber) };
  });
  const ids = new Set(blocks.map(block => block.id));
  const provenanceValid = ids.size === blocks.length && material.pages.every(page => page.blockIds.every(id => blocks.some(block => block.id === id && block.locator.pageNumber === page.pageNumber))) && blocks.every(block => material.pages.some(page => page.pageNumber === block.locator.pageNumber && page.blockIds.includes(block.id)));
  return { outcome: "text", expectedOutcomePassed: expected.outcome === "text", adapterCoverage: material.coverage, coverageScope: material.coverageScope,
    extraction: material.extraction, documentId: material.id, pages: material.pages.length, textPageCoverage: (material.pages.length - emptyPages.length) / material.pages.length,
    emptyPageRate: emptyPages.length / material.pages.length, emptyPages, characters: blocks.reduce((count, block) => count + block.text.length, 0), blockCount: blocks.length,
    provenance, warnings: material.warnings, fingerprint: sha(JSON.stringify(material)),
    quality: { provenanceValid, pageCountPassed: material.pages.length === expected.pages, anchorResults,
      anchorRecall: anchorResults.length ? anchorResults.filter(anchor => anchor.present).length / anchorResults.length : null,
      readingOrderPassed: orderPassed,
      exactBlockBoundariesPassed: expected.exactBlocks ? JSON.stringify(blocks.map(block => block.text)) === JSON.stringify(expected.exactBlocks) : null,
      requiredWarningPresent: expected.requireWarning ? material.warnings.some(warning => warning.code === expected.requireWarning) : null,
      expectedCoveragePassed: expected.coverage ? material.coverage === expected.coverage : null,
      expectedEmptyPagesPassed: expected.emptyPages ? JSON.stringify(emptyPages) === JSON.stringify(expected.emptyPages) : null,
      replacementCharacters: (text.match(/\uFFFD/g) || []).length,
      unexpectedControls: (text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length,
      tinyBlocks: blocks.filter(block => normalize(block.text).split(" ").length <= 2).length,
      repeatedBlocks: [...seen.values()].reduce((count, occurrences) => count + Math.max(0, occurrences - 1), 0),
      // These are review signals, not quality grades or proof of understanding.
      lineEndHyphenJoins: (text.match(/\p{L}-\s+\p{L}/gu) || []).length,
      singleCharacterBlocks: blocks.filter(block => normalize(block.text).length === 1).length,
      headingBlocks: blocks.filter(block => block.kind === "heading").length,
      listBlocks: blocks.filter(block => block.kind === "list-item").length } };
}
