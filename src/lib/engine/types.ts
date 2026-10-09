export type SourceSegment = { id: string; title: string; text: string };
export type Objective = {
  id: string;
  text: string;
  authority: "source-explicit";
  sourceIds: string[];
};
export type LearningMaterial = {
  id: string;
  title: string;
  language: string;
  synthetic: boolean;
  segments: SourceSegment[];
  objectives: Objective[];
};
export type LearnerPreferences = {
  barriers: string[];
  representation: "structured-text";
};
export type ContentAnalysis = { concepts: string[]; accessRequirements: string[] };
export type BarrierFinding = { barrier: string; explanation: string; sourceIds: string[] };
export type SemanticItem = {
  id: string;
  title: string;
  facts: string[];
  spokenStatements?: string[];
  related: { itemId: string; label: string }[];
  sourceIds: string[];
};
export type AccessibleExperience = {
  title: string;
  summary: string;
  items: SemanticItem[];
  objectiveIds: string[];
};
export type PracticeQuestion = {
  id: string;
  objectiveId: string;
  prompt: string;
  options: { id: string; label: string }[];
  multiple: boolean;
  sourceIds: string[];
};
export type PracticeFeedback = { questionId: string; message: string; sourceIds: string[] };
export type Explanation = { text: string; sourceId: string };
export type ExplanationResult =
  | { status: "ready"; origin: "prepared" | "ai-generated"; entries: Explanation[] }
  | { status: "unavailable"; message: string };
export type Accommodation = {
  materialId: string;
  objectives: Objective[];
  analysis: ContentAnalysis;
  barriers: BarrierFinding[];
  strategy: { id: string; explanation: string };
  experience: AccessibleExperience;
  explanations: ExplanationResult;
  practice: PracticeQuestion[];
};

// Domain adapters own source validation, conversion, and competency semantics.
// The engine does not know about trees, diagrams, or any particular subject.
export interface MaterialAdapter {
  ingest(): LearningMaterial;
  analyze(material: LearningMaterial): ContentAnalysis;
  strategies: AccommodationStrategy[];
  practice(objectives: Objective[]): PracticeQuestion[];
  respond(questionId: string, answers: string[]): PracticeFeedback;
}
export interface AccommodationStrategy {
  id: string;
  explanation: string;
  barrier: string;
  accessRequirement: string;
  sourceIds: string[];
  adapt(material: LearningMaterial): AccessibleExperience;
}
