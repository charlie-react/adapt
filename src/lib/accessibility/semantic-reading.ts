import { ReadAloudController } from "./read-aloud";
export type ReadingRegion = { label: string; units: readonly string[]; language?: string };
// Authors supply complete units; speech never comes from DOM text extraction.
export function readingUnits(units: readonly string[]): string[] {
  return units.map(unit => unit.trim()).filter(Boolean).map(unit => /[.!?…]["'”’)]?$/.test(unit) ? unit : `${unit}.`);
}
export class SemanticReadingEngine {
  private regions = new Map<string, ReadingRegion>();
  private current?: string;
  private active?: string;
  private pending?: ReturnType<typeof setTimeout>;
  enabled = false;
  constructor(readonly speech = new ReadAloudController()) {}
  register(id: string, region: ReadingRegion) {
    this.regions.set(id, region);
    return () => {
      this.regions.delete(id);
      if (this.active === id) this.stop();
      if (this.current === id) this.current = undefined;
    };
  }
  setEnabled(enabled: boolean) { this.enabled = enabled; this.stop(); this.current = undefined; }
  enter(id: string, delay = 0) {
    if (!this.enabled || this.current === id || !this.regions.has(id)) return;
    this.clearPending();
    const read = () => {
      this.pending = undefined;
      const region = this.regions.get(id);
      if (!this.enabled || !region) return;
      this.current = id;
      this.active = id;
      this.speech.play(readingUnits(region.units), region.language);
    };
    if (delay) this.pending = setTimeout(read, delay); else read();
  }
  leave(id: string) { this.clearPending(); if (this.current === id) this.current = undefined; }
  private clearPending() { if (this.pending) clearTimeout(this.pending); this.pending = undefined; }
  // Retain identity so Stop does not restart the same region.
  stop = () => { this.clearPending(); this.speech.stop(); this.active = undefined; };
}
