> Current limits and live verification: [MVP material limits](mvp-material-limits.md). Operational details below record the original AWS spike and are superseded where noted.

> Current transcription default: Gemini 3.5 Transcribe. The AWS adapter and its access findings below remain as the restoration/reference path. See [current Gemini integration and setup](gemini-audio-integration.md).

# Audio in the shared ADAPT material flow

Audio uses the same journey as other materials: upload → prepare source → choose support → grounded Claude adaptation → accessible experience. No learning objective or diagnosis is required. The original MP3/WAV is the source; transcription and AI explanation are separate derived representations.

## Boundaries

- `learning/audio.ts`: server-only signature/container/frame validation, bounded WAV/MP3 decoding to signed 16-bit mono PCM. WAV accepts uncompressed integer PCM (8/16/24/32-bit) and 32-bit float, mono/stereo, 8–48 kHz. MP3 accepts complete MPEG Layer III frames, including variable bitrates and ID3 metadata. It does not interpret metadata or fetch attachments/URLs. Unsupported compressed/extensible WAVs, damaged/truncated streams and files exceeding limits fail honestly.
- `learning/transcription.ts`: replaceable **ASR** interface backed by Amazon Transcribe Streaming, not another generative model provider. Pinned `@aws-sdk/client-transcribe-streaming` 3.1145.0; pinned `mpg123-decoder` 1.0.3 supplies server-side WASM MP3 decoding without native executables or browser decoding work. Audio streams as 100 ms PCM chunks at approximately real-time pace. No S3 bucket, batch job, queue or persistent file storage is introduced.
- `learning/http.ts`: existing bounded upload accepts audio, automatically transcribes it, validates final results, then creates the same temporary source-ready session. No Claude call is made until the learner requests adaptation. Silence/no final speech, invalid results, credential/permission/service failures, cancellation and timeouts never create a false ready state. Failed transcription retains any previous server session. No audio content or transcript is logged.
- `learning/material.ts`: `sourceForAdaptation` passes timestamped transcript units to the existing Claude provider. Audio bytes and the original audio unit are retained in the session but excluded from Claude input. Source audio fingerprint, origin link, ordering and timestamp bounds are checked before adaptation.
- Shared source controls retain selectable timestamped transcript segments, optional standard audio playback (no autoplay, no preload), and the learner's original file link. Text is usable without hearing the recording. Existing `Readable` regions expose transcript and adapted text to global Read Aloud; speech/voice engines are unchanged.

## Provenance and integrity

Original bytes have a SHA-256 fingerprint and `audio-1` source unit with decoded duration. Final ASR segments receive deterministic `transcript-N` IDs, exact recognised text, transcript character offsets and `startSeconds`/`endSeconds`. Each segment records Amazon Transcribe, language, original source ID/fingerprint and available word-confidence information. The session fingerprint binds the audio fingerprint to the timed transcript representation, so a changed transcript cannot reuse the old session fingerprint.

Only final results are used; partials are not source content. Duplicated IDs, overlapping/out-of-order/out-of-range timestamps, missing text and invalid confidence values fail validation. Results are not reordered or silently repaired. Adapted references use existing exact server-owned transcript excerpt IDs. This verifies reference fidelity **to the transcript**, not whether recognition captured the original speech correctly.

Machine transcription is visibly labelled, with an always-present audio adaptation notice. ASR may mishear mathematical notation, numbers, names, accents or specialist terms. Low confidence adds an advisory warning (0.8 is a provisional display trigger, not an accuracy certificate). Absence of a warning is not verified speech. Non-speech audio, speaker attribution, inaudible detail and visual references absent from the recording are not reconstructed. Original audio stays alongside the text; learners unable to verify by listening should seek a trusted accessible transcript when important details are unclear. Editing/correcting transcripts, caption export, diarization and video ASR are deferred.

## Hearing-accessible pathway

Audio defaults to **Make spoken content readable**, which can be changed or combined with the existing needs. The existing Claude adaptation contract requests readable topic sections and key points in its standard `steps` field. All transcript segments must be referenced; original transcript and timestamps remain beside the explanation. No separate audio lesson product, objective gate, grading or new LLM is added. Claude Sonnet 4.5 stays the adaptation model.

## Initial operational limits and privacy

- Audio: 64 MiB and 30 minutes, at least 0.5 seconds; at most 24 final segments / 60,000 transcript characters. Gemini returns one transcript with up to 10,000 word annotations. High-bitrate WAV may hit the byte cap earlier than the duration cap.
- Upload/preprocessing has a 120-second deadline. Transcription and adaptation each have a separate 600-second deadline with cancellation, two upload slots, and no late session commit. The upload route allows 750 seconds, adaptation 630 seconds; browser timeouts allow 780/660 seconds respectively. The deployment host must permit long Node requests; this is not an Edge runtime flow.
- Audio and transcript occupy existing bounded 15-minute in-memory sessions. Original file URLs are browser-local and revoked on replacement/unmount. There is no permanent ADAPT storage, learner identity sent to ASR, or client-side AWS credential exposure. AWS service data handling is separate from ADAPT's memory lifetime; do not interpret temporary ADAPT storage as a guarantee about AWS retention.
- Current ASR explicitly uses `en-US`; English is disclosed before submission. Other languages and multilingual accuracy are not claimed. Stereo channels are mixed to mono, with a source limitation; overlapping speech may degrade recognition.

## AWS setup and observed blocker

The SDK reuses the existing standard AWS credential chain / `AWS_PROFILE`; never paste or commit credentials. Transcription needs `transcribe:StartStreamTranscription` (`Resource: "*"`, optionally region-constrained). Adaptation still needs the existing `bedrock:InvokeModel` access. No IAM or Organizations policies are modified by this feature.

`ADAPT_TRANSCRIBE_REGION` defaults to **eu-central-1** (Frankfurt), independently of Bedrock's existing region. AWS's [streaming endpoint list](https://docs.aws.amazon.com/general/latest/gr/transcribe.html) does not list `eu-north-1`; using the same Stockholm region is not a documented streaming option. To change the ASR region, use a documented streaming region allowed by your organisation and restart ADAPT. See [streaming format/chunk guidance](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html).

On 2026-10-07 a synthetic spoken WAV was decoded and sent through the real SDK to Frankfurt. AWS returned **AccessDeniedException, HTTP 403**, explicitly denying `transcribe:StartStreamTranscription` in a **service control policy** (safe request ID: `f71dd4c3-c800-41e0-9e6c-479fffa35025`). No transcript or Claude audio adaptation was returned. An AWS Organizations administrator must amend the applicable SCP to permit this action in an approved streaming region, and the runtime role/profile must also have the IAM allow. Adding an IAM allow alone cannot override an SCP deny. Do not try other regions merely to evade this deny. No bucket or new credentials are needed. **Live end-to-end audio success remains unverified until this account policy is resolved.**

Reuse the existing smoke tool after setup (paid AWS transcription/model invocations):

```powershell
$env:ADAPT_TRANSCRIBE_REGION = 'eu-central-1' # only once permitted by your organisation
node --conditions=react-server --import tsx scripts/learning-smoke.ts --file='C:\path\to\lesson.wav' --need=read-spoken
```

The tool reports transcription counts and validated adaptation counts, or redacted AWS diagnostics. It does not print the audio/transcript. MP3 uses the same command.

## Verification scope

Unit/integration tests use genuine MP3 silent frames and PCM WAV fixtures, injected AWS stream results, and the existing replaceable Claude transport. They cover signatures, truncation, resource limits, PCM chunks, Unicode, final/partial results, no speech, credential/service failures, cancel/deadline, timestamps, deterministic fingerprints, exact source references, original preservation, session retention and upload → adaptation.

Browser tests run against a production Next server. Successful transcript/adaptation service outputs are mocked; actual production decoding and honest ASR-disabled error states are also exercised for both MP3 and WAV. Browser tests cover readable sections, provenance, keyboard controls, optional original playback, no autoplay, Read Aloud availability, 320 px layout and axe accessibility. They do not prove live transcription accuracy or actual screen-reader/audible playback acceptance. The existing PDF/image/text/video and `/demo` regression suite remains the baseline.

Final verification on 2026-10-07: `npm test` **101 passed**; `npm run lint` passed without warnings; `npm run typecheck` passed; `npm run build` passed; `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` **24 passed**. These results include existing regression checks. Real live audio success is **blocked**, as recorded above; automated service mocks must not be mistaken for a successful AWS transcription.

## Files affected in this task

- New `src/lib/learning/audio.ts` and `transcription.ts`: decoding, ASR boundary and transcript attachment.
- Shared `src/lib/learning/types.ts`, `material.ts`, `http.ts`, `provider.ts`, `source-label.ts`: audio contracts/acceptance, source integrity, support preference, transcript-only Claude grounding, and timestamp labels.
- `src/app/api/learning/route.ts`: upload duration budget.
- `src/components/adapt-workspace.tsx`, `original-material.tsx`, `adapted-learning.tsx`: audio selection/progress, hearing-accessible choice, optional playback, readable transcript and visible uncertainty.
- `src/app/adapt.css`: audio player sizing and wrapping material-type badges on narrow screens.
- `package.json`, `package-lock.json`: the two pinned, necessary packages noted above.
- `scripts/learning-smoke.ts`: reuse existing smoke diagnostics for ASR followed by adaptation; no source text logging.
- New `tests/audio.test.ts`, `tests/fixtures/audio.ts`, `tests/e2e/audio.spec.ts`; updated `tests/e2e/adapt.spec.ts` for the additional support choice.
- `README.md` and this document: setup, architecture, operational limits and honest live-status evidence.

The shared speech/voice engines, canonical fixture, PDF extraction/quality layers and existing model identity were not changed. Pre-existing working-tree changes were preserved; no AWS policies, credentials or production infrastructure were created or modified.
