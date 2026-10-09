/** Shared bounded MVP budgets; safe to import into the upload UI. */
export const AUDIO_LIMITS = {
  bytes: 64 * 1024 * 1024,
  seconds: 30 * 60,
  minimumSeconds: 0.5,
  transcriptCharacters: 60000,
  words: 10000,
  responseBytes: 8 * 1024 * 1024,
} as const;
export const LEARNING_LIMITS = {
  uploadBytes: AUDIO_LIMITS.bytes,
  uploadMs: 120000,
  transcriptionMs: 600000,
  adaptationMs: 600000,
  clientUploadMs: 780000,
  clientAdaptationMs: 660000,
  sessionBytes: 256 * 1024 * 1024,
  responseCharacters: 240000,
  sections: 100,
  audioParagraphs: 40,
} as const;
