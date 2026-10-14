"use client";
import Link from "next/link";
import { LEARNING_LIMITS } from "@/lib/learning/limits";
import { useEffect, useRef, useState } from "react";
import { accessOptions, type AccessNeed, type AdaptedSection, type LearningSnapshot, type UnderstandingQuestion } from "@/lib/learning/types";
import { Readable, useStopReadAloud } from "./read-aloud";
import { VoiceField } from "./voice-field";
import { AdaptedLearning } from "./adapted-learning";
import { LoadingExperience } from "./loading-experience";
import { LearnerActionError, learnerFailure, learnerMessage } from "@/lib/learning/learner-messages";

export function AdaptWorkspace() {
  const [mode, setMode] = useState<"file" | "text">("file"), [file, setFile] = useState<File>(), [text, setText] = useState("");
  const [snapshot, setSnapshot] = useState<LearningSnapshot>(), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [partialSections, setPartialSections] = useState<AdaptedSection[]>([]), [partialState, setPartialState] = useState<"" | "reading" | "incomplete" | "complete">("");
  const generation = useRef(0), progressive = useRef(false), stopReading = useStopReadAloud();
  const stopProgress = useRef<HTMLButtonElement>(null), fallbackAction = useRef<HTMLButtonElement>(null);
  const [needs, setNeeds] = useState<AccessNeed[]>(["stepwise"]), [description, setDescription] = useState(""), [focus, setFocus] = useState(""), [focusOpen, setFocusOpen] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined), heading = useRef<HTMLHeadingElement>(null);
  const prepared = snapshot?.analysis.status === "source-ready" || snapshot?.analysis.status === "ready";
  const stage = snapshot?.experience || partialSections.length ? 2 : prepared ? 1 : 0;
  const fingerprint = snapshot?.fingerprint;
  const wasBusy = useRef(false);
  useEffect(() => { if (fingerprint) heading.current?.focus(); }, [stage, fingerprint]);
  useEffect(() => { if (wasBusy.current && !busy && !progressive.current) heading.current?.focus(); wasBusy.current = Boolean(busy); }, [busy]);
  useEffect(() => () => { controller.current?.abort(); }, []);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const response = await fetch(path, { ...init, cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(path === "/api/learning" ? LEARNING_LIMITS.clientUploadMs : LEARNING_LIMITS.clientAdaptationMs)]) });
    const result = await response.json();
    if (!response.ok) { if (["EXPIRED", "STALE_MATERIAL"].includes(result.code)) setSnapshot(undefined); throw new LearnerActionError(result.code); }
    return result as T;
  }
  function selectFile(value?: File) {
    if (value && (value.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi)$/i.test(value.name))) { setFile(undefined); setError(learnerMessage("UNSUPPORTED_FORMAT")); return; }
    setFile(value); setError("");
  }
  async function bringMaterial(event: React.FormEvent) {
    event.preventDefault(); setError(""); setBusy("Adding your material…"); setSnapshot(undefined);
    try {
      if (mode === "file") {
        if (!file || !file.size) throw new LearnerActionError("EMPTY_INPUT");
        if (file.size > LEARNING_LIMITS.uploadBytes) throw new LearnerActionError("RESOURCE_LIMIT");
        const data = new FormData(); data.set("material", file); data.set("transcript", "");
        const prepared = await request<LearningSnapshot>("/api/learning", { method: "POST", body: data });
        setSnapshot(prepared); if (prepared.material.kind === "audio") setNeeds(["read-spoken"]);
      } else {
        setSnapshot(await request<LearningSnapshot>("/api/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }));
      }
    } catch (failure) { setError(learnerFailure(failure)); }
    finally { setBusy(""); }
  }
  async function adapt(event?: React.FormEvent, whole = false) {
    event?.preventDefault(); if (!snapshot) return;
    const own = ++generation.current; controller.current?.abort(); stopReading();
    setPartialSections([]); setPartialState(""); progressive.current = false;
    setBusy("Creating your learning experience…"); setError("");
    const body = JSON.stringify({ fingerprint: snapshot.fingerprint, revision: snapshot.revision, preferences: { needs, description, focus } });
    try {
      if (snapshot.material.kind !== "pdf" || whole) {
        setSnapshot(await request<LearningSnapshot>("/api/learning/adapt", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
      } else {
        const abort = new AbortController(); controller.current = abort;
        const response = await fetch("/api/learning/adapt-progress", { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(LEARNING_LIMITS.clientAdaptationMs)]) });
        if (!response.ok) { const failure = await response.json(); if (["EXPIRED", "STALE_MATERIAL"].includes(failure.code)) setSnapshot(undefined); throw new LearnerActionError(failure.code); }
        if (!response.body) throw new Error("Unavailable lesson");
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "", completed = false;
        const received: AdaptedSection[] = [];
        while (!completed) {
          const chunk = await reader.read(); if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true }); let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            if (!line.startsWith("data:")) continue;
            const event = JSON.parse(line.slice(5)); if (own !== generation.current) return;
            if (event.type === "section") {
              if (event.section.id !== `source-${received.length + 1}`) throw new Error("Unavailable lesson");
              received.push(event.section); progressive.current = true;
              setPartialSections([...received]); setPartialState("reading");
            } else if (event.type === "complete") {
              const next = event.snapshot as LearningSnapshot;
              if (next.fingerprint !== snapshot.fingerprint || next.revision !== snapshot.revision + 1 || !next.experience || JSON.stringify(next.experience.sections.slice(0, received.length)) !== JSON.stringify(received)) throw new Error("Unavailable lesson");
              const recoverFocus = document.activeElement === stopProgress.current;
              setSnapshot(next); if (received.length) setPartialState("complete"); completed = true;
              if (recoverFocus) requestAnimationFrame(() => heading.current?.focus());
            } else if (event.type === "error") {
              if (["EXPIRED", "STALE_MATERIAL"].includes(event.code)) { setSnapshot(undefined); setPartialSections([]); }
              throw new LearnerActionError(event.code);
            } else throw new Error("Unavailable lesson");
          }
        }
        if (!completed) throw new Error("Unavailable lesson");
      }
    } catch (failure) { if (own === generation.current) { stopReading(); const recoverFocus = document.activeElement === stopProgress.current; if (progressive.current) setPartialState("incomplete"); setError(learnerFailure(failure)); if (recoverFocus) requestAnimationFrame(() => fallbackAction.current?.focus()); } }
    finally { if (own === generation.current) setBusy(""); }
  }
  async function startOver() {
    generation.current++; stopReading(); setPartialSections([]); setPartialState(""); progressive.current = false;
    controller.current?.abort(); setError(""); setBusy("");
    try { await request("/api/learning", { method: "DELETE" }); } catch {}
    setSnapshot(undefined); setNeeds(["stepwise"]); setDescription(""); setFocus("");
  }

  return <>
    {stage < 2 && <div className={`adapt-hero ${stage > 0 ? "compact" : ""}`}>
      <Readable label="ADAPT introduction" units={["Different ways in. The same depth of learning.", "Learning that meets you where you are.", "Your learning material, adapted to the way you learn best.", "Bring a lecture, diagram, or recording. Get clearer explanations, step-by-step guidance, and accessible descriptions shaped around your needs."]}>
        <p className="adapt-eyebrow">DIFFERENT WAYS IN. THE SAME DEPTH OF LEARNING.</p><h1>Learning that<br /><span>meets you where you are.</span></h1>
        <p className="hero-description hero-lead">Your learning material, adapted to the way you learn best.</p>
        <p className="hero-description">Bring a lecture, diagram, or recording. Get clearer explanations, step-by-step guidance, and accessible descriptions shaped around your needs.</p>
      </Readable>
      <div className="supported-formats" aria-label="Supported material">{["PDF", "Text", "Image", "Audio"].map(type => <span key={type}>{type}</span>)}</div>
    </div>}
    {stage < 2 && <ol className="adapt-journey" aria-label="Learning journey">{["Bring material", "Choose your support", "Learn your way"].map((label, index) => <li key={label} aria-current={stage === index ? "step" : undefined}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>}
    {stage === 0 && <section className="material-studio loading-surface" aria-labelledby="material-title">
      <div className="loading-underlay" inert={Boolean(busy)}>
      <div className="studio-heading"><p className="adapt-eyebrow">Start with what you’re learning</p><h2 id="material-title" ref={heading} tabIndex={-1}>Bring your material.</h2><p>Bring your notes, a diagram, a recording, or something you’d like to understand.</p></div>
      <div className="input-switch" role="group" aria-label="Material input method"><button type="button" aria-pressed={mode === "file"} disabled={Boolean(busy)} onClick={() => { setMode("file"); setSnapshot(undefined); setError(""); }}>Upload a file</button><button type="button" aria-pressed={mode === "text"} disabled={Boolean(busy)} onClick={() => { setMode("text"); setSnapshot(undefined); setError(""); }}>Paste or dictate text</button></div>
      <form onSubmit={bringMaterial} aria-busy={Boolean(busy)}>
        {mode === "file" ? <>
          <label htmlFor="learning-file" className="upload-invitation"><svg viewBox="0 0 48 48" aria-hidden="true" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 6h17l8 8v28H12zM29 6v9h8M24 34V21m-6 6 6-6 6 6" /></svg><strong>Choose something to learn from</strong><span>PDF, PNG, JPEG, MP3, WAV, or a text file</span></label>
          <input id="learning-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.mp3,.wav,.txt,.md" disabled={Boolean(busy)} onChange={event => selectFile(event.target.files?.[0])} />
        </> : <VoiceField id="material-text" label="Your learning material" value={text} onChange={setText} maxLength={30000} rows={7} placeholder="Paste your notes, an explanation, a code example, or dictate what you’re learning…" disabled={Boolean(busy)} />}
        <div className="studio-actions"><button disabled={Boolean(busy) || (mode === "file" ? !file : !text.trim())}>Continue with my material <span aria-hidden="true">→</span></button></div>
        <p className="field-help">Choose learning material without private or personal information.</p>
      </form>
      </div><LoadingExperience active={Boolean(busy)} onCancel={() => controller.current?.abort()} />
    </section>}
    {error && <p className="adapt-error" role="alert">{error}</p>}
    {error && stage === 1 && snapshot?.material.kind === "pdf" && !busy && <button type="button" onClick={() => void adapt(undefined, true)}>Prepare the whole lesson</button>}
    {snapshot && snapshot.analysis.status !== "ready" && snapshot.analysis.status !== "source-ready" && <section className="understanding-failure"><h2>This material isn’t available yet.</h2><Readable label="Material unavailable" units={["Try another file or paste your material as text."]}><p>Try another file or paste your material as text.</p></Readable><button type="button" disabled={Boolean(busy)} onClick={startOver}>Choose another material</button></section>}
    {stage === 1 && snapshot && <section className="support-studio loading-surface" aria-labelledby="support-title">
      <div className="loading-underlay" inert={Boolean(busy)}>
      <p className="selected-material">{snapshot.material.title}</p>
      <p className="adapt-eyebrow">You choose how to engage</p><h2 id="support-title" ref={heading} tabIndex={-1}>What would make learning more comfortable?</h2><p>Choose what helps, or tell us in your own words.</p>
      <form onSubmit={adapt} aria-busy={Boolean(busy)}><fieldset disabled={Boolean(busy)}><legend className="visually-hidden">Choose accessibility needs and preferences</legend>
        <div className="access-grid">{accessOptions.map(option => <label className={`access-card ${needs.includes(option.id) ? "selected" : ""}`} key={option.id}><input type="checkbox" checked={needs.includes(option.id)} onChange={event => setNeeds(event.target.checked ? [...needs, option.id] : needs.filter(value => value !== option.id))} /><span><strong>{option.label}</strong><span>{option.description}</span></span></label>)}</div>
        <VoiceField id="access-description" label="Anything else that helps? (optional)" value={description} onChange={setDescription} maxLength={800} placeholder="For example, long paragraphs are hard to follow. Keep the ideas connected in short steps." disabled={Boolean(busy)} />
        <details className="optional-focus" onToggle={event => setFocusOpen(event.currentTarget.open)}><summary>Something particular you want to learn? (optional)</summary>{focusOpen && <VoiceField id="learning-focus" label="Your learning focus (optional)" value={focus} onChange={setFocus} maxLength={500} disabled={Boolean(busy)} />}</details>
        <button disabled={(!needs.length && !description.trim()) || Boolean(busy)}>Create my learning experience <span aria-hidden="true">→</span></button>
      </fieldset></form>
      <button type="button" className="adapt-secondary" disabled={Boolean(busy)} onClick={startOver}>Choose another material</button>
      </div><LoadingExperience active={Boolean(busy)} onCancel={() => controller.current?.abort()} />
    </section>}
    {stage === 2 && snapshot && <section className="adapt-experience" aria-labelledby="experience-title">
      <div className="experience-heading"><div><p className="adapt-eyebrow">Your material. Your way in.</p><h1 id="experience-title" ref={heading} tabIndex={-1}>{snapshot.material.title}</h1><div className="preference-tags">{snapshot.preferences?.needs.map(need => <span key={need}>{accessOptions.find(option => option.id === need)?.label}</span>)}</div></div><button type="button" className="adapt-secondary" onClick={startOver}>Bring new material</button></div>
      {partialState && <p role="status" aria-live="polite" aria-atomic="true">{partialState === "reading" ? "You can start reading. The rest of your lesson is still getting ready." : partialState === "complete" ? "Your complete lesson is ready." : "This lesson is incomplete. You can try preparing the whole lesson."}</p>}
      {partialState === "reading" && <button ref={stopProgress} type="button" className="adapt-secondary" onClick={() => { stopReading(); controller.current?.abort(); }}>Stop preparing</button>}
      {partialState === "incomplete" && <button ref={fallbackAction} type="button" onClick={() => void adapt(undefined, true)}>Prepare the whole lesson</button>}
      <AdaptedLearning key={partialSections.length ? snapshot.fingerprint : `${snapshot.fingerprint}:${snapshot.revision}`} snapshot={snapshot} partialSections={partialSections.length ? partialSections : undefined} practice={() => request<{ questions: UnderstandingQuestion[] }>("/api/learning/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fingerprint: snapshot.fingerprint, revision: snapshot.revision }) })} />
    </section>}
    {stage === 0 && <section className="adapt-demo-invitation"><div><p className="adapt-eyebrow">Explore a worked example</p><h2>A diagram. A different way to understand it.</h2><p>Explore a binary-tree lesson with clear descriptions and practice.</p></div><Link href="/demo">Try a sample lesson <span aria-hidden="true">↗</span></Link></section>}
  </>;
}
