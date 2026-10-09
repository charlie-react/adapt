# PDF upload and material review

Implemented 4 October 2026. The home page now offers a PDF intake path without loading the binary-tree fixture. The unchanged source/learning demo is available at `/demo`. The shared header, global semantic Read Aloud, explicit objectives, fixture accommodation, practice and Bedrock provider remain the baseline.

## Learner flow and the scope boundary

1. Choose a PDF and select **Extract and review PDF**. The page announces upload/extraction/quality checking and disables conflicting controls. Client size checks provide early feedback; the server validates actual bytes and enforces the existing parser budgets.
2. Review **Ready**, **Ready with warnings**, or **Not ready**, source page counts and curated limitations. The existing generic gate supplies the decision; there is no score or AI decision. A text-bearing PDF always has text-only/formatting warnings. Low content remains advisory and whole-document blocking is unchanged.
3. Open extracted pages through a standard page selector. Each page/block retains its physical source page, original label where available, deterministic block reference and extracted origin. Structure is labelled document-tagged or heuristic/unverified. Text is rendered as plain React text, never HTML. Empty source pages are shown honestly.
4. Compare with the original source. A local download link provides the unchanged selected file; no PDF is embedded or automatically opened. Help explains source comparison with a source-capable helper or an independently accessible source. A learner who cannot verify the material can leave it unconfirmed; no disability diagnosis is required.
5. For a permitted quality state, explicitly attest source comparison and accept the stated text-only limitations. Every source page must have been fetched/opened first. This is an interaction safeguard, not proof the learner read or accurately verified it. The service invokes `confirmUsableMaterial` on its own snapshot. Blockers cannot be overridden and pages cannot be excluded.
6. **Continue toward accommodation** calls a server guard that requires its issued immutable confirmation. The next-step panel states that PDF accommodation is unavailable until authoritative objectives and a supported strategy/adapter exist. It does not invoke the existing fixture accommodation API, infer an objective, generate practice or send the PDF to Bedrock. The independent demo is offered as a separate example.

This last transition is an honest, guarded handoff **toward** the accommodation boundary, not arbitrary PDF-to-learning transformation. Confirmation accepts extraction review scope; it does not establish educational sufficiency or understanding of diagrams, tables, equations, code semantics or scans. The warnings remain visible after confirmation.

## Modules and API

- `src/lib/material-review/types.ts`: generic review summary, source-unit content and guarded handoff contracts. Quality summaries omit internal diagnostic strings. Original identity/extracted content/heuristic structure remain separate from any future adaptation.
- `src/lib/material-review/service.ts`: server-owned temporary snapshots, source-page access, exact confirmation using the existing gate, immutable issued material and the guarded handoff. `createReviewStore` is independently testable and accepts generic `QualityInput`; it does not import PDF parsing or the accommodation/AI engines.
- `src/lib/material-review/http.ts`: bounded raw upload, same-origin checks, curated failures, strict confirmation-body validation and no-store responses. The PDF adapter is selected here for this first input. No dependency or parser implementation was added.
- `src/app/api/material-review/route.ts`: Node `POST` upload/extract/assess, `GET` summary or `?page=N` source-unit content, and `DELETE` discard.
- `src/app/api/material-review/confirm/route.ts`: Node `POST` exact review assertion/fingerprint/scope/reason acknowledgement.
- `src/app/api/material-review/proceed/route.ts`: Node `POST` guarded handoff status. Returns `awaiting-accommodation-support`; has no model call or accommodation fallback.
- `src/components/pdf-upload-workspace.tsx`: upload/review lifecycle, loading, recovery, original local-file link, attestations and next step.
- `src/components/material-review.tsx`: quality result, reason/page attribution, coverage and page/block provenance display. It uses the existing `Readable` registration API to supply explicit speech units, not DOM extraction.
- `src/app/page.tsx`, `src/app/demo/page.tsx`, `layout.tsx`, `globals.css`: intake home, preserved demo route, general “Skip to content” link and scoped review styles.

Future input handlers can provide `QualityInput` to the same service after their own validated extraction. PDF labels/view are the first presentation; do not make other inputs impersonate PDF pages. Future accommodation entry points must require confirmed material and separately validate objectives/strategy instead of accepting browser-supplied text or review status.

## Temporary lifetime, privacy and request safety

PDF bytes are uploaded for extraction and discarded after processing; the original selected file/download URL remains in browser memory. The server retains **only extracted snapshots/review state**, never a file on disk, for up to 15 minutes. There is no database, authentication or persistent history. Explicit discard releases the snapshot; a timer also removes idle snapshots. Refreshing/leaving loses the client file/review view, and server restart or a different worker may lose the snapshot; the recovery action is re-upload and re-review.

A random 256-bit opaque capability is kept in a same-site, HTTP-only cookie scoped to `/api/material-review`. It is not a user account, authentication system or durable proof. Cookies are Secure for HTTPS requests. Material hashes and IDs alone do not authorize review access. Snapshot lookup and confirmation happen on the server; no original bytes, raw extraction diagnostic strings or capability are returned in summaries. Same-origin/Fetch Metadata checks reject cross-site operations; all JSON responses are `no-store`. Content, titles and labels are treated as untrusted and no source content is logged by this implementation.

One cookie represents the browser's current review. Uploading another PDF invalidates the old snapshot. Other tabs can consequently receive stale/expired results; exact fingerprint checks prevent confirming one file as another. The next-step request also binds `X-Review-Fingerprint`, preventing an old tab from proceeding with another tab's newly confirmed file. The UI checks the returned fingerprint and invalidates stale review display. Discard requests from the UI carry the same revision check. Reopening a page marks it fetched, not source-verified. All attestations remain explicit.

Origin checks compare the browser's origin with the incoming Host and protocol rather than Next's reconstructed internal hostname; forwarded-host headers do not determine the allowed origin. The production browser test exposed this distinction, and a focused handler regression now covers it while cross-origin requests remain rejected.

The upload stream is bounded to 5 MiB even without a truthful Content-Length, has a 15-second combined intake deadline, and permits at most two concurrent upload handlers. Existing worker budgets/deadlines/page/character/item limits remain active. Review retains at most eight snapshots per Node process, each at most 20 source units and 100,000 extracted characters. Confirmation JSON is bounded to 64 KiB and an exact field shape; unknown fields, fabricated material payloads and invalid page indices fail. These engineering caps are not an adversarial-load or process-RSS guarantee.

The store is shared by route bundles within **one Node process**. Multi-instance/serverless hosting needs an explicit deployment design or re-upload/reassessment flow; current memory state is not distributed storage. Do not deploy this as an unrestricted public upload service merely because local tests pass. Deployment isolation, abuse controls and retention policy remain decisions from the spike/policy review; this phase introduces no persistence as a workaround.

## Failure, review and accessibility behavior

Malformed/truncated, empty, false-PDF, password-protected, scanned/image-only, oversized/budget-limited and interrupted extraction produce meaningful errors and no confirmed material. Busy/expired/stale/invalid review requests offer retry or re-upload. A partially readable PDF may expose its extracted pages for inspection while confirmation remains unavailable. There are no silent page drops, repairs, column reorders or subset overrides.

Controls are standard file inputs, buttons, selects, details and checkboxes. Progress uses a polite status region outside busy sections; failures use an alert. Review and next-step headings receive focus after their respective transitions; page selection retains normal keyboard behavior. Read Aloud receives explicit units for upload instructions, quality, warnings, source blocks, empty pages, failures and handoff. Speech does not turn extracted material into an adaptation or claim missing visual information is understood. Existing speech controls/engine are unchanged. Text/screen-reader access remains available without speech synthesis, and no audio auto-plays.

Summaries contain counts and references; full extracted text is fetched one page at a time without thumbnails, client PDF parsing, automatic full-document downloads or AI traffic. The original file link is optional and requires learner activation. This favors low-bandwidth operation, while source comparison may still need a helper or accessible source.

## Tests and remaining limits

`tests/material-review.test.ts` exercises real upload, page provenance, absent/forged capabilities, all-page review requirement, exact confirmation, stale input, unsupported bodies, cross-origin requests, whole-document blocks, byte/header limits, expected failures, discard, generic non-PDF storage, expiration/capacity and snapshot mutation isolation.

`tests/e2e/material-review.spec.ts` covers the real production keyboard flow, page-level provenance, warning/blocked states, explicit confirmation, guarded next step, no fixture-AI requests from upload, loading/error recovery, plain-text treatment of extracted markup, lost review recovery, hover/focus Read Aloud, narrow layout and automated axe checks. Existing lesson/Read Aloud tests navigate to `/demo` and keep their behavior assertions; the skip-link name is generalized. Existing extraction/corpus/gate/Bedrock tests remain intact.

No objective inference, arbitrary PDF adaptation/practice, corrected subsets, new formats, storage/history, OCR, content reconstruction or new AI provider exists. Human comparison is not technically provable by checkbox/page fetching; scope judgement and nonvisual verification support still need product review before broader educational use. Manual screen-reader/browser testing and deployment validation supplement automated checks.

Final verification on 4 October 2026:

- `npm test`: **51 unit/integration tests passed**.
- `npm run lint`: passed with no warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed, including the Node review routes and separate `/demo` page.
- `$env:PLAYWRIGHT_CHANNEL = 'msedge'; npm run test:e2e`: **18 production browser tests passed**, including the six new review tests and existing automated axe, keyboard, narrow layout, PDF-runtime, Bedrock-failure presentation and semantic Read Aloud regressions.
- `git diff --check`: passed. Captured desktop/narrow review layouts were inspected. Speech tests use silent browser mocks; no live model invocation or manual screen-reader certification is claimed.

The files changed in this phase are the modules/routes/components and app shell files enumerated above, `tests/material-review.test.ts`, `tests/e2e/material-review.spec.ts`, navigation/skip-link updates in `tests/e2e/lesson.spec.ts` and `tests/e2e/read-aloud.spec.ts`, this document and `README.md`. Extraction, quality policy/gate, provenance normalization, corpus evidence/tooling, accommodation, Bedrock, practice and speech-engine implementation files were not changed. No dependency, configuration or AGENTS.md changes were made; previous uncommitted work was preserved.

## Learner-journey follow-up (5 October 2026)

The original page-audit UI described above is superseded by the [universal learner journey](universal-learning-journey.md). The new UI accepts a distinctly recorded system-validated text scope while choosing a session goal; it does not claim a human compared every source page. Quality blockers and provenance validation remain unchanged. The original manual-confirmation API remains supported and tested.
