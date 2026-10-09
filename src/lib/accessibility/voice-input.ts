export type VoiceState = "checking" | "ready" | "listening" | "stopped" | "unsupported" | "denied" | "error";
export type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
export interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: { length: number; [index: number]: RecognitionResult } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
export type RecognitionFactory = () => BrowserRecognition;
let stopOwner: (() => void) | undefined;
export function browserRecognitionFactory(): RecognitionFactory | undefined {
  if (typeof window === "undefined") return;
  const browser = window as unknown as { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition };
  const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
  return Constructor ? () => new Constructor() : undefined;
}
export class VoiceInput {
  private state: VoiceState = "checking"; private listeners = new Set<() => void>(); private recognition?: BrowserRecognition; private token = 0; private factory?: RecognitionFactory;
  getSnapshot = () => this.state;
  getServerSnapshot = (): VoiceState => "checking";
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(state: VoiceState) { this.state = state; this.listeners.forEach(listener => listener()); }
  connect(factory = browserRecognitionFactory()) { this.factory = factory; this.set(factory ? "ready" : "unsupported"); }
  start(language: string, onTranscript: (text: string) => void) {
    if (!this.factory) { this.set("unsupported"); return; }
    if (stopOwner && stopOwner !== this.dispose) stopOwner(); this.abort(); stopOwner = this.dispose;
    const token = this.token, final = new Set<number>();
    try {
      const recognition = this.factory(); this.recognition = recognition;
      recognition.lang = language; recognition.continuous = false; recognition.interimResults = false;
      recognition.onresult = event => {
        if (token !== this.token) return;
        const phrases: string[] = [];
        for (let index = event.resultIndex; index < event.results.length; index++) if (event.results[index].isFinal && !final.has(index)) { final.add(index); const text = event.results[index][0].transcript.trim(); if (text) phrases.push(text); }
        if (phrases.length) onTranscript(phrases.join(" "));
      };
      recognition.onerror = event => { if (token === this.token) { this.set(["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error) ? "denied" : "error"); if (stopOwner === this.dispose) stopOwner = undefined; } };
      recognition.onend = () => { if (token === this.token) { if (this.state === "listening") this.set("stopped"); if (stopOwner === this.dispose) stopOwner = undefined; } };
      this.set("listening"); recognition.start();
    } catch { this.set("error"); this.abort(); }
  }
  stop = () => { if (this.state !== "listening") return; try { this.recognition?.stop(); this.set("stopped"); } catch { this.abort(); this.set("error"); } };
  private abort() { this.token++; const previous = this.recognition; this.recognition = undefined; if (previous) { previous.onresult = null; previous.onerror = null; previous.onend = null; try { previous.abort(); } catch {} } if (stopOwner === this.dispose) stopOwner = undefined; }
  dispose = () => { this.abort(); if (this.state === "listening") this.set("stopped"); };
}
export function appendDictation(value: string, phrase: string, max: number) { return (value + (value && !/\s$/.test(value) ? " " : "") + phrase).slice(0, max); }
