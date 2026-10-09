import { BedrockRuntimeClient, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { createLearningProvider } from "../src/lib/learning/provider";
import { jsonEnvelope, ProviderResponseError, resolveProviderEvidence, sourceExcerpts } from "../src/lib/learning/provider-response";
export { jsonEnvelope } from "../src/lib/learning/provider-response";
import { createLearningHandlers } from "../src/lib/learning/http";
import { createLearningStore } from "../src/lib/learning/service";
import { validateUnderstanding } from "../src/lib/learning/validation";
import type { LearningMaterial, LearningSnapshot } from "../src/lib/learning/types";
import { diagramPng, lessonText } from "../tests/fixtures/learning";
import { textPdf } from "../tests/fixtures/pdf";
import { safeDiagnostic } from "./bedrock-smoke";

// This local tool processes only these fixed synthetic sources. Raw source,
// prompts, credentials, and model paragraphs are never written to disk/logs.
function shape(value: unknown) {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const knownKeys = ["title", "summary", "sections", "coverage", "limitations"];
  return { keys: knownKeys.filter(key => key in object), unknownKeyCount: Object.keys(object).filter(key => !knownKeys.includes(key)).length, sections: Array.isArray(object.sections) ? object.sections.length : null, coverage: Array.isArray(object.coverage) ? object.coverage.length : null };
}
function structureDetails(value: unknown, material: LearningMaterial) {
  const v = value as Record<string, unknown>;
  const keys = (item: unknown) => item && typeof item === "object" ? Object.keys(item).map(key => /^[a-zA-Z-]{1,30}$/.test(key) ? key : "[other key]") : [];
  const token = (item: unknown) => typeof item === "string" && /^[a-zA-Z0-9-]{1,40}$/.test(item) ? item : `[${typeof item}]`;
  return {
    sections: Array.isArray(v.sections) ? v.sections.map((item: Record<string, unknown>, index: number) => ({
      path: `sections[${index}]`, keys: keys(item), kind: token(item.kind), validId: typeof item.id === "string" && /^[a-zA-Z0-9-]{1,50}$/.test(item.id),
      paragraphTypes: Array.isArray(item.paragraphs) ? item.paragraphs.map(p => typeof p) : typeof item.paragraphs,
      evidence: Array.isArray(item.evidence) ? item.evidence.map((e: Record<string, unknown>) => ({ keys: keys(e), mode: token(e.mode), knownSource: material.units.some(unit => unit.id === e.sourceId), quoteType: typeof e.quote, quoteCharacters: typeof e.quote === "string" ? e.quote.length : null, exactSourceMatch: typeof e.quote === "string" && material.units.some(unit => unit.id === e.sourceId && unit.text?.includes(e.quote as string)), normalizedWhitespaceMatch: typeof e.quote === "string" && material.units.some(unit => unit.id === e.sourceId && unit.text?.replace(/\s+/g, " ").includes((e.quote as string).replace(/\s+/g, " "))), hasTime: "time" in e })) : typeof item.evidence,
    })) : typeof v.sections,
    coverage: Array.isArray(v.coverage) ? v.coverage.map((item: Record<string, unknown>) => ({ keys: keys(item), status: token(item.status), knownSource: material.units.some(unit => unit.id === item.sourceId) })) : typeof v.coverage,
    limitationTypes: Array.isArray(v.limitations) ? v.limitations.map(item => typeof item) : typeof v.limitations,
  };
}
// A diagnostic counterfactual for the fixed synthetic TEXT case only. It proves
// whether the already-exact quotations fail solely because of an incorrect key.
// Never used by the application, never changes paragraph/quote/source values.
export function textEvidenceCounterfactual(value: unknown): unknown {
  const candidate = structuredClone(value) as { sections?: { evidence?: Record<string, unknown>[] }[] };
  for (const section of candidate.sections || []) for (const item of section.evidence || []) {
    if (!("mode" in item) && "status" in item) { delete item.status; item.mode = "text"; }
  }
  return candidate;
}
async function main() {
  const client = new BedrockRuntimeClient({ ...(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION ? { region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION } : {}), maxAttempts: 1 });
  const cases: { kind: string; body: BodyInit; headers: Record<string, string> }[] = [
    { kind: "text", body: JSON.stringify({ text: lessonText }), headers: { "content-type": "application/json" } },
    { kind: "image", body: diagramPng() as BodyInit, headers: { "content-type": "image/png", "x-material-name": "synthetic-diagram.png" } },
    { kind: "pdf", body: textPdf([[lessonText]], true) as BodyInit, headers: { "content-type": "application/pdf", "x-material-name": "synthetic-lesson.pdf" } },
  ];
  const contractProbe = process.argv.includes("--contract-probe");
  try {
    for (const example of cases.filter(item => (!process.argv.includes("--text-only") || item.kind === "text") && (!process.argv.includes("--pdf-only") || item.kind === "pdf"))) {
      let raw: ConverseCommandOutput | undefined, source: LearningMaterial | undefined;
      let stage = "preprocessing", requestCount = 0;
      const provider = createLearningProvider({ modelId: process.env.BEDROCK_MODEL_ID }, async (command, signal) => {
        stage = "Nova request"; requestCount++;
        if (contractProbe && source) {
          const unit = source.units.find(unit => unit.text && unit.text.length >= 10) || source.units[0];
          const originalDocument = example.kind === "pdf";
          const excerpt = sourceExcerpts(source).find(excerpt => excerpt.sourceId === unit.id);
          const reference = excerpt && !originalDocument ? { sourceId: unit.id, mode: "text", excerptId: excerpt.id } : { sourceId: unit.id, mode: "visual", quote: "" };
          const template = { title: "Replace with the actual material title", summary: "Replace with an explanation of this actual material", sections: [{ id: "topic-1", title: "Replace with an actual source topic", kind: example.kind === "image" ? "diagram" : "prose", paragraphs: ["Replace with complete explanations of the supplied material"], evidence: [reference] }], coverage: source.units.map(unit => ({ sourceId: unit.id, status: "clear" })), limitations: [] };
          command.input.system!.push({ text: `DIAGNOSTIC CONTRACT PROBE ONLY. Return a JSON object matching this literal shape; replace content placeholders with real source-based content. Keep field names and types exactly. Example: ${JSON.stringify(template)}. Evidence NEVER has status. Section kind is ONLY prose,code,diagram,equation,table,image,video,example; visual is an evidence mode, NEVER a section kind. Select server-owned excerpt IDs for text evidence, never regenerate quotations. If describing original PDF/image visual content, use mode visual and quote empty. Preserve source uncertainty. No Markdown or prose outside JSON.` });
          if (originalDocument) command.input.system!.push({ text: "For this native-original-PDF probe, interpret the original supplied document rather than repairing or quoting uncertain extracted text. Cite the corresponding supplied PDF page with mode visual and quote empty. Label the analysis an AI interpretation of the original page, not a verified extracted-text fact, and retain any uncertainty in limitations." });
        }
        const content = command.input.messages![0].content!;
        console.log(JSON.stringify({ kind: example.kind, stage, contractProbe, modelId: command.input.modelId, contentTypes: content.map(block => block.text !== undefined ? "text" : block.document ? "document" : block.image ? "image" : block.video ? "video" : "other"), sourceUnits: source?.units.length, sourceTextCharacters: source?.units.reduce((sum, unit) => sum + (unit.text?.length ?? 0), 0), originalByteCount: source?.bytes?.length || 0 }));
        raw = await client.send(command, { abortSignal: signal }); stage = "response parsing";
        console.log(JSON.stringify({ kind: example.kind, stage: "Nova response", httpStatus: raw.$metadata.httpStatusCode, requestId: raw.$metadata.requestId, stopReason: raw.stopReason, responseTypes: raw.output?.message?.content?.map(block => typeof block.text === "string" ? "text" : "other"), outputTokens: raw.usage?.outputTokens }));
        return raw;
      });
      const store = createLearningStore();
      const handlers = createLearningHandlers(store, {
        ...provider,
        understand: async (material, signal) => {
          source = material;
          console.log(JSON.stringify({ kind: example.kind, stage: "preprocessing", actualKind: source.kind, sourceUnits: source.units.length, hasOriginalBytes: Boolean(source.bytes), provenanceKinds: source.units.map(unit => unit.locator.kind) }));
          try { const value = await provider.understand(material, signal); stage = "schema/grounding validation"; return value; }
          catch (error) {
            // SyntaxError.message can contain source-derived model text.
            // Log only its type and fixed format evidence, never its snippet.
            const name = error instanceof Error ? error.name : "Error";
            console.error(JSON.stringify({ kind: example.kind, stage, providerStage: error instanceof ProviderResponseError ? error.stage : undefined, error: name, ...(name === "SyntaxError" ? { reason: "JSON.parse rejected the full model text; content withheld" } : { diagnostic: safeDiagnostic(error) }) }));
            throw error;
          }
        },
      });
      const response = await handlers.upload(new Request("http://localhost/api/learning", { method: "POST", body: example.body, headers: example.headers }));
      const snapshot = await response.json() as LearningSnapshot;
      console.log(JSON.stringify({ kind: example.kind, stage: "learner result", httpStatus: response.status, analysisStatus: snapshot.analysis?.status, hasExperience: Boolean(snapshot.experience), requests: requestCount, mappedHeading: snapshot.analysis?.status === "unavailable" ? "We couldn’t finish understanding this yet." : snapshot.analysis?.status === "ready" ? "What would make learning more comfortable?" : "Blocked or upload error" }));
      if (snapshot.analysis?.status !== "ready") process.exitCode = 1;
      const text = raw?.output?.message?.content?.map(block => block.text || "").join("");
      let parsedResponse: unknown;
      if (text && source) {
        const envelope = jsonEnvelope(text);
        console.log(JSON.stringify({ kind: example.kind, stage: "isolated provider envelope check", textCharacters: text.length, exactlyOneJsonFence: envelope.fenced }));
        try {
          const parsed = JSON.parse(envelope.json) as unknown;
          parsedResponse = parsed;
          console.log(JSON.stringify({ kind: example.kind, stage: "inner JSON parsed", ...shape(parsed) }));
          console.log(JSON.stringify({ kind: example.kind, stage: "schema structure (values/content withheld)", ...structureDetails(parsed, source) }));
          const resolved = resolveProviderEvidence(parsed, "understanding", source, sourceExcerpts(source));
          const validated = validateUnderstanding(resolved, source);
          console.log(JSON.stringify({ kind: example.kind, stage: "unchanged schema/grounding validation", result: "passed", sections: validated.sections.length, evidenceItems: validated.sections.reduce((sum, section) => sum + section.evidence.length, 0), exactTextQuotes: validated.sections.flatMap(section => section.evidence).filter(item => item.mode === "text").length, visualReferences: validated.sections.flatMap(section => section.evidence).filter(item => item.mode === "visual").length, coverage: validated.coverage.map(unit => unit.status), limitations: validated.limitations.length }));
        } catch (error) {
          console.error(JSON.stringify({ kind: example.kind, stage: "inner JSON/schema/grounding check", error: error instanceof Error ? error.name : "Error", reason: error instanceof SyntaxError ? "Inner JSON is malformed; model content withheld" : safeDiagnostic(error).message }));
          process.exitCode = 1;
        }
      } else process.exitCode = 1;
      if (example.kind === "text" && parsedResponse && source && JSON.stringify(parsedResponse).includes('"status":"text"')) {
        try {
          const candidate = validateUnderstanding(textEvidenceCounterfactual(parsedResponse), source);
          console.log(JSON.stringify({ kind: example.kind, stage: "diagnostic-only evidence-key counterfactual", result: "unchanged validator passed", unchangedSourceAndQuoteAndParagraphs: true, sections: candidate.sections.length, exactQuotes: candidate.sections.flatMap(section => section.evidence).filter(item => item.mode === "text").length, applicationResultStill: snapshot.analysis.status }));
        } catch (error) { console.error(JSON.stringify({ kind: example.kind, stage: "diagnostic-only evidence-key counterfactual", result: "rejected", reason: safeDiagnostic(error).message })); }
      }
      const capability = response.headers.get("set-cookie")?.split(";")[0];
      if (capability) await handlers.remove(new Request("http://localhost/api/learning", { method: "DELETE", headers: { cookie: capability } }));
    }
  } finally { client.destroy(); }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/learning-diagnostic.ts")) void main();
