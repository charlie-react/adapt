# MVP material limits — 2026-10-08

## Decision and scope

Raise the whole-material PDF/audio budgets without changing providers, introducing processing chunks, or adding video support. Text/image input limits and existing video behavior are unchanged. Source validation, strict grounding, transcript preservation, cancellation, bounded concurrency, the quality gate, Read Aloud and `/demo` remain in place.

| Material | Current acceptance budget |
| --- | --- |
| PDF in the learner flow | 100 pages; 4 MiB original file |
| Audio | 30 minutes; 64 MiB original MP3/uncompressed WAV; minimum 0.5 seconds |
| Transcript | 60,000 characters; 10,000 Gemini word annotations; 24 final segments maximum (Gemini currently returns one) |
| Text | Unchanged: 30,000 characters |
| Image | Unchanged: 3 MiB; maximum dimension 4,096 pixels |

The PDF parser remains isolated in a worker, now bounded to 100 pages, 300,000 extracted characters, 100,000 text/structure items and 30 seconds, with its existing 128 MiB worker heap. Its existing 5 MiB extraction-only envelope remains; the learner flow retains the tighter 4 MiB Bedrock-compatible cap. Legacy review-store budgets now follow the parser constants; quality decisions themselves are unchanged.

## Why these bounds

[Gemini's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe) allows 30 minutes with word timestamps. The existing inline request is retained; a 64 MiB file becomes approximately 89.5 MB of base64, below Google's documented [100 MB inline payload ceiling](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-new-file-limits/). Gemini responses are capped at 8 MiB before JSON parsing. Original wording, exact annotation offsets, timing, completion status and source fingerprints are still checked.

Bedrock Converse caps [individual documents at 4.5 MB](https://docs.aws.amazon.com/boto3/latest/reference/services/bedrock-runtime/client/converse.html), so PDF bytes remain capped at 4 MiB. Claude's [PDF documentation](https://platform.claude.com/docs/en/build-with-claude/pdf-support) permits 100 pages in this context tier but explicitly warns that dense documents can exhaust context earlier. A page count is an acceptance ceiling, not a guarantee that every document fits the model.

64 MiB accommodates a typical 30-minute compressed lecture and a 30-minute 16 kHz mono 16-bit WAV (57,600,044 bytes). Higher-bitrate/stereo WAVs may hit the byte cap before 30 minutes; limits are conjunctive, not alternatives. No audio recompression, new storage service, automatic provider switch, objective inference or chunk-based adaptation is introduced.

## Coordinated downstream limits

- Shared, client-safe budgets live in `src/lib/learning/limits.ts`. The browser and raw/multipart upload handlers accept the larger bounded envelope; byte signatures and per-type limits remain server enforced.
- Upload/preparation: 120 seconds. Transcription: 600 seconds. Adaptation: 600 seconds. Browser budgets: 780/660 seconds. Static Next route execution allowances: 750/630 seconds for upload/adaptation. A deployment must actually permit these request durations and upload bodies; exporting `maxDuration` cannot override a hosting-plan limit. This flow still requires a Node server and process-local sessions.
- Two simultaneous uploads and two simultaneous adaptations remain bounded. Aggregate retained-source budget is 256 MiB, now including transcript annotation metadata. Sessions still expire after 15 minutes.
- Source-adaptation accepts up to 100 sections to retain the existing one-slot-per-page map. Audio may use up to 40 readable paragraphs in a source section, still capped at 1,600 characters each. These are presentation arrays in one request, not processing chunks. MP3 frame duration now derives from the integer sample count rather than repeated floating-point addition, so an exact 30-minute 48 kHz file is not incorrectly rejected by accumulated rounding error.
- Small-source output allowance stays at 8,000 tokens. PDFs above 24 pages use 16,000; audio transcripts above 6,000 characters use 64,000. Other text/image request allowances remain unchanged. JSON response length is bounded to 240,000 characters; exact schema, evidence, numbers, source coverage and full-transcript preservation checks remain.
- Claude receives full audio transcript text as well as existing evidence excerpts. Word annotations remain in server provenance and are excluded from Claude's request to avoid sending thousands of unnecessary timing objects. Source-preserving hearing instructions explicitly prohibit deduplicating repeated source content.
- A specifically recognized Bedrock context-overflow error becomes `RESOURCE_LIMIT`/413 through the existing handler. No source is truncated or silently excluded. Learners see a short smaller-file/shorter-recording message; there is no permanent limits banner.

## Observed verification

A real live synthetic 100-page PDF initially failed with `ValidationException` / HTTP 400: “Input is too long for requested model.” The initial 64,000 output-token reserve was too large. A 16,000-token allowance succeeded: 172,221 input tokens, 11,512 output tokens, 100 sections, all existing validation passed, approximately 91.5 seconds. Bedrock token counting was unavailable for this inference profile. This directly informed the large-PDF allowance. See `mvp-material-limit-live.json`.

Fresh-process serial extraction/decoding measurements are in `mvp-material-limit-measurements.json`: synthetic 100-page PDF 1.36 seconds; 30-minute 16 kHz WAV 5.08 seconds; near-30-minute MP3 21.25 seconds. Cumulative peak RSS reached 505 MiB. This is decoding/extraction process memory, not a full concurrency/HTTP/provider-load benchmark. Inline base64, decoded PCM, request buffers and temporary clones add memory beyond the 256 MiB retained-source cap; provision and measure host memory accordingly.

A controlled 29-minute-57-second MP3 was made by repeating the existing approved colonialism recording 31 times. Initial Gemini transcription succeeded in 131 seconds with 33,322 characters and 4,464 word timestamps. The initial Claude response failed the unchanged full-transcript preservation check; no misleading lesson was accepted. Initial safe evidence is retained in `mvp-material-limit-live-audio-initial.json`. The retry supplies complete transcript text alongside evidence excerpts and reinforces preservation of repeated wording. Two later retries were rejected by timestamp validation. The final diagnostic response contained complete text and annotations but a reversed word interval: start 1,179.9 seconds, end 180.3 seconds (annotation 2,933). ADAPT did not invent a missing leading digit or accept the interval. See `mvp-material-limit-live-audio-diagnostic.json`. **Live near-30-minute transcript-to-lesson completion is not established.** The upstream timestamp anomaly and the earlier wording omission remain limitations; a repeated short recording is not representative evidence of varied full-lecture quality. The full-transcript request adjustment passes automated regression coverage, but its live long-audio completion remains unverified because subsequent ASR outputs were invalid.

Automated boundary tests use genuine PDF/WAV/MP3 bytes and injected external-service responses. They cover 100/101 pages, 30-minute audio and overlong rejection, full long-transcript preservation, source provenance, server upload caps, context overflow, unchanged text/image caps and retained strict validation. Production browser coverage verifies long audio reaches transcription, overlong audio has an accessible actionable message, keyboard flow, Read Aloud, the quality gate and `/demo`. Mocked external-service success is distinct from live evidence.

## Files changed in this task

- Shared budgets and audio bounds: `src/lib/learning/limits.ts`, `audio.ts`, `gemini-transcription.ts`, `transcription.ts`.
- Upload, memory, provider and response bounds: `src/lib/learning/material.ts`, `http.ts`, `service.ts`, `provider.ts`, `provider-response.ts`, `validation.ts`.
- PDF parser/review bounds: `src/lib/ingestion/pdf/contracts.ts`, `src/lib/material-review/http.ts`, `service.ts`.
- Host/client budgets and limit visibility: `src/app/api/learning/route.ts`, `src/app/api/learning/adapt/route.ts`, `src/components/adapt-workspace.tsx`, `src/lib/learning/learner-messages.ts`.
- Tests: `tests/material-limits.test.ts`, `audio.test.ts`, `learning.test.ts`, `learning-provider.test.ts`, `pdf-ingestion.test.ts`, `tests/e2e/audio.spec.ts`, `tests/e2e/adapt.spec.ts`, `tests/fixtures/audio.ts`, `tests/gemini-transcription.test.ts`.
- Documentation/evidence: this report, measurement/live JSON artifacts, `README.md`, `docs/audio-material.md`, `docs/gemini-audio-integration.md`.

No dependencies, secrets, provider selection, future input adapters or unrelated learner features were added. Temporary live diagnostic scripts are removed after verification. Earlier unrelated working-tree changes are preserved.


## Verification outcome and remaining issue

The implementation raises and coordinates the requested acceptance budgets. A live 100-page PDF passed strict adaptation. Genuine 30-minute WAV and MP3 fixtures pass decoding, and the complete 50,000+ character transcript passes the existing pipeline with injected providers. The actual approximately 30-minute Gemini call successfully transcribed once, but the live end-to-end hearing adaptation has not passed: one Claude output omitted/changed wording and later Gemini outputs had invalid timestamps. No validator was relaxed. Therefore the live long-audio completion requirement remains unresolved; this report does not claim universal 30-minute service reliability.

Before relying on long lectures in a demonstration, evaluate a varied 20–30-minute spoken lecture against this same strict path and resolve provider timing/fidelity failures. The safe evidence identifies an upstream reversed timestamp, not a reason to clamp/reconstruct timing. Changing timestamp granularity, loosening source-preservation policy, adding transcription retries or processing chunks would be separate decisions beyond this bounded-limit change. Dense PDFs may still hit model context limits before 100 pages; they fail with a smaller-material action, without dropping pages.


## Final checks

| Command | Result |
| --- | --- |
| `npm test` | 114 passed |
| `npm run lint` | Passed, no warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` | 27 passed, including accessibility, 100/101 pages and long audio |
| `git diff --check` | Passed; existing Windows line-ending notices only |

The full browser run preceded the final integer MP3 timing correction; the affected audio browser tests are rerun against the final production build. The full unit suite and final build include that correction. A transient OneDrive reparse-point error during build cleanup was resolved by removing only the verified generated `.next` cache; no application configuration was changed for it. No source document text was printed. Temporary raw/transcript diagnostic artifacts and temporary scripts were removed; only safe aggregate metadata remains in `docs/`.

Final affected-browser rerun: PLAYWRIGHT_CHANNEL=msedge npm run test:e2e -- tests/e2e/audio.spec.ts — **3 passed** against the final build.
