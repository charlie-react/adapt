# Live PDF and audio performance — 13 October 2026

## Decision

Implemented two audio changes: reuse upload validation's decoded audio, and resolve source-preserving transcript paragraphs/key points from server-owned references rather than asking Claude to regenerate their wording. **The PDF production path is unchanged.** Its tested prompt change gave no reliable speed benefit and omitted comparison-table ownership details.

Claude Sonnet 4.5 remains the adaptation provider; Gemini 3.5 Transcribe remains the transcription provider. No model comparison, prepared-demo mode, new dependency, lesson-schema/UI change, session-policy change or relaxed validation was introduced. Existing unrelated AGENTS/README/practice/skills/OpenAI experiment changes were preserved; no commits were made.

## Inputs and methodology

- PDF: supplied networking study material, 38,632 bytes, 11 physical pages despite its ten-page name. SHA-256 `cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01`. Stepwise preference; empty description/focus.
- Audio: supplied entrepreneurship WAV, 18,629,826 bytes, **422.444 seconds (7 minutes 2.444 seconds)** despite its five-minute name. SHA-256 `8246fed25dde4995275d07e3a841131a222518759bdd1817334af3a06aee6d38`. Read-spoken preference; empty description/focus.
- Same existing EU Claude Sonnet 4.5 profile, temperature 0 and existing output limits. Node 24.20.0 / Next.js 16.3.8, existing AWS/Gemini credentials, Edge. No secrets printed.

The browser harness renders the production UI and dispatches intercepted API requests through current real upload/session/provider/validation handlers. Model calls are live. Native PDF bytes and original audio bytes are supplied unchanged. Browser timing ends at a visible lesson plus two animation frames; preference-selection time is excluded. These are **local harness measurements**, not deployed-network first paint. No model output is shown before normal validation succeeds.

Audio adaptation-only controls use the exact baseline machine transcript (text SHA-256 `8a6058c439abaf41f6ce68c9fd285d21e38167802717ab05a8733cea7f30b58d`), not a prepared lesson. They isolate Claude changes from transcription variability. Production reads no benchmark files and invokes the real providers for each normal session. Temporary source/lesson review files support controlled comparison; durable reports contain hashes, counts, stage timings and safe errors rather than document/transcript dumps.

## Actual before/after

| Audio stage | Baseline | Final release |
|---|---:|---:|
| Gemini transcription, including transport/response validation | 42.751 s | 19.140 s |
| Entire upload handler | 45.298 s | 20.902 s |
| Upload click → support selection | 45.677 s | 21.415 s |
| Claude round trip | 16.362 s | 6.075 s |
| Bedrock-reported model latency | 12.264 s | 4.814 s |
| Provider plus validation | 16.377 s | 6.087 s |
| Entire adaptation handler | 16.489 s | 6.138 s |
| Adapt click → visible lesson | 16.967 s | 6.588 s |
| **Total waiting to validated visible lesson** | **62.643 s** | **28.003 s** |
| Claude input/output tokens | 4,244 / 1,503 | 7,032 / 269 |

This run was 34.640 seconds faster, **but that is not a causal 55% code speedup**: unchanged Gemini was 23.611 seconds faster by itself. Provider/network/host load varies considerably. An earlier valid integrated run took 46.570 seconds, with a 18.700-second Claude round trip despite only 6.193 seconds of reported model latency. An earlier reference-only live run took 50.333 seconds. All successful results are retained; no best-case service guarantee is claimed.

Controlled final audio adaptation on the exact original transcript took **6.431 seconds**, versus the original 16.362 seconds; reported model latency was 4.574 versus 12.264 seconds. Another final-contract control took 5.212 seconds before selection-quality refinements. Model output fell **82.1%**, from 1,503 to 269 tokens, without reducing the transcript text shown. Inputs increased because the model receives explicit source-statement choices; token usage is recorded, not actual dollar billing.

The source-preserving contract passed fresh live transcription-to-lesson runs, not merely mocked tests. Every paragraph is compared against the complete transcript by the unchanged validator; selected key points must be exact source excerpts. This does not independently prove Gemini heard the original speech correctly.

### Decoder reuse, tested separately

Three alternating local before/after pairs on the same WAV, with identical decoded samples:

| Preparation/decode | Runs | Mean |
|---|---|---:|
| Previous double decode | 3.692, 3.342, 3.265 s | 3.433 s |
| Reuse validated decode | 1.817, 1.854, 1.675 s | 1.782 s |

That removes roughly 1.65 seconds in this local test and avoids a second PCM allocation. It is not a provider/browser timing or a peak-memory measurement. Host load affected absolute values; removal of the duplicate operation is established by the code and identical-sample checks.

### PDF

| Variant | Claude | Adapt click → visible | Input/output tokens |
|---|---:|---:|---:|
| Earlier unchanged baseline | 54.103 s | 54.356 s | 26,178 / 3,194 |
| Earlier second baseline | 58.428 s | 58.904 s | 26,178 / 3,167 |
| Avoid repeated paragraph/key-point explanations candidate | 53.117 s | 53.498 s | 26,296 / 2,978 |
| **Unchanged production regression run** | **48.660 s** | **49.217 s** | **26,178 / 2,734** |

The candidate's approximately one-second improvement over the nearer baseline is smaller than baseline variability. The later unchanged prompt was faster still. Manual source review found missing MAN/WAN ownership details in the candidate's table explanation. **Rejected; no production PDF prompt change.** Native visuals/citations and source grounding were not removed to obtain faster numbers. The current production run retained all 11 source pages and passed strict validation; total local waiting was 50.252 seconds. Parsing/evidence/validation remain millisecond-scale in the prior recorded PDF measurements.

## Implemented architecture

### Source-owned audio presentation

`transcript-paragraphs.ts` creates deterministic sentence-bounded paragraphs from the actual transcript, preserving repeated wording, numbers, punctuation and Unicode. Nothing is summarised or corrected. If complete statements cannot fit existing paragraph budgets, the existing copy-output path remains available; no source text is silently cut.

For **read-spoken without plain-language**, the production Claude boundary uses a private wire contract:

```text
section.paragraphSourceId = existing transcript source ID
section.stepRefs = 0–6 IDs from server-supplied transcriptKeyPoints
```

Claude supplies the existing introduction/title/evidence/limitations and selects useful source statements. The server inserts complete transcript paragraphs and exact selected statement text. Unknown, missing, duplicated, reordered, cross-source or mixed contracts fail closed. The unchanged evidence resolver and `validateSourceAdaptation` then enforce full source coverage, complete transcript wording, exact key-point excerpts, numeric fidelity and all existing bounds. Learner-facing domain values remain `{paragraphs, steps, evidence, ...}`.

The normal exported production provider enables this option. Direct `createLearningProvider` diagnostic callers can explicitly select `transcriptReferences: true`; the old contract remains available for baseline controls. PDF, text, image and simplified-audio requests retain their existing output contract. AWS Transcribe can still be restored through the existing transcription abstraction.

Initial key-point selection concentrated on the opening. Instructions now ask for salient, self-contained statements across the whole lecture rather than greetings/preview statements or the first six entries. All returned statements are source-grounded, but **semantic salience and balanced topic selection remain model-dependent**; the full transcript is always retained. This optimisation is not an independent knowledge reconstruction or semantic correctness proof.

### Request-local audio reuse

`fileMaterial` optionally hands its validated decoded audio to the upload handler through a server-only callback. The handler reuses that exact object for transcription instead of decoding original bytes again. Original bytes, duration validation, file limits, cancellation, timestamps, fingerprint linkage and immutable session ownership remain unchanged. PCM is not placed in stored material or client snapshots. Gemini's request and parsing implementation are unchanged.

## Failures and limitations retained

- Experimental paragraph-ID lists produced invented/unknown IDs and failed strict validation. Not shipped.
- An intermediate source-ID test ran against a partially updated experimental resolver and failed. Corrected; not a Claude knowledge failure.
- A paragraph-only fresh audio run returned 503 without capturing its exact validation reason. It is not counted as a successful fast lesson. Final references cover key points as well as paragraphs and have passed subsequent live runs.
- Early source-ID-only key-point selection favoured opening statements; quality review prompted the final selection instructions before completion.
- An initial new unit assertion compared Buffer and Uint8Array constructors rather than bytes. Corrected to compare byte content; no production validation was weakened.
- Following the power interruption, Turbopack reported a missing referenced `.sst` cache file. The affected cache directory was renamed for recovery, and Next's own recovery cleared generated cache data. No application/source database was deleted. Fresh normal production builds subsequently passed.
- Actual screen-reader operation, audible playback and microphone permissions remain manual verification; automated speech/voice tests use controlled browser doubles.
- Live practice was not regenerated in this task. Existing PDF/audio practice regression and E2E tests passed; final lesson domain shape is unchanged.

## Verification

- `npm test`: **135 passed**, including audio acceptance/failures/provenance, transcript references, numeric/source validation, PDF and audio practice regressions.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed after cache recovery, and passed again with the final prompt.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e`: **33 passed**, including keyboard, narrow layout, Read Aloud, voice alternatives, automated accessibility, loading/cancellation, PDF and audio regression, and optional practice.
- New focused four-test suite passed again after final prompt changes. E2E ran before the last prompt-only selection refinement; no UI/domain/interaction code changed afterward.
- `git diff --check`: passed. No dependency installation or commits.

Commands for reproducible developer measurements (live commands incur provider charges; choose a unique label to preserve results):

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/live-pipeline-performance.ts audio baseline
node --env-file=.env.local --conditions=react-server --import tsx scripts/live-pipeline-performance.ts audio references-release
node --env-file=.env.local --conditions=react-server --import tsx scripts/live-pipeline-performance.ts pdf production-current
node --expose-gc --conditions=react-server --import tsx scripts/audio-decode-benchmark.ts
```

Existing result labels are protected from overwrite in the live harness. `references-*` enables the new contract; other audio labels measure the legacy contract. Temporary exact-source control paths are recorded in individual metrics. There is no production benchmark switch or prepared-content path.

## Changed files

Production: `src/lib/learning/provider.ts`, `transcript-paragraphs.ts`, `material.ts`, `http.ts`. Tests: `tests/transcript-paragraphs.test.ts`, `audio-decode-reuse.test.ts`. Developer tools: `scripts/live-pipeline-performance.ts`, `audio-decode-benchmark.ts`. Evidence: this directory's metrics/report. The provider's earlier practice-reference changes remain intact.

## Best remaining option

PDF waiting remains dominated by generating the full Claude response. Disabling PDF citations would sacrifice native visual understanding, and shrinking lesson/token limits would risk losing material; neither was done. AWS's [latency-optimised inference support](https://docs.aws.amazon.com/bedrock/latest/userguide/latency-optimized-inference.html) does not list this Sonnet 4.5 configuration, so no speculative latency flag was enabled.

For a larger PDF improvement, the strongest next experiment is **incremental, independently validated sections**, with explicit partial state, retained page provenance, and full coverage checks before declaring the lesson complete or enabling full-lesson practice. That requires a deliberate readiness/streaming contract; streaming raw unvalidated text would not meet ADAPT's safety requirements. It is not implemented here. Audio's largest remaining variable is Gemini's real transcription/transfer latency; compression or service-path work needs a separately measured, source-preserving experiment, not model substitution or looser timestamp checks.
