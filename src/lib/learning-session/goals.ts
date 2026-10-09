import type { QualityMaterial } from "../material-quality/types";

export type GoalEvidence = { blockId: string; unitId: string; quote: string };
export type GoalCandidate = { id: string; origin: "source-stated" | "ai-inferred"; text: string; evidence: GoalEvidence[] };
export type SessionGoal = { origin: "source-stated" | "ai-inferred" | "learner-provided"; text: string; evidence: GoalEvidence[] };
export type GoalUnderstanding = { candidates: GoalCandidate[]; status: "suggestions" | "ask-learner" };
export type SessionPreferences = { readingStyle: "continuous" | "one-section" };
export type LearningSession = { goal: SessionGoal; sourceGoals: GoalCandidate[]; suggestedGoals: GoalCandidate[]; learnerIntent: string; preferences?: SessionPreferences; revision: number };

// Deliberately narrow textual detection, not objective inference or a page-layout guess.
export function sourceGoals(material: QualityMaterial): GoalCandidate[] {
  return material.blocks.flatMap(block => {
    const match = block.text.match(/^(?:learning objectives?|learning outcomes?|objective|intended outcome)\s*[:—]\s*(.+)$/i);
    if (!match || match[1].trim().length < 3 || match[1].length > 500) return [];
    return [{ id: `source:${block.id}`, origin: "source-stated" as const, text: match[1].trim(), evidence: [{ blockId: block.id, unitId: block.sourceUnitId, quote: block.text }] }];
  }).slice(0, 3);
}
export function suggestedGoal(output: unknown, material: QualityMaterial): GoalCandidate | undefined {
  if (output === null) return;
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("Invalid goal suggestion");
  const value = output as Record<string, unknown>;
  if (Object.keys(value).sort().join(",") !== "quote,sourceId" || typeof value.sourceId !== "string" || typeof value.quote !== "string" || value.quote.length < 15 || value.quote.length > 350 || /[<>]/.test(value.quote)) throw new Error("Invalid goal suggestion");
  const block = material.blocks.find(block => block.id === value.sourceId);
  const sentences = block?.text.match(/[^.!?]+[.!?](?:\s|$)/g)?.map(sentence => sentence.trim()) ?? [];
  if (!block || !(block.text === value.quote || sentences.includes(value.quote))) throw new Error("Ungrounded goal suggestion");
  return { id: `suggested:${block.id}`, origin: "ai-inferred", text: `Understand the idea: ${value.quote}`, evidence: [{ blockId: block.id, unitId: block.sourceUnitId, quote: value.quote }] };
}
export function chooseSessionGoal(understanding: GoalUnderstanding, intent: string, candidateId?: string): SessionGoal {
  const text = intent.trim();
  if (text) {
    if (text.length < 3 || text.length > 500 || !/\p{L}/u.test(text)) throw new Error("Tell us what you would like to learn in a few words.");
    return { origin: "learner-provided", text, evidence: [] };
  }
  const candidate = understanding.candidates.find(candidate => candidate.id === candidateId);
  if (!candidate) throw new Error("What would you like to learn from this material?");
  return structuredClone({ origin: candidate.origin, text: candidate.text, evidence: candidate.evidence });
}
