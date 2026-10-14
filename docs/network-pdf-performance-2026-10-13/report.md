# Networking PDF performance experiment — 13 October 2026

**Recommendation: keep the production prompt.** The compact candidate worked through strict validation but did not reduce measured waiting time. No production optimisation was applied.

## Scope and workspace

Inspected the current Git diff, provider/material/session/HTTP/UI paths, existing OpenAI experiment, tests, and repository source-grounding and demo-readiness skills. Existing changes to AGENTS.md, README.md, practice references, tests, skills and OpenAI benchmark artifacts were preserved. HEAD was `a5665be` with pre-existing uncommitted work; this is not a clean-commit benchmark.

Only developer experiment files, two regression tests and this result directory were added. No production provider/default, Gemini audio path, source validation, session semantics, learner UI, dependencies or lesson schema were changed. Eight relevant application files were hashed before/after; see `production-integrity.json`. No commits, OpenAI calls, audio calls, mathematics investigation or 28-page benchmark were performed.

## Material and controlled settings

- Supplied `LAN_WAN_MAN_10_Page_Study_Material.pdf`, 38,632 bytes. It actually has **11 physical pages**; the filename and cover describe ten.
- SHA-256: `cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01`.
- Ten pages have reliable extracted text. Page 9's comparison table uses native-PDF visual evidence. The original document bytes were identical in both requests.
- Node 24.20.0 / Next.js 16.3.8; existing AWS credential mechanism and EU Claude Sonnet 4.5 inference profile `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`.
- Preferences: `needs: ["stepwise"]`, empty description and focus. Temperature 0, maximum 8,000 output tokens, SDK maximum attempts 1 in both variants.

The experiment changes only system-prompt scaffolding: one complete section-shape example plus an explicit compact map replaces eleven repeated verbose example sections. Every source/section ID, evidence reference, safety instruction, user message, native PDF bytes and inference setting is retained. The helper fails closed if the expected prompt shape changes. Unit tests check request equality outside the system text and equivalence to production response handling.

## Measurement method

The unchanged production UI ran locally on port 3205. Playwright intercepted its API requests and dispatched them to the **current real HTTP handlers and isolated existing session store**. Uploads passed the actual extraction path. Adaptation used the actual provider's captured Converse request, actual Bedrock transport, and existing parsing, evidence resolution and validation functions; the service independently validates again.

Preparation is upload-handler wall time. Provider round trip includes SDK/network/model response time; Bedrock's reported latency is recorded separately. Parsing, evidence resolution and provider validation are measured independently. Service revalidation/session/serialization are included in handler time, not isolated individually. Browser readiness means a visible lesson followed by two animation frames. It is **not** a native browser first-paint metric or a deployed upload/network benchmark. Human time choosing support is excluded from total waiting time.

The comparable pair (`*-5`) used the same refreshed production build. An earlier successful baseline (`baseline-4`) provides a second provider measurement but used the older UI build; its browser time is not part of the primary pair. Local regression tests also ran during the primary pair, so sub-second preparation/render differences are not controlled CPU benchmarks. Bedrock-reported model latency still shows no candidate benefit.

Source contents, cookies, credentials and raw PDF quotations are absent from persisted diagnostic metrics. Generated lesson/practice review files, with source quotations omitted, were kept in temporary review directories recorded in results; the original PDF was viewed locally. The durable review is `quality-review.json`, rather than a document-content dump.

## Comparable results

| Measurement | Baseline `baseline-5` | Compact `compact-5` |
|---|---:|---:|
| Upload/preparation | 0.592 s | 1.034 s |
| Request construction | 3.074 ms | 1.371 ms |
| Provider round trip | **54.103 s** | **62.445 s** |
| Bedrock-reported latency | 52.786 s | 60.163 s |
| JSON parsing | 0.603 ms | 0.187 ms |
| Evidence resolution | 0.987 ms | 0.240 ms |
| Provider validation | 2.353 ms | 0.360 ms |
| Adaptation handler | 54.118 s | 62.453 s |
| Adapt click → visible lesson + two frames | **54.356 s** | **62.652 s** |
| Total local waiting, excluding preference selection | **55.431 s** | **64.311 s** |
| Input tokens | 26,178 | 25,928 |
| Output tokens | 3,194 | 3,865 |
| Total tokens | 29,372 | 29,793 |
| Sections / represented pages | 11 / 11 | 11 / 11 |
| Paragraphs / key points, across all sections | 11 / 54 | 11 / 54 |
| Adaptation HTTP / stop reason | 200 / end_turn | 200 / end_turn |

Compaction removed 1,392 system characters (11.55%), but only **250 total input tokens (0.96%)**. Native-document/source input dominates the input budget. Output grew 671 tokens (21.01%). Provider time increased 8.343 seconds (15.42%) in this pair. This is **no evidence of a speed improvement**, not proof that compaction is always slower. Only one successful compact adaptation was run.

The two successful baselines took 58.428 and 54.103 seconds at the provider (mean 56.265 s, range 4.325 s). Their outputs were 3,167 and 3,194 tokens. No confidence interval or general performance guarantee follows from this sample.

Provider round trip consumes over 99.9% of the measured adaptation-handler time. Parsing/validation optimisation cannot materially address a roughly minute-long wait here. Output generation and multimodal inference are plausible contributors within that provider time; this experiment does not separate them or measure time to first token.

## Fidelity and learning review

Compared all original rendered pages with the three generated lessons, separately from structural validation. Both primary lessons cover network purposes, scope, LAN components, MAN infrastructure/uses, WAN technologies/management, all five comparison-table rows, and the university's combined-network example. No invented protocols, numerical distance/speed rules or unsupported network relationships were identified in this bounded review. Source objectives remain context, not a new prerequisite.

Both preserve switch/frame versus router/inter-network roles, Ethernet/Wi-Fi, fiber metropolitan connectivity, provider/ownership distinctions, and LAN/MAN/WAN integration. All eleven IDs remain in order. Page 9 remains explicitly visual evidence with the existing interpretation limitation; passing a reference check does not independently verify visual meaning.

Coverage is **not exhaustive**: baseline-5 compresses individual examples and omits the six original revision questions; compact-5 retains more examples and those questions, but compresses specific resource-sharing/central-service examples. Some key points are more categorical than the qualified surrounding paragraph. For example, baseline's MAN fiber key point loses the source's optional wording, though the paragraph retains it. These are fidelity/readability reservations, not resolved by validation. No equations or mathematical claims were evaluated.

The selected stepwise adaptation supplies manageable sections and at most six key points per section; 54 is a lesson-wide total. It often restates descriptive facts as key points rather than forming a genuinely sequential process. That is a qualitative limitation of both prompts, not a reason to trade correctness for speed.

## Practice and accessibility

No more adaptation calls were made after the slower candidate. Instead, the two validated primary lessons' **unchanged displayed paragraphs/key points** were replayed through the existing service and strict validators, then the normal Claude practice generator was called live.

Review artifacts intentionally omit quotations. For replay, the same page IDs were linked to real first server excerpts from those pages; visual evidence stayed visual. This is a **lesson-answer compatibility test, not exact original evidence/session replay**. No quotations were invented and no validator was bypassed. Replayed adaptation timings are explicitly excluded from performance results.

| Practice replay | Baseline lesson | Compact lesson |
|---|---:|---:|
| Live provider | 10.174 s | 12.807 s |
| Input/output tokens | 30,284 / 577 | 30,883 / 588 |
| Strictly validated questions | 5 | 5 |
| HTTP | 200 | 200 |
| Keyboard feedback / finish | Pass | Pass |

Manually reviewed all ten resolved questions/answers: geography, Ethernet/Wi-Fi, switch/router roles, network comparison and the university example are present in displayed content and supported by the source. Answers use server-owned displayed-lesson references. No scoring/grades were introduced.

Both real generated lessons and practice replays returned zero axe violations and no overflow at 320 px. The custom benchmark speech spy **did not record focus-triggered speech**, and its heading-focus probe returned false in the refreshed build. These checks are not counted as passes. They do not establish a production defect: the existing dedicated Read Aloud, keyboard-focus and accessibility E2E tests all passed. Audible Read Aloud and actual screen-reader/focus rehearsal on this specific networking lesson remain manual checks. No application accessibility code was changed to make the experiment pass.

## Failed attempts retained

- `*-1`: diagnostic multipart interception omitted file bytes; no model result. Harness repaired to supply the exact approved file through the real upload handler.
- `*-2`: upload succeeded, but adaptation returned 503 before a lesson; the first harness did not capture its underlying provider error.
- `*-3-progress.json`: restricted-process SDK returned `CredentialsProviderError: Could not load credentials from any providers`. These are not Claude content/validation failures or latency samples. Retried with existing credentials outside the restriction, without credential changes.
- `baseline-4`: real adaptation/validation/render succeeded, but subsequent silent-speech assertion failed; valid timings retained separately. `compact-4` never reached the provider after temporary UI shutdown.
- `*-5`: real adaptation/validation/render succeeded, but subsequent silent-speech assertion failed. JSON top-level status therefore remains `failed`; the successful adaptation metrics must not be misrepresented as a fully passing uninterrupted journey.

There were three successful adaptation responses and two successful practice responses: 139,451 input tokens and 11,391 output tokens total. Bedrock responses provide usage, not dollar charges; no actual spend is claimed.

## Verification and reproducibility

Commands executed for successful comparison/review (existing dependencies, no installation):

```powershell
npm test
npm run lint
npm run typecheck
npm run build
node --env-file=.env.local --conditions=react-server --import tsx scripts/network-pdf-benchmark.ts fresh
node --env-file=.env.local --conditions=react-server --import tsx scripts/network-pdf-benchmark.ts practice C:\Users\besle\AppData\Local\Temp\adapt-network-review-pPcydh
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
git diff --check
```

Results: **131 unit/integration tests passed; 33 E2E tests passed; lint, typecheck, production build and diff check passed.** New prompt-compaction tests prove native bytes/settings/source-map preservation and production validator equivalence/rejection.

The harness preserves existing result files rather than overwriting them. `pair`, `retry`, `diagnose`, `live`, `fresh` identify historical attempts; `repeat` would create a reversed-order sixth pair only after the recorded quality review passes. Do not run it merely because credentials are present: it makes paid requests, and further work is not recommended for this deadline. On a clean checkout/result directory, `pair` runs the reproducible initial comparison. Practice replay requires the generated temporary review files; if unavailable, a new approved adaptation run is needed, not fabricated lesson content.

## Next decision

Do not migrate the compact prompt or change token caps, validation, native visuals or providers. The smallest prompt-only candidate has **not earned production adoption**. For the demonstration, rehearse the existing Claude flow with this file and budget approximately a minute for adaptation; this is an observation, not a service guarantee. Finish a manual Read Aloud/screen-reader/focus check and an uninterrupted live upload-to-practice rehearsal if that interaction is part of the pitch. Streaming, further output/prompt changes, section processing and provider changes would be separate approved experiments, not outcomes of this task.
