# Factual-fidelity resolution: source-preserving reference experiment

## Decision

**GO for further work/rehearsal on a bounded, source-preserving stepwise candidate. NO-GO for production integration today.** Production remains unchanged.

The two reported failures are prevented in the new benchmark mode by taking factual rewriting out of the model's job. The model selects server-owned paragraph/key-point references; valid references expand to source wording before the unchanged evidence/schema validators and added fidelity checks. It cannot replace `may` with `often`, change attribution/numbers, or rewrite a table cell's ownership relationship in displayed content. Invalid/missing/reordered references fail; missing content is never inserted as a repair.

This is **not a general semantic paraphrase validator**. It rejects even plausible synonyms and changes the experiment from generated explanations to source-preserving layout and key-point selection. It also depends on a source-complete representation. The current visual table transcription is Codex-reviewed fixture data, not automatic extraction or human-confirmed source authority. Product approval of this narrower adaptation behavior, human source confirmation and real assistive-technology rehearsal remain necessary before rollout.

## Exact failures and their cause

Inspected the latest Git diff, preservation review, source extraction/validation/resolution code, incremental reader, review skills and actual saved outputs from `preservation-3` / `preservation-4`.

- Original page 5: `May use high-capacity fiber-optic links.` Generated key point: `Recognize that MANs can connect multiple LANs and often use high-capacity fiber-optic links.` Possibility became an unsupported frequency claim.
- Related page 7: source `Can involve greater latency and management complexity than a local network.` Run 3's key point changed that into `typically involve ...`.
- Original page 9 table: WAN **Typical ownership** cell is `Provider and/or organization`. Run 3's table paragraph instead says management is by `providers and organizations`, loses the explicit ownership attribution, and does not preserve the source's alternatives. Run 4 happens to retain `and/or`; that inconsistency is not a reliability guarantee.

These are already present in generated content, before reference resolution, assembly or rendering. Existing structural/source-evidence checks correctly do not assert semantic equivalence of every paraphrase. The old 23-passage contract did not cover every fact-bearing sentence or the unextracted table cells. Neither JSON normalization nor a renderer fix can resolve that gap.

## General rule, rather than phrase exceptions

`scripts/pdf-incremental/fidelity.ts` implements an optional, isolated source-preserving contract:

1. Source paragraphs cover the entire reviewed textual body in order. Splitting on reviewed heading boundaries must round-trip to that body character-for-character. The source title is preserved; only the reviewed non-teaching footer/title prefix is excluded from paragraph content.
2. Key points are exact, same-page source statements selected in their original order, at most six. They cannot add prefixes, change modality, negate a claim, change values/units, move attribution or introduce prose. Examples/revision prompts remain in paragraphs exactly once under the existing protected-passage checks.
3. A generic reviewed-table representation binds each value to both its **column/entity** and **row/attribute**. Deterministic column descriptions preserve cell operators and terminology literally. All cells are required; there are no generated table key points that can contradict them.
4. Introduction, titles, content kind and limitations are constrained as well, so a new factual claim cannot be moved into a heading or the envelope to bypass paragraph checks.
5. Opaque paragraph/step IDs are validated for exact coverage, order, duplication and page scope before expansion. Expansion is not acceptance of model-generated quotations or output repair. Unknown prose/IDs are rejected.

The deployed lesson type is unchanged: final `paragraphs` and `steps` remain plain strings. Only the **benchmark provider wire contract** uses IDs. Original PDF bytes/excerpts and source provenance remain intact. Text evidence still resolves through the original exact excerpt resolver. The reviewed visual table retains `mode: visual`, empty quotation and page provenance; no fake extracted text or fabricated text-evidence ID is introduced.

`networking-fidelity.ts` is the explicit fixture boundary: it checks the approved PDF fingerprint/11 physical pages, recognizes its reviewed footer/title layout, declares its heading groups, and contains a transcription of the original page-9 matrix. The matrix has all **15 cells** across LAN/MAN/WAN and five attributes: scope, technologies, ownership, management and complexity. Its status is `codex-visual-review`; **human confirmation is outstanding**. The generic renderer does not special-case WAN, `may`, `often`, or either ownership phrase.

The generic code refuses unknown visual-only pages, wrong fingerprint/page, missing layouts, inconsistent table shapes and source groups exceeding the existing schema budget. These are conservative eligibility failures, not silently truncated lessons. These trusted repository fixtures are not a production authorization system for accepting client-claimed review status.

## Trace and completeness

```text
Original PDF / exact extracted text / explicitly reviewed visual transcription
  → immutable source presentation contract
  → Claude selects complete paragraph IDs and source key-point IDs
  → exact ID coverage + scope validation
  → source expansion → existing evidence/schema checks + fidelity checks
  → independently validated incremental text sections
  → full response/session validation → committed lesson → optional practice
```

Original streaming/error/cancellation/session expiry behavior remains. Each section is checked before exposure; visual sections and following sections wait until full completion. Invalid references cannot be marked complete or enable practice. Whole-lesson checks still require all pages in order and an unchanged exposed prefix. The existing production full-lesson path is untouched; this experiment is not imported by `src/`.

Both successful reference runs:

- Retained every reviewed textual body, headings and original statement in order, including all 13 examples, six revision prompts and four protected purpose statements (23 protected spans).
- Preserved `May use high-capacity fiber-optic links.`, `Can involve ...` and the original table value `Provider and/or organization`.
- Retained every table row/column association and original cell value against the checked fixture.
- Produced **identical displayed factual sections** in both runs. Displayed paragraphs/key points equal the expanded source representation on all 11 pages; no renderer filtering or post-generation repair occurs.
- Generated five live, validated practice questions each through the unchanged practice provider, with exact displayed answers and original source references. Direct review found questions answerable from the shown lesson (scope, technologies, switches, routers and combined networks).

For reference-mode reports, `generationToAssemblyUnchanged` compares the **reference-expanded representation** with the committed lesson. Raw provider text contains IDs, not those paragraphs; `referenceExpansion: true` makes that distinction explicit. `assemblyToRenderedUnchanged` compares actual DOM text across every section.

The source contract proves literal coverage relative to inspected extraction and the reviewed visual fixture. It does not prove source truth, correct extraction of arbitrary PDFs, or completeness of undetected diagrams on text-bearing pages. Source-selection context can also matter: section titles accompany standalone bullet key points in Read Aloud, but arbitrary conditional/pronominal passages would need eligibility review. No universal semantic-understanding claim follows.

## Live results

Same approved networking PDF: `LAN_WAN_MAN_10_Page_Study_Material.pdf`, SHA-256 `cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01`; 11 physical pages. Same `stepwise` preference, empty description/focus, existing Claude Sonnet 4.5/model configuration. Native PDF/excerpts are retained; no prompt compaction or model shopping.

| Run / variant | First visible section | First instructional content | Full visible completion | Provider round trip |
|---|---:|---:|---:|---:|
| Reference 1 baseline | 56.63 s | 56.89 s | 56.63 s | 56.54 s |
| Reference 1 incremental | 8.16 s | 9.40 s | 21.46 s | 21.39 s |
| Reference 2 baseline | 58.73 s | 59.00 s | 58.73 s | 58.59 s |
| Reference 2 incremental | 8.94 s | 10.60 s | 22.44 s | 22.26 s |

First instructional access improved **82–83%**; full completion improved about **62%** in these two samples. Reference 1 is baseline-first; reference 2 is incremental-first. No statistical reliability claim is made from two runs. Ordinary local verification overlapped parts of execution.

Browser timing starts at the isolated button click **after PDF preparation**, using two animation frames as a visibility proxy. It is not production file-selection/upload-to-paint timing. Preparation: 0.850 / 0.378 seconds separately. Server first instructional-section validation: 9.222 / 10.007 seconds; whole server commitment: 21.423 / 22.322 seconds. Pages 1–8 arrive incrementally; the visual table and pages 10–11 follow at completion.

Baseline input/output tokens: 26,178 / 3,250 and 26,178 / 3,328. Candidate: 28,462 / 1,957 in both runs. Model input grew; output shrank because references replaced factual prose generation, **not because lesson content was dropped**. The expanded lesson preserves more strictly specified source text than the paraphrased baseline. Actual billed cost is not returned by the API; usage is recorded without inventing invoice amounts.

Baseline request hash remains `574e603282882a7197b18229fffd8e17a957507d681e94b9293491665ccfaa2c`. Both reference requests share `5b602007b0a1525b5a662ce59da230f093d7fe2cf373c959553add41654e4c4e`; source-contract hash `2d10c1e53b3aa56cd97005b921f942746da77a07f713c39947282d2934eb950d`. Production hash comparisons pass in all reports.

### Failed intermediate attempt retained

`fidelity-1.json` records the earlier direct-copy experiment. The first section validated at 12.06 seconds, but Claude merged/rewrote page 2's source groups instead of copying them. The stricter gate rejected `source-2`; no instructional section/completed lesson was accepted. The harness then timed out waiting for that blocked section. The harness now races section arrival against explicit failure and records incomplete output promptly. This result is preserved, not counted as success.

References remove the model's opportunity to rewrite those factual strings; they do not make an unverified paraphrase acceptable.

## Tests and environment verification

- `npm test`: **151/151 pass**, retaining source, PDF, audio, practice, cancellation/expiry and accessibility utility regressions.
- Focused fidelity/incremental/preservation suites: **16/16 pass**; final fidelity-only rerun **6/6 pass**.
- Regression cases reproduce the reported qualifier and ownership errors and related changes: possibility → frequency/certainty, some → all, negation, numeric bounds/units, attribution, AND/OR/AND-only/neither relationships, row/column swapping, omitted cells, extra claims, unknown visuals, wrong page/fingerprint, missing/duplicate/reordered/cross-page references and altered headings. Plausible synonyms are deliberately rejected rather than labelled semantically equivalent. Unknown-reference errors do not echo private model/source text.
- `npm run typecheck`, `npm run lint`: pass.
- `npm run build`: **pass on final retry**. An initial harness `never[]` inference error was corrected with an explicit string-array type. Two later retries hit Windows `EPERM` unlinking an old generated `.next/static/<buildID>` directory. Inspection showed `lstat: directory=true, symlink=false` while directory enumeration reported `directory=false, symlink=true`; Next cleanup attempted file unlink. A later enumeration reported a directory and the normal build succeeded. This is a transient OneDrive/reparse metadata/tool-cleanup issue, not evidence of a production PDF change. No dependency/configuration edit, manual cache deletion, or shared-server termination was used.
- `fidelity-accessibility-2.json`: **11 offline browser scenarios pass**, zero axe violations, no overflow at 320 pixels. Includes full source speech queues, title context/modality for short key points, keyboard focus, stable announcements, no arrival autoplay/restart, cancellation, duplicate/error/early-end states and complete-path retry. Uses silent speech mocks.
- Both live pairs: keyboard, silent Read Aloud, axe, narrow layout, all-page rendering equality and live practice pass. Candidate practice: 12.32 / 11.49 seconds; paired baseline 10.34 / 10.93 seconds. Practice was not optimized.
- `$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:e2e -- tests/e2e/read-aloud.spec.ts tests/e2e/loading.spec.ts tests/e2e/audio.spec.ts`: **12/12 pass**, 2.2 minutes. These are controlled-provider checks, not a new live audio-transcription test; the full 33-test E2E suite was not rerun.
- Actual audible playback, device voices and screen-reader rehearsal remain outstanding; automated checks are not accessibility certification.

## Reproduce without overwriting existing evidence

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/pdf-incremental/benchmark.ts fidelity-rehearsal-3 --fidelity-refs --reverse
node --conditions=react-server --import tsx scripts/pdf-incremental/accessibility-check.ts fidelity-accessibility-rehearsal-3 --fidelity
node --conditions=react-server --import tsx --test tests/pdf-fidelity.test.ts tests/pdf-preservation.test.ts tests/pdf-incremental.test.ts
```

Use fresh result labels. The live command invokes two adaptations and practice for completed variants and incurs Bedrock usage. It uses existing credentials without printing values. Original/expanded responses are saved only in the private temporary review directory named by each report; repository JSON reports contain metrics and reference metadata, not uploaded document contents.

## Changed files and preserved work

- New: `scripts/pdf-incremental/fidelity.ts`, `networking-fidelity.ts`, `tests/pdf-fidelity.test.ts`, this report and newly labelled JSON evidence.
- Updated isolated files: `projection.ts` (fidelity/ref checks), `benchmark.ts` (opt-in flags, failure race and metrics), `accessibility-check.ts` (reference mode/context checks), `viewer.tsx` (section title accompanies source-selected key-point speech).
- No production module imports this experiment. Existing six tracked dirty files/statistics remain unchanged; prior skills, reports, benchmark results and uncommitted work are preserved. No commit or revert.

Source-grounding/accessibility skill instructions were followed by reading repository `SKILL.md` files directly; automatic discovery is not asserted.

## Remaining acceptance conditions

The latency benefit **does justify further work**: both first content and whole completion improved materially while known source wording/cell relationships were preserved by construction.

Before production integration:

1. Obtain human confirmation of the page-9 transcription and define a trustworthy complete source representation for eligible PDFs. Reject/fall back for unverified visual content rather than claiming text extraction covers it. The current reviewed-layout fixture supports this document only.
2. Explicitly approve source-preserving stepwise behavior: AI selects key points but does not generate new explanatory prose. This may suit reading/listening/stepwise needs; it is not a replacement for simplification or arbitrary visual-description adaptation. The model also selected an administrative “10-page study material” lead as a key point despite the instruction to prioritize teaching statements—a smaller selection-quality issue for rehearsal.
3. Rehearse actual speech/screen readers and source-group readability. Long verbatim groups, bullet symbols and spoken chapter-title context require real-device feedback.

**NO-GO for automatic/general production PDF adaptation now. GO for a controlled source-preserving candidate/rehearsal after those source and product checks.** The existing architecture still cannot reliably detect arbitrary semantic changes in free-form generated explanations; that limitation is not solved or hidden by these reference checks. No production migration has occurred.
