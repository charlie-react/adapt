# Learning provider response handling

October 5, 2026. Implements the scoped fix proposed in [the live failure diagnosis](learning-understanding-diagnosis.md). The learning UI, session/service architecture, input preprocessing, source authority, existing validators, Bedrock selection and binary-tree demo are unchanged.

## Boundary

The replaceable `LearningProvider` interface still exposes `understand`, `adapt` and `reflect`. The Bedrock adapter now performs:

`Converse response → complete JSON envelope → JSON parsing → source-reference resolution → existing strict domain validation → service validation → learner snapshot`

`provider-response.ts` owns the wire types, bounded parser and reference resolver. `provider.ts` supplies an explicit literal shape example and separate enums/field rules for each task. It returns values validated by the same `validation.ts` functions the service already uses. Other providers can implement the existing interface without changing the UI or service.

Only bare JSON or a single complete outer Markdown JSON fence is accepted. JSON/unlabelled fences, surrounding whitespace and CRLF are supported. Surrounding prose, multiple/truncated/wrong-language fences, malformed JSON, non-text or incomplete Converse output, and output over 45,000 characters fail. No arbitrary brace searching or partial JSON salvage is performed. Inline code punctuation inside JSON strings remains intact.

## Explicit response contract

| Field | Meaning | Accepted values |
| --- | --- | --- |
| `section.kind` | Kind of learning content | `prose`, `code`, `diagram`, `equation`, `table`, `image`, `video`, `example` |
| `evidence.mode` | How the content refers to its source | `text`, `visual` |
| `coverage.status` | Interpretation coverage of one supplied source unit | `clear`, `limited`, `unreadable` |

These fields are not aliases. `kind: visual`, evidence containing `status`, or coverage containing `mode` is rejected rather than silently corrected. Unknown fields, missing coverage, substituted section IDs, formal grading, unsafe markup and missing uncertainty explanations remain subject to the existing strict validators.

Understanding has exactly `title`, `summary`, `sections`, `coverage`, `limitations`. Adaptation has exactly `introduction`, `sections`, `practice`, `limitations`; sections additionally have `steps` and preserve all analysis section IDs. Reflection has exactly `message`, `nextStep`, `evidence`. `ProviderUnderstanding`, `ProviderExperience` and `ProviderReflection` describe these wire values separately from domain values.

## Source-owned text evidence

New requests instruct Nova to return:

```json
{"sourceId":"p1","mode":"text","excerptId":"excerpt-1-1"}
```

The server supplies a deterministic excerpt ledger from the actual source units. Each entry has an ID, source ID, original string offsets and exact text. Excerpts cover the complete available text in contiguous slices of 10–1,200 characters, preserve Unicode surrogate pairs, punctuation, whitespace and code indentation, and never repair extraction. A very short source unit remains in model context but cannot create a text excerpt below the validator's existing minimum.

Full text is supplied through the ledger rather than duplicated in unit metadata. The original PDF/image/video bytes and source locators are still sent as before. Units whose extracted text was already withheld for uncertainty do not acquire invented excerpts.

The response must select an existing excerpt belonging to its claimed source unit. The server rechecks the entry against the exact source slice and resolves it to the domain evidence `{sourceId, mode: "text", quote: exactSourceText}`. The unchanged validator then requires that quotation to be an exact substring of the source unit. The ledger is server-owned, regenerated deterministically for each call, and never accepted from a browser or model as source truth.

For compatibility, existing `{sourceId, mode: "text", quote}` wire evidence is also accepted **only** if it passes the same exact 10–1,200-character source matching. The prompt prefers excerpt IDs, especially for PDFs. An object containing both `quote` and `excerptId` fails. Unmatched PDF quotations, completed clipped words, normalized spaces, added punctuation, invented IDs and cross-page references fail; none are repaired or replaced with a nearby excerpt.

Visual evidence remains `{sourceId, mode: "visual", quote: ""}` for a real supplied PDF/image/video unit. Only video may add a bounded timestamp. Such references are AI interpretations of original visual material, not verified extracted-text quotations. This distinction and the existing learner-visible AI/source labels remain intact.

## Safe failure diagnostics

`ProviderResponseError` distinguishes `envelope`, `json`, `evidence` and `validation` failures without including source/model paragraphs. Evidence failures identify a fixed field path, for example:

`sections[0].evidence[0]: Ungrounded quotation; exact source match required`

Real AWS/Bedrock exceptions propagate unchanged to callers, retaining their error name and request metadata. The local smoke/diagnostic tools redact credential/account identifiers and report errors rather than substituting generated content. The existing learner service continues to show its honest unavailable state and never publishes rejected output. It does not expose raw AWS errors or private source content to the browser.

## Live verification

The standard local AWS credential mechanism worked without a `.env.local` file. No credentials/configuration changes were required. Real `amazon.nova-lite-v1:0` requests completed successfully:

- `learning-smoke.ts`: text, PNG and PDF each passed unchanged understanding, adaptation and reflection validation (nine live invocations).
- `learning-diagnostic.ts`: actual upload/preprocessing/store handlers returned HTTP 200 and `analysis.status: ready` for text, PNG and PDF. No diagnostic contract-probe override was used.
- Those three understanding responses still had one outer JSON fence; the new parser accepted it. Text/PDF selected excerpt references. PNG selected `kind: diagram` and visual evidence. Image/PDF limitations were retained.

| Live upload source | Bedrock HTTP / completion | Safe request ID | Validated evidence |
| --- | --- | --- | --- |
| Synthetic text | 200 / `end_turn` | `ccfe81cf-a94b-4da0-a2da-a91d9414d3ec` | One exact server-resolved quotation |
| Synthetic PNG | 200 / `end_turn` | `8accea48-b6a6-47e7-a0f3-765b635dac42` | One supplied image interpretation reference |
| Synthetic PDF | 200 / `end_turn` | `a2a3d0ba-7677-43e4-b8aa-2fe578e617c8` | One exact server-resolved page quotation |

The diagnostic PDF intentionally retains the earlier clipped-line fixture (70 extracted characters); success verifies its actual available source evidence, not recovery of missing text. The smoke PDF also carries source-objective context. Two-page PDF regression tests independently cover page/source ownership across all three tasks.

These observations establish working response handling for the tested sources, not universal model accuracy or semantic entailment. An exact excerpt reference proves source traceability; it does not prove that every generated explanation is correct. Visual references do not establish understanding of arbitrary diagrams, equations, tables, video or scans. Live video was not tested in this fix. Future invalid output still fails honestly.

## Reproduce

Final checks passed: 85/85 unit/integration tests (11 new provider regression tests), lint, explicit type checking and production build. All 21 production Edge E2E/accessibility tests passed, including the current learner journey, `/demo`, Read Aloud/voice controls, narrow layouts and the legacy PDF quality boundary. Browser regressions deliberately disable live AI and use controlled responses where needed; live Nova compatibility is established by the separate real-request tools above.

Files changed for this fix:

- `src/lib/learning/provider.ts` — explicit task contracts, excerpt context, response handling and unchanged validator calls.
- `src/lib/learning/provider-response.ts` — server-only wire types, envelope parser, source excerpts and strict reference resolution.
- `tests/learning-provider.test.ts` — format, text/image/PDF, source ownership, malformed evidence/quotations, AWS failure and HTTP result regressions.
- `scripts/learning-smoke.ts` — safe provider-stage reporting.
- `scripts/learning-diagnostic.ts` — shared envelope/resolution checks compatible with the new wire contract.
- `docs/learning-provider-response-contract.md` — contract, live evidence, limits and reproducible commands.
- `docs/learning-understanding-diagnosis.md` — a link to the resolution; historical diagnosis preserved.

No dependencies, application UI, learning service, domain validators, source preprocessing, extraction/quality policies, binary-tree fixture or Read Aloud code changed. No credentials were created or stored, and no commit was made.

From the repository, with standard locally configured AWS credentials:

```powershell
node --env-file-if-exists=.env.local --conditions=react-server --import tsx scripts/learning-smoke.ts
node --env-file-if-exists=.env.local --conditions=react-server --import tsx scripts/learning-diagnostic.ts
npm test
npm run lint
npm run typecheck
npm run build
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

The first two commands make real paid Bedrock calls using fixed synthetic material, keep model/source text in memory and print only structural counts, safe stage/error details and request metadata. Neither script logs credentials, full document contents, prompts or capability cookies.
