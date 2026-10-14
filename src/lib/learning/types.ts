export type MaterialKind = "text" | "pdf" | "image" | "video" | "audio";
export type SourceUnit = { id: string; locator: { kind: MaterialKind | "transcript"; page?: number; label?: string; start?: number; end?: number; duration?: number; startSeconds?: number; endSeconds?: number }; text?: string; transcription?: { service: "amazon-transcribe" | "gemini-transcribe"; language: "en-US" | "und"; model?: string; words?: ({ text: string; startIndex: number; endIndex: number } & ({ timing: "interval"; start: number; end: number } | { timing: "point"; at: number }))[]; sourceId: string; sourceFingerprint: string; confidence?: number } };
export type LearningMaterial = { id: string; kind: MaterialKind; title: string; units: SourceUnit[]; limitations: string[]; fingerprint: string; bytes?: Uint8Array; format?: "pdf" | "png" | "jpeg" | "mp4" | "mp3" | "wav" };
export type Evidence = { sourceId: string; mode: "text" | "visual"; quote: string; time?: number };
export type UnderstandingSection = { id: string; title: string; kind: "prose" | "code" | "diagram" | "equation" | "table" | "image" | "video" | "example"; paragraphs: string[]; evidence: Evidence[] };
export type MaterialUnderstanding = { title: string; summary: string; sections: UnderstandingSection[]; coverage: { sourceId: string; status: "clear" | "limited" | "unreadable" }[]; limitations: string[] };
export const accessOptions = [
  { id: "stepwise", label: "Guide me step by step", description: "Follow the explanation a little at a time." },
  { id: "visual-description", label: "Describe visual information", description: "Describe visible content and acknowledge unclear details." },
  { id: "plain-language", label: "Simplify the explanation", description: "Clearer language, with the same ideas and details." },
  { id: "listen", label: "Make it comfortable to listen", description: "Complete spoken explanations, with Read Aloud." },
  { id: "read-spoken", label: "Make spoken content readable", description: "Readable sections and key points from spoken lessons." },
] as const;
export type AccessNeed = typeof accessOptions[number]["id"];
export type AccessPreferences = { needs: AccessNeed[]; description: string; focus: string };
export type AdaptedSection = UnderstandingSection & { steps: string[] };
export type PracticePrompt = { id: string; prompt: string; evidence: Evidence[] };
export type AdaptedExperience = { introduction: string; sections: AdaptedSection[]; practice: PracticePrompt[]; limitations: string[] };
export type Reflection = { message: string; nextStep: string; evidence: Evidence[] };
export type UnderstandingQuestion = { id: string; prompt: string; sectionId: string; answerQuote: string; evidence: Evidence[] };
/** Presentation adaptation, not a reconstruction or assessment of source knowledge. */
export type SourceAdaptation = AdaptedExperience;
export type LearningSnapshot = { fingerprint: string; expiresAt: number; material: Omit<LearningMaterial, "bytes" | "format" | "units"> & { units: Omit<SourceUnit, "text">[] }; analysis: { status: "source-ready" } | { status: "ready"; content: MaterialUnderstanding } | { status: "unavailable" | "unusable"; message: string }; preferences?: AccessPreferences; experience?: SourceAdaptation; revision: number };
export interface LearningProvider {
  adaptSourceProgress?(material: LearningMaterial, preferences: AccessPreferences, signal: AbortSignal, publish: (section: AdaptedSection) => void): Promise<unknown>;
  createPractice?(material: LearningMaterial, experience: AdaptedExperience, preferences: AccessPreferences, signal: AbortSignal): Promise<unknown>;
  adaptSource?(material: LearningMaterial, preferences: AccessPreferences, signal: AbortSignal): Promise<unknown>;
  /** Legacy diagnostic contracts; the learner flow does not use an understanding call. */
  understand(material: LearningMaterial, signal: AbortSignal): Promise<unknown>;
  adapt(material: LearningMaterial, understanding: MaterialUnderstanding, preferences: AccessPreferences, signal: AbortSignal): Promise<unknown>;
  reflect(material: LearningMaterial, question: PracticePrompt, answer: string, signal: AbortSignal): Promise<unknown>;
}

