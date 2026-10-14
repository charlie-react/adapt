# Incremental source preservation fix and acceptance review

## Verdict

**Original example/revision omissions: fixed in the isolated benchmark. Production integration: NO-GO.**

Both final-contract runs retained all 13 example statements, six original revision prompts and four source-reviewed network-purpose statements, exactly once and in source order. Model-to-assembly and assembly-to-DOM comparisons passed for every page. The experiment retains early instructional access, but full completion is slower and direct source review still finds factual qualification changes and an inconsistent native-table interpretation. These are not hidden by a successful structural/passage-validation result.

No production code, prompt, provider configuration, audio pipeline, lesson schema, dependencies or existing results were changed. This document supplements, rather than overwrites, the original experiment report.

## Root cause and trace

The old streaming lessons in `pair-4.json` and `pair-5.json` lacked the provider metropolitan-network example on physical page 5, the cross-continent organization example on page 7, and the original revision prompts on page 11. Their saved generated sections already lack that material. Evidence resolution only replaces evidence references; it does not select or shorten paragraphs/steps. Projection/assembly preserves each validated section. The viewer renders its paragraphs/steps without filtering those statements. The loss therefore occurs during **generation**, not source extraction, evidence resolution, assembly or rendering.

The production prompt asks for concise explanations and source coverage but does not mechanically require each original example/question to remain. The strict validator verifies schemas, source IDs/excerpts, numeric literals where possible and page-reference coverage; page coverage is not content completeness. It correctly passed the old responses under its existing contract. This does not establish that streaming itself causes omission: the unchanged request can produce differing generated content, and ordinary complete-path responses also paraphrase or omit details.

The new benchmark records raw model text privately and compares every generated `{id,paragraphs,steps}` with the committed experience. It then navigates all 11 sections and compares actual rendered paragraphs/key points with that experience. Both final pairs report `generationToAssemblyUnchanged: true` and `assemblyToRenderedUnchanged: true`, confirming no downstream content loss in those runs.

## Targeted implementation

`scripts/pdf-incremental/preservation.ts` builds a deterministic, source-owned passage manifest from explicit extracted example/revision lists. A configurable, source-reviewed heading selects the four page-2 statements under “Why networks matter.” Each passage carries its source ID, exact text offsets, kind and immutable wording. Offsets are checked against the actual extracted page text; no inferred quotation or invented source text is accepted. Wrapped/ambiguous protected boundaries fail rather than being guessed. The manifest is not a general semantic understanding system.

The isolated streaming request appends a preservation contract to the existing full production prompt. It supplies grouped, exact required paragraphs and instructs Claude to generate them once in the matching section, with no repetition in key points. Other accessible explanations/guidance can remain. The response schema, native PDF, source excerpts, temperature, token budget, model and learner preferences remain unchanged. This is prompt tightening, not prompt compaction. The server never inserts missing passages, rewrites generated content or accepts a reconstructed quotation.

`PdfSectionProjection` checks protected passages after ordinary scoped evidence/schema validation and **before section exposure**, then rechecks the entire lesson before returning it to the existing session store. Missing, changed, duplicated, reordered or cross-page protected passages fail closed. Previously exposed sections must still equal the final prefix. Visual-evidence sections and all following sections remain held until full validation. Partial state is explicit, and practice cannot start before whole-lesson commitment. Cancellation, expiry and retry behavior remain unchanged.

The diagnostic viewer also fixes a focus issue revealed by the new tests: explicitly reselecting the current section now focuses its heading even when its index does not change. New arrivals still do not steal focus or restart speech. Actual production Read Aloud components/semantic units are reused.

### What the check proves

It proves exact preservation, source/page association, ordering and absence of literal duplication for the selected passages. It does **not** prove semantic entailment of every other generated statement, correctness of native visual interpretation, absence of paraphrased repetition, or completeness of arbitrary future PDFs. Baseline exact-match counts must not be interpreted as semantic coverage scores: a paraphrase can preserve meaning without matching verbatim.

## Source and experiment controls

Same approved `LAN_WAN_MAN_10_Page_Study_Material.pdf`, SHA-256 `cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01`; 11 physical pages. Same preferences: `stepwise`, empty description/focus. Same configured Claude Sonnet 4.5. Gemini/audio unchanged. No model shopping.

The unchanged baseline request hash remains `574e603282882a7197b18229fffd8e17a957507d681e94b9293491665ccfaa2c`. Final candidate requests share hash `6aafb87125feb4520beecf30ae507c25c57acc9cc015330b341aa0ffa8ff7390`; final 23-passage manifests share hash `345ab2eebf7c453afea1f84d8e6a5587c3f7af3f1bbdaf3158586be70a6cc167`. Candidate differences are explicit; they are not claimed to use an identical prompt to the baseline.

Reports store metrics/reference IDs only. Raw responses and generated content are in the private temporary directories named in the reports. No uploaded content, API key or credential value is logged by the benchmark. Production-file hash comparisons pass in every live run. Existing result labels cannot be overwritten; offline accessibility output now also uses exclusive file creation.

## Actual timing results

Browser times start at the isolated reader's button click **after material preparation** and use two animation frames as a visibility proxy. They are not full production upload-to-display or physical paint measurements. Page 1 is objectives; page 2 is the first instructional content. Source preparation is measured separately. Local checks overlapped some runs, so these are small practical samples, not a controlled-load statistical latency claim.

| Final contract / variant | First visible section | First instructional section | Complete visible lesson | Provider round trip |
|---|---:|---:|---:|---:|
| Preservation 3 — baseline | 49.92 s | 50.23 s | 49.92 s | 49.86 s |
| Preservation 3 — incremental | 14.40 s | 20.29 s | 62.48 s | 62.40 s |
| Preservation 4 — baseline | 54.13 s | 54.57 s | 54.13 s | 54.05 s |
| Preservation 4 — incremental | 13.05 s | 17.23 s | 67.23 s | 67.18 s |

First instructional access improved about **60% / 68%**, but full completion worsened by **12.56 / 13.11 seconds**. The former 15–16-second range is not assumed: the final measured range is 17–20 seconds. Preserve correctness before optimizing this trade-off.

Preservation 3 is incremental-first; preservation 4 is baseline-first. Preparation was 0.334 / 0.314 seconds. Final incremental server first-section validation: 14.322 / 12.984 seconds; first instructional section: 20.020 / 16.870 seconds. Only pages 1–8 are incrementally exposed; page 9's visual table and pages 10–11 wait for full completion.

Baseline input: 26,178 tokens, output 2,737 / 2,715. Final candidate input: 27,859 tokens, output 3,265 / 3,490. Extra preservation instructions and retained content increase token use; the data does not isolate how much of full latency comes from tokens versus service/transport variability. The API provides usage, not actual billed cost; no monetary-cost estimate is reported as an invoice.

### Earlier iterations retained

- `preservation-1.json`: first instructional content 13.59 seconds, then an exact duplicate source example in paragraphs and key points caused rejection on page 3. The incomplete lesson did not enable practice. Raw evidence shows the example group twice; this failure was not repaired or accepted.
- `preservation-2.json`: original 19 passages preserved; first instructional content 14.26 seconds and full display 53.39 seconds, versus baseline 55.04 / 54.62. Direct source review then found page 2 retained category names but omitted concrete resource-sharing/centralized-service details. Four original statements were added to the protected manifest before the final comparisons.
- First new accessibility attempt failed on heading focus when selecting the already-current section. The isolated focus fix and subsequent checks pass; the original failed attempt is not counted as a pass.

## Direct source acceptance review

Review compared the final generated/assembled/rendered sections with original page text, the original page-9 table image and the completed-path results. Every protected passage is mechanically checked; other content below is a bounded manual source comparison.

| Source page | Checked source material | Final findings |
|---|---|---|
| 1 | Four source-stated objectives: definitions, distinctions, devices/technologies, combined networks | Retained, with no replacement session objective |
| 2 | Device examples; resource sharing, communication, centralized services, scalability; geographical classification | Definitions/device list/classification present; all four concrete purpose statements now exact and ordered |
| 3 | LAN definition, coverage, performance qualification, ownership, Ethernet/Wi-Fi, devices; three examples | Facts present in paragraphs; all three original examples exact and ordered |
| 4 | Switches, access points, routers, network interfaces, Ethernet cabling; Ethernet star and wireless access-point arrangement | Present; shortened key points generalize the two topology descriptions, so paragraph context remains important |
| 5 | MAN scope, multiple LANs, possible fiber links, infrastructure, operator options; three examples | All examples exact; paragraphs preserve facts. **Key points change “may use” fiber to “often use” in both final runs: unsupported frequency strengthening** |
| 6 | High-capacity/fiber possibility and usefulness; four uses; broader infrastructure/planning/management versus LAN | Uses and comparison present. Some key points strengthen “can/may” into unconditional wording; not an exact qualification-preservation pass |
| 7 | WAN definition, private/public networks, providers, routing/technology options, possible latency/complexity; three examples | All examples exact; paragraphs preserve details. Run 3 key points strengthen “can involve” into “typically involve”; run 4 retains “may” |
| 8 | Routers, links, provider services, firewalls/security gateways; connectivity choices and cost/reliability/performance/security | Present in paragraphs and useful guidance |
| 9 | All 15 table cells: three network types × scope/technologies/ownership/management/complexity | Categories/details present, including private WAN. **Run 3 changes WAN ownership from “Provider and/or organization” to providers AND organizations. Run 4 retains and/or. Native visual evidence cannot verify this distinction automatically** |
| 10 | Combined network scales, university's LAN/MAN/WAN example, routers versus local switches/access points | All four original example statements exact and ordered; connected-network context retained |
| 11 | Summary, conceptual categories, six numbered revision prompts, key takeaway | All six original prompts retained exactly and in order, not replaced with answers or a generic checklist |

**Acceptance is therefore not a blanket source-fidelity pass.** Restored examples/questions are real progress, but source-reference validation and the protected-span check still do not detect changes outside their declared coverage. The visual table has no reliable extracted text for an exact quotation check. No fabricated table extraction/evidence was added to claim otherwise.

Practice compatibility: both final candidates produced five live validated questions, based on displayed lesson content and server-owned answer references. Candidate practice took 9.93 / 14.64 seconds; paired baselines 9.92 / 30.40 seconds. Direct review found the candidate questions appropriately answerable from the shown lesson (network classification, LAN technologies, switches, MAN scope, routers). This is not a grading or universal pedagogical-quality claim. Partial/failed sessions remain unable to request practice.

## Verification

- `npm test`: **145/145 passed**, retaining PDF, audio, grounding, practice and accessibility utility regressions.
- Focused incremental/preservation suites: **10/10 passed**. Cases include exact original network examples/prompts, missing/changed/duplicate/reordered passages, source offsets, ambiguous boundaries, page association, fragmented JSON, full completeness, cancellation/expiry and a real session refusing completion/practice after protected-content failure, then accepting a complete retry.
- `npm run typecheck`, `npm run lint`, `npm run build`: pass. Build reported a previously invalid Turbopack filesystem-cache rebuild and then compiled successfully; no cache/dependency repair was performed.
- `preservation-accessibility-3.json`: ten offline browser scenarios pass; zero axe violations; no overflow at 320 pixels. Protected examples and revision prompts are verified in the DOM and full semantic speech queue. Arrivals preserve focus/status/speech; explicit keyboard navigation focuses headings; cancellation, early EOF, errors, duplicate events and complete-path retry remain honest.
- Final live pairs: keyboard heading focus, silent Read Aloud, zero axe violations, narrow layout, all-page DOM equality and live practice pass.
- `$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:e2e -- tests/e2e/read-aloud.spec.ts tests/e2e/loading.spec.ts tests/e2e/audio.spec.ts`: **12/12 passed**, 2.8 minutes. These are controlled-provider regression checks, not live Gemini transcription. The entire 33-test E2E suite was not rerun in this task.
- Actual audible speech, supported device voices and a human screen-reader rehearsal remain manual verification; silent mocks/axe do not prove announcement timing on assistive technology.

## Changed files in this task

- New: `scripts/pdf-incremental/preservation.ts`, `tests/pdf-preservation.test.ts`, this review and newly labelled JSON evidence.
- Updated isolated files: `scripts/pdf-incremental/projection.ts`, `benchmark.ts`, `viewer.tsx`, `accessibility-check.ts`.
- No existing application, provider, audio, schema, dependency, README or AGENTS changes in this task. The six pre-existing tracked dirty files and all prior untracked work/results remain intact; tracked diff statistics are unchanged. No commit or revert.

Repository source-grounding/accessibility skill instructions were read directly and applied to the review. This is path-based skill use, not a claim of refreshed automatic discovery.

## Smallest remaining blocker / next action

**NO-GO for production integration.** Stop live iterations here rather than accepting the observed factual changes or broadening this into a new analysis system.

The remaining blocker is **coverage of fact-bearing qualifications and native visual claims**, not JSON framing, evidence lookup or renderer speed. Extend a source-preserving contract to the relevant factual statements without asking the model to strengthen them. For the table, establish an authoritative source-owned cell representation or an explicitly reviewed transcription tied to the original page before claiming automatic exact validation; a visual page reference alone is insufficient. Do not invent that evidence or silently normalize the model's conjunctions.

Keep the working production completed-lesson path unchanged. A later opt-in rollout should require source-acceptance checks beyond page/span presence, a defined policy for document-wide context arriving late, and an actual screen-reader/speech rehearsal. The current prototype can be used for further isolated investigation, but should not be presented as a generally complete, source-faithful PDF adaptation pipeline.
