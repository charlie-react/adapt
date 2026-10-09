"use client";
import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore } from "react";
import { SemanticReadingEngine, type ReadingRegion } from "@/lib/accessibility/semantic-reading";
const ReadingContext = createContext<{ engine: SemanticReadingEngine; enabled: boolean; setEnabled(value: boolean): void } | null>(null);
function useReading() {
  const context = useContext(ReadingContext);
  if (!context) throw new Error("Reading content requires ReadingProvider");
  return context;
}
// Dictation explicitly interrupts playback to avoid recording synthesized speech.
export function useStopReadAloud() { const { engine } = useReading(); return () => engine.stop(); }
export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [engine] = useState(() => new SemanticReadingEngine());
  const [enabled, updateEnabled] = useState(false);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") engine.stop(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("pagehide", engine.stop);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("pagehide", engine.stop); engine.stop(); };
  }, [engine]);
  return <ReadingContext.Provider value={{ engine, enabled, setEnabled(value) { engine.setEnabled(value); updateEnabled(value); } }}>{children}</ReadingContext.Provider>;
}
export function ReadAloud() {
  const { engine, enabled, setEnabled } = useReading();
  const state = useSyncExternalStore(engine.speech.subscribe, engine.speech.getSnapshot, engine.speech.getServerSnapshot);
  const help = useId();
  const unsupported = state === "unsupported" || state === "checking";
  const status = state === "unsupported" ? "Read Aloud is unavailable in this browser. Text and screen-reader access remain available."
    : state === "error" ? "Read Aloud could not play audio. Move to another reading region to retry, or use text and screen-reader access."
    : !enabled ? "Read Aloud is off."
    : state === "playing" ? "Reading aloud."
    : state === "paused" ? "Read Aloud paused."
    : state === "stopped" ? "Read Aloud stopped. Move to another region to continue."
    : state === "finished" ? "Read Aloud finished."
    : "Read Aloud is on. Hover over or focus learning content to listen.";
  const active = state === "playing" || state === "paused";
  const label = state === "paused" ? "Paused" : state === "playing" ? "Reading" : "Read Aloud";
  const mode = enabled ? "On" : "Off";
  return <div className="reading-controls" role="group" aria-label="Read Aloud controls" data-mode={mode.toLowerCase()}>
    <div className="reading-toolbar">
      <div className="reading-capsule">
        <button type="button" className="reading-toggle" aria-label={`Read Aloud: ${label === "Read Aloud" ? mode : `${label} · ${mode}`}`} aria-pressed={enabled} disabled={unsupported} aria-describedby={help} onClick={() => setEnabled(!enabled)}>
          <SpeechIcon kind={state === "paused" ? "pause" : "speaker"} />
          <span>{label}</span><span className="reading-mode">{mode}</span>
        </button>
        <div className="reading-secondary" hidden={!enabled}>
          <button type="button" className="reading-action" aria-label={active ? state === "paused" ? "Resume Read Aloud" : "Pause Read Aloud" : "Playback is not active"} title={active ? state === "paused" ? "Resume Read Aloud" : "Pause Read Aloud" : "Playback is not active"} disabled={!active} onClick={() => state === "paused" ? engine.speech.resume() : engine.speech.pause()}>
            <SpeechIcon kind={state === "paused" ? "play" : "pause"} />
          </button>
          <button type="button" className="reading-action" aria-label="Stop Read Aloud" title="Stop Read Aloud" disabled={!active} onClick={engine.stop}><SpeechIcon kind="stop" /></button>
        </div>
      </div>
      <details className="reading-help">
        <summary aria-label="Read Aloud help" title="How to use Read Aloud"><span aria-hidden="true">?</span></summary>
        <div className="reading-help-panel">
          <strong>Listen your way</strong>
          <p id={help}>When on, hover briefly or Tab to outlined learning regions. Stop interrupts speech; Off disables automatic reading.</p>
          <p>Pause or resume from these controls. Press Escape to stop. Text and screen-reader access stay available.</p>
        </div>
      </details>
    </div>
    <p role="status" aria-atomic="true" className={state === "unsupported" || state === "error" ? "reading-notice small" : "reading-status-quiet"}>{status}</p>
  </div>;
}

// Match the project's existing inline SVG approach; decorative icons carry no speech labels.
function SpeechIcon({ kind }: { kind: "speaker" | "pause" | "play" | "stop" }) {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {kind === "speaker" ? <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>
      : kind === "pause" ? <><path d="M8 5v14M16 5v14" /></>
      : kind === "play" ? <path d="m8 5 11 7-11 7V5Z" />
      : <rect x="6" y="6" width="12" height="12" rx="1" />}
  </svg>;

}
export function Readable({ label, units, language = "", children }: ReadingRegion & { children: React.ReactNode }) {
  const { engine, enabled } = useReading();
  const id = useId();
  const contentKey = JSON.stringify(units);
  useEffect(() => engine.register(id, { label, units: JSON.parse(contentKey) as string[], language: language || document.documentElement.lang }), [engine, id, label, contentKey, language]);
  return <div className="reading-region" data-reading-label={label} data-reading-enabled={enabled || undefined} tabIndex={enabled ? 0 : undefined}
    onPointerEnter={(event) => { if (event.pointerType !== "touch") engine.enter(id, 200); }}
    onPointerLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) engine.leave(id); }}
    onFocus={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) engine.enter(id); }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) engine.leave(id); }}>
    {children}
  </div>;
}
