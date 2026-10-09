"use client";
import { useEffect, useRef, useState } from "react";
import type { ReviewPage, ReviewSummary } from "@/lib/material-review/types";
import { MaterialReview } from "./material-review";
import { LearningSpace } from "./learning-space";
import { Readable } from "./read-aloud";

const originLabel = { "source-stated": "From your material", "ai-inferred": "AI-suggested · please confirm", "learner-provided": "Chosen by you" };
const scopeMessage = "Some visual elements may not be fully available to ADAPT. We’ll use the readable text; diagrams, tables and equations have not been interpreted. Text layout may differ from your PDF.";
export function PdfUploadWorkspace() {
  const [file, setFile] = useState<File>();
  const [summary, setSummary] = useState<ReviewSummary>();
  const [page, setPage] = useState<ReviewPage>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [intent, setIntent] = useState("");
  const [choice, setChoice] = useState("custom");
  const [style, setStyle] = useState<"continuous" | "one-section">("continuous");
  const [originalUrl, setOriginalUrl] = useState("");
  const request = useRef<AbortController | undefined>(undefined);
  const localUrl = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  const stage = !summary?.quality.canConfirm ? 0 : !summary.session ? 1 : !summary.session.preferences ? 2 : 3;
  const fingerprint = summary?.quality.fingerprint;
  useEffect(() => () => { request.current?.abort(); if (localUrl.current) URL.revokeObjectURL(localUrl.current); }, []);
  useEffect(() => { if (fingerprint) heading.current?.focus(); }, [stage, fingerprint]);
  async function response<T>(url: string, options: RequestInit = {}): Promise<T> {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const result = await fetch(url, { ...options, cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
    const body = await result.json();
    if (!result.ok) { if (["EXPIRED", "STALE_REVIEW"].includes(body.code)) { setSummary(undefined); setPage(undefined); } throw new Error(body.error || "That step could not finish. Please try again."); }
    return body as T;
  }
  function failure(value: unknown) { setError(value instanceof Error ? value.message : "Please try again."); }
  function selectFile(value?: File) {
    request.current?.abort(); setFile(value); setSummary(undefined); setPage(undefined); setError(""); setIntent(""); setChoice("custom"); setBusy("");
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = value ? URL.createObjectURL(value) : ""; setOriginalUrl(localUrl.current);
  }
  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!file) return;
    setError(""); setSummary(undefined); setPage(undefined);
    if (!file.size) { setError("This file is empty. Choose a PDF with selectable text."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("This file exceeds the current 5 MiB upload limit. Choose a smaller source."); return; }
    setBusy("Getting your material ready…");
    try {
      const result = await response<ReviewSummary>("/api/material-review", { method: "POST", headers: { "Content-Type": "application/pdf", "X-Material-Name": encodeURIComponent(Array.from(file.name).slice(0, 120).join("")) }, body: file });
      if (!result.quality.canConfirm) { setSummary(result); return; }
      const understood = await response<ReviewSummary>("/api/material-review/goals", { method: "POST", headers: { "X-Review-Fingerprint": result.quality.fingerprint } });
      setChoice(understood.understanding?.candidates[0]?.id || "custom"); setSummary(understood);
    } catch (value) { failure(value); } finally { setBusy(""); }
  }
  async function viewPage(index: number, current = summary) {
    if (!current) return; setBusy("Opening your material…"); setError("");
    try {
      const value = await response<ReviewPage>(`/api/material-review?page=${index}`);
      if (value.assessmentFingerprint !== current.quality.fingerprint) throw new Error("Another upload replaced this material. Please upload it again.");
      setPage(value);
    } catch (value) { failure(value); } finally { setBusy(""); }
  }
  async function confirmGoal(event: React.FormEvent) {
    event.preventDefault(); if (!summary) return; setBusy("Saving your learning direction…"); setError("");
    try { setSummary(await response<ReviewSummary>("/api/material-review/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentFingerprint: summary.quality.fingerprint, intent: choice === "custom" ? intent : "", candidateId: choice === "custom" ? "" : choice, acceptTextScope: true, acknowledgedReasonIds: summary.quality.reasons.map(reason => reason.id) }) })); }
    catch (value) { failure(value); } finally { setBusy(""); }
  }
  async function openLearning(event: React.FormEvent) {
    event.preventDefault(); if (!summary?.session) return; setBusy("Making space for your learning…"); setError("");
    try {
      const result = await response<ReviewSummary>("/api/material-review/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentFingerprint: summary.quality.fingerprint, revision: summary.session.revision, readingStyle: style }) });
      setSummary(result); await viewPage(1, result);
    } catch (value) { failure(value); } finally { setBusy(""); }
  }
  const candidates = summary?.understanding?.candidates || [];
  return <div className="learner-journey">
    <ol className="journey-steps" aria-label="Your learning journey">{["Material", "Your goal", "Your preferences", "Learn"].map((label, index) => <li key={label} aria-current={index === stage ? "step" : undefined}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>
    {stage === 0 && <section className="upload-surface" aria-labelledby="upload-title">
      <div className="upload-introduction"><p className="eyebrow">Start with what you have</p><h2 id="upload-title" ref={heading} tabIndex={-1}>Bring your material.</h2><Readable label="Material instructions" units={["Bring your material. We’ll find the readable content, then help you choose your learning direction."]}><p>We’ll find the readable content, then help you choose your learning direction.</p></Readable><span className="supported-input">PDF supported today</span></div>
      <form onSubmit={upload} className="upload-choice" aria-busy={Boolean(busy)}><label htmlFor="pdf-upload">Choose your material</label><p id="upload-help">A PDF with selectable text · up to 5 MiB and 20 pages</p><input id="pdf-upload" type="file" accept="application/pdf,.pdf" disabled={Boolean(busy)} aria-describedby="upload-help" onChange={event => selectFile(event.target.files?.[0])} /><button disabled={!file || Boolean(busy)}>Start learning <span aria-hidden="true">↗</span></button><details className="privacy-details"><summary>How your material is used</summary><p>Original PDF bytes are discarded after processing. Extracted text stays temporarily for 15 minutes. If no clear goal is stated, short text excerpts may go to Amazon Bedrock for a suggested focus. Only source text—not session details—is supplied for that suggestion.</p></details></form>
    </section>}
    <p className="journey-status" role="status" aria-atomic="true">{busy}</p>
    {error && <p className="journey-error" role="alert">{error}</p>}
    {summary && <>
      <div className="material-strip"><span>{summary.title}</span><span className={`material-state ${summary.quality.canConfirm ? "usable" : "blocked"}`}>{summary.quality.readiness === "ready" ? "Ready" : summary.quality.canConfirm ? "Ready with warnings" : "Not ready"}</span></div>
      {!summary.quality.canConfirm && <section className="blocked-material"><h2>Let’s try another version.</h2><Readable label="Material needs another source" units={["Some of this material could not be read reliably. Choose another accessible copy. No pages will be silently left out."]}><p>Some of this material could not be read reliably. Choose another accessible copy. No pages will be silently left out.</p></Readable><ul>{[...new Set(summary.quality.reasons.filter(reason => reason.severity === "blocking").map(reason => reason.learnerMessage))].map(message => <li key={message}>{message}</li>)}</ul></section>}
      {stage === 1 && <section className="journey-step" aria-labelledby="goal-title"><p className="eyebrow">Your direction matters</p><h2 id="goal-title" ref={heading} tabIndex={-1}>What would you like to learn?</h2><Readable label="Learning goal instructions" units={[candidates.length ? "Here is a possible starting point. Choose it, or tell us what matters to you." : "Tell us what you want to take away from this material. You don’t need a formal learning objective."]}><p className="step-description">{candidates.length ? "Here’s a possible starting point. Choose it, or tell us what matters to you." : "Tell us what you want to take away. You don’t need a formal learning objective."}</p></Readable>
        <form onSubmit={confirmGoal}><fieldset disabled={Boolean(busy)}><legend className="visually-hidden">Choose your learning goal</legend>
          {candidates.map(candidate => <div className={`goal-card ${choice === candidate.id ? "selected" : ""}`} key={candidate.id}><Readable label="Suggested learning goal" units={[originLabel[candidate.origin], candidate.text]}><label className="goal-choice"><input type="radio" name="goal" checked={choice === candidate.id} onChange={() => setChoice(candidate.id)} /><span><small>{originLabel[candidate.origin]}</small><strong>{candidate.text}</strong></span></label></Readable><details className="goal-evidence"><summary>Where this comes from</summary>{candidate.evidence.map(evidence => <div key={evidence.blockId}><p>Source page {summary.quality.units.find(unit => unit.id === evidence.unitId)?.locator.index}</p><blockquote>{evidence.quote}</blockquote></div>)}</details></div>)}
          {candidates.length > 0 && <label className="custom-goal"><input type="radio" name="goal" checked={choice === "custom"} onChange={() => setChoice("custom")} />I have something else in mind</label>}
          {choice === "custom" && <div className="goal-input"><label htmlFor="learning-intent">I want to learn…</label><textarea id="learning-intent" rows={3} maxLength={500} value={intent} onChange={event => setIntent(event.target.value)} placeholder="For example, how to explain the main idea in my own words" required /></div>}
          <Readable label="Material scope" units={[scopeMessage]}><p className="scope-note">{scopeMessage}</p></Readable>
          <button disabled={choice === "custom" && intent.trim().length < 3}>Continue with this goal <span aria-hidden="true">→</span></button><p className="action-caption">Continue with readable text within these limits. Your goal remains yours.</p>
        </fieldset></form></section>}
      {summary.session && <Readable label="Your session goal" units={["Your session goal.", originLabel[summary.session.goal.origin], summary.session.goal.text]}><div className="session-goal"><span>Your session goal · {originLabel[summary.session.goal.origin]}</span><p>{summary.session.goal.text}</p></div></Readable>}
      {stage === 2 && <section className="journey-step" aria-labelledby="preferences-title"><p className="eyebrow">Make space for your way of learning</p><h2 id="preferences-title" ref={heading} tabIndex={-1}>How would you like to learn?</h2><p className="step-description">Choose a comfortable starting point. No diagnosis needed.</p><form onSubmit={openLearning}><fieldset disabled={Boolean(busy)}><legend className="visually-hidden">Reading preference</legend><div className="preference-grid">{([{ id: "continuous", title: "Comfortable reading", description: "A clear, spacious view of each page’s text." }, { id: "one-section", title: "One section at a time", description: "Focus on one section before moving on." }] as const).map(item => <label key={item.id} className={`preference-card ${style === item.id ? "selected" : ""}`}><input type="radio" name="reading-style" checked={style === item.id} onChange={() => setStyle(item.id)} /><span><strong>{item.title}</strong><span>{item.description}</span></span></label>)}</div><Readable label="Listening preference" units={["Prefer listening? Turn on Read Aloud in the header, then hover or focus meaningful learning content."]}><p className="listening-note">Prefer listening? <strong>Read Aloud</strong> is always available in the header.</p></Readable><button>Open my learning space <span aria-hidden="true">→</span></button></fieldset></form></section>}
      {stage === 3 && <section className="journey-step" aria-labelledby="learning-title" aria-busy={Boolean(busy)}><p className="eyebrow">At your pace</p><h2 id="learning-title" ref={heading} tabIndex={-1}>Your learning space.</h2><p className="step-description">The material’s readable text, presented your way. Visual content hasn’t been reconstructed or explained.</p><LearningSpace key={page?.unit.id ?? "pending"} summary={summary} page={page} busy={Boolean(busy)} onPage={viewPage} />{summary.session?.sourceGoals.length ? <details className="source-context"><summary>Goals stated in the material</summary>{summary.session.sourceGoals.map(goal => <div key={goal.id}><p>{goal.text}</p>{goal.evidence.map(evidence => <p className="small" key={evidence.blockId}>Source page {summary.quality.units.find(unit => unit.id === evidence.unitId)?.locator.index} · {evidence.quote}</p>)}</div>)}</details> : null}</section>}
      <details className="source-disclosure" onToggle={event => { if (event.currentTarget.open && !page && !busy) void viewPage(1); }}><summary>View material and source details</summary><div className="source-details">{originalUrl && <p><a href={originalUrl} download={file?.name}>Open your original PDF</a></p>}<MaterialReview summary={summary} page={page} onPage={viewPage} busy={Boolean(busy)} /></div></details>
    </>}
    <noscript><p>Interactive upload needs JavaScript. The demonstration remains available as semantic text.</p></noscript>
  </div>;
}



