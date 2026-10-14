// Diagnostic-only prompt experiment. Never imported by the production application.
import { ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { performance } from "node:perf_hooks";
import { parseProviderResponse, resolveProviderEvidence, sourceExcerpts, ProviderResponseError } from "../../src/lib/learning/provider-response";
import { validateSourceAdaptation } from "../../src/lib/learning/validation";
import type { AccessPreferences, LearningMaterial } from "../../src/lib/learning/types";

export function compactPdfPrompt(command: ConverseCommand) {
  if (!command.input.messages?.some(message => message.content?.some(block => block.document?.format === "pdf"))) throw new Error("PDF-only prompt experiment");
  const marker = "This is a shape example, not additional learning material. ";
  const boundary = "\nsection.kind";
  const systems = command.input.system?.map(block => {
    if (!block.text) throw new Error("Unexpected system block");
    const start = block.text.indexOf(marker) + marker.length;
    const end = block.text.indexOf(boundary, start);
    if (!block.text.includes(marker) || end < start) throw new Error("Unknown production prompt shape; experiment stopped");
    const example = JSON.parse(block.text.slice(start, end));
    if (!Array.isArray(example.sections) || !example.sections.length || example.practice?.length !== 0) throw new Error("Not the source-adaptation contract");
    const sectionReferences = example.sections.map((section: { id: string; kind: string; evidence: { sourceId: string }[] }) => ({ id: section.id, sourceId: section.evidence[0].sourceId, kind: section.kind, evidence: section.evidence }));
    const compact = { ...example, sections: [example.sections[0]] };
    let text = block.text.slice(0, start) + JSON.stringify(compact) + "\nRequired section-reference map: " + JSON.stringify(sectionReferences) + block.text.slice(end);
    const original = "The sections array above is a required source map: fill EVERY supplied section slot in order, retain each source-N ID and its sourceId, and do not combine or omit slots.";
    if (!text.includes(original)) throw new Error("Source-map instruction changed; experiment stopped");
    text = text.replace(original, "The required section-reference map above defines EVERY output section slot: fill ALL mapped slots in order, retain each source-N ID and its sourceId, and do not combine or omit slots. The single sections object is a format example only, not the number of output sections.");
    return { ...block, text };
  });
  return new ConverseCommand({ ...command.input, system: systems });
}

/** The exact production parsing/resolution/validation functions, timed without altering them. */
export function resolveTimedAdaptation(raw: ConverseCommandOutput, material: LearningMaterial, preferences: AccessPreferences) {
  const blocks = raw.output?.message?.content;
  if (raw.stopReason !== "end_turn" || !blocks?.length) throw new ProviderResponseError("envelope", "Incomplete model response");
  const text = blocks.map(block => {
    if (typeof block.text === "string") return block.text;
    const cited = block.citationsContent?.content;
    if (cited?.length && cited.every(part => typeof part.text === "string")) return cited.map(part => part.text).join("");
    throw new ProviderResponseError("envelope", "Unexpected model content");
  }).join("");
  let start = performance.now();
  const parsed = parseProviderResponse(text), parseMs = performance.now() - start;
  start = performance.now();
  const resolved = resolveProviderEvidence(parsed, "source-adaptation", material, sourceExcerpts(material, { includeShort: true }));
  const evidenceMs = performance.now() - start;
  start = performance.now();
  const experience = validateSourceAdaptation(resolved, material, preferences), validationMs = performance.now() - start;
  return { experience, wire: parsed, parseMs, evidenceMs, validationMs };
}
