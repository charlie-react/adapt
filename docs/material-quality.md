# Material quality and source review gate

The server-side boundary is **ingestion → quality/coverage assessment → confirmed usable extracted material → future analysis/accommodation**. This phase implements the first three steps as library functions. It creates no upload/review UI, HTTP review endpoint, storage, objective inference or AI call. The existing fixture accommodation pipeline is unchanged and still does not accept PDF material.

## Contracts and responsibilities

- `src/lib/material-quality/types.ts` defines format-neutral source units (pages, sections or future adapter-defined units), extracted blocks, coverage scope, signals, reports and review requests. Original source identity is retained separately from extracted text. Block structure is explicitly document-tagged, heuristic or unknown. There is no objective or AI-output field.
- `gate.ts` evaluates these records deterministically; `policy.ts` owns reason severity and curated learner-facing messages. Diagnostics remain separate and must not be presented as trusted learner content.
- `src/lib/ingestion/pdf/quality.ts` translates the PDF extraction result into this contract. `ingestAndAssessPdf` returns the unchanged extraction result alongside its assessment. `assessPdfMaterial` also accepts an already extracted result. PDF-specific provenance translation stays here, outside the generic readiness policy.
- The PDF worker now retains its independently declared `numPages` as `originalSource.unitCount`. The gate checks this against actual page records rather than deriving expected coverage from those records. Unit indices must be contiguous and ordered. Block identifiers must be nonempty/unique, linked exactly once to the correct unit and index, with consistent page labels and source identity.

Reports contain source/unit references, counts, coverage, readiness and structured reasons; no excerpts are needed to display a summary. `textUnitRatio` is the fraction of source units containing any text, **not the fraction of source meaning captured**. Failed extraction has unknown/null coverage. Low-content units are visible review signals (fewer than 40 non-whitespace characters or eight whitespace-delimited words), not failure scores or learning judgements. This provisional rule is language/layout sensitive and needs review before product use.

## Readiness policy (version 1)

| State | Meaning | Confirmation |
| --- | --- | --- |
| `ready` | Valid provenance, complete declared coverage, readable content and no known warning | Explicit source review is still required |
| `ready-with-warnings` | No blocker; specific scope/structure/formatting or low-content limitations remain | Require source comparison, exact scope acceptance and all warning acknowledgements |
| `not-ready` | Rejection, invalid provenance, missing/empty unit, partial coverage, reading-order/code uncertainty, decoding loss, known unsupported structure or unrecognized warning | Refuse confirmation; acknowledgement cannot override a blocker |

Every PDF receives `TEXT_ONLY` and `FORMATTING_NOT_PRESERVED`, even if the adapter warning list omits them. Accordingly, **no PDF automatically receives `ready`**. Confirming a PDF accepts only its `selectable-text` scope; it never certifies an entire document or promotes extracted text to authoritative source material. Diagram, table, equation, scan and code meaning is not understood.

This is a deliberately conservative **whole-material** policy. An empty cover/back page or benign wide spacing can block an otherwise useful document. Automatically discarding pages, overriding uncertainty or confirming a subset would hide a product decision; those capabilities are deferred. Alternative policies (page exclusion, reviewed correction or isolated subsets) require explicit design and separate provenance/coverage rules before implementation.

## Confirmation boundary for the future UI

```ts
const { extraction, quality } = await ingestAndAssessPdf(upload, signal);
// Show quality.reasons[].learnerMessage, scope and page counts;
// offer comparison against the original source and extracted blocks.
const decision = confirmUsableMaterial(pdfQualityInput(extraction), {
  assessmentFingerprint: quality.fingerprint,
  sourceReviewed: true, // collected from an explicit source-comparison action
  acceptedScope: quality.scope!,
  acknowledgedReasonIds: quality.reasons.map(reason => reason.id),
});
```

The example describes a future confirmed review action, not automatic acknowledgement. A future backend must use its own bounded, retained extraction result and validate incoming request shape; never assess material supplied by the browser as if it were a trusted adapter result. These TypeScript functions are an internal server contract, not an arbitrary JSON request parser. The `sourceReviewed` assertion records a person's review; it cannot prove that comparison was accurate.

`confirmUsableMaterial` reassesses the server-held material, refuses blockers, checks a SHA-256 fingerprint covering content/provenance/signals/extraction version/policy version, and requires matching scope and reason identifiers. Changed content or policy invalidates review. Errors are `NOT_READY`, `STALE_REVIEW` and `REVIEW_REQUIRED`.

Success issues an immutable, cloned `ConfirmedUsableMaterial` with `origin: "extracted"`. A private brand and issuance check prevent accidental construction, mutation or acceptance of a serialized client imitation in the same server process. This is a domain guard, not authentication or a persistent credential. Future PDF analysis entry points should require this value; reissue it by reassessment/review verification across process boundaries. Existing accommodation APIs remain fixture-only; no raw or confirmed PDF can reach them in this phase. Quality approval must never infer, weaken or replace a source objective.

A future UI should show curated messages as plain text with linked physical page references; retain original source bytes and extracted text separately for comparison. Treat page labels, titles, text and diagnostic messages as untrusted. Avoid rendering raw diagnostics, logging documents, or duplicating full documents in quality summaries. Decisions remain server-side, lightweight and bounded by the existing extraction budgets, with no network/model call. No client-side PDF parser is needed.

## Corpus gaps and narrow extraction changes

The normalizer now warns about wide whitespace bridges and column transitions that previously escaped its spacing check after PDF.js emitted line endings. It does **not** rearrange text or recover column order. A conservative lexical signal warns about some code-like lines; it does **not** restore indentation or boundaries. Generic PDF formatting warnings cover the unresolved limitation even when code is not detected. Both heuristics can miss cases or flag legitimate layouts; absence of a signal is not proof of correct structure.

The parser/library versions and safety limits are unchanged. Extraction version is now **2** because warning/coverage semantics and source-count provenance changed; deterministic material/block identifiers use `pdf-v2`. Historical version-1 corpus metrics and parser audits are preserved. Earlier extraction records lack independent source unit counts and must be re-extracted before this gate can validate them.

Decoding loss (including U+FFFD) blocks confirmation; there is no attempted repair of PDF.js mathematical-slide output. Known tagged unsupported structures block. Untagged equations/figures/tables may not be recognized, so text-only warnings and source comparison remain mandatory. A warning-only extraction cannot establish whether omitted visual information matters to an objective; that future decision is separate from extraction readiness.

## Verification and reproduction

`tests/material-quality.test.ts` covers generic non-PDF readiness, deterministic assessment, rejection, partial/empty/low-content units, uncertainty/unsupported warnings, replacement characters, provenance faults, stale review, acknowledgements, immutable confirmation, real PDF ingestion and the column-bridge/code warning regressions. Existing extraction, accommodation, grounding, Bedrock and speech tests remain in the regression suite.

```powershell
npm test
npm run lint
npm run typecheck
npm run build
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
node --conditions=react-server --import tsx scripts/pdf-validation/quality-gate.ts
```

The last command reuses the previously prepared public/synthetic corpus, verifies byte hashes, makes two sequential adapter/gate calls per document, and writes content-free `docs/pdf-validation/quality-gate-results.json`. It does not overwrite the original extraction metrics or benchmark memory/latency. The cache must already exist; there are no downloads or private uploads.

The 24-document follow-on run produced **6 ready-with-warnings, 18 not-ready and 0 ready**. All repeat quality reports matched. Extraction still succeeded for 17 documents; seven expected rejections remain blocked. Of successful extractions, 11 were blocked by known limitations. Lecture prose, tagged headings/lists, both Unicode controls, repeated boilerplate and the simple mathematics-layout fixture reached scoped warning review. The latter is explicitly **not equation understanding**. Both column fixtures, code-indentation, poor paint order, mixed text/scan pages, tabular/diagram spacing, public slide decks, paper and Python chapter were blocked. See the JSON for page-level coverage and reasons; successful text extraction is separate from quality readiness.

Verification completed on 3 October 2026: **46 unit/integration tests, lint, type checking, production build and all 12 production E2E tests passed**. E2E includes the existing PDF runtime checks, keyboard workflow, automated axe accessibility checks, narrow layout and global Read Aloud controls/semantic speech. `git diff --check` passed. No live AI call was made and no manual screen-reader certification is claimed.

## Files changed in this phase

- Added `src/lib/material-quality/types.ts`, `policy.ts`, `gate.ts` and `src/lib/ingestion/pdf/quality.ts` for contracts, policy, assessment and confirmation.
- Updated `src/lib/ingestion/types.ts`, `src/lib/ingestion/pdf/contracts.ts`, `worker-source.ts`, `adapter.ts` and `normalize.ts` for source unit count, warning vocabulary/detection and extraction version 2.
- Added `tests/material-quality.test.ts`; updated the typed fixture in `tests/pdf-validation-metrics.test.ts` for the source unit count. Existing corpus tooling and historical evidence were preserved.
- Added `scripts/pdf-validation/quality-gate.ts` and `docs/pdf-validation/quality-gate-results.json` for the repeatable follow-on corpus check.
- Added this document and linked it from `README.md` and `docs/pdf-extraction-spike.md`.

No learner UI, accommodation, AI, Read Aloud, dependency, Next configuration or AGENTS.md changes were made in this phase. Earlier uncommitted work remains intact.

Before building review UI, review the conservative blocking policy and low-content threshold, decide whether/how to confirm corrected subsets, and design source comparison that prevents acknowledgement from becoming a claim of full document understanding. Deployment-specific worker/memory validation and upload retention/abuse policy remain outstanding from the extraction spike.

## Learner-journey acceptance boundary (5 October 2026)

The [universal learner journey](universal-learning-journey.md) adds a separate `system-validated-text-scope` acceptance basis. Readiness policy and whole-document blockers are unchanged. It preserves exact warning/scope/fingerprint validation but does not require the learner to audit every page or claim human source verification. The original human-review contract remains available. Confirmed extracted content stays distinct from original source facts and later AI adaptations.
