import type { SourceUnit } from "./types";
export function sourceLabel(unit?: Omit<SourceUnit, "text">, time?: number) {
  if (!unit) return "Source material";
  if (unit.locator.kind === "pdf") return `Page ${unit.locator.page}${unit.locator.label ? ` · original label ${unit.locator.label}` : ""}`;
  if (unit.locator.kind === "video") return time === undefined ? "Original video" : `Video · ${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, "0")}`;
  if (unit.locator.kind === "audio") return "Original audio";
  if (unit.transcription) {
    const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${(Math.floor((seconds % 60) * 10) / 10).toFixed(1).padStart(4, "0")}`;
    return `Machine transcript · ${stamp(unit.locator.startSeconds!)}–${stamp(unit.locator.endSeconds!)}`;
  }
  return unit.locator.kind === "image" ? "Original image" : unit.locator.kind === "transcript" ? "Supplied transcript" : "Original text";
}
