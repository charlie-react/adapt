import type { Accommodation, Objective, PracticeQuestion } from "../engine/types";

export function experienceSpeech(content: Accommodation): string[] {
  return [
    "Learning objective.",
    ...content.objectives.map((objective) => objective.text),
    content.experience.title,
    content.experience.summary,
    "Source-derived relationships.",
    ...content.experience.items.map((item) => `${item.title}. ${item.facts.join(" ")}`),
    ...(content.explanations.status === "ready" ? [
      content.explanations.origin === "ai-generated" ? "AI-selected explanation, grounded in the source." : "Prepared explanation from the source.",
      ...content.explanations.entries.map((entry) => entry.text),
    ] : []),
  ];
}

export function practiceSpeech(question: PracticeQuestion, objective: Objective): string[] {
  return [
    "Practice learning objective.", objective.text,
    question.prompt,
    question.multiple ? "You may select more than one answer." : "Select one answer.",
    `Answer choices: ${question.options.map((option) => option.label).join(". ")}.`,
  ];
}
