# Gemini audio integration verification

## Outcome

PASS: original colonialism MP3 -> Gemini 3.5 Transcribe -> server-owned timed transcript -> existing Claude Sonnet 4.5 -> accessible experience, through actual production Next.js HTTP endpoints. Upload HTTP 200, adaptation HTTP 200. 4 sections; 144 word timestamps; complete paragraph transcript preserved and every key point an exact source excerpt. Transcription/upload 7614 ms; adaptation 12223 ms. Request-scoped session was removed after testing and the temporary server stopped.

## Checks

- npm test: 107/107 unit/integration tests passed, including six new Gemini/source-preservation cases.
- npm run lint: passed.
- npm run typecheck: passed.
- npm run build: passed (Next.js 16.3.8 / Node 24.20.0).
- Full npm run test:e2e with installed Edge: 24/24 passed.
- After the final presentation-only introduction instruction, audio.spec.ts and adapt.spec.ts: 10/10 passed against the final production build. These include keyboard, screen-reader markup/axe, narrow screens, Read Aloud, original source controls and honest failure behavior. Real assistive-technology user testing is not claimed.
- Final generated client bundles contain no configured Gemini API key (checked without printing it).

## Scope and files changed

- src/lib/learning/gemini-transcription.ts: server-only verbatim REST transcription, bounded response and strict text/word provenance validation.
- src/lib/learning/transcription.ts: reusable transcriber original-byte input, provider metadata, word point/interval provenance and default Gemini/retained AWS selection.
- src/lib/learning/types.ts and material.ts: honest Gemini origin/model and source provenance acceptance.
- src/lib/learning/http.ts: original audio handoff and provider-neutral failure messaging.
- src/lib/learning/provider.ts: accept service-prepared transcript-only input without repeating original-byte validation; source-preserving read-spoken instructions; presentation-only introduction. Claude remains the adaptation provider.
- src/lib/learning/validation.ts and service.ts: existing validation enforces full readable transcript wording/order and exact-excerpt key points unless simplification is selected.
- tests/gemini-transcription.test.ts and tests/e2e/audio.spec.ts: integration/failure/fidelity tests and Gemini provenance regression fixtures.
- README.md, docs/audio-material.md, docs/gemini-audio-integration.md and this directory: current setup, architecture and actual evidence.
- Ignored local .env.local: only AWS_REGION=eu-north-1 appended; existing keys preserved. No secrets committed, no dependencies added, no learner UI or Read Aloud redesign.

## Live findings and limitations

The first production attempts returned source-ready Gemini transcripts but safe adaptation failure. An instrumented existing-provider call exposed a source-number rejection: an introduction used mid-20th where the source uses mid 20th. Strict validators were retained. Read-spoken introductions now describe presentation, not source facts/dates. Exact-title transcript adaptations passed both service and provider validators. The final actual production HTTP run passed with AWS_REGION explicitly eu-north-1. Earlier generic HTTP failures cannot all be assigned a specific cause because their underlying provider errors were not captured; do not infer a proven AWS-region cause from correlation alone. Their safe results and captured diagnostic responses remain available.

Gemini latency varied substantially across requests (about 8-79 seconds), within the existing 90-second transcription deadline. Longer latency fails gracefully rather than creating a false transcript. This verifies one known educational MP3 live; WAV is covered by request/decoder/integration/browser tests, not a separate live WAV call.

The existing contract requires reliable timestamps: currently one completed text part with covering word annotations. Missing timing or an unsupported response shape fails honestly. Rounded point timestamps are retained distinctly; positive-duration transcript segment validation is unchanged. Language remains und rather than guessed. ASR warning remains; machine output is not universally guaranteed faithful to audio. Selecting plain-language permits paraphrase under existing grounding, so semantic fidelity of arbitrary simplified text still needs evaluation. The full original/transcript stay available. No objective inference, new UI, storage or unrelated providers.

## Local setup

Existing GEMINI_API_KEY is used server-side. Local AWS_REGION is now explicitly eu-north-1, the tested Bedrock region. Restart the regular dev server to load the integration/configuration. Existing AWS authentication still must be valid for Claude. ADAPT_TRANSCRIPTION_PROVIDER=aws restores the retained AWS implementation; its service-control-policy restriction remains unresolved and there is no automatic fallback.
