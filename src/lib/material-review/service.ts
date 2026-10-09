import "server-only";
import { PDF_SPIKE_LIMITS } from "../ingestion/pdf/contracts";
import { randomBytes } from "node:crypto";
import { assessMaterial, confirmTextScope, confirmUsableMaterial, isConfirmedUsableMaterial, type ConfirmedUsableMaterial } from "../material-quality/gate";
import type { MaterialReview, QualityInput } from "../material-quality/types";
import type { AccommodationHandoff, ReviewPage, ReviewSummary } from "./types";
import type { IngestionErrorCode } from "../ingestion/types";
import { chooseSessionGoal, type GoalUnderstanding, type LearningSession, type SessionPreferences } from "../learning-session/goals";
import { understandGoals, type GoalSuggestionProvider } from "../ai/learning-goal";

export class ReviewError extends Error {
  constructor(public code: IngestionErrorCode | "EXPIRED" | "NOT_READY" | "REVIEW_REQUIRED" | "STALE_REVIEW" | "INVALID_REQUEST", public status = 409) { super(code); }
}
type Snapshot = { input: QualityInput; title: string; expiresAt: number; visited: Set<string>; confirmed?: ConfirmedUsableMaterial; understanding?: GoalUnderstanding; session?: LearningSession; timer: ReturnType<typeof setTimeout> };
export function createReviewStore({ maxSessions = 8, ttlMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map<string, Snapshot>();
  function remove(key: string) { const entry = entries.get(key); if (entry) clearTimeout(entry.timer); entries.delete(key); }
  function get(key: string | undefined) {
    const entry = key ? entries.get(key) : undefined;
    if (!entry || entry.expiresAt <= now()) { if (key) remove(key); throw new ReviewError("EXPIRED", 410); }
    return entry;
  }
  function summary(entry: Snapshot): ReviewSummary {
    const report = assessMaterial(entry.input);
    // Never expose adapter diagnostic strings, metadata or original source bytes.
    const { diagnostics: _diagnostics, ...quality } = report;
    void _diagnostics;
    return structuredClone({ title: entry.title, quality, expiresAt: entry.expiresAt, reviewedUnitIds: [...entry.visited], reviewStatus: entry.confirmed ? "confirmed" : "awaiting-review", understanding: entry.understanding, session: entry.session });
  }
  return {
    create(input: QualityInput, title = "Uploaded material") {
      for (const [key, entry] of entries) if (entry.expiresAt <= now()) remove(key);
      if (entries.size >= maxSessions) throw new ReviewError("BUSY", 429);
      const snapshot = structuredClone(input);
      if (snapshot.status !== "extracted" || snapshot.material.units.length > PDF_SPIKE_LIMITS.maxPages || snapshot.material.blocks.reduce((size, block) => size + block.text.length, 0) > PDF_SPIKE_LIMITS.maxCharacters) throw new ReviewError("INVALID_REQUEST", 422);
      const key = randomBytes(32).toString("hex");
      const timer = setTimeout(() => remove(key), ttlMs); timer.unref();
      const entry: Snapshot = { input: snapshot, title: title.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120), expiresAt: now() + ttlMs, visited: new Set(), timer };
      entries.set(key, entry);
      return { key, summary: summary(entry) };
    },
    summary(key: string | undefined) { return summary(get(key)); },
    async goals(key: string | undefined, expected: string, provider?: GoalSuggestionProvider) {
      const entry = get(key), quality = assessMaterial(entry.input);
      if (expected !== quality.fingerprint) throw new ReviewError("STALE_REVIEW");
      if (!quality.canConfirm || entry.input.status !== "extracted") throw new ReviewError("NOT_READY");
      if (!entry.understanding) {
        const understood = await understandGoals(entry.input.material, provider);
        if (get(key) !== entry) throw new ReviewError("STALE_REVIEW");
        entry.understanding = understood;
      }
      return summary(entry);
    },
    setGoal(key: string | undefined, request: { assessmentFingerprint: string; intent: string; candidateId?: string; acceptTextScope: boolean; acknowledgedReasonIds: string[] }) {
      const entry = get(key);
      if (!entry.understanding || !request.acceptTextScope) throw new ReviewError("REVIEW_REQUIRED");
      const goal = chooseSessionGoal(entry.understanding, request.intent, request.candidateId);
      const quality = assessMaterial(entry.input);
      const confirmed = confirmTextScope(entry.input, { basis: "system-validated-text-scope", assessmentFingerprint: request.assessmentFingerprint, acceptedScope: quality.scope!, acknowledgedReasonIds: request.acknowledgedReasonIds });
      if (!confirmed.ok) throw new ReviewError(confirmed.code);
      entry.confirmed = confirmed.material;
      entry.session = { goal, sourceGoals: entry.understanding.candidates.filter(item => item.origin === "source-stated"), suggestedGoals: entry.understanding.candidates.filter(item => item.origin === "ai-inferred"), learnerIntent: request.intent.trim(), revision: (entry.session?.revision ?? 0) + 1 };
      return summary(entry);
    },
    preferences(key: string | undefined, expected: string, revision: number, preferences: SessionPreferences) {
      const entry = get(key);
      if (expected !== assessMaterial(entry.input).fingerprint || entry.session?.revision !== revision) throw new ReviewError("STALE_REVIEW");
      if (!entry.confirmed || !isConfirmedUsableMaterial(entry.confirmed) || !entry.session) throw new ReviewError("REVIEW_REQUIRED");
      if (!["continuous", "one-section"].includes(preferences.readingStyle)) throw new ReviewError("INVALID_REQUEST", 400);
      entry.session = { ...entry.session, preferences: structuredClone(preferences), revision: entry.session.revision + 1 };
      return summary(entry);
    },
    page(key: string | undefined, index: number): ReviewPage {
      const entry = get(key);
      if (!Number.isSafeInteger(index) || index < 1 || entry.input.status !== "extracted") throw new ReviewError("INVALID_REQUEST", 400);
      const material = entry.input.material;
      const unit = material.units[index - 1];
      if (!unit) throw new ReviewError("INVALID_REQUEST", 400);
      entry.visited.add(unit.id);
      return structuredClone({ unit, blocks: material.blocks.filter(block => block.sourceUnitId === unit.id), assessmentFingerprint: assessMaterial(entry.input).fingerprint });
    },
    confirm(key: string | undefined, review: MaterialReview) {
      const entry = get(key);
      const quality = assessMaterial(entry.input);
      if (!quality.canConfirm) throw new ReviewError("NOT_READY");
      if (review.assessmentFingerprint !== quality.fingerprint) throw new ReviewError("STALE_REVIEW");
      if (entry.input.status !== "extracted" || entry.input.material.units.some(unit => !entry.visited.has(unit.id))) throw new ReviewError("REVIEW_REQUIRED");
      const result = confirmUsableMaterial(entry.input, review);
      if (!result.ok) throw new ReviewError(result.code);
      entry.confirmed = result.material;
      return summary(entry);
    },
    proceed(key: string | undefined, expectedFingerprint: string): AccommodationHandoff {
      const entry = get(key);
      if (expectedFingerprint !== assessMaterial(entry.input).fingerprint) throw new ReviewError("STALE_REVIEW");
      if (!entry.confirmed || !isConfirmedUsableMaterial(entry.confirmed)) throw new ReviewError("REVIEW_REQUIRED");
      return { status: "awaiting-accommodation-support", materialId: entry.confirmed.material.id, assessmentFingerprint: entry.confirmed.quality.fingerprint,
        message: entry.session ? "Your session goal and readable-text scope are confirmed. Source-text presentation is available; generated PDF accommodation and competency practice are not available yet." : "Your extracted text is confirmed for review scope. PDF accommodation is not available yet. The next phase requires an authoritative learning objective and a supported accommodation strategy. No objective has been inferred and no AI adaptation has been generated." };
    },
    remove(key: string | undefined) { if (key) remove(key); },
  };
}
// Route bundles in the same Node process share the bounded ephemeral store.
const processState = globalThis as typeof globalThis & { __adaptMaterialReviews?: ReturnType<typeof createReviewStore> };
export const materialReviews = processState.__adaptMaterialReviews ??= createReviewStore();

