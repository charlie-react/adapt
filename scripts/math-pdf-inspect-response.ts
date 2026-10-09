import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseProviderResponse, resolveProviderEvidence, sourceExcerpts } from "../src/lib/learning/provider-response";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import type { LearningMaterial } from "../src/lib/learning/types";
async function main() {
  const directory = join("docs/math-pdf-diagnosis-2026-10-08", process.argv[2]);
  const material = JSON.parse(await readFile(join(directory, "prepared-source.json"), "utf8")) as LearningMaterial;
  const raw = parseProviderResponse(await readFile(join(directory, "raw-response.txt"), "utf8"));
  const resolved = resolveProviderEvidence(raw, "source-adaptation", material, sourceExcerpts(material, { includeShort: true }));
  const value = resolved as { introduction: string; sections: { id: string; paragraphs: string[]; steps: string[]; evidence: unknown[] }[]; practice: unknown[]; limitations: string[] };
  const failures: { path: string; actual: number; minimum: number; maximum: number }[] = [];
  function list(path: string, value: unknown[], minimum: number, maximum: number) { if (!Array.isArray(value) || value.length < minimum || value.length > maximum) failures.push({ path, actual: value?.length, minimum, maximum }); }
  list("sections", value.sections, 1, 100);
  for (const [index, section] of value.sections.entries()) {
    list(`sections[${index}].paragraphs`, section.paragraphs, 1, 4);
    list(`sections[${index}].steps`, section.steps, 0, 6);
    list(`sections[${index}].evidence`, section.evidence, 1, 6);
  }
  list("practice", value.practice, 0, 3); list("limitations", value.limitations, 0, 8);
  const numerals = (text: string) => text.match(/[-−]?\d+(?:[.,]\d+)*(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?/gu) ?? [];
  const allowed = new Set(numerals(material.units.map(unit => unit.text ?? "").join("\n")));
  const numericCheckEnabled = material.units.every(unit => Boolean(unit.text));
  const unknownNumbers = numericCheckEnabled ? [value.introduction, ...value.sections.flatMap(section => [...section.paragraphs, ...section.steps])].flatMap(text => numerals(text).filter(number => !allowed.has(number)).map(number => ({ number, statement: text }))) : [];
  let validation: unknown;
  try { validateSourceAdaptation(resolved, material, { needs: ["stepwise"], description: "", focus: "" }); validation = "passed"; } catch (error) { validation = error instanceof Error ? error.message : "failed"; }
  const report = { validation, listFailures: failures, missingTextPages: material.units.filter(unit => !unit.text).map(unit => unit.id), numericCheckEnabled, unknownNumbers, sections: value.sections.map(section => ({ id: section.id, paragraphs: section.paragraphs.length, steps: section.steps.length })), sourceCharacters: material.units.reduce((sum, unit) => sum + (unit.text?.length ?? 0), 0) };
  await writeFile(join(directory, "field-diagnostics.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ...report, unknownNumbers: unknownNumbers.map(item => item.number) }));
}
void main();
