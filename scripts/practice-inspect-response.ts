// Replay saved live responses through unchanged production parsing/validation.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseProviderResponse, resolveProviderEvidence, sourceExcerpts } from "../src/lib/learning/provider-response";
import { validatePractice } from "../src/lib/learning/practice";
import type { AdaptedExperience, LearningMaterial, UnderstandingQuestion } from "../src/lib/learning/types";
async function main() {
  const slug = process.argv[2]; if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Pass diagnostic slug");
  const directory = join("docs", "practice-diagnosis-2026-10-08", slug);
  const source = JSON.parse(await readFile(join(directory, "source.json"), "utf8")) as LearningMaterial;
  const { experience } = JSON.parse(await readFile(join(directory, "practice-input.json"), "utf8")) as { experience: AdaptedExperience };
  const parsed = parseProviderResponse(await readFile(join(directory, "claude-response.txt"), "utf8"));
  const resolved = resolveProviderEvidence(parsed, "practice", source, sourceExcerpts(source, { includeShort: true })) as { questions: UnderstandingQuestion[] };
  const details = resolved.questions.map((question, index) => {
    const section = experience.sections.find(section => section.id === question.sectionId), blocks = section ? [...section.paragraphs, ...section.steps] : [];
    return { index, id: question.id, sectionId: question.sectionId, sectionExists: !!section, answerQuote: question.answerQuote,
      exactPresentedQuote: blocks.some(text => text.includes(question.answerQuote)),
      caseInsensitiveMatchForDiagnosisOnly: blocks.some(text => text.toLowerCase().includes(question.answerQuote.toLowerCase())),
      joinedBlocksMatchForDiagnosisOnly: blocks.join(" ").includes(question.answerQuote),
      exactQuoteInOriginalExtractedSourceIds: source.units.filter(unit => unit.text?.includes(question.answerQuote)).map(unit => unit.id),
      sectionParagraphs: section?.paragraphs, sectionSteps: section?.steps,
      evidence: question.evidence, expectedSectionEvidence: section?.evidence,
      evidenceModeMatchesSection: question.evidence.every(ref => section?.evidence.some(original => original.sourceId === ref.sourceId && original.mode === ref.mode)) };
  });
  let validation = "passed";
  try { validatePractice(resolved, source, experience); } catch (error) { validation = error instanceof Error ? error.message : "failed"; }
  // This is an explicitly labelled offline counterfactual, never accepted/displayed
  // by the application. Choose a whole existing paragraph, without fuzzy matching,
  // normalization, punctuation repair, or any change to the actual validator.
  const counterfactual = structuredClone(resolved), selected: { question: string; sectionId: string; kind: string; index: number }[] = [];
  for (const question of counterfactual.questions) {
    const section = experience.sections.find(section => section.id === question.sectionId);
    if (section && ![...section.paragraphs, ...section.steps].some(text => text.includes(question.answerQuote))) {
      // These two observed ODE answers live in existing worked-example/key-point
      // blocks rather than the section's introductory paragraph. Selection is
      // explicit diagnostic evidence, not a production relevance heuristic.
      const useStep = slug === "ode" && ["q1-order-degree", "q5-repeated-root"].includes(question.id);
      question.answerQuote = useStep ? section.steps[4] : section.paragraphs[0];
      selected.push({ question: question.id, sectionId: section.id, kind: useStep ? "step" : "paragraph", index: useStep ? 4 : 0 });
    }
  }
  let counterfactualValidation = "passed";
  try { validatePractice(counterfactual, source, experience); } catch (error) { counterfactualValidation = error instanceof Error ? error.message : "failed"; }
  const report = { parsing: "passed", evidenceResolution: "passed", count: resolved.questions.length, validation, details,
    diagnosticCounterfactual: { notProductionBehavior: true, explanation: "Select existing server-owned lesson paragraphs instead of regenerating their words. Raw response remains unchanged.", selected, validation: counterfactualValidation } };
  await writeFile(join(directory, "field-diagnostics.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ slug, parsing: report.parsing, evidenceResolution: report.evidenceResolution, count: report.count, validation, nonExactQuestionIds: details.filter(item => !item.exactPresentedQuote).map(item => item.id), counterfactualValidation }));
}
void main();
