"use client";

import { useState } from "react";
import type { Objective, PracticeFeedback, PracticeQuestion } from "@/lib/engine/types";
import { Readable } from "./read-aloud";
import { LoadingExperience } from "./loading-experience";
import { practiceSpeech } from "@/lib/accessibility/speech-content";

function PracticeCard({ question, materialId, objective }: { question: PracticeQuestion; materialId: string; objective: Objective }) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<PracticeFeedback>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setFeedback(undefined); setBusy(true);
    try {
      const response = await fetch("/api/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialId, questionId: question.id, answers }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Practice unavailable");
      setFeedback(await response.json() as PracticeFeedback);
    } catch { setError("Practice response unavailable. Please try again. Your choices are kept."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="practice-card">
    <p className="small">Practising: <a href="#source-objective">{objective.text}</a></p>
    <Readable label={`Practice: ${question.prompt}`} units={practiceSpeech(question, objective)}>
    <fieldset disabled={busy}>
      <legend>{question.prompt}</legend>
      <div className="answer-options">{question.options.map((option) => <label key={option.id}>
        <input type={question.multiple ? "checkbox" : "radio"} name={question.id} value={option.id} checked={answers.includes(option.id)} onChange={(event) => {
          setFeedback(undefined); setError("");
          setAnswers(question.multiple ? event.target.checked ? [...answers, option.id] : answers.filter((id) => id !== option.id) : [option.id]);
        }} />{option.label}
      </label>)}</div>
      <button type="submit" disabled={!answers.length}>Check my reasoning</button>
    </fieldset>
    </Readable>
    <LoadingExperience active={busy} compact />
    <div role="status" aria-label={`Practice feedback: ${question.prompt}`} aria-atomic="true">{feedback && <><Readable label={`Feedback: ${question.prompt}`} units={[feedback.message]}><p>{feedback.message}</p></Readable></>}</div>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export function CompetencyPractice({ questions, objectives, materialId }: { questions: PracticeQuestion[]; objectives: Objective[]; materialId: string }) {
  return <section aria-labelledby="practice-title">
    <h3 id="practice-title">Demonstrate the same competency</h3>
    <Readable label="Practice instructions" units={["This is open-reference practice, not formal grading. Use the explorer above, explain your reasoning, and try again as often as you like. Nothing is saved after a reload."]}><p>This is open-reference practice, not formal grading. Use the explorer above, explain your reasoning, and try again as often as you like. Nothing is saved after a reload.</p></Readable>
    {questions.map((question) => <PracticeCard key={question.id} question={question} materialId={materialId} objective={objectives.find((item) => item.id === question.objectiveId)!} />)}
  </section>;
}
