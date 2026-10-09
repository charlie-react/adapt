# Learner-facing UX cleanup

The learner journey remains **provide material → choose support → learn**. This change concerns presentation, not ingestion, transcription, adaptation or quality policy.

## Learner experience

- Upload and support screens use brief, plain language, with useful file limits and the existing optional voice controls.
- The finished experience opens at its lesson title, with section navigation, adapted content, key points and practice. Welcome content, journey steps and the sample invitation no longer repeat above/below the finished lesson.
- Source previews, original-material sidebars/playback, evidence links, provenance labels, limitation panels, scope notes, provider/model labels and the prototype badge are removed from the active learner experience. This follows the explicit request to remove Source/provenance from the UI; source records themselves are retained.
- The sample lesson keeps its diagram, complete relationships, objective, exploration and competency practice, using learner-facing labels without provider/validation explanations.
- Read Aloud stays in the header; semantic reading units, speech logic, keyboard navigation and voice recognition remain intact. Async actions retain short accessible progress announcements and alert/status semantics.

## Error and diagnostic boundary

`src/lib/learning/learner-messages.ts` maps known error codes to short actions. Raw HTTP error text, exception messages, parsing failures and provider details are never used as learner alert text. Unknown errors receive a generic retry message. Unusable material still cannot become an experience, and provider failure never substitutes fabricated learning content.

All existing provider contracts, validators, audio fingerprints/timestamps, quality checks, source snapshots, internal warning collections and protected source endpoints are unchanged. Developer evidence remains in existing diagnostic scripts/reports and server-owned session data/API responses. Removing diagnostic UI does not erase those records or make them learner-confirmed facts. No new logging of uploaded contents, credentials or learner identity was introduced.

The cleanup does not filter or rewrite actual lesson prose. Material that teaches AI or discusses historical sources may naturally contain those words; the removed text is ADAPT's implementation commentary and controls.

## Files

- Learner views: `src/components/adapt-workspace.tsx`, `adapted-learning.tsx`, `voice-field.tsx`.
- Shared/sample presentation: `src/app/layout.tsx`, `src/app/demo/page.tsx`, `src/components/lesson-workspace.tsx`, `semantic-explorer.tsx`, `competency-practice.tsx`, `src/lib/fixtures/binary-tree-source.tsx`.
- Presentation utilities/styles: `src/lib/learning/learner-messages.ts`, display descriptions in `src/lib/learning/types.ts`, `src/app/adapt.css`.
- Regression coverage: `tests/learner-messages.test.ts`, `tests/e2e/adapt.spec.ts`, `audio.spec.ts`, `lesson.spec.ts`, `read-aloud.spec.ts`.

## Verification

- Unit/integration: **109 passed**. Includes new plain-language error tests and existing ingestion, transcription, provider, grounding, provenance and safety tests.
- Lint: passed.
- Explicit type checking: passed.
- Production build: passed.
- Full production-browser E2E suite in installed Edge: **25 passed**, including keyboard, narrow screens, voice input, all material types, the sample lesson, Read Aloud and axe accessibility checks.
- Desktop and 320-pixel finished-lesson screenshots were inspected. The dark-purple design remains; the lesson occupies the former source-sidebar space and no repeated welcome block precedes it.

The first browser run exposed a mock-only speech queue issue: the audio mock never completed the heading utterance. The mock now signals completion so the unchanged engine can read the queued paragraph. No speech engine change was needed. A file encoding error caught by the build was corrected to UTF-8 before the final successful checks.

Automated axe checks and keyboard tests are not a claim of independent assistive-technology user testing. No new live provider evaluation was needed for this presentation-only task. No dependencies, providers, infrastructure, secrets or AGENTS.md changes were introduced.
