# PDF practice: displayed-lesson answer references

## Current diagnosis

At revision `a5665be`, before this fix, the October 8 ODE and LAN live-response records were replayed through the current parser, source-evidence resolver and practice validator. Parsing and source evidence succeeded; both failed at `Answer was not presented in the lesson`. The colonialism read-spoken response passed with four questions. This is a present-code replay of historical live output, not a fresh live invocation or evidence that every PDF fails.

The current path is upload/preparation -> validated adaptation -> protected in-memory session -> practice request with fingerprint/revision -> Claude -> JSON parsing -> source-evidence resolution -> practice validation -> UI. Practice receives the actual stored experience, not an independently reconstructed lesson. PDF practice also supplies native PDF bytes/extracted evidence; audio practice supplies only source-owned transcript units. Both previously asked Claude to regenerate an exact `answerQuote` while also providing the original source. ODE included a source-only repeated-root representation and capitalization changes; LAN copied a source statement rather than the displayed adapted wording. Strict rejection was correct. The service maps failure to 503 and the optional practice UI offers retry without replacing the lesson.

The earlier stale development-store failure is separate. No runtime server was inspected or restarted in this task; the store/session implementation was not changed.

## Targeted change

`practice-answers.ts` builds request-local server-owned references to complete paragraphs and key points in the supplied displayed experience. Each reference identifies its section, unit kind and zero-based index. Only non-empty units within the existing 1,600-character answer budget are eligible. Registry text is copied exactly, including capitalization, subscripts, equations and punctuation. No source-only statement or generated replacement is added.

The Claude practice wire contract now returns exactly:

```text
{questions:[{id,prompt,sectionId,answerRef,evidence}]}
```

The prompt supplies the displayed sections and the reference/index map without duplicating their text. It asks for questions answerable from selected displayed units and supported by the source, with no new calculations or knowledge. Source evidence still resolves through the existing exact source/excerpt resolver. The new resolver rejects unknown/cross-section references, extra fields, mixed quotation/reference contracts and counts outside 3–5. It replaces `answerRef` with the exact server-owned `answerQuote`, then runs the unchanged domain validator. The session service independently revalidates before caching.

The domain/UI contract remains `{id,prompt,sectionId,answerQuote,evidence}`. Feedback quotes the complete selected paragraph/key point. No fuzzy matching, capitalization repair, mathematical reconstruction, validator relaxation, new provider, UI redesign, or session change was introduced. Audio uses the same references against its displayed transcript-based lesson, and original audio bytes remain excluded from Claude practice input.

## Regression evidence

`tests/fixtures/pdf-practice-records.json` contains reduced, non-sensitive source/lesson/question records from the existing ODE, LAN and colonialism diagnosis, with explicit lesson-unit selections. Historical model-generated quotations are retained to demonstrate the original rejection. Those selections are controlled test responses, not a production heuristic that repairs old output or proof of new live generation.

- ODE and LAN: original quotation responses still fail; selected references pass current provider parsing, source resolution, strict validation, session storage and HTTP practice handling.
- Successful selectable-text PDF: real in-memory PDF bytes pass upload, adaptation validation and practice with controlled external responses.
- Audio: recorded colonialism read-spoken practice passes at the transcript-only provider boundary; genuine WAV upload/transcription/adaptation/practice passes with controlled external responses. Existing MP3/WAV and Gemini regressions remain in the full suite.
- Negative cases: unknown, wrong-section and missing-unit references; mixed fields; 2/6 questions; forged source evidence; exact Unicode preservation; failure/retry preserving the stored lesson. Existing fingerprint/revision/cache tests remain intact.

Verification: full `npm test` passed 125 tests. After final test-only strengthening of invalid-reference retry and hearing preferences, all 10 practice tests passed again. `npm run typecheck` and `npm run lint` passed; targeted ESLint on all changed TypeScript files passed after the final test edits. `git diff --check` passed. Final diff inspection confirmed only the practice provider, new answer resolver, tests/fixture and this report were changed by this task; pre-existing README, AGENTS.md and skill changes were preserved. No live service invocation or new browser/build run was performed.

## Source-grounding review and remaining verification

The repository `adapt-source-grounding-review` skill was read and followed directly. The reviewed change preserves the distinction between original source evidence and displayed generated lesson text. Unknown evidence/reference failures remain closed; no unpresented quotation is accepted as feedback. UI, accessibility, ingestion, providers, session behavior, original diagnostic records, README and skills are unchanged by this task.

A valid reference establishes that feedback was presented and source-linked; it does not mechanically prove that the question is semantically answered by that unit or that the existing adaptation is independently correct. The prompt constrains relevance, but representative live/manual review remains necessary. No new semantic-entailment claim is made.

Before claiming live PDF practice success, create fresh ODE, LAN and a previously successful PDF lesson with the current server, request practice through the normal UI, and verify 3–5 questions, correct section/reference selection, useful feedback and source fidelity. Recheck colonialism audio practice. If an old dev process has an incompatible retained store, restart it deliberately and re-upload; do not patch unrelated session state or alter validation to conceal a failure. This task does not repair the separately diagnosed Turbopack/OneDrive cache.
