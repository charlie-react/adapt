# Source-grounded material adaptation

The learner flow is **source material -> accessibility need -> grounded presentation adaptation -> accessible learning**. This supersedes the home page's broad material-understanding/analysis gate. Learning objectives remain optional source context; there is no objective inference, knowledge reconstruction, automatic correction or generated assessment in this slice.

The human product decision is to retain Claude Sonnet 4.5 for this narrower role. The earlier capability assessment remains evidence of its limitations, not a guarantee that narrower prompts eliminate factual mistakes.

## Learner flow

1. Upload an existing supported input, or paste/dictate text. **Continue with my material** validates and prepares server-owned source data without an AI call.
2. Choose one or more of four supports: simplify, step-by-step, visual description, listening. Additional access preferences and a particular learning focus are optional and support voice input. No disability diagnosis or objective confirmation is required.
3. **Create my learning experience** makes one source-adaptation call. The original material remains available if the call fails; no prepared AI response is substituted.
4. Explore source-referenced sections. The original source is shown alongside the AI-labeled explanation, with page/section selection and a link to the original file. Equations/code can be read in their original form. Read Aloud and keyboard/voice controls continue to use the existing accessibility layer.

Listening does not auto-enable speech. The learner turns on the existing header Read Aloud control and focuses/hovers a meaningful region. Original text and adapted explanations register explicit reading units through `Readable`; no DOM-fragment extraction or duplicate speech engine was introduced.

## Boundary and contracts

- `learning/material.ts`: unchanged input/container validation, byte/page budgets and PDF source inspection. Original bytes, deterministic fingerprints, page labels and source text remain server-owned. `sourceForAdaptation` selects supported content without replacing the original material.
- `learning/http.ts`: upload creates a source-only session. Fingerprint/revision, same-origin, strict request validation, private session cookie and no-store responses remain enforced. Clients cannot supply replacement source text or evidence to the adaptation endpoint.
- `learning/service.ts`: a source-only snapshot has `analysis.status = "source-ready"`. This means input preparation succeeded, **not that AI understood or independently verified the knowledge**. Adaptation calls `adaptSource(material, preferences, signal)` directly. Session memory, expiry, concurrency, abort/deadline protection and immutable-source ownership are retained.
- `learning/provider.ts`: the existing Bedrock boundary invokes Sonnet 4.5 using `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`. `BEDROCK_ADAPTATION_MODEL_ID` can configure the same replaceable boundary; the demo's `BEDROCK_MODEL_ID`/Nova configuration is independent. AWS uses the standard server credential mechanism; no credentials reach the client.
- `SourceAdaptation`: `{ introduction, sections, practice, limitations }`. A section has `{ id, title, kind, paragraphs, steps, evidence }`. The model returns plain presentation text and source references, not a material-understanding object, quality score or authoritative learning objective. The source-adaptation prompt requires `practice: []`; the reusable renderer retains existing practice support for the regression/demo surfaces.
- Text evidence uses server excerpt IDs, resolved to exact original substrings. Native visual evidence uses a known source unit, empty quotation and an explicit interpretation label. PDF citations are enabled for Claude's native visual processing; citation content blocks can contain response text, but citations are not treated as an independent factual proof.
- The parser accepts bare JSON or one complete outer JSON fence. Strict schema validation, known references, exact quotation matching, size limits and plain-text rendering remain. Each supplied adaptable source unit must be referenced; material cannot silently disappear from a valid adaptation.
- The provider receives a server-owned section slot for each source unit, including cover/title pages. Filling these slots preserves page provenance without asking the model to certify the document's knowledge. Short text snippets also receive exact server-owned excerpt references; existing legacy quotation contracts retain their original minimum length.

Legacy understanding/analysis helpers are retained for existing diagnostics and regression tests. The home-page flow does not call them. `/api/learning/analyze` on a prepared source-only session returns that snapshot without an AI analysis request. The binary-tree engine, its provider and `/demo` were not rewritten.

## Content fidelity and its limits

The prompt prohibits new facts/examples, recalculations, changed equations/code/numbers, invented visual relationships and silent repair of source errors. Stepwise support changes the sequence of explanation, not the mathematics or competency. Visual descriptions must distinguish clear visible details from uncertainty.

Original text/bytes are immutable and are never overwritten by AI paragraphs. Source limitations are appended by the server so they cannot disappear from the learner result. The validator also rejects novel numeric literals for fully text-backed material and generated fenced code. These are literal/presentation checks, **not a solver or independent knowledge validator**. Known numbers reused incorrectly, altered prose meaning and incorrect visual relationships cannot be comprehensively detected by these checks. Native visual-only material has no reliable text against which to compare all numbers; its descriptions stay labeled interpretations. No claim is made that a valid reference proves every generated sentence.

Extracted PDF text remains distinct from original visual pages. A page without reliable extracted text still links to the original PDF; it is not displayed as a verified text reconstruction. The existing extraction/quality-gate/review boundaries and their tests are preserved. This source-adaptation path does not certify a PDF's extracted text as confirmed authoritative material or infer its objectives.

## Video scope

Existing MP4 container ingestion and original-file preservation remain. Sonnet 4.5 does not accept native video/audio input through Bedrock; see [AWS's model capability reference](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-5.html). This slice adapts a supplied transcript only. Video bytes and the original video locator remain in the session for learner access but are excluded from model input. Without a transcript the server returns actionable `TRANSCRIPT_REQUIRED`; with one it preserves the transcript's learner-provided/unverified status. No frame extraction, speech-to-text service or new provider was added.

## Verification and reproduction

`tests/source-adaptation.test.ts` covers direct upload-to-adaptation for all four needs, no understanding call, source immutability, optional objectives/focus, native PDF/image input, Claude citation envelopes, exact evidence, missing-page references, numeric/code changes, provider failure, retained prior results and transcript-only video input. Updated learner E2E tests cover all four controls, source rendering, keyboard focus, Read Aloud, voice input, failures, narrow layout and axe checks. Existing ingestion, material quality/review and `/demo` tests remain regression coverage.

The existing `scripts/learning-smoke.ts` now exercises this boundary without logging source contents. It can accept an already supplied public document:

```powershell
node --conditions=react-server --import tsx scripts/learning-smoke.ts
node --conditions=react-server --import tsx scripts/learning-smoke.ts --file="C:\path\to\public-lesson.pdf" --need=plain-language
```

Supported `--need` values are `plain-language`, `stepwise`, `visual-description`, `listen`. These are paid live calls using existing AWS authentication. The script reports schema/reference validation, not a general factual-accuracy score. It is a reused smoke tool, not new model evaluation infrastructure.

No dependencies, external speech service, database, persistent history, new input adapter or provider were introduced.

## Implementation verification

Results reviewed on 2026-10-07:

| Check | Result |
|---|---|
| `npm test` | 92 unit/integration tests passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, including TypeScript and production route generation |
| `$env:PLAYWRIGHT_CHANNEL = 'msedge'; npm run test:e2e` | 22 E2E tests passed; saved run status is `passed` with no failed tests |
| Existing live learning smoke tool | Actual Sonnet responses passed source-adaptation validation for synthetic text, image and PDF |
| Real SDN educational PDF, `--need=plain-language` | Actual Sonnet response passed: 13 sections, 13 source pages, no generated practice, source limitations retained |

The first real PDF response was rejected for missing page references. The required server-owned section map resolved that omission; reference validation was retained. One retry failed before a response with a Bedrock DNS error (`ENOTFOUND`); the subsequent retry passed. These are distinct from model factual fidelity.

Playwright's bundled browser executable was unavailable, so the full suite used already installed Edge instead of installing another dependency. Desktop/narrow E2E screenshots were visually inspected. Presentation tests use injected responses; they must not be described as a live Bedrock UI run. An additional live production-browser check was declined and was not executed. The real PDF smoke exercised the actual provider and source-adaptation validator separately from those UI tests. Audible playback and manual screen-reader acceptance remain outside silent automated verification.

### Files changed for this slice

| Area | Files |
|---|---|
| Domain/provider | `src/lib/learning/types.ts`, `provider.ts`, `provider-response.ts`, `validation.ts` |
| Existing ingestion/session/HTTP | `src/lib/learning/material.ts`, `service.ts`, `http.ts` |
| Source presentation | New `src/lib/learning/source-label.ts`, new `src/components/original-material.tsx` |
| Learner UI | `src/components/adapt-workspace.tsx`, `adapted-learning.tsx`, `src/app/adapt.css` |
| Reused smoke tool | `scripts/learning-smoke.ts` |
| Regression coverage | New `tests/source-adaptation.test.ts`; updated `tests/learning.test.ts`, `learning-provider.test.ts`, `fixtures/learning.ts`, `e2e/adapt.spec.ts` |
| Documentation | `README.md`, this document |

Other pre-existing working-tree changes were preserved. `AGENTS.md`, dependency manifests/lockfile, the binary-tree engine/provider, and the Read Aloud/voice implementations were not changed by this slice. No commits were made.
