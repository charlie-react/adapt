import "server-only";
import { AUDIO_LIMITS } from "./limits";
import { RequestFailure } from "../server/request";
import type { AudioTranscriber, TranscriptSegment, TranscriptWord } from "./transcription";

export const GEMINI_TRANSCRIPTION_MODEL = "gemini-3.5-transcribe";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";
const invalid = () => new RequestFailure("INVALID_TRANSCRIPTION", 502);
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
function seconds(value: unknown) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?s$/.test(value)) throw invalid();
  return Number(value.slice(0, -1));
}

/** Preserve exact text and provider word offsets; never repair missing/invalid timing. */
export function parseGeminiTranscript(value: unknown, duration: number): TranscriptSegment[] {
  const response = record(value);
  if (response.status !== "completed" || response.model !== GEMINI_TRANSCRIPTION_MODEL || !Array.isArray(response.steps)) throw invalid();
  const parts = response.steps.filter(step => record(step).type === "model_output").flatMap(step => {
    const content = record(step).content;
    if (!Array.isArray(content)) throw invalid();
    return content;
  });
  if (parts.length !== 1) throw invalid();
  const part = record(parts[0]), text = part.text;
  if (part.type !== "text" || typeof text !== "string" || !text.trim()) throw new RequestFailure("NO_SPEECH", 422);
  if (text.length > AUDIO_LIMITS.transcriptCharacters) throw new RequestFailure("RESOURCE_LIMIT", 413);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text) || (response.output_text !== undefined && response.output_text !== text) || !Array.isArray(part.annotations)) throw invalid();
  const annotations = part.annotations.filter(item => record(item).type === "word_info");
  if (!annotations.length || annotations.length > AUDIO_LIMITS.words) throw invalid();
  let previousIndex = 0, previousTime = 0;
  const words: TranscriptWord[] = annotations.map(value => {
    const word = record(value), startIndex = word.start_index, endIndex = word.end_index;
    const start = seconds(word.start_offset), end = seconds(word.end_offset);
    if (typeof startIndex !== "number" || typeof endIndex !== "number" || !Number.isSafeInteger(startIndex) || !Number.isSafeInteger(endIndex) || startIndex < previousIndex || endIndex <= startIndex || endIndex > text.length || typeof word.text !== "string" || text.slice(startIndex, endIndex) !== word.text || text.slice(previousIndex, startIndex).trim() || start < previousTime || end > duration) throw invalid();
    // Rounded provider word offsets can identify a point, not a speech interval.
    // Preserve that distinction; segment ranges below still require end > start.
    const timing: TranscriptWord = start === end
      ? { text: word.text, startIndex, endIndex, timing: "point", at: start }
      : { text: word.text, startIndex, endIndex, timing: "interval", start, end };
    if (timing.timing === "interval" && timing.end <= timing.start) throw invalid();
    previousIndex = endIndex; previousTime = end;
    return timing;
  });
  if (text.slice(previousIndex).trim()) throw invalid();
  const first = words[0], last = words.at(-1)!;
  const start = first.timing === "point" ? first.at : first.start;
  const end = last.timing === "point" ? last.at : last.end;
  if (end <= start) throw invalid();
  return [{ id: "gemini-transcript-1", text, start, end, words }];
}

export function createGeminiTranscriber(config: { apiKey?: string; disabled?: boolean } = {}, transport: typeof fetch = fetch): AudioTranscriber {
  return { service: "gemini-transcribe", model: GEMINI_TRANSCRIPTION_MODEL, async transcribe(audio, signal, original) {
    signal.throwIfAborted();
    const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
    if (config.disabled) throw new RequestFailure("TRANSCRIPTION_UNAVAILABLE", 503);
    if (!apiKey?.trim()) throw new RequestFailure("TRANSCRIPTION_ACCESS", 503);
    if (!original?.length || original.length > AUDIO_LIMITS.bytes) throw new RequestFailure("INVALID_AUDIO", 422);
    const response = await transport(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, signal, cache: "no-store", redirect: "error",
      body: JSON.stringify({ model: GEMINI_TRANSCRIPTION_MODEL, input: [{ type: "audio", mime_type: audio.format === "mp3" ? "audio/mp3" : "audio/wav", data: Buffer.from(original).toString("base64") }], generation_config: { transcription_config: { mode: { type: "verbatim", timestamp_granularities: ["word"] } } }, store: false }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      // Only status is retained. Provider bodies may contain source data or secrets.
      const error = new RequestFailure([401, 403].includes(response.status) ? "TRANSCRIPTION_ACCESS" : "TRANSCRIPTION_UNAVAILABLE", 503);
      error.cause = { provider: "gemini-transcribe", httpStatus: response.status };
      throw error;
    }
    const reader = response.body?.getReader(); if (!reader) throw invalid();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { signal.throwIfAborted(); const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > AUDIO_LIMITS.responseBytes) throw new RequestFailure("RESOURCE_LIMIT", 413); chunks.push(next.value); }
    } finally { await reader.cancel(); reader.releaseLock(); }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw invalid(); }
    return parseGeminiTranscript(value, audio.duration);
  } };
}
