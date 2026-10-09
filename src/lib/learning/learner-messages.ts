/** Presentation copy only. Internal error codes and diagnostics remain unchanged. */
const messages: Record<string, string> = {
  EMPTY_INPUT: "Choose a file or add some text first.",
  RESOURCE_LIMIT: "Choose a smaller file or a shorter recording. PDF: up to 100 pages / 4 MB. Audio: up to 30 minutes / 64 MB.",
  UNSUPPORTED_FORMAT: "Choose a PDF, image, audio or text file.",
  PASSWORD_PROTECTED: "Choose a PDF that opens without a password.",
  INVALID_AUDIO: "We couldn’t open this recording. Try another MP3 or WAV file.",
  NO_SPEECH: "We couldn’t hear clear speech. Try another recording or paste the words as text.",
  INVALID_TRANSCRIPTION: "We couldn’t use this recording. Try another recording or paste the words as text.",
  TRANSCRIPTION_ACCESS: "We couldn’t use this recording right now. Try again or paste the words as text.",
  TRANSCRIPTION_UNAVAILABLE: "We couldn’t use this recording right now. Try again or paste the words as text.",
  TRANSCRIPT_REQUIRED: "Choose a PDF, image, audio or text file.",
  INVALID_TEXT: "Try pasting the text again.",
  INVALID_IMAGE: "We couldn’t open this image. Try another image.",
  INVALID_VIDEO: "Choose a PDF, image, audio or text file.",
  INVALID_PDF: "We couldn’t open this PDF. Try another copy.",
  NOT_PDF: "We couldn’t open this PDF. Try another copy.",
  EXTRACTION_FAILED: "We couldn’t open this file. Try another copy.",
  NOT_READY: "Try another file or paste your material as text.",
  EXPIRED: "Please add your material again to continue.",
  STALE_MATERIAL: "Please add your material again to continue.",
  BUSY: "Please try again in a moment.",
  ABORTED: "Cancelled. You can try again when you’re ready.",
};
export function learnerMessage(code?: string): string {
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code] : "We couldn’t finish that. Please try again.";
}
export class LearnerActionError extends Error {
  constructor(code?: string) { super(learnerMessage(code)); }
}
export function learnerFailure(error: unknown): string {
  if (error instanceof LearnerActionError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return learnerMessage("ABORTED");
  return learnerMessage();
}
