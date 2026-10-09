import "server-only";
import { LEARNING_LIMITS } from "./limits";
import { createHash, randomBytes } from "node:crypto";
import type { AccessPreferences, AdaptedExperience, LearningMaterial, LearningProvider, LearningSnapshot, MaterialUnderstanding } from "./types";
import { validateExperience, validateReflection, validateSourceAdaptation, validateUnderstanding } from "./validation";
import { RequestFailure } from "../server/request";
import { sourceForAdaptation } from "./material";
import { validatePractice } from "./practice";
import type { UnderstandingQuestion } from "./types";
type Entry = { material: LearningMaterial; analysis: LearningSnapshot["analysis"]; understanding?: MaterialUnderstanding; preferences?: AccessPreferences; experience?: AdaptedExperience; questions?: UnderstandingQuestion[]; revision: number; expiresAt: number; cost: number; pending: boolean; timer: ReturnType<typeof setTimeout> };
export function createLearningStore({ now = Date.now, ttlMs = 15 * 60000, maxSessions = 8, maxBytes = LEARNING_LIMITS.sessionBytes, deadlineMs = LEARNING_LIMITS.adaptationMs }: { now?: () => number; ttlMs?: number; maxSessions?: number; maxBytes?: number; deadlineMs?: number } = {}) {
  const entries = new Map<string, Entry>(); let active = 0;
  const remove = (key?: string) => { if (!key) return; const entry = entries.get(key); if (entry) clearTimeout(entry.timer); entries.delete(key); };
  function get(key?: string) { const entry = key ? entries.get(key) : undefined; if (!entry || entry.expiresAt <= now()) { remove(key); throw new RequestFailure("EXPIRED", 410); } return entry; }
  function snapshot(entry: Entry): LearningSnapshot {
    const { bytes: _bytes, format: _format, units, ...material } = entry.material; void _bytes; void _format;
    return structuredClone({ fingerprint: entry.material.fingerprint, expiresAt: entry.expiresAt, material: { ...material, units: units.map(({ text: _text, ...unit }) => { void _text; return unit; }) }, analysis: entry.analysis, preferences: entry.preferences, experience: entry.experience, revision: entry.revision });
  }
  function current(entry: Entry, fingerprint: string, revision: number) { if (fingerprint !== entry.material.fingerprint || revision !== entry.revision) throw new RequestFailure("STALE_MATERIAL", 409); }
  async function work<T>(key: string | undefined, signal: AbortSignal | undefined, action: (entry: Entry, signal: AbortSignal) => Promise<T>) {
    const entry = get(key); if (entry.pending || active >= 2) throw new RequestFailure("BUSY", 429);
    entry.pending = true; active++;
    const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let rejectAbort!: (error: Error) => void;
    const abort = () => rejectAbort(new RequestFailure("AI_UNAVAILABLE", 503));
    const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const timer = setTimeout(() => controller.abort(), deadlineMs); combined.addEventListener("abort", abort, { once: true });
    try { if (combined.aborted) abort(); const result = await Promise.race([action(entry, combined), interrupted]); if (get(key) !== entry) throw new RequestFailure("STALE_MATERIAL", 409); return result; }
    finally { clearTimeout(timer); combined.removeEventListener("abort", abort); controller.abort(); entry.pending = false; active--; }
  }
  return {
    create(material: LearningMaterial, { sourceOnly = false } = {}) {
      for (const [key, entry] of entries) if (entry.expiresAt <= now()) remove(key);
      const cost = (material.bytes?.byteLength ?? 0) + material.units.reduce((sum, unit) => sum + (unit.text?.length ?? 0) * 2 + JSON.stringify(unit.transcription ?? {}).length * 2, 0);
      if (entries.size >= maxSessions || cost + [...entries.values()].reduce((sum, entry) => sum + entry.cost, 0) > maxBytes) throw new RequestFailure("BUSY", 429);
      // Own source data. The client never chooses evidence, content or fingerprints.
      const own = structuredClone(material); const key = randomBytes(32).toString("hex"), timer = setTimeout(() => remove(key), ttlMs); timer.unref();
      const entry: Entry = { material: own, analysis: sourceOnly ? { status: "source-ready" } : { status: "unavailable", message: "Understanding is not available yet. Please try again." }, revision: 0, expiresAt: now() + ttlMs, cost, pending: false, timer };
      entries.set(key, entry); return { key, snapshot: snapshot(entry) };
    },
    snapshot(key?: string) { return snapshot(get(key)); },
    source(key: string | undefined, fingerprint: string, sourceId: string) { const entry = get(key); if (fingerprint !== entry.material.fingerprint) throw new RequestFailure("STALE_MATERIAL", 409); const unit = entry.material.units.find(unit => unit.id === sourceId); if (!unit) throw new RequestFailure("INVALID_REQUEST"); return structuredClone(unit); },
    async analyze(key: string | undefined, fingerprint: string, revision: number, provider: LearningProvider, signal?: AbortSignal) {
      return work(key, signal, async (entry, taskSignal) => {
        current(entry, fingerprint, revision);
        // Old clients can refresh prepared material without triggering broad AI analysis.
        if (entry.analysis.status === "source-ready") return snapshot(entry);
        let understanding: MaterialUnderstanding;
        try { understanding = validateUnderstanding(await provider.understand(structuredClone(entry.material), taskSignal), entry.material); }
        catch { if (taskSignal.aborted) throw new RequestFailure("AI_UNAVAILABLE", 503); get(key); entry.analysis = { status: "unavailable", message: "ADAPT could not understand this material right now. Try again; no AI explanation has been substituted." }; entry.understanding = undefined; entry.experience = undefined; entry.questions = undefined; entry.preferences = undefined; entry.revision++; return snapshot(entry); }
        if (taskSignal.aborted) throw new RequestFailure("AI_UNAVAILABLE", 503); get(key); current(entry, fingerprint, revision);
        entry.revision++; entry.experience = undefined; entry.questions = undefined; entry.preferences = undefined;
        if (understanding.coverage.some(unit => unit.status === "unreadable")) { entry.understanding = undefined; entry.analysis = { status: "unusable", message: "Some of this material could not be understood reliably. Try a clearer or more accessible version. ADAPT will not silently leave it out." }; }
        else { entry.understanding = understanding; entry.analysis = { status: "ready", content: understanding }; }
        return snapshot(entry);
      });
    },
    async adapt(key: string | undefined, fingerprint: string, revision: number, preferences: AccessPreferences, provider: LearningProvider, signal?: AbortSignal) {
      return work(key, signal, async (entry, taskSignal) => {
        current(entry, fingerprint, revision); if (entry.analysis.status !== "source-ready" && (!entry.understanding || entry.analysis.status !== "ready")) throw new RequestFailure("NOT_READY", 409);
        const source = entry.analysis.status === "source-ready" ? sourceForAdaptation(entry.material) : entry.material;
        let experience: AdaptedExperience;
        try {
          if (entry.analysis.status === "source-ready") {
            if (!provider.adaptSource) throw new Error("Source adaptation is unavailable");
            experience = validateSourceAdaptation(await provider.adaptSource(structuredClone(source), structuredClone(preferences), taskSignal), source, preferences);
          } else {
            experience = validateExperience(await provider.adapt(structuredClone(entry.material), structuredClone(entry.understanding!), structuredClone(preferences), taskSignal), entry.material, entry.understanding!);
          }
        } catch (error) { if (error instanceof RequestFailure && error.code === "RESOURCE_LIMIT") throw error; throw new RequestFailure("AI_UNAVAILABLE", 503); }
        if (taskSignal.aborted) throw new RequestFailure("AI_UNAVAILABLE", 503); get(key); current(entry, fingerprint, revision); entry.preferences = structuredClone(preferences); entry.experience = experience; entry.questions = undefined; entry.revision++; return snapshot(entry);
      });
    },
    async practice(key: string | undefined, fingerprint: string, revision: number, provider: LearningProvider, signal?: AbortSignal) {
      return work(key, signal, async (entry, taskSignal) => {
        current(entry, fingerprint, revision);
        if (!entry.experience || !entry.preferences) throw new RequestFailure("NOT_READY", 409);
        if (entry.questions) return { questions: structuredClone(entry.questions) };
        if (!provider.createPractice) throw new RequestFailure("AI_UNAVAILABLE", 503);
        try {
          const source = sourceForAdaptation(entry.material);
          const result = await provider.createPractice(structuredClone(source), structuredClone(entry.experience), structuredClone(entry.preferences), taskSignal);
          const questions = validatePractice(result, source, entry.experience);
          taskSignal.throwIfAborted(); get(key); current(entry, fingerprint, revision);
          entry.questions = questions;
          return { questions: structuredClone(questions) };
        } catch { throw new RequestFailure("AI_UNAVAILABLE", 503); }
      });
    },
    async reflect(key: string | undefined, fingerprint: string, revision: number, questionId: string, answer: string, provider: LearningProvider, signal?: AbortSignal) {
      return work(key, signal, async (entry, taskSignal) => {
        current(entry, fingerprint, revision); const question = entry.experience?.practice.find(item => item.id === questionId); if (!question) throw new RequestFailure("NOT_READY", 409);
        if (!answer.trim() || answer.length > 2000) throw new RequestFailure("INVALID_REQUEST");
        try { const response = validateReflection(await provider.reflect(structuredClone(entry.material), structuredClone(question), answer, taskSignal), entry.material); if (taskSignal.aborted) throw new RequestFailure("AI_UNAVAILABLE", 503); get(key); current(entry, fingerprint, revision); return response; } catch (error) { if (error instanceof RequestFailure) throw error; throw new RequestFailure("AI_UNAVAILABLE", 503); }
      });
    },
    remove,
  };
}
const globalStore = globalThis as typeof globalThis & { __adaptLearningStore?: ReturnType<typeof createLearningStore> };
export const learningStore = globalStore.__adaptLearningStore ??= createLearningStore();
export function materialRevision(sourceFingerprint: string, transcript: string) { return createHash("sha256").update(sourceFingerprint + "\n" + transcript).digest("hex"); }

