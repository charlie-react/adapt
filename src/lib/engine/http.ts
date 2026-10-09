import type { ExplanationProvider } from "../ai/provider";
import { accommodate } from "./pipeline";
import type { LearnerPreferences, MaterialAdapter } from "./types";

type Registry = Record<string, MaterialAdapter>;
class InputError extends Error {}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new InputError("Unexpected request fields");
  }
  return value as Record<string, unknown>;
}
async function readInput(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new InputError("Expected JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Missing body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new InputError("Request too large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch { throw new InputError("Invalid or oversized JSON request"); }
}
function adapterFor(registry: Registry, id: unknown): MaterialAdapter {
  if (typeof id !== "string" || !Object.hasOwn(registry, id)) throw new InputError("Unknown material");
  return registry[id];
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export function createHandlers(registry: Registry, provider: ExplanationProvider) {
  async function handle(request: Request, action: "adapt" | "practice") {
    try {
      const body = object(await readInput(request), action === "adapt" ? ["materialId", "preferences"] : ["materialId", "questionId", "answers"]);
      const adapter = adapterFor(registry, body.materialId);
      if (action === "practice") {
        if (typeof body.questionId !== "string" || !Array.isArray(body.answers) || body.answers.length > 20 || body.answers.some((answer) => typeof answer !== "string" || answer.length > 64)) throw new InputError("Invalid response");
        try { return json(adapter.respond(body.questionId, body.answers)); }
        catch { throw new InputError("Unknown question or invalid answers"); }
      }
      const preferences = object(body.preferences, ["barriers", "representation"]);
      const supported = adapter.strategies.map((strategy) => strategy.barrier);
      if (preferences.representation !== "structured-text" || !Array.isArray(preferences.barriers) || !preferences.barriers.length || new Set(preferences.barriers).size !== preferences.barriers.length || preferences.barriers.some((barrier) => typeof barrier !== "string" || !supported.includes(barrier))) throw new InputError("Unsupported preferences");
      return json(await accommodate(adapter, preferences as LearnerPreferences, provider));
    } catch (error) {
      return json({ error: error instanceof InputError ? error.message : "Unable to process this lesson. Please try again." }, error instanceof InputError ? 400 : 500);
    }
  }
  return { adapt: (request: Request) => handle(request, "adapt"), practice: (request: Request) => handle(request, "practice") };
}
