import "server-only";
import type { AccessPreferences, LearningMaterial } from "./types";
import { ProviderResponseError } from "./provider-response";
export type TranscriptParagraph = { id: string; sourceId: string; text: string };
export function transcriptStatements(material: LearningMaterial): TranscriptParagraph[] {
  return material.units.flatMap((unit,index) => [...(unit.text ?? "").matchAll(/[^]+?(?:[.!?]["'”’)]*(?=\s|$)|$)/gu)].map(m=>m[0].trim()).filter(text=>text && text.length <=800).map((text,n)=>({id:`transcript-point-${index+1}-${n+1}`,sourceId:unit.id,text})));
}

/** Server-owned, ordered, complete transcript statements. No paraphrase/deduplication. */
export function transcriptParagraphs(material: LearningMaterial, preferences?: AccessPreferences): TranscriptParagraph[] | undefined {
  if (material.kind !== "audio" || !preferences?.needs.includes("read-spoken") || preferences.needs.includes("plain-language")) return;
  const result: TranscriptParagraph[] = [];
  for (const [index, unit] of material.units.entries()) {
    if (!unit.text || unit.locator.kind !== "transcript") return;
    let start = 0, count = 0;
    while (start < unit.text.length) {
      const remaining = unit.text.slice(start);
      let length = remaining.length;
      if (length > 1600) {
        // Keep sentence boundaries; a long unbroken sentence uses the existing path.
        const endings = [...remaining.slice(0, 1600).matchAll(/[.!?]["'”’)]*\s+/gu)];
        if (!endings.length) return;
        const last = endings.at(-1)!; length = last.index! + last[0].length;
      }
      const text = remaining.slice(0, length).trim();
      if (text) { if (++count > 40) return; result.push({ id: `transcript-paragraph-${index + 1}-${count}`, sourceId: unit.id, text }); }
      start += length;
    }
  }
  return result.length ? result : undefined;
}

/** Resolve only known references in their full original order before strict validation. */
export function resolveTranscriptParagraphs(value: unknown, paragraphs: TranscriptParagraph[], points: TranscriptParagraph[]): unknown {
  const fail = (): never => { throw new ProviderResponseError("validation", "Invalid transcript paragraph references; complete ordered source required"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.sections)) return fail();
  const used: string[] = [];
  const sections = root.sections.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const section = item as Record<string, unknown>;
    if ("paragraphs" in section || "paragraphRefs" in section || typeof section.paragraphSourceId !== "string" || !Array.isArray(section.evidence)) return fail();
    const owned = paragraphs.filter(p => p.sourceId === section.paragraphSourceId);
    if (!owned.length || !section.evidence.some((e: unknown) => Boolean(e && typeof e === "object" && "sourceId" in e && e.sourceId === section.paragraphSourceId))) return fail();
    used.push(...owned.map(p => p.id));
    const texts = owned.map(p => p.text);
    if ("steps" in section || !Array.isArray(section.stepRefs) || section.stepRefs.length > 6 || new Set(section.stepRefs).size !== section.stepRefs.length) return fail();
    const steps = section.stepRefs.map(id => { const point = points.find(p=>p.id===id && p.sourceId===section.paragraphSourceId); if (!point) return fail(); return point.text; });
    const { paragraphSourceId: _source, stepRefs: _steps, ...other } = section; void _source; void _steps;
    return { ...other, paragraphs: texts, steps };
  });
  if (JSON.stringify(used) !== JSON.stringify(paragraphs.map(p => p.id))) return fail();
  return { ...root, sections };
}
