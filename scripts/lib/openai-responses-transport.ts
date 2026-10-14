// BENCHMARK ONLY. Nothing under src/ imports this transport.
import type { ConverseCommand, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";

export const OPENAI_BENCHMARK_MODEL = "gpt-6.1-sol";
export const OUTPUT_BUDGET = 25000; // Includes reasoning, unlike Bedrock's visible-output budget.
export type OpenAIUsage = { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } };
export function costFromUsage(usage: OpenAIUsage) {
  for (const n of [usage.input_tokens, usage.output_tokens, usage.input_tokens_details?.cached_tokens ?? 0, usage.input_tokens_details?.cache_write_tokens ?? 0]) if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid usage; spending cannot be reconciled");
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const writes = usage.input_tokens_details?.cache_write_tokens ?? 0;
  if (cached + writes > usage.input_tokens) throw new Error("Invalid cached usage");
  const long = usage.input_tokens > 272000;
  const inputRate = long ? 4 : 2, outputRate = long ? 15 : 10;
  const baseUsd = ((usage.input_tokens - cached - writes) * inputRate + writes * inputRate * 1.25 + cached * inputRate * .05 + usage.output_tokens * outputRate) / 1e6;
  // Reserve the cache-write premium too when API usage does not itemize writes.
  const upperUsd = (usage.input_tokens * inputRate * 1.25 + usage.output_tokens * outputRate) / 1e6;
  return { baseUsd, upperUsd, cacheWritesItemized: usage.input_tokens_details?.cache_write_tokens !== undefined, pricing: "Standard; 2026-10-13 published rates; token charge estimate, not invoice/taxes" };
}
export function reserveUsd(inputTokens: number) {
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 1) throw new Error("Token count unavailable; no generation permitted");
  // Long-context/cache-write rates throughout, plus margin on the counted input.
  return (Math.ceil(inputTokens * 1.1) * 5 + OUTPUT_BUDGET * 15) / 1e6;
}
export function checkBudget(spentUpperUsd: number, pendingUsd: number, nextUsd: number) {
  if (![spentUpperUsd, pendingUsd, nextUsd].every(n => Number.isFinite(n) && n >= 0) || spentUpperUsd + pendingUsd + nextUsd > 5) throw new Error("OpenAI $5 ceiling: next call blocked");
}
export function responsesPayload(command: ConverseCommand, effort: "low" | "high" = "low") {
  if (!["low", "high"].includes(effort)) throw new Error("Unsupported benchmark reasoning effort");
  const input = command.input;
  const content = input.messages?.[0]?.content;
  if (input.messages?.length !== 1 || !content) throw new Error("Unsupported benchmark request");
  const source = content.find(block => typeof block.text === "string")?.text;
  const material = source && JSON.parse(source);
  if (material?.inputKind !== "pdf" || material.sourceUnits?.length !== 7) throw new Error("Only the approved seven-page PDF is permitted");
  return {
    model: OPENAI_BENCHMARK_MODEL, service_tier: "default", reasoning: { effort },
    store: false, max_output_tokens: OUTPUT_BUDGET, truncation: "disabled",
    instructions: input.system?.map(block => block.text ?? "").join("\n"),
    input: [{ role: "user", content: content.map(block => {
      if (typeof block.text === "string") return { type: "input_text", text: block.text };
      const bytes = block.document?.source?.bytes;
      if (block.document?.format === "pdf" && bytes) return { type: "input_file", filename: "learning-material.pdf", file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}` };
      throw new Error("Unsupported modality; no audio/video/image experiment allowed");
    }) }],
  };
}
export function responseEnvelope(raw: Record<string, unknown>, elapsedMs: number): ConverseCommandOutput {
  if (raw.status !== "completed" || !Array.isArray(raw.output)) throw new Error(`OpenAI response not complete (${String(raw.status)})`);
  const text: string[] = [];
  for (const item of raw.output) {
    if (item.type === "reasoning") continue; // Reasoning is not lesson content.
    if (item.type !== "message" || item.role !== "assistant" || !Array.isArray(item.content)) throw new Error("Unexpected OpenAI output item");
    for (const part of item.content) {
      if (part.type !== "output_text" || typeof part.text !== "string") throw new Error("Refused or unsupported OpenAI output");
      text.push(part.text);
    }
  }
  if (!text.length) throw new Error("Empty OpenAI lesson");
  const usage = raw.usage as OpenAIUsage;
  costFromUsage(usage);
  return { $metadata: { httpStatusCode: 200 }, stopReason: "end_turn", usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.input_tokens + usage.output_tokens }, metrics: { latencyMs: elapsedMs }, output: { message: { role: "assistant", content: [{ text: text.join("") }] } } };
}
