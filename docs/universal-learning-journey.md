# Universal learner journey

ADAPT starts with the learner’s material and intended learning, rather than an extraction audit. The conceptual flow is:

**Input material → material understanding → learning goal → learner intent → session goal → learner needs/preferences → adaptation → learning experience.**

Extraction belongs beneath material understanding. PDF remains the only implemented upload adapter. `/demo` continues to demonstrate canonical visual accommodation, grounded explanation and competency practice independently.

## Implemented learner experience

1. **Material:** Choose a PDF and select **Start learning**. Upload, extraction and deterministic quality assessment run automatically. Unusable whole documents remain blocked, with a calm explanation and an invitation to choose another version. No goal suggestion runs for blocked material.
2. **Your goal:** A clearly source-stated objective can be offered with its source excerpt. Otherwise a constrained optional AI suggestion can offer a possible focus. When evidence or the provider is insufficient, ask **What would you like to learn?** Written objectives are never mandatory. The learner can supply a different goal.
3. **Your preferences:** Select comfortable continuous reading or one extracted section at a time. Listening uses the unchanged global Read Aloud capability. No diagnosis is requested.
4. **Learn:** Display source-derived text in the selected presentation with original page provenance and the current session goal. Optional source details preserve the full quality report and original local PDF link.

This phase provides a source-text learning space, not arbitrary PDF teaching, generated explanation, visual reconstruction, goal-achievement assessment or competency practice. The binary-tree demo retains those supported domain-specific accommodations. A learner-written goal defines intent; it does not prove the material contains sufficient instruction to achieve that goal.

## Small reusable session contract

`src/lib/learning-session/goals.ts` defines goal candidates, evidence, a session goal and presentation preferences without PDF-specific types. A future input adapter can provide the existing generic quality material and provenance units to the same session flow; no future adapters are implemented here.

| Origin | Meaning | Authority and evidence |
| --- | --- | --- |
| `source-stated` | An explicitly labelled objective in extracted source text | Exact source excerpt, block ID and source unit retained. It describes what the source states; the learner may choose another session goal. |
| `ai-inferred` | A suggested focus selected using supplied text | Always labelled AI-suggested and requires learner confirmation. Exact evidence is retained; never promoted to a source-stated objective. |
| `learner-provided` | The learner’s intended learning | Takes priority whenever a nonempty learner intent is supplied. Original source goals remain separately retained. |

Detection is deliberately narrow: explicit inline English labels such as `Objective:` or `Learning outcomes:` followed by text in one extracted block. It does not infer objectives from headings or assume every input has objectives. Separate heading/list layouts, other languages and ambiguous wording can fall back to asking the learner. This avoids claiming reliable extraction of every written objective.

`src/lib/ai/learning-goal.ts` exposes a replaceable `GoalSuggestionProvider` implemented server-side with the existing Bedrock SDK, standard credentials, configured region/model and Nova Lite default. The existing accommodation/explanation provider boundary is unchanged. At most twelve complete text blocks of 15–350 characters are supplied; no learner identity, intent or preference is sent. The model selects a verbatim complete sentence or full supplied block. Structured JSON, exact keys, supplied source ID, quotation length, sentence boundaries and absence of markup are validated. Inference is the model’s selection of a possible focus, not generated factual instruction. The displayed wording is `Understand the idea: [validated quotation]`. This conservative suggestion can be less helpful than a richer inferred goal; it is a deliberate current grounding limit.

A five-second deadline aborts model work. Unavailable credentials/region, provider failures, insufficient evidence or invalid responses result in a learner question, with no invented suggestion. Source-stated objectives skip this call. Upload processing and the quality gate never call AI. Optional suggestions can use the existing AWS configuration; browser tests and unit transport tests require no paid live calls.

## Quality confirmation without a document audit

The user-approved redesign supersedes the old requirement that learners manually compare every page. It does **not** alter readiness policy, low-content advisory status, provenance validation, whole-document blocking or extraction limits.

The quality gate now supports a distinctly named `system-validated-text-scope` acceptance, in addition to the existing human source-review contract. Continuing with a goal explicitly accepts the stated text-only limitations. The server independently reassesses the original snapshot, verifies its fingerprint, requires the exact scope and every reason acknowledgement, and issues the same immutable server-only confirmed-material value. It never records `sourceReviewed: true` on the learner’s behalf. System validation of extracted text is not proof of full fidelity to inaccessible visual source content.

Known blocking signals remain blockers: invalid provenance, empty/missing pages, partial coverage, decoding problems, reading-order uncertainty, code-formatting uncertainty, unsupported structures and unknown warnings. Some silent PDF extraction defects remain undetectable; the new flow cannot certify visual fidelity or interpretation. Passing the gate means usable **within its limited text scope**, not that diagrams, tables, equations or scans were understood.

The old manual `/confirm` and guarded `/proceed` APIs remain compatible and tested, including their existing page-visit requirement. The new learner path uses `/goals`, `/session`, `/preferences` and on-demand source pages. The legacy handoff describes its earlier review scope; it is not the new learner-session transition.

## Server/session invariants

- Sessions live in the existing bounded, ephemeral review store, protected by the existing HTTP-only same-site capability cookie. No persistent files, identity or learner history is introduced.
- `/goals` requires the current material fingerprint and usable quality. Candidates are server-owned and cached for the snapshot.
- `/session` accepts learner intent or a known server candidate, never caller-provided authority/evidence. It confirms text scope and retains source goals, AI suggestions and learner intent separately.
- `/preferences` requires confirmed material, the current fingerprint and exact session revision. Changing the goal clears old preferences and increments the revision.
- Material fingerprints and session revisions prevent stale or substituted materials from being silently reused. Expired snapshots require a fresh upload. The existing single-process/multi-instance limitation remains.
- Page retrieval is lazy. No mandatory all-page downloads or source-comparison checkboxes. Text is never rendered as HTML and document contents are not logged.

## Accessibility and visual direction

The home page uses a warm cream base, deep green primary actions, restrained clay typography accents, generous spacing and quiet surfaces. Four labelled steps distinguish the primary journey from optional source details. The existing proof-of-concept badge and compact Read Aloud header remain intact.

Native file input, radio controls, textarea, select and disclosure elements support keyboard and screen-reader use. Step headings receive focus on transitions. Loading status is announced separately from busy sections; errors use alerts. Selection and readiness use text and native state, not color alone. Layout collapses at narrow widths without hiding functionality. Explicit `Readable` units register instructions, candidate goals, session goals, warnings and source text in the unchanged semantic reading engine.

## Verification and remaining scope

Tests cover all goal origins, learner-intent precedence, source evidence, supplied-source grounding, provider failure/malformed output, immutable limited-scope confirmation, quality/provenance blockers, stale sessions and strict request validation. Real production-server browser tests cover initial upload, source and learner goals, optional details, blocked material, validation failures, plain-text source rendering, keyboard navigation, narrow layout, Read Aloud and axe checks. Existing demo, practice, Bedrock and speech-engine tests remain regression baselines.

Future work must evaluate richer material understanding and inferred goal quality, check whether a selected goal is supported by the material without overriding learner intent, and add supported accommodation strategies/competency demonstration for that session. Do not treat this source-text presentation as complete universal accommodation. Corrected subsets, new adapters, full PDF AI adaptation, persistence and objective-management infrastructure remain deferred. Manual screen-reader and audible speech acceptance remain useful alongside automated checks.

## Files changed in this phase

| Area | Files |
| --- | --- |
| Home and presentation | `src/app/page.tsx`, `src/app/globals.css`, `src/components/pdf-upload-workspace.tsx`, `src/components/learning-space.tsx`, `src/components/material-review.tsx` |
| Goal model and provider | `src/lib/learning-session/goals.ts`, `src/lib/ai/learning-goal.ts` |
| Scoped acceptance | `src/lib/material-quality/types.ts`, `src/lib/material-quality/gate.ts` |
| Session orchestration | `src/lib/material-review/types.ts`, `src/lib/material-review/service.ts`, `src/lib/material-review/http.ts` |
| Routes | `src/app/api/material-review/goals/route.ts`, `src/app/api/material-review/session/route.ts`, `src/app/api/material-review/preferences/route.ts` |
| Tests | `tests/learning-session.test.ts`, `tests/e2e/material-review.spec.ts` |
| Evidence and setup docs | `README.md`, `docs/universal-learning-journey.md`, `docs/material-quality.md`, `docs/pdf-upload-review.md` |

No dependencies, extraction/corpus tooling, canonical fixture, accommodation/practice engine, existing explanation provider or semantic reading engine were changed in this phase. Existing unrelated working-tree changes were preserved.

## Verification recorded 5 October 2026

- `npm test`: 57 unit/integration tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: route generation and TypeScript passed.
- `npm run build`: production build passed with home, demo and all review/session routes.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` (set through PowerShell environment): 20 tests passed against the production server. Includes actual preference presentation, page/section resets, strict goal origins, expiry/stale material, quality blockers, plain-text rendering, Read Aloud, keyboard, axe and narrow-width regression checks.
- Desktop upload/goal/learning screenshots and the 320-pixel learning screenshot were visually inspected. Artifacts are generated under ignored `test-results/journey-*.png`.

AWS goal output is tested through injected SDK transports and grounded candidate validation; browser tests disable live AWS calls. A live model invocation was not performed for this redesign. Screen-reader output and audible speech were not manually exercised; automated semantics, keyboard and silent speech controls passed.

The browser fixtures intentionally use original labels `i` and `5` for physical pages 1 and 2. Both labels are preserved. Browser tests remove their temporary snapshots between cases instead of weakening the store's bounded capacity. The optional source-page selector resets one-section presentation on every page change, and single-section pages omit redundant navigation controls.
