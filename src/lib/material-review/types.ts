import type { MaterialQualityReport, QualityBlock, QualitySourceUnit } from "../material-quality/types";
import type { GoalUnderstanding, LearningSession } from "../learning-session/goals";

export type ReviewSummary = {
  title: string;
  quality: Omit<MaterialQualityReport, "diagnostics">;
  expiresAt: number;
  reviewedUnitIds: string[];
  reviewStatus: "awaiting-review" | "confirmed";
  understanding?: GoalUnderstanding;
  session?: LearningSession;
};
export type ReviewPage = { unit: QualitySourceUnit; blocks: QualityBlock[]; assessmentFingerprint: string };
export type AccommodationHandoff = { status: "awaiting-accommodation-support"; materialId: string; assessmentFingerprint: string; message: string };
export const readinessLabels = { ready: "Ready", "ready-with-warnings": "Ready with warnings", "not-ready": "Not ready" };
