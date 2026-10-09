import type { AccessibleExperience, BarrierFinding, Explanation, LearningMaterial, Objective, SourceSegment } from "../engine/types";

export type ExplanationInput = { language: string; objectives: Objective[]; sources: SourceSegment[]; experience: AccessibleExperience; barriers: BarrierFinding[] };
export interface ExplanationProvider {
  readonly origin: "prepared" | "ai-generated";
  explain(input: ExplanationInput, signal: AbortSignal): Promise<unknown>;
}

// Extractive explanations deliberately limit this first boundary to source quotes.
// Citation IDs alone cannot establish faithfulness of unrestricted generated prose.
export function validateExplanations(output: unknown, material: LearningMaterial): Explanation[] {
  if (!Array.isArray(output) || output.length === 0 || output.length > 8) {
    throw new Error("Invalid explanation response");
  }
  return output.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid explanation");
    const value = entry as Record<string, unknown>;
    if (Object.keys(value).some((key) => !["text", "sourceId"].includes(key))) throw new Error("Unexpected provider field");
    if (typeof value.text !== "string" || typeof value.sourceId !== "string" || !value.text.trim()) {
      throw new Error("Invalid explanation fields");
    }
    const source = material.segments.find((segment) => segment.id === value.sourceId);
    const completeSentences = source?.text.match(/[^.!?]+[.!?](?:\s|$)/g)?.map((sentence) => sentence.trim()) ?? [];
    if (!source || !(source.text === value.text || completeSentences.includes(value.text)) || /[<>]/.test(value.text)) {
      throw new Error("Explanation is not an exact plain-text source excerpt");
    }
    return { text: value.text, sourceId: value.sourceId };
  });
}

