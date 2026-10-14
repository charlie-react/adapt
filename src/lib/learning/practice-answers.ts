import "server-only";
import type { AdaptedExperience } from "./types";
import { ProviderResponseError } from "./provider-response";

export type LessonAnswer = { id: string; sectionId: string; kind: "paragraph" | "step"; index: number; text: string };

/** Request-local references to complete, already displayed lesson units. Never source-only wording. */
export function lessonAnswers(experience: AdaptedExperience): LessonAnswer[] {
  return experience.sections.flatMap((section, sectionIndex) => {
    const collect = (texts: string[], kind: LessonAnswer["kind"]) => texts.flatMap((text, index) =>
      text.trim() && text.length <= 1600 ? [{ id: `answer-${sectionIndex + 1}-${kind}-${index + 1}`, sectionId: section.id, kind, index, text }] : []);
    return [...collect(section.paragraphs, "paragraph"), ...collect(section.steps, "step")];
  });
}

/** Translate the provider wire contract; the unchanged domain validator checks the resolved result. */
export function resolvePracticeAnswers(value: unknown, answers: LessonAnswer[]): unknown {
  const fail = (message: string): never => { throw new ProviderResponseError("validation", message); };
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).join() !== "questions") return fail("Invalid practice response");
  const questions = (value as { questions: unknown }).questions;
  if (!Array.isArray(questions) || questions.length < 3 || questions.length > 5) return fail("Expected 3-5 questions");
  return { questions: questions.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join() !== "answerRef,evidence,id,prompt,sectionId") return fail("Invalid practice reference question");
    const answer = answers.find(answer => answer.id === item.answerRef);
    if (!answer || answer.sectionId !== item.sectionId) return fail("Unknown or wrong-section lesson answer reference");
    const { answerRef: _answerRef, ...question } = item; void _answerRef;
    return { ...question, answerQuote: answer.text };
  }) };
}
