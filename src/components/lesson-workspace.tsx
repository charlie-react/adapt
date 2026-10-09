"use client";

import { useEffect, useRef, useState } from "react";
import type { Accommodation } from "@/lib/engine/types";
import { SemanticExplorer } from "./semantic-explorer";
import { CompetencyPractice } from "./competency-practice";
import { Readable } from "./read-aloud";
import { LoadingExperience } from "./loading-experience";

export function LessonWorkspace({ materialId, barrier }: { materialId: string; barrier: { id: string; label: string } }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Accommodation>();
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (result) heading.current?.focus(); }, [result]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResult(undefined);
    try {
      const response = await fetch("/api/accommodation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialId, preferences: { barriers: [barrier.id], representation: "structured-text" } }), signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error("Request failed");
      setResult(await response.json() as Accommodation);
    } catch { setError("We couldn’t finish that. Please try again."); }
    finally { setBusy(false); }
  }
  return <>
    <section aria-labelledby="preferences-title" className="panel">
      <p className="eyebrow">02 / Your access needs</p>
      <h2 id="preferences-title">Change the representation</h2>
      <Readable label="Access instructions" units={["Tell ADAPT what gets in the way. No diagnosis or personal identity is required. The learning objective stays the same."]}><p>Tell ADAPT what gets in the way. No diagnosis or personal identity is required. The learning objective stays the same.</p></Readable>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend>Barrier and representation preference</legend>
          <label className="barrier-choice"><input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setResult(undefined); }} />{barrier.label}</label>
          <p id="representation-help">Explore the diagram through clear descriptions and relationships.</p>
          <button type="submit" disabled={!confirmed} aria-describedby="representation-help">Create accessible representation</button>
        </fieldset>
      </form>
      <LoadingExperience active={busy} compact />
      {error && <p role="alert">{error}</p>}
      <noscript><p>You can read the complete lesson above. Try another browser to explore it interactively.</p></noscript>
    </section>
    {result && <section className="panel" aria-labelledby="accommodation-title">
      <p className="eyebrow">03 / Same objective, another way in</p>
      <h2 id="accommodation-title" ref={heading} tabIndex={-1}>Your accessible learning experience</h2>
      <Readable label="Accommodation strategy" units={[result.strategy.explanation]}><p>{result.strategy.explanation}</p></Readable>
      <Readable label="Preserved learning objective" units={["Your learning goal.", ...result.objectives.map(item => item.text)]}><p><strong>Your learning goal:</strong> {result.objectives.map((item) => item.text).join(" ")}</p></Readable>
      <SemanticExplorer experience={result.experience} />
      {result.explanations.status === "ready" && <section aria-labelledby="explanation-title" className="explanation">
        <h3 id="explanation-title">Explore the ideas</h3>
        <ol>{result.explanations.entries.map((entry, index) => <li key={`${entry.sourceId}-${index}`}><Readable label={`Explanation ${index + 1}`} units={[entry.text]}><p>{entry.text}</p></Readable></li>)}</ol>
      </section>}
      <CompetencyPractice questions={result.practice} objectives={result.objectives} materialId={materialId} />
    </section>}
  </>;
}
