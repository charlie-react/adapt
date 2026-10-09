import { validateExplanations, type ExplanationProvider } from "../ai/provider";
import type { Accommodation, LearnerPreferences, MaterialAdapter, Objective } from "./types";

export function identifyObjectives(objectives: Objective[]): Objective[] {
  if (!objectives.length || objectives.some((objective) => objective.authority !== "source-explicit" || !objective.text.trim())) {
    throw new Error("An explicit source objective is required; inference is not enabled");
  }
  return structuredClone(objectives);
}

export async function accommodate(
  adapter: MaterialAdapter,
  preferences: LearnerPreferences,
  provider: ExplanationProvider,
  timeoutMs = 15000,
): Promise<Accommodation> {
  const material = adapter.ingest();
  const analysis = adapter.analyze(material);
  const objectives = identifyObjectives(material.objectives);
  const strategy = adapter.strategies.find((candidate) =>
    preferences.representation === "structured-text" && preferences.barriers.includes(candidate.barrier) &&
    analysis.accessRequirements.includes(candidate.accessRequirement));
  if (!strategy) throw new Error("No supported strategy matches these preferences");
  const experience = strategy.adapt(material);
  const practice = adapter.practice(objectives);
  const objectiveIds = objectives.map((objective) => objective.id);
  if (JSON.stringify(experience.objectiveIds) !== JSON.stringify(objectiveIds) ||
      practice.some((question) => !objectiveIds.includes(question.objectiveId))) {
    throw new Error("Adaptation or practice changed the objective linkage");
  }
  const sourceIds = new Set(material.segments.map((segment) => segment.id));
  const references = [...objectives, ...experience.items, ...practice, strategy].flatMap((part) => part.sourceIds);
  if (references.some((id) => !sourceIds.has(id))) throw new Error("Unknown source reference");
  const result: Accommodation = {
    materialId: material.id, objectives, analysis,
    barriers: [{ barrier: strategy.barrier, explanation: strategy.explanation, sourceIds: strategy.sourceIds }],
    strategy: { id: strategy.id, explanation: strategy.explanation },
    experience, practice, explanations: { status: "unavailable", message: "Explanation unavailable. Source-derived exploration and practice remain available." },
  };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const output = await Promise.race([
      provider.explain({ language: material.language, objectives: structuredClone(objectives), sources: structuredClone(material.segments), experience: structuredClone(experience), barriers: structuredClone(result.barriers) }, controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Provider timeout")); }, timeoutMs); }),
    ]);
    result.explanations = { status: "ready", origin: provider.origin, entries: validateExplanations(output, material) };
  } catch {
    // Do not expose provider errors, credentials, or prompts to the learner.
  } finally {
    clearTimeout(timer);
  }
  return result;
}
