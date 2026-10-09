/** Small synthetic PCM tone/silence; no private speech or external fixture downloads. */
export function wavAudio(seconds = 1, channels = 1, rate = 16000, bits = 16) {
  const size = Math.floor(seconds * rate) * channels * bits / 8, b = Buffer.alloc(44 + size);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * bits / 8, 28); b.writeUInt16LE(channels * bits / 8, 32); b.writeUInt16LE(bits, 34); b.write("data", 36); b.writeUInt32LE(size, 40);
  return b;
}
/** Complete MPEG-1 Layer III silent frames (128 kbps, 44.1 or 48 kHz). */
export function mp3Audio(frames = 40, rate: 44100 | 48000 = 44100) {
  const size = rate === 48000 ? 384 : 417, b = Buffer.alloc(frames * size);
  for (let frame = 0; frame < frames; frame++) { b[frame * size] = 255; b[frame * size + 1] = 251; b[frame * size + 2] = rate === 48000 ? 148 : 144; }
  return b;
}
