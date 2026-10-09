# PDF material-quality policy review

Date: 3 October 2026. Status: **recommendations for product review; no policy or application change approved or implemented by this document**.

Keep whole-document blocking as the default for the first PDF MVP. Treat the low-content threshold as an advisory source-comparison signal, never a minimum lesson-size or reliability test. Plan a later explicitly reviewed subset workflow, initially at page boundaries, once scope, provenance, dependency and review safeguards are defined. A subset must become a separately assessed selection; it must not turn the original blocked document into an apparently complete, verified lesson.

These recommendations follow ADAPT's objective-preservation, source-integrity, accessibility and low-bandwidth principles in [AGENTS.md](../AGENTS.md). They do not authorize upload UI, objective inference, changes to Bedrock, or relaxation of existing blockers.

## Evidence and limits of the review

The review inspected [material-quality documentation](material-quality.md), [types](../src/lib/material-quality/types.ts), [policy](../src/lib/material-quality/policy.ts), [gate](../src/lib/material-quality/gate.ts), [PDF translation](../src/lib/ingestion/pdf/quality.ts), [normalization](../src/lib/ingestion/pdf/normalize.ts) and [quality tests](../tests/material-quality.test.ts). Corpus evidence comes from the [validation report](pdf-validation/report.md), [historical extraction results](pdf-validation/results.json), [manifest](pdf-validation/manifest.json) and [follow-on gate results](pdf-validation/quality-gate-results.json).

**Implementation facts:** the gate checks source identity/link consistency, independently retained source unit count, ordered page records, block ownership and extraction origin. It does not verify all extracted words against the original PDF. Any blocking reason makes the whole input `not-ready`. All PDFs have selectable-text/formatting warnings, so none automatically become `ready`. Confirmation reassesses a server-held snapshot, checks its fingerprint, source-review assertion, accepted scope and warning acknowledgements, then issues an immutable value. The source-review assertion does not prove accurate human comparison. No PDF is connected to the accommodation engine.

**Test facts:** inspected tests cover rejection, missing/empty/low-content units, partial coverage, uncertainty, decoding loss, unsupported/unknown warnings, provenance faults, stale review, exact scope, immutable confirmation, actual PDF ingestion and column/code warning regressions. They do not validate educational completeness, effective human review, a minimum text threshold, or subset safety. The prior implementation recorded 46 unit/integration and 12 E2E passes; those are historical verification results, not new runs in this review.

**Corpus observations:** 24 documents were assessed twice with matching reports: six `ready-with-warnings`, 18 `not-ready`. Seventeen extracted text successfully; seven expected rejections remained blocked. Eleven successful extractions were blocked by limitations. The historical version-1 extraction run and version-2 gate evidence must not be conflated: warning detection and source-count provenance changed between them. This diagnostic corpus has no independent full educational-sufficiency labels and is not a representative statistical sample from which acceptance/error rates can be estimated.

| Corpus example | Observed evidence | Policy implication |
| --- | --- | --- |
| `columns-interleaved` | Original anchors survived but their order failed; version 2 blocks with reading-order uncertainty | Text presence/volume can conceal unreliable statements |
| `columns-ordered` | Original fixture's expected order passed; version 2 also blocks conservatively | A layout signal can block an observed usable ordering; its presence is uncertainty, not proven corruption |
| `code-indentation` | Code words survived, indentation and five expected line boundaries did not; now blocked | Formatting can carry meaning and cannot be waived by word counts |
| `mixed-text-scan` | Two pages, one with text; second has no selectable text; blocked | Some extraction success does not establish complete learning material |
| `unicode-embedded-font` | Exact Unicode/punctuation control passed; gate records 38 non-whitespace characters and a low-content warning | Short material can be accurately extracted |
| `maths-layout` | Seven blocks and 87 non-whitespace characters pass the low-content rule; gate allows warning review, while the original report identifies fragmented notation | Warning readiness and sufficient volume do not establish equation understanding |
| `mit-theory-slides` | 24 replacement characters already in PDF.js output, historical physical pages 4–8; blocked | Decoding loss must remain visible; normalization cannot claim to repair it |

## 1. Whole-document blocking

**Recommendation:** retain the current default for the first PDF MVP, while making the eventual explanation precise: “This material cannot proceed to accommodation yet.” It should remain possible to inspect reliable extracted pages and source references in review. Blocking downstream use need not prevent diagnostic review or mean every page is unusable.

**False-acceptance risk:** two missing pages can contain the definition, diagram, code, prerequisite or explicit objective needed to interpret the other 18. Full text-page coverage is also insufficient: an interleaved page can contain every word in the wrong order. Without a dependency/objective review contract, a “90% usable” rule would silently trade educational accuracy for volume. The current gate has neither authority nor evidence to make that trade.

**False-rejection cost:** a blank separator, cover, bibliography or independently readable appendix may block useful prose. The ordered-column fixture demonstrates conservative detection exceeding observed order failure. Long resource-limited books are usable sources in principle but outside current extraction budgets. Whole-document blocking will reduce usable intake, particularly for slides and technical subjects; the six accepted-with-warning corpus cases are not evidence of broad MVP acceptance.

**Product choice:** this trades initial availability for an explainable, narrow accommodation boundary. The alternative is a scoped selection workflow, not a lower percentage threshold or a blanket “continue anyway” button. Keep the safer default until that workflow exists; do not claim this is the final policy for arbitrary learning materials.

An empty page should not automatically become a warning on the assumption it is blank: the current extractor cannot distinguish a genuinely blank page from an image-only learning page. A later verified exclusion of a blank/non-instructional page can permit a selection, without weakening that rule for retained material.

## 2. What low content should mean

**Implementation fact:** a nonempty source unit is flagged if it has **fewer than 40 non-whitespace characters OR fewer than eight whitespace-delimited words**. Empty units follow a separate blocking path. These counts aggregate text per page/unit, not per block. Low content alone yields a warning, not a blocker; there is no document-level minimum and no opaque score.

**Recommended semantics:** “This page contains little extracted text; compare it with the original to check for missing visual content or intentional brevity.” It must not mean “unreliable extraction,” “insufficient knowledge,” “too short to learn from,” or “adequate material once the number is exceeded.” A heading, vocabulary prompt or short instruction can be complete. A long garbled paragraph can be incomplete. Whitespace word counting is particularly weak across languages without space-delimited words, while JavaScript string length is not a count of human-perceived characters.

**Evidence judgement:** the rule is defensible only as an explicitly provisional, nonblocking attention cue. The corpus does not empirically validate 40 or eight, provide an optimal replacement, or establish sensitivity/specificity. Three documents have low-content units in the gate evidence: the accurately extracted Unicode control, poor paint order, and the Python excerpt's final page. The latter two have independent blocking reasons. The mathematics fixture shows that passing both volume checks offers no assurance of intact notation. Do not tune constants to make these 24 documents pass.

**Architecture recommendation:** preserve separate count signals, extraction fidelity, content coverage and educational sufficiency. No generic amount of text can establish the last item. Before revising the threshold, annotate short legitimate instructions/title pages, image-heavy pages, multilingual/non-space-delimited text, code and corrupted-but-long pages; assess whether the warning helps reviewers and its burden. Use those observations to choose a product rule, not a hidden confidence score. An eventual review of objective-relevant material must remain separate and cannot be inferred here.

## 3. Later corrected-subset workflow

**Recommendation:** support this later, subject to explicit approval of who can verify scope and corrections. Start with **page exclusion and source comparison**; treat manual transcription/order correction as a separate capability. Excluding a page is simpler than proving a changed statement faithful. Section/block exclusion should wait until semantic boundaries and cross-page dependencies can be reviewed; inferred headings alone do not establish safe section boundaries.

The current model is not subset-ready. It requires unit indices 1 through the original count and complete links. A selection of original pages 2, 7 and 9 cannot be passed through by renumbering them 1, 2 and 3 or changing the original source count. That would obscure provenance. A later selection contract must add selection order separately from immutable original locators.

Proposed requirements, **not implemented interfaces**:

- **Immutable parent reference:** original source hash, adapter/extraction version, original page count, extraction fingerprint and complete original unit/block registry. Original extraction and its blocked report remain available.
- **Complete selection ledger:** included original unit IDs in explicit order; excluded IDs with structured reasons and source-comparison evidence; every original page accounted for exactly once. Unknown, duplicate, overlapping and forged references fail. A displayed coverage statement must say, for example, “18 of 20 pages selected; pages 6 and 14 excluded,” even if all selected pages contain text.
- **Separate coverage dimensions:** original extraction coverage, intentionally selected coverage, and reliability of retained content. Removing problematic pages cannot rewrite historical coverage or make the original extraction `supported`. Document-wide/unattributed warnings remain unresolved unless their impact on the selection has been established; simply filtering warning arrays is unsafe.
- **Correction lineage:** preserve original extracted text, original block/page links and a separate reviewer-authored correction with evidence, revision and verification status. Mark its origin as reviewed correction, never untouched source/extraction or AI output. Retain detected limitations/history; any resolved finding needs a scoped recorded verification, not deletion. Word edits, equations and code require different fidelity checks.
- **Educational scope check:** explicitly establish that excluded pages are unnecessary for the intended competency and that retained content has its prerequisites, definitions, referenced examples and context. “Most pages work” and acknowledgement alone are insufficient. A missing authoritative objective or essential context blocks the intended accommodation until supplied/verified; never silently narrow or replace the objective. For a self-contained excerpt with no explicit objective, this stage makes no objective claim and waits for the future separately approved objective-identification workflow.
- **Server-owned reassessment and confirmation:** assess the derived selection with its own fingerprint, selection/correction revision and policy version. Keep every unresolved retained/global blocker. Require exact scoped review and warning acknowledgements; invalidate confirmation after source, selection, correction or relevant objective/scope changes. A confirmation must bind the selection, not the parent document. Browser-submitted material/reports are not trusted evidence.
- **Downstream exclusion:** future analysis/AI/adaptation receives only confirmed retained material and necessary verified context. Excluded content remains diagnostic evidence, never a factual basis, practice answer or grounding citation. Original page numbers and exclusions remain visible in resulting experiences. Objective preservation remains a separate downstream obligation.

Selection can reduce usable scope without changing the competency only when its dependencies are satisfied. If a learner chooses a different learning scope, that is an explicit separate product action, not a silent repair of extraction. Quality readiness alone cannot authorize that change.

## Blockers and warnings

| Condition | First MVP | Possible later treatment |
| --- | --- | --- |
| Invalid/untraceable source or blocks, source-count inconsistency, missing unaccounted pages | Hard blocker regardless of usable-page majority | Repair provenance/re-extract; cannot waive by selection percentage |
| Empty input, parser rejection, password protection, no readable text, exceeded budgets/deadlines | Hard blocker for that attempt; coverage remains unknown where extraction failed | Retry safely or provide another supported source; selecting before extraction would be a separate bounded ingestion capability |
| Unrecognized warning or unresolved document-wide limitation | Hard blocker | Define its meaning/scope and reassess; acknowledgement cannot silently dismiss it |
| Reading-order uncertainty, decoding loss, suspected code-format loss, known unsupported structures on retained material | Hard blocker | Verified correction or an independently adequate selection excluding all affected content; no warning-only override |
| Empty/image-only page or partial extraction | Hard blocker for full material | Explicit verified exclusion can permit a new selection, provided context/objective dependencies are satisfied; unresolved scans stay excluded |
| Essential objective, definition, diagram, equation, table or code only available in excluded/unsupported content | Current gate cannot establish this dependency; known extraction limitations still block as above | Hard blocker for the intended accommodation even if 18/20 pages are reliable; source/context must be provided or fidelity established |
| Low-content nonempty page, inferred headings/boundaries, generic text-only scope, generic formatting uncertainty | Learner-visible warnings with source review | Remain warnings only while no specific retained-content fidelity problem is known; educational adequacy must still be established |
| Legitimate repeated footer or sparse title | No repetition-specific gate rule; may coexist with other warnings | Do not block solely on repetition or sparsity; any exclusion must be explicit rather than automatic |

Generic `FORMATTING_NOT_PRESERVED` is advisory because not every line break matters. Specific code indentation loss is blocking because it may change the lesson. Likewise, generic text-only scope is a warning, whereas a known essential unrepresented structure is a blocker. The gate cannot detect all such dependencies; future review must make this distinction explicit. Confirming text scope never claims visual structures were understood.

## Concrete policy examples

1. **20-page lesson; 18 prose pages reliable, two image-only pages.** First MVP: `not-ready`, with precise page references; 90% text coverage cannot override it. Later: if pages 6 and 14 contain necessary diagrams or an objective, still blocked for that competency. If a capable source reviewer establishes they are irrelevant separators, a new explicitly labelled 18-page selection can reach `ready-with-warnings` and then scoped confirmation. The parent remains incomplete. This is a hypothetical policy example, not a tested corpus document.
2. **Ordered versus interleaved columns.** Both currently block. The interleaved control has observed incorrect order; the ordered control has observed correct fixture order despite a conservative signal. Later verified source comparison might resolve the ordered case, or a supported ordered representation might replace it with recorded lineage. Neither should be released merely because all anchors are present. Tests against synthetic expected order do not automatically certify an uploaded document.
3. **Short Unicode lesson versus mathematical notation.** The Unicode control's low-content warning should prompt comparison without rejecting an accurately extracted short statement. The mathematical fixture passes text-volume checks and currently reaches warning review, yet equation structure remains unsupported. If the lesson depends on its equations, the reviewer must withhold confirmation for that purpose; a volume threshold cannot make it eligible.
4. **Python chapter with useful prose and unsafe code boundaries.** Excluding code can be acceptable only for a self-contained scope whose existing competency does not require interpreting that code. If code execution/interpretation is the competency, readable prose does not compensate for lost indentation. Any later correction must preserve exact code formatting and source lineage; this gate does not repair or execute code.

## Recommended states and transitions

Keep the existing three **quality states**; do not merge them with review progress or invent a numerical readiness score.

| Transition | Requirement |
| --- | --- |
| Extraction result → quality assessment | Server-owned bounded extraction, integrity and coverage checks |
| `not-ready` → source review | Inspection is allowed; accommodation remains blocked |
| `ready` / `ready-with-warnings` → awaiting source confirmation | Neither is automatic authorization; PDFs retain explicit text-only scope |
| Awaiting confirmation → confirmed usable extracted material | Current fingerprint/scope, source comparison and required acknowledgements; no blocker |
| `not-ready` → future revised extraction/selection/correction → reassessment | New immutable revision and complete lineage; never a direct “continue anyway” transition |
| Revised selection → confirmed scoped material | Technical readiness plus selection/dependency verification, exact warning acceptance and original-page coverage disclosure |
| Any relevant revision → previous confirmation stale | Require reassessment and review; never reuse an old parent/subset confirmation |
| Confirmed material → future analysis/objective validation → accommodation eligibility | Separate content/objective checks; quality confirmation alone grants no understanding or objective authority |

“Awaiting review,” “confirmed” and “stale” are review lifecycle concepts, not replacements for quality readiness. A blocked parent's later confirmed subset is a separate record; do not relabel the parent `ready`. These transitions are recommendations for later implementation, not new behavior.

## Accessibility and low-bandwidth implications

Source comparison cannot require the learner to visually inspect a PDF they cannot access. Offer a supported review route (for example, a trusted reviewer or an independently accessible source) and a clear recovery path. Do not require disability disclosure, force an inaccessible confirmation task, or imply the learner is at fault. Who can verify scope is a product decision; a checkbox alone is insufficient evidence for high-impact corrections.

Future review should use keyboard-operable standard controls, text summaries, named original page references, discoverable warnings and status announcements that do not rely on color. Exclusions must stay apparent after confirmation. Avoid dozens of repetitive acknowledgement controls that obscure the actual decision; group summaries while retaining precise reason/page records and backend validation.

Reuse extracted snapshots; assess/select on the server without retransmitting entire documents or calling AI. Send counts/reasons first and fetch selected page text/previews only as needed. Allow a reviewer-assisted path where preview downloads are inaccessible or costly. Retention/deletion and cross-session review are still undecided; the current process-local issued brand is neither persistent authorization nor a durable review history.

## Tests required when an approved policy is implemented

- Retain present fail-closed, stale-review, immutable-confirmation and no-AI regressions. Add the 20-page/18-reliable scenario with essential versus nonessential exclusions; majority coverage must not decide either case.
- Test exact low-content boundaries (39/40 characters, seven/eight words, OR behavior), whitespace-only content, long corrupted text, short complete instructions, Unicode combining characters and scripts without spaces. Verify counts are warnings, never grades, completeness claims or automatic page exclusions.
- Test noncontiguous original pages and distinct selection order without renumbering source locators; complete included/excluded ledger; unknown/duplicate/tampered references; source hash/count mismatch; missing exclusions and unresolved global warnings.
- Verify retained blockers cannot disappear through filtered warning arrays, changed coverage labels or review acknowledgement. Known dependencies on excluded pages and objectives must refuse intended accommodation.
- Test immutable correction lineage, changed text/order/selection invalidating review, unverified corrections refusing confirmation, distinct origins and exact source links. No fabricated correction can impersonate raw extraction.
- Test that excluded/unconfirmed content never reaches future provider inputs, grounding citations or practice; the parent report remains blocked and original coverage remains visible.
- Add manual source/order/transcription oracles for clean and interleaved columns, prose/code and maths, plus page-level review decisions. Measure warning burden and false acceptance/rejection only against explicit annotated criteria, not extraction success alone.
- When UI exists, test keyboard/screen-reader navigation, comprehensible blocked states, supported nonvisual review, visible exclusions, stale changes and grouped warning acknowledgement. Test summary-first/page-on-demand payloads and no document-text logging. Preserve existing fixture, Bedrock and Read Aloud regressions.

## Explicit product decisions still required

1. **First MVP intake policy:** approve continued whole-document blocking and its limited technical-document acceptance, or authorize a separately scoped subset capability before release. Recommendation: keep the default and defer subsets.
2. **Meaning of scope confirmation:** decide whether learners can self-confirm independent prose scopes and when another source-capable reviewer is required, especially for objectives, dependencies, code and equations. Provide an accessible verification path; do not make inability to inspect visuals a barrier to ADAPT itself.
3. **Low-content UX:** approve retaining the provisional rule only as an advisory signal and decide whether/how page warnings are grouped. There is no evidence-supported replacement threshold or minimum lesson volume to approve today.
4. **Subset semantics:** decide page-only exclusion first versus corrections, what constitutes independent educational scope, and how an explicit change of learning scope is authorized without weakening an authoritative objective. Recommendation: page-only reviewed selection first; no automatic exclusions or blocker overrides.
5. **Review evidence and lifetime:** define correction verification, scope/dependency evidence, review validity across sessions and safe source retention/deletion before designing durable workflows. Existing fingerprints/brands do not answer these product/data-policy questions.

The evidence supports a restricted, transparent source-review MVP and a later controlled selection boundary. It does not justify unattended PDF accommodation, guaranteed educational sufficiency, a universal low-content threshold, or treating selectable text as understanding of the source.

## Review execution

This task read repository artifacts and summarized existing content-free corpus records; it did not rerun extraction, install dependencies, call a model or rerun application tests. The only intended change is this Markdown review. Prior test/build results are reported as historical evidence. Existing code, policies, tests and validation evidence are preserved.
