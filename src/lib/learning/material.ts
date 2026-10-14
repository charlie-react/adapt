import "server-only";
import { LEARNING_LIMITS } from "./limits";
import { createHash } from "node:crypto";
import { inspectPdfSource } from "../ingestion/pdf/adapter";
import { pageBlocks } from "../ingestion/pdf/normalize";
import { RequestFailure } from "../server/request";
import type { LearningMaterial, SourceUnit } from "./types";
import { decodeAudio, isAudio, type DecodedAudio } from "./audio";
export const MATERIAL_LIMITS = { textCharacters: 30000, pdfBytes: 4 * 1024 * 1024, imageBytes: 3 * 1024 * 1024, videoBytes: 8 * 1024 * 1024, imageDimension: 4096, videoSeconds: 120 } as const;
const fingerprint = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function title(name: string) { return name.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || "Your material"; }
export function textMaterial(text: string): LearningMaterial {
  if (!text.trim()) throw new RequestFailure("EMPTY_INPUT", 422);
  if (text.length > MATERIAL_LIMITS.textCharacters) throw new RequestFailure("RESOURCE_LIMIT", 413);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text)) throw new RequestFailure("INVALID_TEXT", 422);
  const hash = fingerprint(new TextEncoder().encode(text));
  return { id: `text:${hash}`, kind: "text", title: "Your learning material", fingerprint: hash, limitations: [], units: [{ id: "text-1", text, locator: { kind: "text", start: 0, end: text.length } }] };
}
function imageFormat(bytes: Uint8Array): "png" | "jpeg" {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength); let width = 0, height = 0;
  if (b.length >= 45 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let offset = 8, chunks = 0, image = false, end = false;
    while (offset + 12 <= b.length && ++chunks < 2000) {
      const size = b.readUInt32BE(offset); if (offset + size + 12 > b.length) throw new RequestFailure("INVALID_IMAGE", 422);
      const type = b.toString("ascii", offset + 4, offset + 8);
      if (chunks === 1) { if (type !== "IHDR" || size !== 13) throw new RequestFailure("INVALID_IMAGE", 422); width = b.readUInt32BE(offset + 8); height = b.readUInt32BE(offset + 12); }
      if (type === "IDAT" && size > 0) image = true;
      offset += size + 12;
      if (type === "IEND") { end = size === 0 && offset === b.length; break; }
    }
    if (!end || !image) throw new RequestFailure("INVALID_IMAGE", 422);
  } else if (b.length > 10 && b[0] === 255 && b[1] === 216 && b[b.length - 2] === 255 && b[b.length - 1] === 217) {
    let offset = 2;
    while (offset + 4 < b.length) {
      if (b[offset++] !== 255) break; while (b[offset] === 255) offset++;
      const marker = b[offset++]; if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const size = b.readUInt16BE(offset); if (size < 2 || offset + size > b.length) break;
      if ([192, 193, 194].includes(marker) && size >= 8) { height = b.readUInt16BE(offset + 3); width = b.readUInt16BE(offset + 5); }
      offset += size;
    }
  } else throw new RequestFailure("INVALID_IMAGE", 422);
  if (!width || !height) throw new RequestFailure("INVALID_IMAGE", 422);
  if (width > MATERIAL_LIMITS.imageDimension || height > MATERIAL_LIMITS.imageDimension) throw new RequestFailure("RESOURCE_LIMIT", 413);
  return b[0] === 137 ? "png" : "jpeg";
}
export function mp4Duration(bytes: Uint8Array): number {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength); let duration = 0, video = false, boxes = 0;
  function walk(start: number, end: number, depth: number) {
    if (depth > 8) throw new RequestFailure("INVALID_VIDEO", 422);
    let offset = start;
    while (offset < end) {
      if (++boxes > 5000 || offset + 8 > end) throw new RequestFailure("INVALID_VIDEO", 422);
      let size = b.readUInt32BE(offset), header = 8; const type = b.toString("ascii", offset + 4, offset + 8);
      if (size === 1) { if (offset + 16 > end) throw new RequestFailure("INVALID_VIDEO", 422); const big = b.readBigUInt64BE(offset + 8); if (big > BigInt(end)) throw new RequestFailure("INVALID_VIDEO", 422); size = Number(big); header = 16; }
      if (size === 0) size = end - offset;
      if (size < header || offset + size > end) throw new RequestFailure("INVALID_VIDEO", 422);
      const data = offset + header;
      if (type === "mvhd") {
        const version = b[data], t = version === 0 ? data + 12 : data + 20;
        if (![0, 1].includes(version) || t + (version === 0 ? 8 : 12) > offset + size) throw new RequestFailure("INVALID_VIDEO", 422);
        const scale = b.readUInt32BE(t), ticks = version === 0 ? b.readUInt32BE(t + 4) : Number(b.readBigUInt64BE(t + 4)); duration = ticks / scale;
      }
      if (type === "hdlr" && data + 12 <= offset + size && b.toString("ascii", data + 8, data + 12) === "vide") video = true;
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) walk(data, offset + size, depth + 1);
      offset += size;
    }
  }
  if (b.length < 24 || b.toString("ascii", 4, 8) !== "ftyp") throw new RequestFailure("INVALID_VIDEO", 422);
  walk(0, b.length, 0);
  if (!video || !Number.isFinite(duration) || duration <= 0) throw new RequestFailure("INVALID_VIDEO", 422);
  if (duration > MATERIAL_LIMITS.videoSeconds) throw new RequestFailure("RESOURCE_LIMIT", 413);
  return duration;
}
export async function fileMaterial(bytes: Uint8Array, name: string, signal?: AbortSignal, receiveAudio?: (audio: DecodedAudio) => void): Promise<LearningMaterial> {
  if (!bytes.length) throw new RequestFailure("EMPTY_INPUT", 422);
  if (bytes.length > LEARNING_LIMITS.uploadBytes) throw new RequestFailure("RESOURCE_LIMIT", 413);
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), hash = fingerprint(bytes);
  if (isAudio(bytes) || /\.(mp3|wav)$/i.test(name)) {
    const decoded = await decodeAudio(bytes, signal);
    receiveAudio?.(decoded); // Request-local reuse only; PCM is never added to stored material.
    return { id: `audio:${hash}`, kind: "audio", title: title(name), fingerprint: hash, bytes: Uint8Array.from(bytes), format: decoded.format, units: [{ id: "audio-1", locator: { kind: "audio", duration: decoded.duration } }], limitations: decoded.channels > 1 ? ["Stereo audio is mixed to one channel for transcription. Overlapping speakers may be difficult to distinguish."] : [] };
  }
  if (b.subarray(0, 5).toString() === "%PDF-") {
    if (bytes.length > MATERIAL_LIMITS.pdfBytes) throw new RequestFailure("RESOURCE_LIMIT", 413);
    const result = await inspectPdfSource({ bytes, mediaType: "application/pdf" }, signal);
    if (!result.ok) throw new RequestFailure(result.code, result.code === "RESOURCE_LIMIT" ? 413 : 422);
    const units: SourceUnit[] = result.pdf.pages.map(page => {
      const normalized = pageBlocks(page, `pdf-v2:${hash}`);
      const unreliable = normalized.warnings.some(warning => ["READING_ORDER_UNCERTAIN", "CODE_FORMATTING_UNCERTAIN", "TEXT_DECODE_WARNING", "UNSUPPORTED_STRUCTURE"].includes(warning.code));
      return { id: `p${page.pageNumber}`, locator: { kind: "pdf", page: page.pageNumber, label: page.pageLabel }, text: unreliable ? undefined : normalized.blocks.map(block => block.text).join("\n\n") || undefined };
    });
    return { id: `pdf:${hash}`, kind: "pdf", title: title(name), fingerprint: hash, bytes: Uint8Array.from(bytes), format: "pdf", units, limitations: ["Visual and mathematical explanations are AI interpretations of the original pages, not verified reconstructions. Unclear details must remain uncertain."] };
  }
  if (b[0] === 137 || (b[0] === 255 && b[1] === 216)) {
    if (bytes.length > MATERIAL_LIMITS.imageBytes) throw new RequestFailure("RESOURCE_LIMIT", 413);
    const format = imageFormat(bytes);
    return { id: `image:${hash}`, kind: "image", title: title(name), fingerprint: hash, bytes: Uint8Array.from(bytes), format, units: [{ id: "image-1", locator: { kind: "image" } }], limitations: ["Visual descriptions are AI interpretations. Small, blurry or obscured details may not be readable."] };
  }
  if (b.toString("ascii", 4, 8) === "ftyp") {
    if (bytes.length > MATERIAL_LIMITS.videoBytes) throw new RequestFailure("RESOURCE_LIMIT", 413);
    const duration = mp4Duration(bytes);
    return { id: `video:${hash}`, kind: "video", title: title(name), fingerprint: hash, bytes: Uint8Array.from(bytes), format: "mp4", units: [{ id: "video-1", locator: { kind: "video", duration } }], limitations: ["The original video is retained. This adaptation uses a supplied transcript, not video images or audio."] };
  }
  if (/\.(txt|md)$/i.test(name)) { let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new RequestFailure("INVALID_TEXT", 422); } return { ...textMaterial(text), title: title(name) }; }
  throw new RequestFailure("UNSUPPORTED_FORMAT", 422);
}
export function withTranscript(material: LearningMaterial, transcript: string): LearningMaterial {
  if (!transcript.trim()) return material;
  if (material.kind !== "video") throw new RequestFailure("INVALID_REQUEST");
  const text = textMaterial(transcript);
  return { ...material, units: [...material.units, { ...text.units[0], id: "transcript-1", locator: { kind: "transcript", start: 0, end: transcript.length } }], limitations: [...material.limitations, "The supplied transcript is learner-provided text; it has not been verified against the audio."] };
}
/** Claude accepts text/images/PDFs; retained video bytes are not sent as supported input. */
export function sourceForAdaptation(material: LearningMaterial): LearningMaterial {
  if (material.kind !== "video" && material.kind !== "audio") return material;
  const units = material.units.filter(unit => unit.locator.kind === "transcript" && unit.text?.trim());
  if (!units.length) throw new RequestFailure(material.kind === "audio" ? "NO_SPEECH" : "TRANSCRIPT_REQUIRED", 422);
  if (material.kind === "audio") {
    const audio = material.units.find(unit => unit.id === "audio-1" && unit.locator.kind === "audio");
    const sourceHash = material.bytes && fingerprint(material.bytes);
    let previous = 0;
    if (!audio?.locator.duration || !sourceHash) throw new RequestFailure("INVALID_TRANSCRIPTION", 422);
    for (const unit of units) {
      const origin = unit.transcription, start = unit.locator.startSeconds, end = unit.locator.endSeconds;
      if (origin?.sourceId !== audio.id || origin.sourceFingerprint !== sourceHash || !["amazon-transcribe", "gemini-transcribe"].includes(origin.service) || start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end) || start < previous || end <= start || end > audio.locator.duration) throw new RequestFailure("INVALID_TRANSCRIPTION", 422);
      previous = end;
    }
  }
  return { ...material, units, bytes: undefined, format: undefined };
}
