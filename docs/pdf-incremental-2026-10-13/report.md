# Validated incremental PDF experiment — 13 October 2026

## Decision

**Keep this benchmark-only.** Streaming the identical Claude request makes early, source-referenced text sections available substantially sooner, but does not materially shorten full generation. The implementation does not change production routes, prompts, providers, lesson schema, audio processing or session semantics. The existing completed-lesson workflow remains the production fallback.

The prototype is not approved for production integration: both streaming outputs omitted some source examples and revision prompts that the paired baselines retained. Page-reference coverage and a valid schema do not prove semantic completeness. Later global context/limitations also cannot be guaranteed before the final response. No validation has been relaxed to conceal these limitations.

## Scope and reproducibility

- Input: `LAN_WAN_MAN_10_Page_Study_Material.pdf`, the supplied networking PDF; **11 physical pages**, despite its filename. SHA-256: `cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01`.
- Preferences: `needs: ["stepwise"]`, empty description/focus. Native PDF bytes, extracted source excerpts and the entire production prompt are retained.
- Both transports capture the actual `createLearningProvider().adaptSource` request. The request hashes are identical in each completed pair: `574e603282882a7197b18229fffd8e17a957507d681e94b9293491665ccfaa2c`.
- Existing configured Claude Sonnet 4.5 through Bedrock. No OpenAI comparison, prompt compaction, per-page independent model calls or audio changes. Streaming uses `ConverseStreamCommand` rather than `ConverseCommand` only.
- Pair 4 runs baseline then streaming. Pair 5 reverses that order. No concurrent adaptation requests. Ordinary local checks ran during parts of the experiment; these are small local samples, not an isolated-load statistical benchmark.
- JSON reports contain timings, page/reference IDs, token counts and check outcomes, not uploaded document contents. Generated lesson/practice review artifacts remain in the local temporary directories identified in each report; they are not added to the repository. Secrets/environment values are not recorded.

From the repository root, with existing server credentials and installed Edge:

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/pdf-incremental/benchmark.ts pair-6
node --conditions=react-server --import tsx scripts/pdf-incremental/accessibility-check.ts
node --conditions=react-server --import tsx --test tests/pdf-incremental.test.ts
```

The live command incurs Bedrock usage: two adaptations plus practice generation for each successfully completed variant. Existing result labels are protected from overwrite. The script binds localhost port 3207; the offline check uses 3208. This is a local diagnostic viewer, not a prepared-demo mode or an application route. `pair-5` is the recorded reverse-order repeat; other labels use baseline-first order. The input hash prevents silently substituting another document.

## Measurements

Browser timings below start at the diagnostic button click **after PDF preparation** and use a double-animation-frame DOM visibility proxy. They include the local HTTP request and browser rendering, but not file selection/upload or initial PDF preparation; they are not a production upload-to-lesson measurement or a physical display-paint trace. Page 1 is objectives; page 2 is the first instructional content. The test explicitly navigates to page 2 as soon as it is available, before running accessibility checks.

| Run / transport | First validated section, server | First visible section, browser | First instructional section, browser | Complete visible lesson, browser | Provider round trip |
|---|---:|---:|---:|---:|---:|
| Pair 4 baseline | Full lesson only | 55.11 s | 55.61 s | 55.11 s | 55.04 s |
| Pair 4 streaming | 9.06 s | 9.14 s | 14.55 s | 54.38 s | 54.28 s |
| Pair 5 baseline | Full lesson only | 59.71 s | 60.05 s | 59.71 s | 59.38 s |
| Pair 5 streaming | 10.28 s | 10.41 s | 15.52 s | 55.59 s | 55.50 s |

First instructional content arrived about **74% sooner** in both pairs. Complete lessons arrived only 0.73 / 4.12 seconds sooner; that difference is not evidence of a dependable full-completion speed-up. Provider latency still dominates.

PDF preparation was 0.712 s in pair 4 and 0.660 s in pair 5. Complete server validation/session commit occurred at 55.074 / 54.307 s in pair 4 and 59.402 / 55.537 s in pair 5 (baseline / streaming). Preparation is measured separately rather than added to browser timings and called a measured end-to-end result.

Each adaptation used 26,178 input tokens. Baseline output tokens: 3,148 / 3,378; streaming: 3,231 / 3,231. No output reduction was requested. Bedrock returned usage, not billed cost; no actual monetary-cost claim is made.

In pair 5, validated sections 1–8 arrived at approximately 10.28, 15.16, 19.51, 24.05, 28.05, 34.11, 36.96 and 42.22 seconds. The visual table on page 9, and pages 10–11 behind it, remained held until full completion to preserve order.

### Failed attempts retained

- Pair 1: baseline provider 58.24 s; browser speech assertion interrupted the harness before streaming.
- Pair 2: baseline provider 50.58 s; incorrect Playwright context setup prevented axe and the streaming run. No baseline browser timing was retained.
- Pair 3: baseline browser completion 61.02 s. Streaming exposed an independently validated section at 9.21 s, then failed with `Invalid section separator`. A chunk ending with whitespace before the next comma triggered an experimental parser bug. The reader remained incomplete; no lesson was committed or practice enabled. The pretty-printed, character-fragmented regression test now covers this boundary.
- Silent speech injection initially used a TypeScript function transformed by the CLI runner; the browser mock did not initialize correctly. Plain JavaScript injection fixed the harness. Earlier failed speech results are retained rather than counted as passes. Final live and offline checks pass with a silent mock; real speech playback remains a manual check.

## Architecture and safety

`scripts/pdf-incremental/projection.ts` is an experimental layer between model text deltas and diagnostic events. It accepts complete JSON section objects only; raw deltas never go to the viewer. A token-aware scan preserves strings, escapes and fragment boundaries, with the existing response-size cap.

Each section must occupy its expected `source-N` slot, resolve through the existing server-owned excerpt resolver, and pass `validateSourceAdaptation` against its own page. Unknown/cross-page evidence, changed source numerals on text pages, extra fields, duplicate IDs and reordering fail closed. This scoped validation is deliberately stricter for cross-page references and does not certify semantic entailment.

Visual-evidence sections are held, along with all following sections. The prototype does not pretend a source reference independently verifies table cells or diagram interpretation. Full response parsing, source validation, all-page coverage, exact source order and equality of the already surfaced prefix are required before completion. Original introduction, key points and final limitations are retained; the current viewer reveals final introduction/notes only after full validation.

The actual learning store owns the request and retains its existing cancellation, deadline, session revision/fingerprint and expiry behavior. The streaming loop rechecks session existence before exposing each delta. No partial experience is committed. Practice uses the actual existing provider/store and is enabled only after the whole experience is committed. An aborted, expired, truncated, duplicate, reordered or failed attempt cannot become complete. The UI retains an explicit incomplete state and offers a fresh full-lesson retry; it does not retry paid calls automatically or continue obsolete generations.

The isolated viewer has one active section, explicit navigation and stable polite phase announcements. New arrivals do not focus a heading, advance the active section or restart speech. Keyboard section selection focuses the heading. Start/cancel/recovery move focus only when the action control becomes disabled. Actual `ReadingProvider`, `Readable` and navbar `ReadAloud` are reused; speech units remain explicit statements. Speech stops on cancellation/error/retry. The loading notice reserves space. No animation library, dependency or production UI change is introduced.

## Source fidelity and practice review

All four completed variants passed the unchanged full validator, had 11 ordered sections, and referenced pages 1–11. The already exposed prefix matched the fully validated response. This establishes reference coverage/order, **not exhaustive content coverage**.

Observed review:

- Network definitions, LAN/MAN/WAN scope distinctions, Ethernet/Wi-Fi, switches, routers, fiber, WAN services, and the university multi-network example remained present. Stepwise paragraphs/key points and qualifications in the principal definitions remained usable.
- The original page-9 table was visually compared with both streaming results and paired baselines. All five categories across LAN/MAN/WAN were represented: scope, technologies (including private WAN), ownership, management and complexity. There was no repeat of the earlier prompt-compaction table omission. It remains a visual interpretation, not machine-proven table understanding.
- **P1 for integration:** both streaming results omitted the provider metropolitan-network example on page 5 and the cross-continent organization example on page 7. Their page-11 sections replaced revision prompts with a definition checklist, whereas the baseline preserved substantially more of the revision material. These omissions are observable even though all pages have references. The projection did not truncate or alter model content; the unchanged request yielded different output through the two API transports. This evidence does not establish why generation differed, nor guarantee that every future baseline is complete.
- **P2:** pair-4 streaming practice question 5 asked about both routers and switches but selected an answer discussing only switches/access points. Exact displayed-answer grounding passed, but answer completeness did not. Pair-5 question 5 selected the complete university paragraph and was appropriate. No practice validator was weakened or changed.
- **P2:** global limitations and final introduction can arrive after an early section. The partial-state notice is honest, but cannot establish that later context is unnecessary for every future PDF. Visual pages waiting until the end also means this approach does not accelerate access to an early visual-only lesson.

Each completed variant generated **five live, validated practice questions**. Practice took 12.34 / 10.28 s in pair 4 and 11.58 / 13.94 s in pair 5 (baseline / streaming). Questions reference actual displayed lesson answers and source evidence. Partial lessons cannot request practice. These outcomes verify compatibility, not universal pedagogical quality.

## Verification

- `npm test`: **139/139 pass**, including four new incremental tests and retained PDF/audio/practice regressions.
- `npm run typecheck`: pass after the final experimental changes.
- `npm run lint`: pass after the final experimental changes.
- `npm run build`: pass; production routes unchanged. Turbopack reported rebuilding its previously invalid filesystem cache; compilation completed successfully.
- Offline `accessibility-check.ts`: nine scenario checks pass, no axe violations, no horizontal overflow at 320 pixels. Covers progressive focus/speech/status behavior, no autoplay, practice gating, duplicate events, early EOF, provider failure, cancellation, retry and full-lesson fallback.
- Both completed live pairs: keyboard heading focus, silent Read Aloud, axe (zero violations), narrow-layout and live practice checks pass.
- `$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:e2e`: **32/33 pass** in 7.8 minutes. The existing all-support-choices test timed out waiting for the five preference checkboxes (`tests/e2e/adapt.spec.ts:64`); its upload `route.fetch` and teardown were still pending. The failure happened while other local work was running; contention is a possibility, not an established cause. No source or test fix was made.
- The same test rerun in isolation with `npm run test:e2e -- --grep 'all support choices use the same source-first experience'`: **1/1 pass**, 33.1 seconds overall. This resolves the immediate reproduction, not the underlying intermittent timeout. The original full-suite failure is not rewritten as a clean 33/33 run.
- Manual still required: actual audible browser speech, screen-reader announcements/reading order, touch/zoom/device checks and a real-person rehearsal. Automated checks are not a complete accessibility audit.

## Files and preserved work

New experiment files: `scripts/pdf-incremental/{projection.ts,viewer.tsx,benchmark.ts,accessibility-check.ts}`, `tests/pdf-incremental.test.ts`, and this report/JSON metrics in `docs/pdf-incremental-2026-10-13/`.

The tracked dirty files present before this task remain: `AGENTS.md`, `README.md`, `src/lib/learning/{http.ts,material.ts,provider.ts}` and `tests/understanding-practice.test.ts`, along with existing untracked skills, benchmarks, practice/audio helpers and evidence. No existing results were overwritten. Each live report verifies unchanged hashes of production provider, validation, HTTP and session-service files. No commit was made.

The accessibility, source-grounding and demo-readiness skill instructions were followed by reading their repository `SKILL.md` files directly; this does not assert automatic skill discovery. Review findings above distinguish tests, live timing, manual observations and unverified generalizations.

## Recommendation before the hackathon

The experiment proves a useful first-content transport improvement, **not a safe production rollout under the stated fidelity requirements**. Keep the reliable completed-lesson workflow for the demo and preserve this prototype for subsequent work. Do not alter the prompt or validators to label the observed omissions acceptable.

Smallest next alternative: evaluate offering clearly labelled, source-owned readable text while the complete adaptation is prepared, using the existing source/quality checks and Read Aloud. It would be source access, not an unfinished adaptation presented as complete, and must not bypass whole-document blocking. This alternative is a recommendation, not implemented here.

Before integrating incremental AI sections: establish a small source-specific coverage acceptance check including examples/revision content; decide how early sections receive necessary document-wide context; then add an opt-in PDF-only progress transport with the same cancellation/session checks and full validated fallback. Require manual screen-reader/speech rehearsal. Do not adopt a general semantic-completeness claim from reference validation alone.
