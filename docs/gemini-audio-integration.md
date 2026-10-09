# Audio transcription through Gemini

The existing journey now uses validated MP3/WAV audio → Gemini 3.5 Transcribe → server-owned transcript/provenance → existing Claude Sonnet 4.5 adaptation → existing accessible learning experience. No objective or independent material-understanding call is required. The audio player, transcript source controls, keyboard interface and global Read Aloud remain unchanged.

## Setup and provider boundary

Configure `GEMINI_API_KEY` only in the server environment or ignored `.env.local`, then restart Next.js. Never use a `NEXT_PUBLIC_*` key. Gemini is the default audio transcriber; set `ADAPT_TRANSCRIPTION_PROVIDER=aws` to restore the existing AWS streaming implementation when its account restriction is resolved. It retains the existing standard credential chain and `ADAPT_TRANSCRIBE_REGION` configuration. Failures never trigger automatic provider switching. `ADAPT_AI_DISABLE=1` disables transcription and adaptation in automated browser tests.

`AudioTranscriber` accepts decoded audio for resource/timing validation and the validated original bytes for Gemini. The server-only Gemini adapter uses the Interactions API, `gemini-3.5-transcribe`, verbatim mode and word timestamps. It supplies audio only: no learner identity, preferences, adaptation prompt, summaries, vocabulary hints or corrections. `store:false`, no-store requests and a fixed non-redirecting endpoint are used. The [MVP material limits](mvp-material-limits.md) apply: audio up to 64 MiB / 30 minutes, a bounded 8 MiB provider response, and 60,000 transcript characters / 10,000 word annotations. Two concurrent uploads and cancellation remain enforced. No additional dependency or storage is introduced.

The request follows [Google's transcription documentation](https://ai.google.dev/gemini-api/docs/transcribe) and the previously successful direct test. The current parser deliberately supports one completed text part with fully verifiable word annotations. Other response shapes, absent/invalid timestamps, incomplete output and provider failures fail honestly rather than fabricating provenance.

## Source fidelity and provenance

Original audio bytes and the original audio source unit remain intact. Gemini wording and punctuation are not rewritten. Character offsets, word text and timing must agree with the returned transcript and decoded duration. Whitespace is allowed between annotated words; missing non-whitespace content is rejected. Provider word timestamps with equal start/end offsets are represented explicitly as **points**, not positive-duration speech intervals. Reversed/overlapping/out-of-range timing is rejected. Transcript segment ranges must still have strictly positive duration.

Transcript provenance records `service:gemini-transcribe`, exact model ID, original audio fingerprint/source ID, character span, segment time range and word intervals/points. Language is `und` because this request does not establish a verified language code. Confidence is omitted rather than invented. Source controls retain these details. The machine-transcription warning remains visible; ASR is not independently verified speech.

The service validates original audio provenance before preparing transcript-only material. Claude receives transcript text/excerpts and preferences, never raw audio bytes or the Gemini key. The provider now accepts this already-prepared server material instead of attempting a second audio-byte preparation. Both existing provider and service validators still run.

For `read-spoken` audio without `plain-language`, Claude is instructed to preserve complete transcript wording/order in readable paragraphs and select exact excerpts as key points. The existing validator checks complete paragraph wording (ignoring layout whitespace only) and exact key-point excerpts. Paraphrase, omission or added facts in those fields fail rather than silently becoming a readable transcript. Selecting simplification intentionally permits paraphrasing under the existing grounding rules. Generated headings/introduction remain interpretations; existing structural/reference/number checks do not prove semantic entailment of arbitrary generated prose.

## Failure behavior

Missing credentials or denied access produce provider-neutral learner messaging with a text-transcript alternative. Invalid, missing or ungrounded transcription cannot create a source-ready session. Existing sessions survive failed replacement uploads. API response bodies, credentials and audio contents are not logged. HTTP status can be retained internally without exposing provider details to learners. No summaries or fabricated transcripts substitute for failures.

## Verification

Tests cover original MP3/WAV request bytes, transcription-only request configuration, recorded real Gemini output, Unicode/punctuation, all word timings including points, deterministic provenance, malformed/partial/empty responses, resource bounds, missing keys/disabled/abort/error cases, safe HTTP failures and the existing upload → Claude → source controls path. Source-preserving validation tests reject changed paragraphs and regenerated key points. Existing audio E2E fixtures now represent Gemini provenance while retaining the keyboard, narrow-screen, Read Aloud, source playback and axe checks. See the accompanying verification results for the actual live run and full checks.
