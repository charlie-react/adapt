import { createBedrockProvider } from "../src/lib/ai/bedrock";
import { accommodate } from "../src/lib/engine/pipeline";
import { binaryTreeAdapter } from "../src/lib/fixtures/binary-tree";
import { validateExplanations, type ExplanationProvider } from "../src/lib/ai/provider";

export function safeDiagnostic(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  function redact(text: string) {
    for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_BEARER_TOKEN_BEDROCK"]) {
      const secret = process.env[key];
      if (secret) text = text.split(secret).join("[REDACTED]");
    }
    return text
      .replace(/arn:aws[a-z-]*:[^\s"',;]+/gi, "[AWS ARN REDACTED]")
      .replace(/\b\d{12}\b/g, "[ACCOUNT REDACTED]")
      .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[ACCESS KEY REDACTED]")
      .replace(/(authorization|secretAccessKey|sessionToken|accessToken|refreshToken|password)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]")
      .replace(/\b[A-Za-z0-9/+_=.-]{80,}\b/g, "[TOKEN REDACTED]");
  }
  const metadata = value.$metadata && typeof value.$metadata === "object" ? value.$metadata as Record<string, unknown> : {};
  return {
    name: typeof value.name === "string" ? redact(value.name) : "Error",
    message: typeof value.message === "string" ? redact(value.message) : "Non-Error failure (raw value withheld)",
    httpStatusCode: typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined,
    requestId: typeof metadata.requestId === "string" ? redact(metadata.requestId) : undefined,
  };
}

async function main() {
  const config = { region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION, modelId: process.env.BEDROCK_MODEL_ID };
  console.log(`Bedrock smoke configuration: region=${config.region || "(not set)"}, model=${config.modelId ?? "amazon.nova-lite-v1:0"}, profile=${process.env.AWS_PROFILE ? "explicit" : "default"}`);
  const provider = createBedrockProvider(config);
  let diagnosed = false;
  // Diagnostics belong only to this local script, never the learner-facing result.
  const diagnosticProvider: ExplanationProvider = {
    origin: provider.origin,
    async explain(input, signal) {
      let stage = "AWS/Bedrock request or response parsing";
      try {
        const output = await provider.explain(input, signal);
        stage = "source-grounding validation (Bedrock returned successfully)";
        return validateExplanations(output, binaryTreeAdapter.ingest());
      } catch (error) {
        diagnosed = true;
        console.error("Live Bedrock diagnostic:", JSON.stringify({ stage, ...safeDiagnostic(error) }, null, 2));
        throw error;
      }
    },
  };
  const result = await accommodate(binaryTreeAdapter, {
    barriers: ["visual-diagram-interpretation"], representation: "structured-text",
  }, diagnosticProvider);
  if (result.explanations.status !== "ready") {
    if (!diagnosed) console.error("Live Bedrock diagnostic: the pipeline timed out after 15 seconds before a validated explanation was available.");
    console.error("Live Bedrock explanation unavailable or rejected. Check AWS region, standard credentials, model access, and model ID. Deterministic exploration remains available.");
    process.exitCode = 1;
    return;
  }
  console.log(`Live Bedrock smoke test passed: ${result.explanations.entries.length} validated source excerpts; original objective preserved.`);
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/bedrock-smoke.ts")) void main();
