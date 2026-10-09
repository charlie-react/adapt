import "server-only";
import { boundedBody, requestJson, RequestFailure, sameOrigin } from "../server/request";
import { LEARNING_LIMITS } from "./limits";
import { fileMaterial, textMaterial, withTranscript } from "./material";
import { createLearningStore, learningStore, materialRevision } from "./service";
import { learningProvider } from "./provider";
import { validatePreferences } from "./validation";
import type { LearningMaterial, LearningProvider } from "./types";
import { decodeAudio } from "./audio";
import { attachTranscription, audioTranscriber, transcribeAudio, transcriptionFailure, type AudioTranscriber } from "./transcription";
const cookieName = "adapt-learning";
const messages: Record<string, string> = {
  INVALID_AUDIO: "This audio could not be read safely. Choose a complete MP3 or uncompressed WAV (8–48 kHz, mono or stereo).",
  NO_SPEECH: "No spoken content could be transcribed. Try a clear recording of speech, or use an existing accessible transcript as text.",
  INVALID_TRANSCRIPTION: "The transcript could not be linked reliably to this audio. Try another recording or use an accessible transcript as text.",
  TRANSCRIPTION_ACCESS: "Audio transcription is unavailable for this session. Try again later, or use an existing accessible transcript as text. Your audio has not been adapted.",
  TRANSCRIPTION_UNAVAILABLE: "Audio transcription is unavailable right now. Try again, or use an existing accessible transcript as text. Your audio has not been adapted.",
  TRANSCRIPT_REQUIRED: "Add a transcript for this video, or paste the spoken lesson as text. Video images and audio are not adapted by the current model.",
  EMPTY_INPUT: "Choose a file or add some learning material first.", INVALID_TEXT: "This text could not be read reliably. Try UTF-8 text or paste a clear copy.",
  UNSUPPORTED_FORMAT: "Choose PDF, PNG, JPEG, MP3, WAV, MP4 or a plain UTF-8 text file.", INVALID_IMAGE: "This image is incomplete or unsupported. Try a clear PNG or JPEG.", INVALID_VIDEO: "This video could not be read. Try a complete MP4 clip with a supported video encoding.",
  RESOURCE_LIMIT: "Choose a smaller file or a shorter recording. PDFs can have up to 100 pages (4 MB); audio up to 30 minutes (64 MB).",
  PASSWORD_PROTECTED: "Password-protected PDFs are not supported. Choose an unprotected copy; do not share passwords.", INVALID_PDF: "This PDF is incomplete or malformed. Please try another copy.", NOT_PDF: "The file contents are not a valid PDF.",
  EXTRACTION_FAILED: "The document could not be opened safely. Try another copy.", BUSY: "ADAPT is busy. Please try again shortly.", TIMEOUT: "The material took too long to process. Try a smaller or clearer source.", ABORTED: "Processing was cancelled. You can try again.",
  AI_UNAVAILABLE: "We couldn’t finish adapting this yet. Your original material is still available. Try again or choose another way to engage.", NOT_READY: "This material is not ready for adaptation. Bring your material again or choose another source.",
  EXPIRED: "This temporary session has expired or the server restarted. Bring your material again; nothing was saved permanently.", STALE_MATERIAL: "Your material or learning session changed. Start with the current material again.", INVALID_REQUEST: "That request could not be accepted. Check your input and try again.",
};
function key(request: Request) { return request.headers.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(cookieName + "="))?.slice(cookieName.length + 1); }
function cookie(request: Request, value: string) { return `${cookieName}=${value}; Path=/api/learning; HttpOnly; SameSite=Strict; Max-Age=${value ? 900 : 0}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`; }
function json(body: unknown, status = 200, cookieValue?: string) { return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(cookieValue ? { "Set-Cookie": cookieValue } : {}) } }); }
function exact(body: Record<string, unknown>, keys: string[]) { if (Object.keys(body).sort().join(",") !== keys.sort().join(",")) throw new RequestFailure("INVALID_REQUEST"); }
function revision(body: Record<string, unknown>) { if (typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint) || !Number.isSafeInteger(body.revision) || (body.revision as number) < 0) throw new RequestFailure("INVALID_REQUEST"); return { fingerprint: body.fingerprint, revision: body.revision as number }; }
export function createLearningHandlers(store: ReturnType<typeof createLearningStore> = learningStore, provider: LearningProvider = learningProvider, transcriber: AudioTranscriber = audioTranscriber) {
  let uploads = 0;
  async function run(request: Request, action: () => Promise<Response> | Response) {
    if (!sameOrigin(request)) return json({ code: "INVALID_REQUEST", error: messages.INVALID_REQUEST }, 403);
    try { return await action(); } catch (error) { const e = error instanceof RequestFailure ? error : new RequestFailure("INVALID_REQUEST"); return json({ code: e.code, error: messages[e.code] || messages.INVALID_REQUEST }, e.status); }
  }
  return {
    upload: (request: Request) => run(request, async () => {
      if (uploads >= 2) throw new RequestFailure("BUSY", 429); uploads++;
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(LEARNING_LIMITS.uploadMs)]); let material: LearningMaterial;
        if (request.headers.get("content-type")?.split(";")[0] === "application/json") {
          const body = await requestJson(request, 128000); exact(body, ["text"]); if (typeof body.text !== "string") throw new RequestFailure("INVALID_REQUEST"); material = textMaterial(body.text);
        } else if (request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
          const bytes = await boundedBody(request, LEARNING_LIMITS.uploadBytes + 128000, signal);
          const form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: bytes }).formData();
          if ([...form.keys()].sort().join(",") !== "material,transcript") throw new RequestFailure("INVALID_REQUEST");
          const file = form.get("material"), transcript = form.get("transcript");
          if (!(file instanceof File) || typeof transcript !== "string" || transcript.length > 30000) throw new RequestFailure("INVALID_REQUEST");
          material = await fileMaterial(new Uint8Array(await file.arrayBuffer()), file.name, signal); material = withTranscript(material, transcript);
          if (transcript.trim()) { material.fingerprint = materialRevision(material.fingerprint, transcript); material.id += `:transcript:${material.fingerprint}`; }
        } else {
          const bytes = await boundedBody(request, LEARNING_LIMITS.uploadBytes, signal); const encoded = request.headers.get("x-material-name") || "material";
          if (encoded.length > 1500) throw new RequestFailure("INVALID_REQUEST"); material = await fileMaterial(bytes, decodeURIComponent(encoded), signal);
        }
        if (material.kind === "audio") {
          const transcriptionSignal = AbortSignal.any([request.signal, AbortSignal.timeout(LEARNING_LIMITS.transcriptionMs)]);
          try {
            const decoded = await decodeAudio(material.bytes!, transcriptionSignal);
            const segments = await transcribeAudio(decoded, transcriber, transcriptionSignal, material.bytes);
            transcriptionSignal.throwIfAborted(); material = attachTranscription(material, segments, transcriber);
          } catch (failure) { throw transcriptionFailure(failure); }
        }
        request.signal.throwIfAborted();
        // Audio ASR is ingestion; there is still no adaptation model or objective gate here.
        store.remove(key(request)); const created = store.create(material, { sourceOnly: true });
        return json(created.snapshot, 200, cookie(request, created.key));
      } finally { uploads--; }
    }),
    read: (request: Request) => run(request, () => json(store.snapshot(key(request)))),
    remove: (request: Request) => run(request, () => { store.remove(key(request)); return json({ removed: true }, 200, cookie(request, "")); }),
    source: (request: Request) => run(request, () => { const url = new URL(request.url), id = url.searchParams.get("id"), fingerprint = request.headers.get("x-material-fingerprint"); if (!id || !fingerprint) throw new RequestFailure("INVALID_REQUEST"); return json(store.source(key(request), fingerprint, id)); }),
    analyze: (request: Request) => run(request, async () => { const body = await requestJson(request); exact(body, ["fingerprint", "revision"]); const r = revision(body); return json(await store.analyze(key(request), r.fingerprint, r.revision, provider, request.signal)); }),
    adapt: (request: Request) => run(request, async () => { const body = await requestJson(request); exact(body, ["fingerprint", "revision", "preferences"]); const r = revision(body); let preferences; try { preferences = validatePreferences(body.preferences); } catch { throw new RequestFailure("INVALID_REQUEST"); } return json(await store.adapt(key(request), r.fingerprint, r.revision, preferences, provider, request.signal)); }),
    practice: (request: Request) => run(request, async () => { const body = await requestJson(request); exact(body, ["fingerprint", "revision"]); const r = revision(body); return json(await store.practice(key(request), r.fingerprint, r.revision, provider, request.signal)); }),
    reflect: (request: Request) => run(request, async () => { const body = await requestJson(request); exact(body, ["fingerprint", "revision", "questionId", "answer"]); const r = revision(body); if (typeof body.questionId !== "string" || body.questionId.length > 50 || typeof body.answer !== "string" || body.answer.length > 2000) throw new RequestFailure("INVALID_REQUEST"); return json(await store.reflect(key(request), r.fingerprint, r.revision, body.questionId, body.answer, provider, request.signal)); }),
  };
}
export const learningHandlers = createLearningHandlers();
