import "server-only";
import { createHash } from "node:crypto";
import { BedrockRuntimeClient, ConverseStreamCommand, type ConverseCommand, type ConverseStreamCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { createLearningProvider, CLAUDE_ADAPTATION_MODEL_ID } from "../provider";
import type { AccessPreferences, LearningMaterial, LearningProvider } from "../types";
import { networkingFidelity } from "./networking-fidelity";
import { protectedPassages, manifestFingerprint } from "./preservation";
import { fidelityRequest } from "./fidelity";
import { PdfSectionProjection } from "./projection";

export const reviewedNetworkingFingerprint = "cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01";
/** Rehearsal authorization is server-owned. No filename/client flag grants eligibility. */
export function verifiedPdfContract(material: LearningMaterial, preferences: AccessPreferences, enabled: boolean) {
  if (!enabled || material.kind !== "pdf" || !material.bytes || material.fingerprint !== reviewedNetworkingFingerprint ||
      createHash("sha256").update(material.bytes).digest("hex") !== reviewedNetworkingFingerprint ||
      preferences.needs.length !== 1 || preferences.needs[0] !== "stepwise" || preferences.description.trim() || preferences.focus.trim()) return undefined;
  try {
    const passages = protectedPassages(material, { factHeadings: ["Why networks matter"] });
    if (passages.length !== 23) return undefined;
    const contract = networkingFidelity(material, passages);
    // Pin the reviewed extraction AND visual transcription, not merely the original bytes.
    if (createHash("sha256").update(JSON.stringify(contract)).digest("hex") !== "2d10c1e53b3aa56cd97005b921f942746da77a07f713c39947282d2934eb950d" ||
        manifestFingerprint(passages) !== "345ab2eebf7c453afea1f84d8e6a5587c3f7af3f1bbdaf3158586be70a6cc167") return undefined;
    return { passages, contract };
  } catch { return undefined; } // An unrecognized extraction/layout uses the unchanged full path.
}
type StreamTransport = (command: ConverseStreamCommand, signal: AbortSignal) => Promise<ConverseStreamCommandOutput>;
export function withVerifiedPdfProgress(base: LearningProvider, options: { enabled: boolean; modelId?: string; transport?: StreamTransport }) : LearningProvider {
  return { ...base, async adaptSourceProgress(material, preferences, signal, publish) {
    const verified = verifiedPdfContract(material, preferences, options.enabled);
    if (!verified) {
      if (!base.adaptSource) throw new Error("Source adaptation unavailable");
      return base.adaptSource(material, preferences, signal);
    }
    // Capture the unchanged production request builder, then add the tested reference contract.
    let command: ConverseCommand | undefined;
    const capture = new Error("Request captured");
    const modelId = options.modelId || CLAUDE_ADAPTATION_MODEL_ID;
    const builder = createLearningProvider({ modelId }, async request => { command = request; throw capture; });
    try { await builder.adaptSource!(material, preferences, signal); } catch (error) { if (error !== capture) throw error; }
    if (!command) throw new Error("Missing adaptation request");
    const projection = new PdfSectionProjection(material, preferences, verified.passages, verified.contract, true);
    const client = options.transport ? undefined : new BedrockRuntimeClient({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION, maxAttempts: 1 });
    try {
      const request = new ConverseStreamCommand(fidelityRequest(command.input, verified.contract, true));
      const response = options.transport ? await options.transport(request, signal) : await client!.send(request, { abortSignal: signal });
      if (!response.stream) throw new Error("Missing provider stream");
      let stopReason = "";
      for await (const event of response.stream) {
        signal.throwIfAborted();
        if (event.contentBlockDelta?.delta?.text !== undefined) {
          for (const section of projection.push(event.contentBlockDelta.delta.text)) { signal.throwIfAborted(); publish(section); }
        } else if (event.messageStop) stopReason = event.messageStop.stopReason ?? "";
        else if (event.internalServerException || event.modelStreamErrorException || event.serviceUnavailableException || event.throttlingException || event.validationException) throw new Error(`PDF stream failure: ${Object.keys(event)[0]}`);
      }
      signal.throwIfAborted();
      return projection.finish(stopReason);
    } catch (error) {
      projection.fail();
      // No document, model output, credentials or SDK error message enters diagnostics.
      console.error("ADAPT verified PDF incomplete", { stage: "stream-or-validation", errorType: error instanceof Error ? error.name : "Unknown" });
      throw error;
    } finally { client?.destroy(); }
  } };
}
