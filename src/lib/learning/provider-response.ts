import "server-only";
import { LEARNING_LIMITS } from "./limits";
import type { Evidence, LearningMaterial, UnderstandingSection, MaterialUnderstanding, AdaptedExperience, Reflection } from "./types";

/** The provider wire contract is distinct from ADAPT's validated domain values. */
export type ProviderEvidence =
  | { sourceId: string; mode: "text"; excerptId: string }
  | { sourceId: string; mode: "text"; quote: string }
  | { sourceId: string; mode: "visual"; quote: ""; time?: number };
type ProviderSection = Omit<UnderstandingSection, "evidence"> & { evidence: ProviderEvidence[] };
export type ProviderUnderstanding = Omit<MaterialUnderstanding, "sections"> & { sections: ProviderSection[] };
export type ProviderExperience = Omit<AdaptedExperience, "sections" | "practice"> & {
  sections: (ProviderSection & { steps: string[] })[];
  practice: { id: string; prompt: string; evidence: ProviderEvidence[] }[];
};
export type ProviderReflection = Omit<Reflection, "evidence"> & { evidence: ProviderEvidence[] };
export type SourceExcerpt = { id: string; sourceId: string; start: number; end: number; text: string };
export type ResponseTask = "understanding" | "adaptation" | "source-adaptation" | "reflection" | "practice";

export class ProviderResponseError extends Error {
  constructor(public readonly stage: "envelope" | "json" | "evidence" | "validation", message: string) {
    super(message); this.name = "ProviderResponseError";
  }
}

/** No trimming, whitespace repair, reordering, or model-generated quotations. */
export function sourceExcerpts(material: LearningMaterial, { includeShort = false } = {}): SourceExcerpt[] {
  return material.units.flatMap((unit, index) => {
    const text = unit.text;
    if (!text || (!includeShort && text.length < 10)) return [];
    const excerpts: SourceExcerpt[] = [];
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 1200, text.length);
      if (end < text.length && text.length - end < 10) end = text.length - 10;
      // Avoid dividing a Unicode surrogate pair at an excerpt boundary.
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
      excerpts.push({ id: `excerpt-${index + 1}-${excerpts.length + 1}`, sourceId: unit.id, start, end, text: text.slice(start, end) });
      start = end;
    }
    return excerpts;
  });
}

/** Accept exactly one complete JSON fence or bare JSON, never surrounding prose. */
export function jsonEnvelope(text: string): { fenced: boolean; json: string } {
  const trimmed = text.trim();
  const fence = /^\x60{3}(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n\x60{3}$/i.exec(trimmed);
  const single = fence && !/^[ \t]*\x60{3}/m.test(fence[1]);
  return { fenced: Boolean(single), json: single ? fence[1] : trimmed };
}
export function parseProviderResponse(text: string): unknown {
  if (text.length > LEARNING_LIMITS.responseCharacters) throw new ProviderResponseError("envelope", "Oversized model response");
  const envelope = jsonEnvelope(text);
  if (text.trim().startsWith("```") && !envelope.fenced) throw new ProviderResponseError("envelope", "Expected one complete outer JSON fence with no surrounding prose");
  try { return JSON.parse(envelope.json) as unknown; }
  catch { throw new ProviderResponseError("json", "Invalid JSON model response; content withheld"); }
}

/** Resolve references only; the existing strict validator still checks every value. */
export function resolveProviderEvidence(value: unknown, task: ResponseTask, material: LearningMaterial, excerpts: SourceExcerpt[]): unknown {
  const fail = (path: string, reason: string): never => { throw new ProviderResponseError("evidence", `${path}: ${reason}`); };
  const resolve = (items: unknown, path: string): Evidence[] => {
    if (!Array.isArray(items) || items.length < 1 || items.length > 6) return fail(path, "Expected 1-6 evidence references");
    return items.map((item, index) => {
      const location = `${path}[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) return fail(location, "Invalid evidence object");
      const e = item as Record<string, unknown>;
      const reference = e.mode === "text" && "excerptId" in e;
      const keys = reference ? ["sourceId", "mode", "excerptId"] : ["sourceId", "mode", "quote", ...("time" in e ? ["time"] : [])];
      if (Object.keys(e).sort().join(",") !== keys.sort().join(",")) return fail(location, "Invalid evidence keys; mode is distinct from coverage.status");
      const unit = material.units.find(unit => unit.id === e.sourceId);
      if (!unit) return fail(location, "Unknown source reference");
      if (reference) {
        const excerpt = excerpts.find(excerpt => excerpt.id === e.excerptId && excerpt.sourceId === unit.id);
        if (!excerpt || !unit.text || excerpt.text.length < (["source-adaptation", "practice"].includes(task) ? 1 : 10) || excerpt.text.length > 1200 || unit.text.slice(excerpt.start, excerpt.end) !== excerpt.text) return fail(location, "Unknown or mismatched source excerpt reference");
        return { sourceId: unit.id, mode: "text", quote: excerpt.text };
      }
      // Exact legacy quotations remain supported, never fuzzy-matched or repaired.
      if (e.mode === "text") {
        if (typeof e.quote !== "string" || e.quote.length < (["source-adaptation", "practice"].includes(task) ? 1 : 10) || e.quote.length > 1200 || !unit.text?.includes(e.quote) || "time" in e) return fail(location, "Ungrounded quotation; exact source match required");
        return { sourceId: unit.id, mode: "text", quote: e.quote };
      }
      if (e.mode !== "visual" || e.quote !== "" || !["pdf", "image", "video"].includes(unit.locator.kind)) return fail(location, "Invalid visual evidence; no extracted quotation may be invented");
      if ("time" in e && (unit.locator.kind !== "video" || typeof e.time !== "number" || !Number.isFinite(e.time) || e.time < 0 || unit.locator.duration === undefined || e.time > unit.locator.duration)) return fail(location, "Invalid video timestamp");
      return { sourceId: unit.id, mode: "visual", quote: "", ...("time" in e ? { time: e.time as number } : {}) };
    });
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderResponseError("validation", "Expected a structured response object");
  const root = value as Record<string, unknown>;
  if (task === "practice") return { ...root, questions: Array.isArray(root.questions) ? root.questions.map((question, index) => {
    if (!question || typeof question !== "object" || Array.isArray(question)) throw new ProviderResponseError("validation", "Invalid practice question");
    return { ...question, evidence: resolve(question.evidence, `questions[${index}].evidence`) };
  }) : root.questions };
  if (task === "reflection") return { ...root, evidence: resolve(root.evidence, "evidence") };
  const sections = Array.isArray(root.sections) ? root.sections.map((section, index) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) throw new ProviderResponseError("validation", "Invalid section object");
    return { ...section, evidence: resolve(section.evidence, `sections[${index}].evidence`) };
  }) : root.sections;
  const result = { ...root, sections };
  if (task !== "adaptation" && task !== "source-adaptation") return result;
  const practice = Array.isArray(root.practice) ? root.practice.map((prompt, index) => {
    if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) throw new ProviderResponseError("validation", "Invalid practice object");
    return { ...prompt, evidence: resolve(prompt.evidence, `practice[${index}].evidence`) };
  }) : root.practice;
  return { ...result, practice };
}
