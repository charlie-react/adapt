import test from "node:test";
import assert from "node:assert/strict";
import { transcriptParagraphs, transcriptStatements, resolveTranscriptParagraphs } from "../src/lib/learning/transcript-paragraphs";
import { createLearningProvider } from "../src/lib/learning/provider";
import { sourceExcerpts } from "../src/lib/learning/provider-response";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import type { LearningMaterial } from "../src/lib/learning/types";
const text = "Café — speech may help. Repeated wording stays. Repeated wording stays. ".repeat(35);
const material: LearningMaterial = { id: "audio:test", kind: "audio", title: "Lecture", fingerprint: "a".repeat(64), units: [{ id: "transcript-1", locator: { kind: "transcript", startSeconds: 0, endSeconds: 30 }, text, transcription: { service: "gemini-transcribe", sourceId: "audio-1", sourceFingerprint: "b".repeat(64), language: "und" } }], limitations: [] };
const prefs = { needs: ["read-spoken"] as ["read-spoken"], description: "", focus: "" };
test("server paragraphs preserve every source word, repetition, Unicode and complete statement boundaries", () => {
  const plan = transcriptParagraphs(material, prefs)!;
  assert.ok(plan.length > 1);
  assert.equal(plan.map(p => p.text).join(" "), text.trim());
  assert.ok(plan.every(p => p.text.length <=1600 && p.text.endsWith(".")));
  assert.deepEqual(plan, transcriptParagraphs(material, prefs));
  assert.equal(transcriptParagraphs(material, { ...prefs, needs: ["read-spoken", "plain-language"] }), undefined);
  assert.equal(transcriptParagraphs({ ...material, kind: "pdf" }, prefs), undefined);
  assert.equal(transcriptParagraphs({ ...material, units: [{ ...material.units[0], text: "x".repeat(1700) }] }, prefs), undefined);
});
function wire() { return { introduction: "Read at your pace.", sections: [{ id: "source-1", title: "Lecture", kind: "prose", paragraphSourceId: "transcript-1", stepRefs: ["transcript-point-1-2"], evidence: [{ sourceId: "transcript-1", mode: "text", excerptId: sourceExcerpts(material)[0].id }] }], practice: [], limitations: [] }; }
test("references fail closed for unknown, missing, duplicated, reordered, cross-source and mixed paragraph fields", () => {
  const plan = transcriptParagraphs(material, prefs)!;
  for (const source of ["unknown", "", "excerpt-1-1"]) {
    const value=wire(); value.sections[0].paragraphSourceId=source; assert.throws(()=>resolveTranscriptParagraphs(value,plan,transcriptStatements(material)));
  }
  const duplicate=wire(); duplicate.sections.push(duplicate.sections[0]); assert.throws(()=>resolveTranscriptParagraphs(duplicate,plan,transcriptStatements(material)));
  const missing=wire(); missing.sections=[]; assert.throws(()=>resolveTranscriptParagraphs(missing,plan,transcriptStatements(material)));
  const wrong=wire(); wrong.sections[0].evidence[0].sourceId="other"; assert.throws(()=>resolveTranscriptParagraphs(wrong,plan,transcriptStatements(material)));
  const mixed=wire(); Object.assign(mixed.sections[0],{paragraphs:["invented"]}); assert.throws(()=>resolveTranscriptParagraphs(mixed,plan,transcriptStatements(material)));
  const two = { ...material, units: [...material.units, { ...material.units[0], id: "transcript-2", text: "A second spoken section." }] };
  const twoPlan = transcriptParagraphs(two, prefs)!;
  const reversed = wire(); reversed.sections.push({ ...reversed.sections[0], id: "source-2", paragraphSourceId: "transcript-2", evidence: [{ sourceId: "transcript-2", mode: "text", excerptId: "excerpt-2-1" }] });
  reversed.sections.reverse(); assert.throws(()=>resolveTranscriptParagraphs(reversed,twoPlan,transcriptStatements(two)));
});
test("Claude reference response expands through existing evidence and unchanged strict transcript validation", async () => {
  const provider=createLearningProvider({transcriptReferences:true},async command=>{
    assert.ok(command.input.system![0].text!.includes("FINAL AUDIO WIRE FORMAT"));
    return {$metadata:{httpStatusCode:200},stopReason:"end_turn",usage:{inputTokens:1,outputTokens:1,totalTokens:2},metrics:{latencyMs:1},output:{message:{role:"assistant",content:[{text:JSON.stringify(wire())}]}}};
  });
  const value=await provider.adaptSource!(material,prefs,new AbortController().signal);
  const valid=validateSourceAdaptation(value,material,prefs);
  assert.equal(valid.sections.flatMap(s=>s.paragraphs).join(" "),text.trim());
  assert.throws(()=>validateSourceAdaptation({...valid,sections:[{...valid.sections[0],steps:["Unsupported wording."]}]},material,prefs));
});
