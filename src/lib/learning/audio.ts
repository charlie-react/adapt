import "server-only";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { MPEGDecoder } from "mpg123-decoder";
import { RequestFailure } from "../server/request";

import { AUDIO_LIMITS } from "./limits";
export { AUDIO_LIMITS } from "./limits";
export type DecodedAudio = { pcm: Uint8Array; sampleRate: number; duration: number; channels: number; format: "mp3" | "wav" };
const invalid = () => new RequestFailure("INVALID_AUDIO", 422);
function limits(rate: number, channels: number, duration: number) {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || ![1, 2].includes(channels) || !Number.isFinite(duration) || duration < AUDIO_LIMITS.minimumSeconds) throw invalid();
  if (duration > AUDIO_LIMITS.seconds) throw new RequestFailure("RESOURCE_LIMIT", 413);
}
export function isAudio(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  return b.toString("ascii", 0, 4) === "RIFF" || b.toString("ascii", 0, 3) === "ID3" || (b[0] === 255 && (b[1] & 224) === 224);
}
function wav(bytes: Uint8Array): DecodedAudio {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 44 || b.toString("ascii", 8, 12) !== "WAVE" || b.readUInt32LE(4) + 8 !== b.length) throw invalid();
  let fmt: Buffer | undefined, data: Buffer | undefined, chunks = 0;
  for (let offset = 12; offset < b.length;) {
    if (++chunks > 1000 || offset + 8 > b.length) throw invalid();
    const size = b.readUInt32LE(offset + 4), type = b.toString("ascii", offset, offset + 4), end = offset + 8 + size;
    if (end + (size % 2) > b.length) throw invalid();
    if (type === "fmt ") { if (fmt) throw invalid(); fmt = b.subarray(offset + 8, end); }
    if (type === "data") { if (data) throw invalid(); data = b.subarray(offset + 8, end); }
    offset = end + (size % 2);
  }
  if (!fmt || fmt.length < 16 || !data?.length) throw invalid();
  const encoding = fmt.readUInt16LE(0), channels = fmt.readUInt16LE(2), sampleRate = fmt.readUInt32LE(4), bits = fmt.readUInt16LE(14), alignment = fmt.readUInt16LE(12);
  if (!((encoding === 1 && [8, 16, 24, 32].includes(bits)) || (encoding === 3 && bits === 32)) || alignment !== channels * bits / 8 || fmt.readUInt32LE(8) !== sampleRate * alignment || data.length % alignment) throw invalid();
  const samples = data.length / alignment, duration = samples / sampleRate;
  limits(sampleRate, channels, duration);
  const pcm = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const offset = index * alignment + channel * bits / 8;
      const value = encoding === 3 ? data.readFloatLE(offset) : bits === 8 ? (data[offset] - 128) / 128 : data.readIntLE(offset, bits / 8) / 2 ** (bits - 1);
      if (!Number.isFinite(value)) throw invalid(); sum += value;
    }
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sum / channels)) * 32767), index * 2);
  }
  return { pcm, sampleRate, duration, channels, format: "wav" };
}
/** Walk actual Layer III frames before decoding: metadata/extension cannot establish validity or duration. */
function mp3Profile(b: Buffer) {
  let offset = 0, duration = 0, sampleRate = 0, frames = 0, totalSamples = 0;
  if (b.toString("ascii", 0, 3) === "ID3") {
    if (b.length < 10 || ![2, 3, 4].includes(b[3]) || b.subarray(6, 10).some(value => value > 127)) throw invalid();
    offset = 10 + (b[6] << 21 | b[7] << 14 | b[8] << 7 | b[9]) + (b[3] === 4 && (b[5] & 16) ? 10 : 0);
  }
  while (offset < b.length) {
    if (b.length - offset === 128 && b.toString("ascii", offset, offset + 3) === "TAG") break;
    if (offset + 4 > b.length || b[offset] !== 255 || (b[offset + 1] & 224) !== 224) throw invalid();
    const version = (b[offset + 1] >> 3) & 3, layer = (b[offset + 1] >> 1) & 3, rateIndex = (b[offset + 2] >> 2) & 3, bitIndex = b[offset + 2] >> 4;
    if (version === 1 || layer !== 1 || rateIndex === 3 || bitIndex === 0 || bitIndex === 15) throw invalid();
    const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const kbps = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitIndex];
    const size = Math.floor((version === 3 ? 144000 : 72000) * kbps / rate) + ((b[offset + 2] >> 1) & 1);
    if (offset + size > b.length || (sampleRate && rate !== sampleRate)) throw invalid();
    sampleRate = rate; totalSamples += version === 3 ? 1152 : 576; duration = totalSamples / rate; frames++; offset += size;
    if (duration > AUDIO_LIMITS.seconds + 0.05) throw new RequestFailure("RESOURCE_LIMIT", 413);
  }
  if (!frames) throw invalid(); limits(sampleRate, 1, duration);
  return { sampleRate, duration };
}
export async function decodeAudio(bytes: Uint8Array, signal?: AbortSignal): Promise<DecodedAudio> {
  signal?.throwIfAborted();
  if (!bytes.length) throw new RequestFailure("EMPTY_INPUT", 422);
  if (bytes.length > AUDIO_LIMITS.bytes) throw new RequestFailure("RESOURCE_LIMIT", 413);
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.toString("ascii", 0, 4) === "RIFF") return wav(bytes);
  const profile = mp3Profile(b), decoder = new MPEGDecoder();
  await decoder.ready;
  const chunks: Buffer[] = []; let samples = 0, channels = 0;
  try {
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      signal?.throwIfAborted();
      const result = decoder.decode(bytes.subarray(offset, offset + 16384));
      if (result.errors.length) throw invalid();
      if (result.samplesDecoded) {
        if (result.sampleRate !== profile.sampleRate || ![1, 2].includes(result.channelData.length)) throw invalid();
        channels = result.channelData.length; samples += result.samplesDecoded;
        if (samples / profile.sampleRate > AUDIO_LIMITS.seconds) throw new RequestFailure("RESOURCE_LIMIT", 413);
        const pcm = Buffer.alloc(result.samplesDecoded * 2);
        for (let i = 0; i < result.samplesDecoded; i++) {
          const value = result.channelData.reduce((sum, channel) => sum + channel[i], 0) / channels;
          if (!Number.isFinite(value)) throw invalid();
          pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), i * 2);
        }
        chunks.push(pcm);
      }
      await yieldTurn();
    }
    limits(profile.sampleRate, channels, samples / profile.sampleRate);
    return { pcm: Buffer.concat(chunks), sampleRate: profile.sampleRate, duration: samples / profile.sampleRate, channels, format: "mp3" };
  } finally { decoder.free(); }
}
