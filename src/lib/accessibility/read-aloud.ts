export type ReadingState = "checking" | "unsupported" | "idle" | "playing" | "paused" | "stopped" | "finished" | "error";
export type SpeechPort = Pick<SpeechSynthesis, "speak" | "pause" | "resume" | "cancel"> & {
  createUtterance(text: string): SpeechSynthesisUtterance;
};

function browserSpeech(): SpeechPort | null {
  try {
    if (typeof window === "undefined" || typeof window.SpeechSynthesisUtterance !== "function") return null;
    const synthesis = window.speechSynthesis;
    if (!synthesis || ["speak", "pause", "resume", "cancel"].some((method) => typeof synthesis[method as keyof SpeechSynthesis] !== "function")) return null;
    return {
      speak: (utterance) => synthesis.speak(utterance),
      pause: () => synthesis.pause(),
      resume: () => synthesis.resume(),
      cancel: () => synthesis.cancel(),
      createUtterance: (text) => new window.SpeechSynthesisUtterance(text),
    };
  } catch { return null; }
}

// Queue whole semantic units. Never split a statement at an arbitrary length.
export function speechChunks(paragraphs: readonly string[]): string[] {
  return paragraphs.map(paragraph => paragraph.trim()).filter(Boolean);
}

const speechSession: { reader?: ReadAloudController } = {};

// One browser-owned session across all controls. No engine/provider dependencies.
export class ReadAloudController {
  private state: ReadingState = "checking";
  private listeners = new Set<() => void>();
  private port: SpeechPort | null = null;
  private utterance?: SpeechSynthesisUtterance;
  private chunks: string[] = [];
  private index = 0;
  private language = "";

  constructor(private getPort: () => SpeechPort | null = browserSpeech) {}

  getSnapshot = (): ReadingState => this.state;
  getServerSnapshot = (): ReadingState => "checking";
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.state === "checking") {
      this.port = this.getPort();
      this.update(this.port ? "idle" : "unsupported");
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.stop();
    };
  };

  private update(state: ReadingState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  private detach() {
    if (this.utterance) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
      this.utterance = undefined;
    }
  }

  private fail() {
    this.detach();
    if (speechSession.reader === this) {
      speechSession.reader = undefined;
      try { this.port?.cancel(); } catch { /* Browser speech service failed. */ }
    }
    this.update("error");
  }

  private speakNext() {
    if (!this.port || speechSession.reader !== this) return;
    if (this.index >= this.chunks.length) {
      speechSession.reader = undefined;
      this.update("finished");
      return;
    }
    try {
      const utterance = this.port.createUtterance(this.chunks[this.index]);
      if (this.language) utterance.lang = this.language;
      this.utterance = utterance; // Retain it until completion/cancellation.
      utterance.onend = () => {
        if (this.utterance !== utterance || speechSession.reader !== this) return;
        this.detach();
        this.index++;
        if (this.state !== "paused") this.speakNext();
      };
      utterance.onerror = () => {
        if (this.utterance === utterance && speechSession.reader === this) this.fail();
      };
      this.port.speak(utterance);
    } catch { this.fail(); }
  }

  play(paragraphs: readonly string[], language = "") {
    if (!this.port) return;
    speechSession.reader?.stop();
    this.chunks = speechChunks(paragraphs);
    this.index = 0;
    this.language = language;
    if (!this.chunks.length) return;
    speechSession.reader = this;
    this.update("playing");
    try {
      // A canceled paused session can leave the browser's queue paused.
      this.port.resume();
      this.speakNext();
    } catch { this.fail(); }
  }

  pause() {
    if (speechSession.reader !== this || this.state !== "playing") return;
    try { this.port!.pause(); this.update("paused"); } catch { this.fail(); }
  }

  resume() {
    if (speechSession.reader !== this || this.state !== "paused") return;
    try {
      this.update("playing");
      this.port!.resume();
      if (!this.utterance) this.speakNext();
    } catch { this.fail(); }
  }

  stop = () => {
    if (speechSession.reader !== this) return;
    this.detach(); // Ignore browser cancellation events from an obsolete utterance.
    speechSession.reader = undefined;
    try { this.port?.cancel(); this.update("stopped"); } catch { this.update("error"); }
  };
}
