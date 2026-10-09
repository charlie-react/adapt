import "server-only";
import { AUDIO_LIMITS } from "./limits";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { StartStreamTranscriptionCommand, TranscribeStreamingClient, type StartStreamTranscriptionCommandOutput, type AudioStream } from "@aws-sdk/client-transcribe-streaming";
import { RequestFailure } from "../server/request";
import type { DecodedAudio } from "./audio";
import type { LearningMaterial, SourceUnit } from "./types";
import { createGeminiTranscriber } from "./gemini-transcription";

export type TranscriptWord = { text: string; startIndex: number; endIndex: number } & ({ timing: "interval"; start: number; end: number } | { timing: "point"; at: number });
export type TranscriptSegment = { id: string; text: string; start: number; end: number; confidence?: number; words?: TranscriptWord[] };
export type AudioTranscriber = { service?: "amazon-transcribe" | "gemini-transcribe"; model?: string; transcribe(audio: DecodedAudio, signal: AbortSignal, original?: Uint8Array): Promise<TranscriptSegment[]> };
type Transport = (command: StartStreamTranscriptionCommand, signal: AbortSignal) => Promise<StartStreamTranscriptionCommandOutput>;
export const TRANSCRIPTION_NOTICE = "This machine transcript may mishear words, names, numbers or notation. Adaptations use the transcript, not independently verified audio. Non-speech sounds and unstated visual information are not reconstructed.";
export async function transcribeAudio(audio: DecodedAudio, transcriber: AudioTranscriber, signal: AbortSignal, original?: Uint8Array) {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { abort = () => reject(transcriptionFailure(signal.reason)); signal.addEventListener("abort", abort, { once: true }); });
  try { return await Promise.race([transcriber.transcribe(audio, signal, original), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

/** Audio is sent as mono PCM, paced in 100 ms chunks; no S3, credentials, identity or preferences in the request. */
export async function* audioEvents(audio: DecodedAudio, signal: AbortSignal): AsyncGenerator<AudioStream, void, unknown> {
  const size = Math.floor(audio.sampleRate / 10) * 2;
  for (let offset = 0; offset < audio.pcm.length; offset += size) {
    signal.throwIfAborted(); yield { AudioEvent: { AudioChunk: audio.pcm.subarray(offset, offset + size) } };
    await delay(100, undefined, { signal });
  }
}
export function transcriptionFailure(error: unknown): RequestFailure {
  if (error instanceof RequestFailure) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") return new RequestFailure("ABORTED", 408);
  if (name === "TimeoutError") return new RequestFailure("TIMEOUT", 408);
  const failure = new RequestFailure(/AccessDenied|UnrecognizedClient|CredentialsProvider|ExpiredToken|InvalidSignature/.test(name) ? "TRANSCRIPTION_ACCESS" : "TRANSCRIPTION_UNAVAILABLE", 503);
  // Preserve the AWS exception for local diagnostics only; HTTP responses never serialize it.
  failure.cause = error;
  return failure;
}
export function createAudioTranscriber(config: { region?: string; disabled?: boolean } = {}, transport?: Transport): AudioTranscriber {
  return { async transcribe(audio, signal) {
    signal.throwIfAborted();
    if (config.disabled) throw new RequestFailure("TRANSCRIPTION_UNAVAILABLE", 503);
    const client = transport ? undefined : new TranscribeStreamingClient({ region: config.region || "eu-central-1", maxAttempts: 1 });
    try {
      const command = new StartStreamTranscriptionCommand({ LanguageCode: "en-US", MediaEncoding: "pcm", MediaSampleRateHertz: audio.sampleRate, AudioStream: audioEvents(audio, signal) });
      const response = transport ? await transport(command, signal) : await client!.send(command, { abortSignal: signal });
      if (!response.TranscriptResultStream) throw new RequestFailure("INVALID_TRANSCRIPTION", 502);
      const segments: TranscriptSegment[] = [], seen = new Set<string>(); let characters = 0;
      for await (const event of response.TranscriptResultStream) {
        signal.throwIfAborted();
        if (!event.TranscriptEvent) throw new RequestFailure("INVALID_TRANSCRIPTION", 502);
        for (const result of event.TranscriptEvent.Transcript?.Results || []) {
          if (result.IsPartial === true) continue;
          if (result.IsPartial !== false) throw new RequestFailure("INVALID_TRANSCRIPTION", 502);
          const alternative = result.Alternatives?.[0];
          if (!alternative?.Transcript?.trim()) continue;
          if (!result.ResultId || seen.has(result.ResultId)) throw new RequestFailure("INVALID_TRANSCRIPTION", 502);
          seen.add(result.ResultId);
          const scores = (alternative.Items || []).filter(item => item.Type === "pronunciation" && item.Confidence !== undefined).map(item => item.Confidence!);
          segments.push({ id: result.ResultId, text: alternative.Transcript, start: result.StartTime!, end: result.EndTime!, ...(scores.length ? { confidence: Math.min(...scores) } : {}) });
          characters += alternative.Transcript.length;
          if (segments.length > 24 || characters > AUDIO_LIMITS.transcriptCharacters) throw new RequestFailure("RESOURCE_LIMIT", 413);
        }
      }
      validateSegments(segments, audio.duration);
      return segments;
    } catch (error) { throw transcriptionFailure(error); }
    finally { client?.destroy(); }
  } };
}
function validateSegments(segments: TranscriptSegment[], duration: number) {
  if (!Array.isArray(segments) || !segments.length) throw new RequestFailure("NO_SPEECH", 422);
  if (segments.some(item => !item || typeof item.text !== "string")) throw new RequestFailure("INVALID_TRANSCRIPTION", 502);
  if (segments.length > 24 || segments.reduce((sum, item) => sum + item.text.length, 0) > AUDIO_LIMITS.transcriptCharacters) throw new RequestFailure("RESOURCE_LIMIT", 413);
  let previous = 0; const ids = new Set<string>();
  for (const item of segments) {
    if (typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.text !== "string" || !item.text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(item.text) || !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < previous || item.end <= item.start || item.end > duration || (item.confidence !== undefined && (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1))) throw new RequestFailure("INVALID_TRANSCRIPTION", 502);
    previous = item.end; ids.add(item.id);
  }
}
/** Attach server-owned timed transcript units without replacing the original audio unit/bytes. */
export function attachTranscription(material: LearningMaterial, segments: TranscriptSegment[], provider: Pick<AudioTranscriber, "service" | "model"> = {}): LearningMaterial {
  const audio = material.units.find(unit => unit.id === "audio-1" && unit.locator.kind === "audio");
  if (material.kind !== "audio" || !audio?.locator.duration || !material.bytes) throw new RequestFailure("INVALID_REQUEST");
  validateSegments(segments, audio.locator.duration);
  let start = 0;
  const units: SourceUnit[] = segments.map((segment, index) => {
    const unit: SourceUnit = { id: `transcript-${index + 1}`, text: segment.text, locator: { kind: "transcript", start, end: start + segment.text.length, startSeconds: segment.start, endSeconds: segment.end }, transcription: { service: provider.service || "amazon-transcribe", language: provider.service === "gemini-transcribe" ? "und" : "en-US", ...(provider.model ? { model: provider.model } : {}), ...(segment.words ? { words: structuredClone(segment.words) } : {}), sourceId: audio.id, sourceFingerprint: material.fingerprint, ...(segment.confidence !== undefined ? { confidence: segment.confidence } : {}) } };
    start += segment.text.length + 1; return unit;
  });
  const hash = createHash("sha256").update(material.fingerprint).update(JSON.stringify(units)).digest("hex");
  return { ...material, id: `${material.id}:transcript:${hash}`, fingerprint: hash, units: [...material.units, ...units], limitations: [...material.limitations, TRANSCRIPTION_NOTICE, ...(segments.some(segment => segment.confidence !== undefined && segment.confidence < 0.8) ? ["Some spoken words were recognised with low confidence. Important details may need checking against another source or accessible transcript."] : [])] };
}
export const audioTranscriber = process.env.ADAPT_TRANSCRIPTION_PROVIDER === "aws"
  ? createAudioTranscriber({ region: process.env.ADAPT_TRANSCRIBE_REGION, disabled: process.env.ADAPT_AI_DISABLE === "1" })
  : createGeminiTranscriber({ disabled: process.env.ADAPT_AI_DISABLE === "1" });
