"use client";
import { useEffect, useRef, useState } from "react";
import type { UnderstandingQuestion } from "@/lib/learning/types";
import { Readable } from "./read-aloud";
import { VoiceField } from "./voice-field";
import { LoadingExperience } from "./loading-experience";

export function CheckUnderstanding({ available, generate }: { available: boolean; generate(): Promise<{ questions: UnderstandingQuestion[] }> }) {
  const [questions, setQuestions] = useState<UnderstandingQuestion[]>(), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [index, setIndex] = useState(0), [answer, setAnswer] = useState(""), [revealed, setRevealed] = useState(false), [finished, setFinished] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (questions || finished) heading.current?.focus(); }, [questions, index, finished]);
  async function start() {
    setBusy(true); setError(false);
    try { const result = await generate(); if (mounted.current) setQuestions(result.questions); }
    catch { if (mounted.current) setError(true); }
    finally { if (mounted.current) setBusy(false); }
  }
  const question = questions?.[index];
  return <section hidden={!available} className="adapt-practice understanding-practice" aria-labelledby="practice-title" aria-busy={busy}>
    {!questions && !finished && <>
      <Readable label="Practice invitation" units={["Ready to see what you picked up?", "A few quick questions — no grades, just a chance to check your understanding."]}><h2 id="practice-title">Ready to see what you picked up?</h2><p>A few quick questions — no grades, just a chance to check your understanding.</p></Readable>
      <button type="button" disabled={busy} onClick={start}>Check my understanding</button>
      <LoadingExperience active={busy} compact />
      {error && <p role="alert">We couldn’t prepare the questions. You can try again or keep exploring your lesson.</p>}
    </>}
    {question && !finished && <article className="reflection-card">
      <p className="adapt-eyebrow">Check your understanding · {index + 1} of {questions!.length}</p>
      <h2 id="practice-title" ref={heading} tabIndex={-1}>A moment to reflect</h2>
      <Readable label="Practice question" units={[question.prompt, "Use your lesson whenever you like. Type or dictate your response."]}><h3>{question.prompt}</h3><p>Use your lesson whenever you like. Type or dictate your response.</p></Readable>
      <form onSubmit={event => { event.preventDefault(); setRevealed(true); }}>
        <VoiceField key={question.id} id={`answer-${question.id}`} label="Your response" value={answer} onChange={setAnswer} maxLength={2000} />
        <button disabled={!answer.trim()}>Explore my response</button>
      </form>
      <div role="status" aria-atomic="true">{revealed && <div className="reflection-response"><p className="adapt-eyebrow">Keep exploring</p><Readable label="Practice reflection" units={["Here’s how your lesson explains it:", question.answerQuote, "Compare this with your response. It’s fine to revisit the lesson or try a different explanation."]}><p>Here’s how your lesson explains it:</p><blockquote>{question.answerQuote}</blockquote><p>Compare this with your response. It’s fine to revisit the lesson or try a different explanation.</p></Readable></div>}</div>
      <div className="practice-actions">{revealed && index < questions!.length - 1 && <button type="button" onClick={() => { setIndex(index + 1); setAnswer(""); setRevealed(false); }}>Next question</button>}<button type="button" className="adapt-secondary" onClick={() => setFinished(true)}>{revealed && index === questions!.length - 1 ? "Finish practice" : "Finish for now"}</button></div>
    </article>}
    {finished && <><h2 id="practice-title" tabIndex={-1} ref={heading}>Keep learning at your pace</h2><Readable label="Practice complete" units={["You can revisit your lesson whenever you like. There’s nothing to hand in."]}><p>You can revisit your lesson whenever you like. There’s nothing to hand in.</p></Readable></>}
  </section>;
}
