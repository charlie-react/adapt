import type { AccessPreferences, AdaptedExperience, Evidence, LearningMaterial, MaterialUnderstanding, Reflection, UnderstandingSection } from "./types";
import { LEARNING_LIMITS } from "./limits";
import { accessOptions } from "./types";
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new Error("Invalid structured response"); return value as Record<string, unknown>;
}
function string(value: unknown, max = 1600): string { if (typeof value !== "string" || !value.trim() || value.length > max || /<(?:script|iframe|img|svg|style|div|span|html)\b/i.test(value)) throw new Error("Invalid plain text"); return value; }
function list<T>(value: unknown, min: number, max: number, parse: (item: unknown) => T): T[] { if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error("Invalid list"); return value.map(parse); }
function id(value: unknown) { const result = string(value, 50); if (!/^[a-zA-Z0-9-]+$/.test(result)) throw new Error("Invalid ID"); return result; }
export function evidence(value: unknown, material: LearningMaterial, allowShort = false): Evidence[] {
  return list(value, 1, 6, item => {
    if (!item || typeof item !== "object") throw new Error("Missing source evidence");
    const keys = "time" in item ? ["sourceId", "mode", "quote", "time"] : ["sourceId", "mode", "quote"];
    const v = object(item, keys), unit = material.units.find(source => source.id === v.sourceId);
    if (!unit || typeof v.quote !== "string" || v.quote.length > 1200) throw new Error("Unknown evidence source");
    if (v.mode === "text") { if (!unit.text || v.quote.length < (allowShort ? 1 : 10) || !unit.text.includes(v.quote) || v.time !== undefined) throw new Error("Ungrounded quotation"); }
    else if (v.mode === "visual") { if (!["pdf", "image", "video"].includes(unit.locator.kind) || v.quote !== "") throw new Error("Visual evidence is not extracted text"); }
    else throw new Error("Unknown evidence mode");
    if (v.time !== undefined && (unit.locator.kind !== "video" || typeof v.time !== "number" || !Number.isFinite(v.time) || v.time < 0 || v.time > unit.locator.duration!)) throw new Error("Invalid video timestamp");
    return { sourceId: unit.id, mode: v.mode as Evidence["mode"], quote: v.quote, ...(v.time === undefined ? {} : { time: v.time as number }) };
  });
}
function section(value: unknown, material: LearningMaterial, adapted = false, allowShort = false, paragraphLimit = 4) {
  const v = object(value, ["id", "title", "kind", "paragraphs", "evidence", ...(adapted ? ["steps"] : [])]);
  if (!["prose", "code", "diagram", "equation", "table", "image", "video", "example"].includes(v.kind as string)) throw new Error("Unknown content kind");
  return { id: id(v.id), title: string(v.title, 140), kind: v.kind as UnderstandingSection["kind"], paragraphs: list(v.paragraphs, 1, paragraphLimit, item => string(item)), evidence: evidence(v.evidence, material, allowShort), ...(adapted ? { steps: list(v.steps, 0, 6, item => string(item, 800)) } : {}) };
}
function unique(items: { id: string }[]) { if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("Duplicate IDs"); }
export function validateUnderstanding(value: unknown, material: LearningMaterial): MaterialUnderstanding {
  const v = object(value, ["title", "summary", "sections", "coverage", "limitations"]);
  const sections = list(v.sections, 1, 6, item => section(item, material)); unique(sections);
  const coverage = list(v.coverage, material.units.length, material.units.length, item => {
    const c = object(item, ["sourceId", "status"]);
    if (!material.units.some(unit => unit.id === c.sourceId) || !["clear", "limited", "unreadable"].includes(c.status as string)) throw new Error("Invalid coverage");
    return { sourceId: c.sourceId as string, status: c.status as "clear" | "limited" | "unreadable" };
  });
  if (new Set(coverage.map(item => item.sourceId)).size !== material.units.length) throw new Error("Missing source coverage");
  const limitations = list(v.limitations, 0, 8, item => string(item, 500));
  if (coverage.some(item => item.status !== "clear") && !limitations.length) throw new Error("Missing uncertainty explanation");
  return { title: string(v.title, 140), summary: string(v.summary, 1000), sections, coverage, limitations };
}
export function validatePreferences(value: unknown): AccessPreferences {
  const v = object(value, ["needs", "description", "focus"]);
  const needs = list(v.needs, 0, accessOptions.length, item => { if (!accessOptions.some(option => option.id === item)) throw new Error("Unknown preference"); return item as AccessPreferences["needs"][number]; });
  if (new Set(needs).size !== needs.length || typeof v.description !== "string" || v.description.length > 800 || typeof v.focus !== "string" || v.focus.length > 500 || (!needs.length && !v.description.trim())) throw new Error("Describe an access preference");
  return { needs, description: v.description.trim(), focus: v.focus.trim() };
}
export function validateExperience(value: unknown, material: LearningMaterial, understanding: MaterialUnderstanding): AdaptedExperience {
  const v = object(value, ["introduction", "sections", "practice", "limitations"]);
  const sections = list(v.sections, understanding.sections.length, understanding.sections.length, item => section(item, material, true) as AdaptedExperience["sections"][number]); unique(sections);
  if (sections.some(item => !understanding.sections.some(original => original.id === item.id))) throw new Error("Lost or substituted content topic");
  const practice = list(v.practice, 1, 3, item => { const p = object(item, ["id", "prompt", "evidence"]); return { id: id(p.id), prompt: string(p.prompt, 700), evidence: evidence(p.evidence, material) }; }); unique(practice);
  const limitations = list(v.limitations, 0, 8, item => string(item, 500));
  if (understanding.coverage.some(item => item.status === "limited") && !limitations.length) throw new Error("Uncertainty cannot disappear");
  return { introduction: string(v.introduction, 1200), sections, practice, limitations };
}
/** Validate source references and presentation, without deriving or grading knowledge. */
export function validateSourceAdaptation(value: unknown, material: LearningMaterial, preferences?: AccessPreferences): AdaptedExperience {
  const v = object(value, ["introduction", "sections", "practice", "limitations"]);
  const sections = list(v.sections, 1, LEARNING_LIMITS.sections, item => section(item, material, true, true, material.kind === "audio" ? LEARNING_LIMITS.audioParagraphs : 4) as AdaptedExperience["sections"][number]); unique(sections);
  const practice = list(v.practice, 0, 3, item => { const p = object(item, ["id", "prompt", "evidence"]); return { id: id(p.id), prompt: string(p.prompt, 700), evidence: evidence(p.evidence, material, true) }; }); unique(practice);
  const referenced = new Set(sections.flatMap(item => item.evidence.map(reference => reference.sourceId)));
  const missing = material.units.filter(unit => !referenced.has(unit.id));
  if (!material.units.length || missing.length) throw new Error(`Missing source references: ${missing.map(unit => unit.id).join(", ")}; material must not silently disappear`);
  const introduction = string(v.introduction, 1200);
  const prose = [introduction, ...sections.flatMap(item => [...item.paragraphs, ...item.steps]), ...practice.map(item => item.prompt)];
  // This checks literal fidelity, not whether the source mathematics is correct.
  // Native visual-only content has no text against which numeric literals can be checked.
  const text = material.units.map(unit => unit.text ?? "").join("\n");
  // Readable speech changes layout, not wording, unless simplification was also requested.
  if (material.kind === "audio" && preferences?.needs.includes("read-spoken") && !preferences.needs.includes("plain-language")) {
    const whitespace = (content: string) => content.replace(/\s+/gu, " ").trim();
    if (whitespace(sections.flatMap(item => item.paragraphs).join("\n")) !== whitespace(text)) throw new Error("Readable transcript adaptation changed or omitted source wording");
    if (sections.some(item => item.steps.some(step => !material.units.some(unit => unit.text?.includes(step))))) throw new Error("Readable transcript key points must preserve exact source excerpts");
  }
  const numerals = (content: string) => content.match(/[-−]?\d+(?:[.,]\d+)*(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?/gu) ?? [];
  if (material.units.every(unit => Boolean(unit.text))) {
    const allowed = new Set(numerals(text));
    if (prose.some(content => numerals(content).some(numeral => !allowed.has(numeral)))) throw new Error("Adaptation introduced or changed a source number");
  }
  // Code/equations stay in the original source view; AI supplies plain explanations.
  if (prose.some(content => content.includes("```"))) throw new Error("Generated code blocks are not source content");
  const limitations = list(v.limitations, 0, 8, item => string(item, 500));
  return { introduction, sections, practice, limitations: [...new Set([...material.limitations, ...limitations])] };
}
export function validateReflection(value: unknown, material: LearningMaterial): Reflection {
  const v = object(value, ["message", "nextStep", "evidence"]); const message = string(v.message, 1400), nextStep = string(v.nextStep, 600);
  if (/\b(?:your (?:grade|score)|you (?:passed|failed)|score\s*[:=])/i.test(message + nextStep)) throw new Error("Formal grading is not supported");
  return { message, nextStep, evidence: evidence(v.evidence, material) };
}

