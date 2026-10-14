# Seven-page PDF experiment — 13 October 2026

## Decision

**Do not migrate production or advance to the 28-page test on this evidence.** GPT-6.1 Sol did not demonstrate a latency benefit in the first live pair, and the adapted lessons failed the completeness review despite passing ADAPT's strict structural/source-reference validators. Correctness was the gate for further generation; no repeat adaptation calls were made.

Claude remains the default. Gemini/audio, the application schema, source validation, session semantics, UI and practice implementation were not changed. The experiment adds two diagnostic scripts, four automated transport/budget tests, this report and local evidence. Pre-existing working-tree changes were preserved. Six relevant application files were hashed before/after and were unchanged; see [integrity evidence](openai-pdf-benchmark-2026-10-13/production-integrity.json).

## Method

The actual `ODE_Mathematics_7_Page_Study_Material.pdf` in the approved Downloads location was processed by the existing PDF preparation path: 34,712 bytes, seven pages, fingerprint `e3fe69b27104c1fc7672ce66274f4339abfef078b104a089579182a2f366a91a`. Preferences were `stepwise`, with empty additional description/focus. Original PDF bytes, extracted source excerpts, source-map slots and ADAPT's existing instructions were supplied to each model. No equations were solved, source text repaired, pages omitted, prompt shortened or validator relaxed.

The existing provider's injectable transport supplied real Bedrock responses for Claude and a benchmark-only Responses API translation for OpenAI. The translator retained the exact system instructions and text/evidence context and sent the PDF inline; there was no Files API upload. Completed message text traversed the unchanged JSON parser, source-evidence resolver and adaptation validator, followed by another domain validation. Reasoning/refusal/incomplete output was not accepted as lesson text.

Models/settings:

- Claude: existing Sonnet 4.5 Bedrock configuration, existing temperature 0 and 8,000 output-token cap.
- OpenAI: returned model `gpt-6.1-sol`, Standard (`service_tier:default`), low reasoning, `store:false`, no tools, no automatic retries or model switching. Its 25,000-token cap includes non-visible reasoning; this is not the same visible-output budget as Bedrock. OpenAI did not receive Bedrock's temperature parameter.

One adaptation per model was run serially in the same Node 24.20.0 process. This is a **validated pipeline benchmark**, not browser/upload-to-paint timing. Next.js cold compilation, HTTP upload, preference selection and browser rendering were not measured. The OpenAI token-count preflight is included separately below and would not necessarily be part of a production request. These are one-pair observations, not medians or a statistically established model ranking.

## Live results

| Measurement | Claude | GPT-6.1 Sol |
| --- | ---: | ---: |
| Preparation | 0.592 s | 0.592 s, shared material |
| Provider round trip | 42.460 s | 42.984 s |
| Input-token preflight | None | 2.675 s |
| Adaptation pipeline including validation | 42.470 s | 45.669 s, including preflight |
| Pipeline including preparation | 43.062 s | 46.261 s, including preflight |
| Non-provider/non-preflight processing | 9.757 ms | 9.516 ms |
| Input tokens reported | 19,239 | 5,796 |
| Output tokens reported | 2,409 | 1,935 |
| OpenAI reasoning tokens | N/A | 0 reported |
| Source pages referenced / returned sections | 7 / 7 | 7 / 7 |
| Strict adaptation validation | Pass | Pass |
| Manual completeness gate | Fail | Fail |

OpenAI's provider call was approximately 0.524 seconds longer. Different native-PDF tokenization makes the token totals non-comparable as a count of material retained. No claim is made that OpenAI is generally slower; this test simply did not demonstrate the intended improvement.

## Correctness and accessibility review

The original seven pages were rendered locally with Poppler and inspected alongside displayed paragraphs/key points. Evidence quotations were excluded from the visible-content assessment because the current learner UI does not render those fields.

The most important problem was omission rather than an observed dropped-minus-sign substitution:

- OpenAI repeatedly directs the learner to the original equations, integration lines and final expressions. None of the eight starting worked-example equations appears verbatim in its displayed lesson text.
- Claude includes one of those eight starting equations, but also replaces most worked examples with general method descriptions. Neither displayed lesson includes the source's explicit negative-exponent result `y=2+Ce^(-2x)`.
- These exact-expression checks ignore whitespace only. They are concrete omission signals, not a mathematical grading score or proof that every semantically equivalent explanation is invalid. Manual inspection establishes that important worked mathematics is unavailable in the adapted text.
- OpenAI explicitly acknowledges ambiguous constant/root labels rather than reconstructing them. Claude supplies numbered subscripts where extracted text has repeated `n` labels. Poppler emitted missing-display-font warnings, and several original Greek/subscript glyphs were not reliably legible in the rendered pages. Intended replacements cannot be independently certified from this rendering; they were not guessed during review.

A prompt/UI mismatch contributes to this outcome: `provider.ts` tells the model that original equations/code/numbers are displayed beside its explanation and to refer to the original for exact expressions. `adapted-learning.tsx` renders only the introduction, paragraphs/key points and practice; browser regressions explicitly assert that original-material/evidence/source-preview panels are absent. OpenAI's cautious references therefore do not create an independently accessible mathematics lesson in the current UI. This is a bounded finding in the existing workflow, not grounds to replace the provider, reconstruct mathematics or silently restore source panels. Addressing it requires a separate approved product/implementation decision.

Both results retain source-stated objectives and page order, use complete text units and no executable markup, and supply connected steps. Those properties are compatible with the existing semantic Read Aloud controls, but omitted equations cannot be made accessible merely by reading the remaining prose. No manual screen-reader, audible playback or new browser/E2E run was conducted. Existing semantic-reading/Gemini/audio regression checks passed.

See [quality review](openai-pdf-benchmark-2026-10-13/quality-review.json), [expression checks](openai-pdf-benchmark-2026-10-13/equation-presence-checks.json), [Claude lesson](openai-pdf-benchmark-2026-10-13/claude-1-lesson.json), and [OpenAI lesson](openai-pdf-benchmark-2026-10-13/openai-1-lesson.json).

## Live PDF practice compatibility

The unchanged Claude practice provider was invoked against both actual returned lessons, using a fresh protected session and the normal HTTP practice handler. The lessons were replayed through the existing adaptation validator; they were not adapted again. Both requests returned HTTP 200 with **five validated questions**, resolved by server-owned references to the exact displayed lesson units, with strict source/section evidence checks. This live ODE test reconfirms the reference-based practice fix; it does not establish universal PDF or question-semantic correctness.

Manual feedback inspection found remaining semantic limitations: on the OpenAI lesson, the first question asks for both order and degree but its selected feedback unit explains only order. Another asks for the integrating factor and its effect, but the selected feedback explains the effect without giving the factor's expression (which was not displayed in that lesson). On the Claude lesson, a question asks for rearranging and solving a separable equation but the selected feedback contains only the rearrangement step. References are exact and source-linked; their relevance/completeness is not mechanically guaranteed. These are additional review findings, not repaired outputs or grounds to weaken the validator.

Records: [Claude lesson practice](openai-pdf-benchmark-2026-10-13/claude-practice-result.json), [OpenAI lesson practice](openai-pdf-benchmark-2026-10-13/openai-practice-result.json). Practice remained Claude-based; there was no OpenAI practice or Gemini invocation.

## Spend and safety

OpenAI made one input-token-count preflight and **one generation request**. Usage reports 5,796 input tokens, including 5,793 cache-write tokens and zero cached-read tokens, plus 1,935 output tokens (zero reasoning tokens reported). At the published Standard short-context rates, the calculated generation charge is:

```text
(3 × $2 + 5,793 × $2.50 + 1,935 × $10) / 1,000,000 = $0.0338385
```

This is a usage-derived token charge, not an invoice including taxes or unrelated account usage. The token-count endpoint did not return billed usage/charges. Bedrock's one adaptation and two practice calls incur separate AWS charges and are outside the OpenAI ceiling.

The durable ledger reserved **$0.40688 before generation**, using the counted PDF input plus 10% input margin, long-context/cache-write rates and the full 25,000-token output budget. It reconciles to a conservative **$0.03384** spent upper bound, zero pending reservation, and a $5 ceiling. Incomplete/failed output cannot bypass the ledger; absent usage or an interrupted request leaves the reservation pending and blocks further calls. No token cap, tier, model or retry was increased after seeing results. Repeat mode requires both initial quality reviews to pass; they fail, so no repeat generation was authorized by the runner.

API key and AWS credentials were loaded only into the benchmark process from the existing private `.env.local`; values, authorization headers and session cookies were not printed or saved. Saved provider data is redacted against the key as an additional safeguard. Raw educational responses and source-page images are intentional local diagnostic artifacts. `store:false` does not guarantee zero provider retention; see [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

Sources for model, pricing and preflight behavior: [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [pricing](https://developers.openai.com/api/docs/pricing), and [input-token counting](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count).

## Reproduction and verification

Commands executed:

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/openai-pdf-benchmark.ts pair
node --env-file=.env.local --conditions=react-server --import tsx scripts/openai-pdf-benchmark.ts practice
node --conditions=react-server --import tsx --test tests/openai-pdf-transport.test.ts tests/understanding-practice.test.ts tests/semantic-reading.test.ts tests/gemini-transcription.test.ts
node node_modules/eslint/bin/eslint.js scripts/openai-pdf-benchmark.ts scripts/lib/openai-responses-transport.ts tests/openai-pdf-transport.test.ts
npm run typecheck
npm test
git diff --check
```

The paired runner preserves existing results and outstanding reservations rather than repeating paid calls on restart. Practice mode is a live Bedrock operation; it is not a free replay. Do not delete the spending ledger to bypass the ceiling or reuse these scripts for an unapproved larger document.

Results: **129 full-suite tests passed**; 25 selected benchmark/practice/semantic-reading/Gemini tests passed; targeted lint, project type checking and diff checks passed. No dependencies, production application files, model defaults, existing skills, learner UI or audio pipeline were modified. Build/browser tests were not rerun for this diagnostic-only change.

**Recommendation:** retain the working production providers for submission. The live practice fix is promising; the OpenAI adaptation migration is not justified by this pair. Review the mathematics-source presentation mismatch separately before claiming full worked-example preservation. No 28-page or audio experiment was performed.

## Explicitly approved high-reasoning follow-up

After the initial report, the user asked to try high reasoning. One additional seven-page generation was made with **only `reasoning.effort` changed from low to high**. Same native PDF/fingerprint, system prompt, preferences, evidence, model, Standard tier, 25,000-token ceiling, `store:false` and strict validators. No new Claude or practice call, 28-page test, prompt revision or production change was made.

| Measurement | Low | High |
| --- | ---: | ---: |
| Provider latency | 42.984 s | 72.288 s |
| Pipeline including local preparation and token-count preflight | 46.261 s | 74.743 s |
| Input tokens | 5,796 | 5,796 |
| Output tokens, including reasoning | 1,935 | 3,678 |
| Reasoning tokens reported | 0 | 1,552 |
| Cache-write tokens / cached-read tokens | 5,793 / 0 | 5,793 / 0 |
| Calculated generation token charge | $0.0338385 | $0.0512685 |
| Strict adaptation validation | Pass | Pass |
| Completeness review | Fail | Fail |

High took approximately 68% longer at the provider. It retained all seven page references and gave natural connected prose, but still displayed **none of the eight starting worked-example equations** and omitted the explicit negative-exponent result. Mathematical steps repeatedly defer to the original source. This does not satisfy the standalone accessible-material completeness gate. Its raw limitations also state “No original page images were supplied”; the transport actually sent the same native PDF, which the Responses API documentation says is processed as text plus page images. That unsupported claim is retained rather than corrected in model output. It is not evidence that the actual request omitted the PDF.

High request preflight counted 5,796 tokens and reserved $0.40688 before generation. The combined calculated OpenAI generation charge is **$0.085107**, with a conservative ledger of **$0.08511**, zero pending reservations and the unchanged $5 ceiling. Two generation calls total were made across the initial and high experiments; neither had an access/completion error. No further call was made after reviewing high. Initial costs/results above refer to the first phase; these totals include the follow-up.

Evidence: [high request metadata](openai-pdf-benchmark-2026-10-13/openai-high-1-request-metadata.json), [raw response](openai-pdf-benchmark-2026-10-13/openai-high-1-raw.json), [validated lesson](openai-pdf-benchmark-2026-10-13/openai-high-1-lesson.json), [timing/usage](openai-pdf-benchmark-2026-10-13/openai-high-1-result.json), and [quality review](openai-pdf-benchmark-2026-10-13/high-reasoning-review.json). This remains a single observation per effort, not a statistical ranking. Browser paint and high-lesson practice were not tested.

The runner's `high` mode is explicit and preserves existing high results on rerun. The benchmark-only transport accepts low/high while retaining low as its original default. The tests confirm that changing effort leaves the rest of the request unchanged. Four benchmark tests, targeted lint, typecheck and diff checks passed; application hashes remained unchanged. The 129-test full suite above preceded this small benchmark-only follow-up.

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/openai-pdf-benchmark.ts high
```

**Follow-up recommendation:** high reasoning does not justify a migration or the larger-document test. The prompt/source-presentation mismatch remains the more useful issue to address, with approval, than additional reasoning effort.
