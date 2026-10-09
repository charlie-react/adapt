import { createLearningProvider } from "../src/lib/learning/provider";
import { ProviderResponseError } from "../src/lib/learning/provider-response";
import { fileMaterial, textMaterial } from "../src/lib/learning/material";
import { validateSourceAdaptation } from "../src/lib/learning/validation";
import { sourceForAdaptation } from "../src/lib/learning/material";
import { accessOptions, type AccessNeed } from "../src/lib/learning/types";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { safeDiagnostic } from "./bedrock-smoke";
import { diagramPng, lessonText } from "../tests/fixtures/learning";
import { textPdf } from "../tests/fixtures/pdf";
import { decodeAudio } from "../src/lib/learning/audio";
import { attachTranscription, audioTranscriber, transcribeAudio } from "../src/lib/learning/transcription";
async function main() {
  const provider = createLearningProvider({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, modelId: process.env.BEDROCK_ADAPTATION_MODEL_ID });
  const path = process.argv.find(arg => arg.startsWith("--file="))?.slice(7);
  const need = process.argv.find(arg => arg.startsWith("--need="))?.slice(7) || "stepwise";
  if (!accessOptions.some(option => option.id === need)) throw new Error("Choose an existing adaptation need");
  const sources = path ? [await fileMaterial(new Uint8Array(await readFile(path)), basename(path))] : [textMaterial(lessonText), await fileMaterial(diagramPng(), "synthetic-diagram.png"), await fileMaterial(textPdf([["Learning objective: identify the root and leaf nodes.", lessonText]], true), "synthetic-lesson.pdf")];
  const preferences = { needs: [need as AccessNeed], description: "Use complete, source-grounded statements.", focus: "" };
  for (let material of sources) {
    let stage = "source-adaptation";
    try {
      if (material.kind === "audio") {
        stage = "audio-transcription";
        const signal = AbortSignal.timeout(90000);
        material = attachTranscription(material, await transcribeAudio(await decodeAudio(material.bytes!, signal), audioTranscriber, signal));
        console.log(JSON.stringify({ kind: "audio", stage, status: "live-transcript-received", transcriptSections: material.units.filter(unit => unit.transcription).length, timedProvenance: true }));
        stage = "source-adaptation";
      }
      const adapted = validateSourceAdaptation(await provider.adaptSource!(material, preferences, AbortSignal.timeout(80000)), sourceForAdaptation(material));
      console.log(JSON.stringify({ kind: material.kind, stage, need, status: "live-response-validated", sections: adapted.sections.length, sourceUnits: material.units.length, practicePrompts: adapted.practice.length, limitations: adapted.limitations.length }));
    } catch (error) { console.error(JSON.stringify({ kind: material.kind, stage, providerStage: error instanceof ProviderResponseError ? error.stage : undefined, ...safeDiagnostic(error), ...(stage === "audio-transcription" && error instanceof Error && error.cause ? { aws: safeDiagnostic(error.cause) } : {}) }, null, 2)); process.exitCode = 1; }
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/learning-smoke.ts")) void main();
