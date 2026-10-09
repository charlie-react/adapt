"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { appendDictation, VoiceInput } from "@/lib/accessibility/voice-input";
import { useStopReadAloud } from "./read-aloud";
export function VoiceField({ id, label, value, onChange, maxLength = 800, rows = 3, placeholder, disabled = false }: { id: string; label: string; value: string; onChange(value: string): void; maxLength?: number; rows?: number; placeholder?: string; disabled?: boolean }) {
  const [voice] = useState(() => new VoiceInput());
  const state = useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getServerSnapshot);
  const latest = useRef({ value, onChange }); const stopReading = useStopReadAloud();
  useEffect(() => { latest.current = { value, onChange }; }, [value, onChange]);
  useEffect(() => { voice.connect(); const escape = (event: KeyboardEvent) => { if (event.key === "Escape") voice.stop(); }; window.addEventListener("keydown", escape); window.addEventListener("pagehide", voice.dispose); return () => { voice.dispose(); window.removeEventListener("keydown", escape); window.removeEventListener("pagehide", voice.dispose); }; }, [voice]);
  useEffect(() => { if (disabled) voice.dispose(); }, [voice, disabled]);
  const listening = state === "listening";
  const message = state === "unsupported" ? "Voice input is unavailable in this browser. You can still type or paste."
    : state === "denied" ? "Microphone access is unavailable. Check browser permissions, or type instead."
    : state === "error" ? "Voice input could not finish. Try again, or type instead."
    : listening ? "Listening. Speak, then stop. Review the text before continuing."
    : state === "stopped" ? "Voice input stopped. You can edit the text."
    : "";
  return <div className="voice-field"><div className="field-heading"><label htmlFor={id}>{label}</label><button type="button" className="voice-button" disabled={disabled || state === "unsupported" || state === "checking"} aria-label={listening ? `Stop dictating ${label}` : `Dictate ${label}`} aria-pressed={listening} onClick={() => { if (listening) voice.stop(); else { stopReading(); voice.start(document.documentElement.lang || navigator.language, text => latest.current.onChange(appendDictation(latest.current.value, text, maxLength))); } }}><svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>{listening ? "Stop" : "Use voice"}</button></div><textarea id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} rows={rows} placeholder={placeholder} disabled={disabled} aria-describedby={`${id}-voice-help ${id}-voice-status`} /><p className="field-help" id={`${id}-voice-help`}>Speak or type—whichever feels easier.</p><p className="voice-status" id={`${id}-voice-status`} role="status" aria-atomic="true">{message}</p></div>;
}

