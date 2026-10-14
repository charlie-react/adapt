# Restricted source-preserving PDF integration

## Acceptance status

Implemented, default **off**. GO for controlled interactive rehearsal of the reviewed networking document. NO-GO for unattended demo enablement until the human checks below pass; NO-GO for general incremental PDFs.

Source-preserving organisation is intentional accommodation: the model selects verified paragraph/key-point references, rather than rewriting factual prose. This path is not a simplification or arbitrary visual-understanding replacement. Claude remains the adaptation provider; Gemini/audio, provider defaults, lesson schema, existing source validation and full-lesson implementation are retained. No commit, credentials/configuration-file edit, dependency change or OpenAI request.

## Exact eligibility

All of these are server-owned and required:

- `ADAPT_VERIFIED_PDF_INCREMENTAL=networking-rehearsal`; `ADAPT_AI_DISABLE=1` still disables the fast path. The switch is unset by default and is intended for explicit rehearsal acceptance, not a claim that manual gates passed.
- PDF bytes and material fingerprint both equal SHA-256 `cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01`.
- Reviewed 11-page layout, textual boundaries and table pass the existing networking contract constructor.
- The entire source-presentation contract hashes to `2d10c1e53b3aa56cd97005b921f942746da77a07f713c39947282d2934eb950d`; the 23 protected passages hash to `345ab2eebf7c453afea1f84d8e6a5587c3f7af3f1bbdaf3158586be70a6cc167`. Changed extraction or transcription is ineligible even with identical PDF bytes.
- Preferences are exactly `stepwise`, with no additional description or focus. Other preferences retain the original full adaptation path.

Filename, browser MIME, client claims or a client review flag cannot grant eligibility. The page-9 transcription is still labelled `codex-visual-review`; this release does not fabricate human approval. Unknown/unverified PDFs and visuals select the existing full provider, not a guessed incremental contract.

## Integration and lifecycle

The tested fidelity, preservation, reviewed fixture and projection modules now live in `src/lib/learning/pdf-incremental/`; benchmark modules re-export them, retaining the earlier experiments and results. `provider.ts` adds a replaceable optional progress adapter around the unchanged production request builder and the tested source-reference request.

`POST /api/learning/adapt-progress` uses the existing same-origin check, bounded request validation, HttpOnly session cookie and fingerprint/revision ownership. The learning store keeps its existing concurrency, deadline and 15-minute session lifecycle. Before each publication it rechecks cancellation, session identity, expiry and revision. Partial sections are never stored as completed experiences.

Only independently validated source-reference sections are emitted. The visual table and subsequent pages remain held until whole-document validation. Completion requires all pages, source order, protected content, exact source strings/relationships and an unchanged displayed prefix; the existing source validator runs again before committing the session. Practice is absent in the partial UI and cannot run against an uncommitted session.

The existing `AdaptedLearning` navigation/Readable regions render the available sections. New arrivals preserve the current section and focus; status text changes at partial-ready/completion/error rather than every arrival. Source-selected key points include their section title in speech for context, without adding spoken “Step” labels. Existing completed non-incremental lessons keep their reading behaviour.

Cancellation, truncated streams, provider/validation errors and expiry never label partial content complete. An explicit **Prepare the whole lesson** action clears the partial view and uses the original `/api/learning/adapt` route. There is no hidden paid automatic retry. Starting over cancels the old generation; stale responses cannot replace newer material. Expired/stale sessions request material again.

## Verification and timing evidence

Current integration verification:

- `npm test`: 157/157 passed, including audio, practice, fidelity and six new eligibility/progress/session tests. Final rerun includes pinned-contract eligibility and session error handling.
- Final production build, `npm run lint`, `npm run typecheck`, final `npx tsc --noEmit` and `git diff --check` passed.
- Full browser run: all 36 cases passed, including three new progressive UI cases, keyboard/focus, practice gating, narrow layout/axe, audio, Read Aloud and `/demo`. Windows teardown required stopping only the verified test-owned server on port 3100. The initial run was interrupted: its PDF presentation mock had not yet intercepted the new endpoint, and its generated `/demo` manifest failed. Updated mocks and a normal rebuild resolved those failures; no demo code/configuration/cache deletion was used.
- The first new test mock needed complete AWS event metadata/index fields for type checking; corrected without changing production semantics. The live-check script initially failed before any API call due to unsupported top-level await under the project’s CJS runner; it now uses an async entry point.
- Final-build focused reruns exposed a pre-existing 150-ms audio loading assertion race; the mock now waits for the asserted loading state through an explicit response gate. Audio production code was not changed. A subsequent 30-minute audio browser test hit the suite's 60-second timeout while other checks passed; the assertion/timeout were retained and the suite repeated without concurrent compiler/lint work. **Final focused rerun: 12/12 passed in 2.1 minutes**, including the 30-minute test in 20.9 seconds. The timeout is retained as evidence of local variability, not declared a proven application regression or hidden by raising the limit.

One real production UI/API rehearsal is recorded in `production-acceptance-1.json`. It used the same approved networking bytes, empty description/focus and stepwise preference, the configured Claude provider, and then the existing practice generator. It did not transcribe audio or compare other models.

| Measurement | Actual integrated run |
|---|---:|
| Upload button to support screen | 2.61 s |
| Create-experience action to first visible section | 14.07 s |
| Create-experience action to first instructional section | 15.50 s |
| Create-experience action to full visible lesson | 28.63 s |
| Practice action to visible validated questions | 11.13 s |

All 11 rendered paragraph arrays matched the pinned reviewed source contract; table cells matched and practice remained unavailable while partial. The live practice request passed the unchanged strict validator.

Historical isolated benchmark: instructional content 9–11 seconds, completion 21–22 seconds; historical full-path comparisons 57–59 seconds. These are earlier measurements, not a newly paired baseline. This integrated measurement starts immediately before clicking Create and includes the app request/render path after upload; upload is separate. Two animation frames are used as a visibility proxy. One live run is not a latency SLA or evidence of audible/screen-reader acceptance. Source contents and credentials are absent from the metrics report.

## Interactive rehearsal: required human checks

Use the actual application in Edge with your intended screen reader and real device voices. A restricted rehearsal server was started on `http://127.0.0.1:3209` for this task. If it is no longer running, from the repository root use:

```powershell
$env:ADAPT_VERIFIED_PDF_INCREMENTAL = 'networking-rehearsal'
npm start -- --hostname 127.0.0.1 --port 3209
```

Use the existing AWS configuration; do not paste credentials. This uses the current production build and incurs normal Bedrock charges when adaptation/practice is requested. Keep other dev servers separate. Clear the switch and restart to return that process to ordinary full-path behaviour; no `.env` edit is needed.

Upload `tests/fixtures/reviewed-networking.pdf` (identical approved source bytes), or the existing Downloads networking PDF. Leave only **Guide me step by step** selected and the optional fields empty. Then:

1. **Source confirmation:** compare all 15 page-9 cells with the PDF, especially WAN ownership **Provider and/or organization**, separate from management **Highly distributed**. Confirm all 13 examples (3 on p3, 3 on p5, 3 on p7, 4 on p10), six p11 revision questions and four p2 purpose statements. Confirm section order and literal May/Can qualifications. Check that the source-preserving groups are useful and understandable; they are not newly generated explanations.
2. **Real Read Aloud:** no autoplay. Activate the header control, focus/hover a meaningful region, and listen to complete statements. Test source-selected key-point context, qualifiers, examples, the table, Pause/Resume, Stop, Escape and Off. New arrivals must not restart current speech. Test original text access with reading mode off too.
3. **Keyboard/focus:** use Tab/Shift+Tab/Enter only. Navigate the available sections; explicit navigation must focus the section heading. Arriving sections and completion must not steal focus while reading. Test Stop preparing, full-lesson retry and Bring new material; focus must remain usable.
4. **Actual screen reader:** record browser/screen-reader versions. Verify the loading, first-ready, incomplete and complete announcements without per-section chatter; heading/outline navigation and meaningful control names; useful reading during updates. Automated live-region assertions do not establish this pass.
5. **Completion and practice:** before full completion, no practice invitation should be available. Cancel before completion: material must stay explicitly incomplete. Retry using Prepare the whole lesson, then navigate to the end and request practice. Confirm questions/feedback can be used without audio and are answerable from the displayed lesson.
6. **Fallback:** upload a different PDF or add a different preference/instruction. Expect the normal full-lesson path, not partial verified sections. Do not deliberately invalidate the source contract or disable validators for rehearsal.

Record each as Pass / Fail / Not tested. Any source, real speech, focus or screen-reader failure is a release blocker for this restricted path. No claim is made that human acceptance has occurred. General incremental eligibility would require separately reviewed source representations and additional acceptance evidence; it is not enabled here.

## Changed files

- New production core: `src/lib/learning/pdf-incremental/{provider,fidelity,networking-fidelity,preservation,projection}.ts`.
- New route: `src/app/api/learning/adapt-progress/route.ts`.
- Integration: `src/lib/learning/{http,service,types}.ts`; `src/components/{adapt-workspace,adapted-learning}.tsx`.
- Shared benchmark re-exports: `scripts/pdf-incremental/{fidelity,networking-fidelity,preservation,projection}.ts`.
- Reproducible live check: `scripts/pdf-incremental/production-check.ts`; this document; uniquely labelled live metrics.
- Tests: `tests/verified-pdf-progress.test.ts`, `tests/e2e/pdf-progress.spec.ts`, updated PDF presentation mock in `tests/e2e/adapt.spec.ts`, deterministic loading gate in `tests/e2e/audio.spec.ts`, and `tests/fixtures/reviewed-networking.pdf`.

Earlier working-tree changes, repository skills, benchmark records, OpenAI experiments and audio optimisations were preserved. The default adaptation provider, original full-lesson request/prompt, audio source/transcription/adaptation code, dependency manifest and lockfile were not changed by this task.
