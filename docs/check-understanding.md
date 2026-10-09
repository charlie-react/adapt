# Optional understanding practice

ADAPT offers “Ready to see what you picked up?” at the end of the adapted lesson. Nothing is generated until the learner chooses **Check my understanding**. The existing adaptation request, source material, ingestion, and demo experience remain unchanged.

## Interaction

Practice contains 3–5 short-answer questions, shown one at a time. Learners may consult the lesson, type or dictate an answer, then choose **Explore my response**. Immediate feedback quotes the lesson’s explanation verbatim and invites comparison with their response. This is deliberately a self-check, not automated answer marking: there are no grades, correctness judgments, scores, timers, or performance histories. Learners can finish at any point.

Questions, instructions, quoted explanations, and completion messages participate in the existing semantic Read Aloud system. Standard forms/buttons, labelled voice fields, heading focus after transitions, a polite feedback region, and the shared accessible loading component support keyboard and screen-reader operation. Leaving and returning to the last lesson section retains practice state while the component remains mounted.

## Boundary and integrity

- `LearningProvider.createPractice` uses the existing replaceable Claude provider and the server-owned source, adapted sections, and accessibility preferences. No identity or learner answer is sent. Audio uses the existing transcript-only boundary; native audio bytes are never sent to Claude.
- `POST /api/learning/practice` accepts only the current fingerprint and revision. Existing same-origin, capability-cookie, expiration, concurrency, cancellation, and deadline protections apply.
- `UnderstandingQuestion` contains an ID, prompt, section ID, exact `answerQuote`, and source evidence. `validatePractice` requires 3–5 distinct bounded questions, valid source references belonging to the specified lesson section, and an exact continuous answer quote from that section’s presented paragraphs or key points. Unknown sources, invented quotations, changed mathematical answer text, extra fields, and answers absent from the lesson fail closed.
- Source excerpt IDs resolve server-side through the existing evidence resolver. PDF quotation matching remains exact. Existing visual references retain their existing meaning as interpretations rather than independently verified visual facts.
- The store validates again and caches valid questions for the session/revision. A new adaptation invalidates this cache. The source and adapted lesson are not mutated, and the practice endpoint cannot supply source content or learner answers.
- Responses stay in local component state, are not sent for grading, and disappear when the experience is left. Generation failure offers a simple retry; the adapted lesson remains available. Fewer than three supportable questions is an unavailable optional activity rather than permission to invent content.

## Limits

Exact quotations and references establish traceability and prevent newly generated feedback explanations. They do not mechanically prove the semantic correctness of a generated question, or independently verify the source’s mathematics/visual relationships. The provider is instructed to ask only about explicit, unambiguous presented content, never add calculations or solve/correct the source. This phase adds no separate assessment engine or model provider.

## Verification

Unit/integration coverage includes count/schema/duplicate checks, exact lesson quotes, cross-section/source rejection, mathematical wording, text/PDF/audio provider requests, protected HTTP requests, cache behavior, failures, and retry without losing the lesson. Browser tests cover opt-in, one question at a time, keyboard navigation, immediate non-graded feedback, early finish, failure/retry, voice input, Read Aloud, narrow screens, and axe accessibility checks. A live Claude smoke test successfully adapted a synthetic source and returned four validated questions, each with its answer present in the lesson. No private document content or credentials were logged.

## Files in this change

- `src/components/check-understanding.tsx`: optional invitation, one-question reflection, local answers, immediate quoted feedback, and finish state.
- `src/components/adapted-learning.tsx`, `src/components/adapt-workspace.tsx`, `src/app/adapt.css`: end-of-lesson integration, request wiring, and presentation.
- `src/lib/learning/types.ts`, `practice.ts`, `provider.ts`, `provider-response.ts`, `service.ts`, `http.ts`, and `src/app/api/learning/practice/route.ts`: question contract, existing-provider generation, exact validation, protected request, and ephemeral cache.
- `tests/understanding-practice.test.ts`, `tests/e2e/adapt.spec.ts`, `tests/e2e/loading.spec.ts`: integrity, request, interaction, accessibility, and regression coverage.
- This document records the boundary and the self-check feedback decision.

Final checks (2026-10-08): `npm test` passed 120 tests; `npm run lint`, `npm run typecheck`, and `npm run build` passed. The production-runtime Edge Playwright suite passed all 32 tests, including axe accessibility checks. A test-only punctuation encoding mismatch was corrected before the final successful browser run. Automated checks do not replace manual testing with assistive technologies.
