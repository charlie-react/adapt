import "server-only";
import type { AdaptedExperience, LearningMaterial, UnderstandingQuestion } from "./types";
import { evidence } from "./validation";

export function validatePractice(value: unknown, material: LearningMaterial, experience: AdaptedExperience): UnderstandingQuestion[] {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).join() !== "questions") throw new Error("Invalid practice response");
  const questions = (value as { questions: unknown }).questions;
  if (!Array.isArray(questions) || questions.length < 3 || questions.length > 5) throw new Error("Expected 3-5 questions");
  const text = (value: unknown, max: number) => { if (typeof value !== "string" || !value.trim() || value.length > max || /<(?:script|iframe|img|svg|style|div|span|html)\b|```/i.test(value)) throw new Error("Invalid practice text"); return value; };
  const result = questions.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join() !== "answerQuote,evidence,id,prompt,sectionId") throw new Error("Invalid practice question");
    const id = text(item.id, 50), prompt = text(item.prompt, 700), sectionId = text(item.sectionId, 50), answerQuote = text(item.answerQuote, 1600);
    if (!/^[a-zA-Z0-9-]+$/.test(id) || /\b(?:grade|score|timer|leaderboard|streak)\b/i.test(prompt)) throw new Error("Invalid practice wording");
    const section = experience.sections.find(section => section.id === sectionId);
    if (!section || ![...section.paragraphs, ...section.steps].some(content => content.includes(answerQuote))) throw new Error("Answer was not presented in the lesson");
    const refs = evidence(item.evidence, material, true);
    if (refs.some(ref => !section.evidence.some(original => original.sourceId === ref.sourceId && original.mode === ref.mode))) throw new Error("Question source does not support this lesson section");
    return { id, prompt, sectionId, answerQuote, evidence: refs };
  });
  if (new Set(result.map(item => item.id)).size !== result.length || new Set(result.map(item => item.prompt.toLowerCase().trim())).size !== result.length) throw new Error("Duplicate practice questions");
  return result;
}
