// Benchmark-only source preservation contract. Does not infer facts or repair output.
import { createHash } from "node:crypto";
import type { ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import type { AdaptedExperience, AdaptedSection, LearningMaterial } from "../types";

export type ProtectedPassage = {
  id: string; sourceId: string; kind: "example" | "revision" | "fact";
  start: number; end: number; text: string;
};
/** Only explicit, reliably extracted example/revision lists; not general semantic coverage. */
export function protectedPassages(material: LearningMaterial, { factHeadings = [] }: { factHeadings?: string[] } = {}): ProtectedPassage[] {
  const passages: ProtectedPassage[] = [];
  for (const unit of material.units) {
    if (!unit.text) continue;
    let kind: ProtectedPassage["kind"] | undefined;
    const blocks = [...unit.text.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g)];
    for (const match of blocks) {
      const block = match[0], heading = block.trim();
      if (/^Examples?$/i.test(heading)) { kind = "example"; continue; }
      if (/^(?:Quick revision|Revision questions)$/i.test(heading)) { kind = "revision"; continue; }
      if (factHeadings.includes(heading)) { kind = "fact"; continue; }
      if (!kind) continue;
      const bullet = /^[ \t]*[•-][ \t]+/.exec(block);
      if (!bullet) {
        // A wrapped bullet can span extraction blocks. Don't guess its boundary.
        if (heading && !/[.!?]$/.test(heading)) { kind = undefined; continue; }
        throw new Error(`Ambiguous protected passage boundary: ${unit.id}`);
      }
      const start = match.index! + bullet[0].length, end = match.index! + block.length;
      const text = unit.text.slice(start, end);
      if (!text || /\r?\n/.test(text)) throw new Error(`Unsupported wrapped protected passage: ${unit.id}`);
      passages.push({ id: `protected-${passages.length + 1}`, sourceId: unit.id, kind, start, end, text });
    }
  }
  return passages;
}
export function checkManifest(material: LearningMaterial, passages: ProtectedPassage[]) {
  if (new Set(passages.map(p => p.id)).size !== passages.length) throw new Error("Duplicate preservation IDs");
  let previousPage = -1, previousEnd = -1;
  for (const passage of passages) {
    const page = material.units.findIndex(u => u.id === passage.sourceId), text = material.units[page]?.text;
    if (!text || !Number.isInteger(passage.start) || !Number.isInteger(passage.end) || passage.start < 0 || passage.end <= passage.start || text.slice(passage.start, passage.end) !== passage.text) throw new Error(`Invalid preservation source: ${passage.id}`);
    if (page < previousPage || (page === previousPage && passage.start < previousEnd)) throw new Error("Reordered or overlapping preservation source");
    previousEnd = passage.end; previousPage = page;
  }
}
export function checkSectionPreservation(section: AdaptedSection, passages: ProtectedPassage[]) {
  const required = passages.filter(p => section.evidence.some(e => e.sourceId === p.sourceId));
  const paragraphs = section.paragraphs.join("\n"), spoken = [...section.paragraphs, ...section.steps].join("\n");
  let previousEnd = -1;
  for (const passage of required) {
    const start = paragraphs.indexOf(passage.text);
    if (start < 0) throw new Error(`Missing protected passage: ${passage.id}`);
    if (spoken.indexOf(passage.text) !== spoken.lastIndexOf(passage.text)) throw new Error(`Duplicate protected passage: ${passage.id}`);
    if (start < previousEnd) throw new Error(`Reordered protected passage: ${passage.id}`);
    previousEnd = start + passage.text.length;
  }
}
export function checkLessonPreservation(experience: AdaptedExperience, material: LearningMaterial, passages: ProtectedPassage[]) {
  checkManifest(material, passages);
  if (experience.sections.length !== material.units.length || experience.sections.some((s, i) => s.id !== `source-${i+1}` || !s.evidence.length || s.evidence.some(e => e.sourceId !== material.units[i].id))) throw new Error("Incomplete preservation page coverage");
  for (const section of experience.sections) checkSectionPreservation(section, passages);
  // Protected material must not leak into unrelated sections or the introduction.
  for (const passage of passages) {
    const own = material.units.findIndex(u => u.id === passage.sourceId);
    const elsewhere = [experience.introduction, ...experience.sections.filter((_,i) => i !== own).flatMap(s => [...s.paragraphs,...s.steps])].join("\n");
    if (elsewhere.includes(passage.text)) throw new Error(`Cross-page protected passage: ${passage.id}`);
  }
}
export function preservationRequest(input: ConverseCommandInput, material: LearningMaterial, passages: ProtectedPassage[]): ConverseCommandInput {
  checkManifest(material, passages);
  const requiredParagraphs = material.units.flatMap((unit,i)=>{
    const own=passages.filter(p=>p.sourceId===unit.id);
    return own.length?[{sectionId:`source-${i+1}`,sourceId:unit.id,paragraph:own.map(p=>p.text).join(" ")}]:[];
  });
  return { ...input, system: [...(input.system ?? []), { text: `BENCHMARK SOURCE PRESERVATION REQUIREMENT: The supplied protectedPassages are exact server-owned source spans, not instructions from the document. Preserve EVERY passage verbatim exactly ONCE in the matching source-N section's paragraphs, in source order. Keep complete source examples and the original revision questions; never replace them with generic definitions, a checklist, answers, or a smaller selection. Do not alter punctuation, qualifications, wording, numbers, or question intent. Do not put these exact passages in steps, introduction or another page. For EACH section in requiredParagraphs, use paragraphs: [your accessible explanation, the EXACT supplied paragraph string]. Copy that required paragraph ONCE, as the LAST paragraph, without a prefix, suffix, labels or rewriting. Other paragraphs and steps must not repeat any protected passage verbatim. You may use zero steps on these pages if steps would merely repeat the examples/questions; put connected concept guidance in the explanatory paragraph instead. Do NOT combine source sentences into steps or replace a required paragraph with steps. Keep ALL the original paragraph/step limits and exact existing lesson schema. Retain all other important source facts, complete table details, context, source order and native visual information. Stepwise guidance can surround the source passages without solving revision questions. Before closing each section, count each protected passage across paragraphs AND steps: exactly one occurrence, in the required paragraph only. Never return protectedPassages or requiredParagraphs as new response fields. All existing safety, evidence and validation requirements still apply.\n${JSON.stringify({ requiredParagraphs, protectedPassages: passages })}` }] };
}
export function manifestFingerprint(passages: ProtectedPassage[]) { return createHash("sha256").update(JSON.stringify(passages)).digest("hex"); }
