# End-to-end ADAPT learning experience

The home route now follows **material → content understanding → access needs/preferences → adapted learning**. A written objective and an objective-confirmation screen are not prerequisites. Any objective in the source remains context which the provider is instructed to preserve. An optional learner-written focus stays separate from source content and is displayed as the learner's choice.

The earlier goal-first home interface is superseded. Its review/session APIs, extraction quality policy, corpus evidence and tests remain compatible. The canonical binary-tree experience stays at /demo and continues to use deterministic relationships and its original explanation provider.

## Boundaries

- src/lib/learning/material.ts turns actual uploaded bytes or pasted text into a LearningMaterial with a source fingerprint, typed source units and locators. It checks signatures, container structure, resource limits and unsupported cases server-side.
- The original PDF path reuses the isolated PDF.js worker through inspectPdfSource, with existing cancellation, page/text/item budgets and deadlines. This is a **new native-document understanding scope**, not certification that the old selectable-text extraction passed its quality gate. Uncertain decoded/ordered/code text is withheld from exact-quote evidence; Nova receives the original PDF as a document input. Legacy extracted-text quality blockers remain enforced.
- SourceUnit preserves original page number and PDF page label, text offsets, image identity, or video duration/timestamp. A supplied video transcript is a distinct learner-provided source unit, never verified audio.
- LearningProvider is replaceable. Its current server-only implementation uses Bedrock Converse and Amazon Nova Lite, with three separate operations: understand, adapt and reflect. PDF/image/video bytes are native multimodal inputs, rather than pretending extracted prose describes their visuals. AWS credentials use the SDK's standard chain and never reach the client.
- validation.ts checks strict structured output, complete source-unit coverage, unique IDs, bounded plain text, exact text quotations, valid visual references and video timestamps. Adaptation retains every analyzed topic ID. Unreadable coverage blocks the whole material; limited coverage must retain visible uncertainty. No subset workflow exists.
- service.ts owns the immutable source and current understanding. Browser requests cannot supply replacement material, evidence or objectives. Adaptation requires valid understanding, a matching fingerprint and current revision. Reflection uses an actual stored practice question; it is source-grounded feedback, not formal grading or a general chatbot.
- HTTP handlers enforce bounded bodies, same-origin requests and an HttpOnly, SameSite=Strict capability cookie. Raw source stays in bounded temporary server memory (8 sessions, 32 MiB source budget, 15-minute lifetime); AI concurrency is limited to two jobs with 60-second deadlines. There is no database, document persistence, account or performance history.

Source bytes and optional source text, AI understanding, AI adaptation, learner preferences/focus and learner practice responses are separate contracts. Uploaded names are not used as provider document names. No document text is logged. Learners are asked to use non-sensitive sources and avoid personal details in free-text preferences.

## Practical supported inputs

| Input | Path and current limits | Honest limitations |
| --- | --- | --- |
| Pasted/dictated text, UTF-8 .txt/.md | Exact Unicode/indentation-preserving text, 30,000 characters | No images are inferred from prose. |
| PDF | Original native document plus page references; 4 MiB, 20 pages and existing parser budgets | Model descriptions of diagrams, equations, tables and layout are interpretations, not deterministic reconstructions. Scans may be attempted through the visual source; unreadable coverage blocks use. |
| PNG/JPEG | Native image; 3 MiB, dimensions up to 4096 each | Container/dimension validation is not full pixel decoding. Bedrock must accept/decode the image; blurry or obscured content can remain unreadable. |
| MP4 | Native video; 8 MiB, up to 120 seconds, valid duration/video-container metadata | Nova Lite uses sampled visual frames, **not the audio track**. Optional pasted/dictated transcript is needed for spoken material. No transcription, transcoding or caption generation. Container checks cannot establish codec support; fragmented clips with missing/zero duration are rejected. |

Nova Lite's supported native modalities and visual-only video scope are documented in [AWS Nova modalities](https://docs.aws.amazon.com/nova/latest/userguide/modalities.html). No additional paid AI/TTS provider, dependency, remote URL fetching or attachment/action execution was introduced.

Passing structured validation proves reference validity and coverage declarations. It does **not** prove semantic entailment, correctly read every pixel, establish mathematical correctness, or prevent a model from incorrectly declaring clear coverage. The interface labels source excerpts, visual interpretations, AI understanding and AI adaptation distinctly. More demanding educational material needs source-faithfulness evaluation before production reliance.

## Learner interaction

1. Upload a supported source or paste/dictate material. “Understand my material” validates and analyzes automatically; there is no PDF audit or objective gate.
2. Choose access support: connected steps, visual descriptions, clear language, listening, or simple keyboard interaction. A custom preference and learner focus are optional and support voice input.
3. Open the real provider-generated learning experience: navigable source-grounded topics, complete semantic statements, ordered steps when appropriate, provenance disclosure, uncertainty notes and non-graded practice/reflection.
4. AI failure shows an honest retry state. Original text/file remains available; prepared or invented adaptation is never substituted. Starting again clears the temporary session.

The dark-purple visual system is scoped to the new home flow so /demo remains a regression surface. It uses restrained lavender actions, readable typography, spacious grouping, gold keyboard focus and native responsive controls. Source/technical details use progressive disclosure rather than dominate the learner journey.

Global semantic Read Aloud remains the single reading engine. New content registers complete statements through Readable, including the initial introduction, understanding, adaptation, practice and reflection. No DOM text extraction or new speech segmentation is used.

VoiceField and VoiceInput provide one browser-native speech-recognition boundary for every editable text field. Activation is explicit, final phrases append to editable text, only one microphone session is active, Escape/Stop interrupts, and unmount/page exit/disabled inputs abort recognition. Starting dictation stops owned Read Aloud playback. Unsupported browsers and denied permissions retain full keyboard/typing access. Browser recognition can use an online browser service; it is not advertised as offline/local. See [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Verification and live use

Run the existing unit tests, lint, typecheck, production build and Playwright suite. Presentation tests deliberately mock model responses only in the browser; the real HTTP/store/provider boundaries are tested separately through injected test providers. Production has no prepared/mock response path. Playwright sets ADAPT_AI_DISABLE=1 to prevent accidental model charges through a configured default profile.

The new synthetic live smoke command exercises text, a real PNG diagram and a real PDF through understanding, adaptation and reflection:

    node --env-file-if-exists=.env.local --conditions=react-server --import tsx scripts/learning-smoke.ts

It prints only source kind, structured counts or redacted AWS/validation error diagnostics. It never prints document contents or credentials. The existing binary-tree npm run test:live command is unchanged.

Initial live attempt on October 5, 2026: all three inputs reached AWS credential discovery and failed with CredentialsProviderError: “Your session has expired. Please reauthenticate.” **No successful live Nova response was observed at this point.** Renew the existing AWS session with aws login (and the existing profile option if needed), then rerun. Set AWS_REGION/AWS_DEFAULT_REGION or a standard AWS profile region, and a supported BEDROCK_MODEL_ID/inference profile when the account requires it. Never paste secrets into chat.

## Acceptance limits

Automated axe, keyboard and silent speech/recognition tests supplement manual screen-reader, microphone and audible playback acceptance. A successful native API response alone is not a completed evaluation of code indentation, equation fidelity, table structure, difficult diagrams or video coverage. This implementation deliberately does not fabricate these details or claim automated transcripts. Server sessions are process-local and expire on restart; streaming persistent storage and multi-instance infrastructure remain deferred.

## Files changed for this implementation

These are the changes from the end-to-end implementation, not all previously uncommitted work in the repository.

- Learning boundary: src/lib/learning/types.ts, material.ts, validation.ts, provider.ts, service.ts, http.ts.
- Bounded request utility: src/lib/server/request.ts.
- Narrow PDF reuse: src/lib/ingestion/pdf/adapter.ts adds the original-document inspection export; existing extraction/quality behavior is unchanged.
- Routes: src/app/api/learning/route.ts and analyze/route.ts, adapt/route.ts, reflect/route.ts, source/route.ts.
- Learner UI: src/components/adapt-workspace.tsx, adapted-learning.tsx, voice-field.tsx.
- Speech coordination: src/lib/accessibility/voice-input.ts and a small useStopReadAloud export in src/components/read-aloud.tsx. The semantic reading engine and SpeechSynthesis implementation are unchanged.
- Visual entry points: src/app/page.tsx, layout.tsx, adapt.css.
- Verification: tests/learning.test.ts, voice-input.test.ts, fixtures/learning.ts, e2e/adapt.spec.ts, e2e/material-review.spec.ts, playwright.config.ts, scripts/learning-smoke.ts.
- Documentation: README.md and this document.

The old home-screen E2E assertions were replaced because that goal/PDF-review interface is intentionally superseded. Equivalent legacy confirmation/blocking checks remain as API E2E tests; existing unit coverage is retained. The binary-tree and Read Aloud E2E files remain unchanged.

## Verification results — October 5, 2026

- npm test: **71/71 passed**, including all prior unit/integration cases plus the new source, native-content, grounding, HTTP/session, objective-context, failure, cancellation and voice tests.
- npm run lint: **passed**.
- npm run typecheck: **passed**.
- npm run build: **passed**, with all five new Node server routes included in the production build.
- PLAYWRIGHT_CHANNEL=msedge npm run test:e2e: **21/21 passed** against the production server. Includes new keyboard journey, source provenance, modal input presentation, denial/unsupported voice cases, global semantic Read Aloud, axe accessibility, 320-pixel overflow checks, plus /demo, legacy quality gates and the real PDF extraction runtime.
- Desktop and narrow home/learning screenshots reviewed. An inherited light header background and a secondary-button hover contrast issue were discovered and corrected before the passing run. No unrelated demo styling changes were needed.
- Live Nova: **not verified**. Actual synthetic text/image/PDF calls failed during credential discovery because the standard AWS session expired. Test model responses are explicitly test-only; they are not evidence of live Nova success. Video tests verify request construction, container/resource handling, source/transcript separation and UI; the synthetic MP4 container fixture is not a playable clip and does not establish successful live video decoding.
- Manual audible playback, real microphone recognition and screen-reader/device acceptance remain manual checks.
