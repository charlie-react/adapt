import assert from "node:assert/strict";
import { test } from "node:test";
import { jsonEnvelope, textEvidenceCounterfactual } from "../scripts/learning-diagnostic";
import { textMaterial } from "../src/lib/learning/material";
import { validateUnderstanding } from "../src/lib/learning/validation";
import { lessonText, understanding } from "./fixtures/learning";
const fence = String.fromCharCode(96).repeat(3);
test("local diagnostic isolates only a single complete JSON envelope without accepting surrounding prose", () => {
  const json = JSON.stringify({ quote: "Keep punctuation — and inline " + fence + " intact." });
  assert.deepEqual(jsonEnvelope(json), { fenced: false, json });
  for (const label of ["json", ""]) assert.deepEqual(jsonEnvelope("  " + fence + label + "\n" + json + "\n" + fence + "  "), { fenced: true, json });
  for (const text of [
    "Here is the response:\n" + fence + "json\n" + json + "\n" + fence,
    fence + "json\n" + json + "\n" + fence + "\nExtra prose.",
    fence + "json\n" + json,
    fence + "javascript\n" + json + "\n" + fence,
    fence + "json\n" + json + "\n" + fence + "\n" + fence + "json\n{}\n" + fence,
  ]) { assert.equal(jsonEnvelope(text).fenced, false); assert.throws(() => JSON.parse(jsonEnvelope(text).json)); }
});
test("diagnostic-only evidence-key counterfactual proves the precise schema error without altering source content or original output", () => {
  const material = textMaterial(lessonText), response = understanding(material) as unknown as { sections: { evidence: Record<string, unknown>[] }[] };
  for (const section of response.sections) for (const item of section.evidence) { delete item.mode; item.status = "text"; }
  const before = JSON.stringify(response); assert.throws(() => validateUnderstanding(response, material), /Invalid structured response/);
  const corrected = textEvidenceCounterfactual(response);
  assert.equal(validateUnderstanding(corrected, material).sections.length, 2); assert.equal(JSON.stringify(response), before);
});
test("diagnostic checks retain rejection of invented quotes and extra fields rather than bypass grounding", () => {
  const material = textMaterial(lessonText), response = understanding(material) as unknown as { sections: { evidence: Record<string, unknown>[] }[] };
  const reference = response.sections[0].evidence[0]; delete reference.mode; reference.status = "text"; reference.quote = "This quotation is absent from the supplied source.";
  assert.throws(() => validateUnderstanding(textEvidenceCounterfactual(response), material), /Ungrounded quotation/);
  reference.quote = lessonText; reference.identity = "must remain rejected";
  assert.throws(() => validateUnderstanding(textEvidenceCounterfactual(response), material), /Invalid structured response/);
});
