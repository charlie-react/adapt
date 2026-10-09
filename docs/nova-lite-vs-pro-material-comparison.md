# Direct Nova Lite vs Nova Pro material-understanding comparison

Date: 2026-10-06. This is an observed capability comparison, not a provider change or an ADAPT integration test.

## Recommendation

**Neither model should be ADAPT's sole material-understanding authority for the requested mix of educational prose, code, mathematics and diagrams.** Pro produced substantially more detailed binomial explanations and often better class-member transcription, but still changed signs, powers, coefficients, relationships and multiplicities. It did not resolve the failures that motivated this comparison. Lite retained more SDN examples and performed better on the six clean-text arithmetic items in this particular run. Neither outcome establishes broad superiority.

Lite remains a plausible component for explanations of independently verified prose/simple code. Pro may be worth evaluating further as a component, but this evidence does not justify switching ADAPT to Pro as a fix for general material understanding. Source verification and explicit uncertainty remain necessary with either model. No production provider, UI or validation behavior was changed.

## Experiment and evidence

Nine matched Lite/Pro pairs produced **18 HTTP 200 responses**, all with `end_turn`. There was one additional, preserved HTTP 400 routing error before the matched runs. There were no output-token-limit stops. The original four materials were uploaded again; earlier Lite responses were not substituted for the new comparison.

- Lite invocation: `amazon.nova-lite-v1:0`.
- Requested Pro model: `amazon.nova-pro-v1:0`. Its base ID returned `ValidationException`: on-demand throughput is unsupported and an inference profile is required.
- Successful Pro invocation: `eu.amazon.nova-pro-v1:0`, verified with `bedrock get-inference-profile` as ACTIVE and containing the requested Pro v1 foundation model. Source endpoint remains `eu-north-1`. The profile permits destinations in `eu-central-1`, `eu-north-1`, `eu-west-1` and `eu-west-3`; the saved response does not identify which destination served a particular request. This routing difference is recorded rather than presented as identical regional execution. AWS documents the same Pro model and EU profile in its [Nova Pro model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-pro.html).
- Both models: `temperature: 0`, `maxTokens: 10000`, one user message, source blocks followed by the prompt, 180-second deadline, SDK `maxAttempts: 1`. No hidden retries, system prompt, tool use, guardrail or ADAPT response contract was added.
- Standard local AWS credential chain; no learner identity, credentials or unrelated material was placed in prompts or saved diagnostic output.

The standalone runner imports only the installed Bedrock Runtime SDK and Node built-ins. Native PDFs go directly to Converse document blocks; PNGs go directly to image blocks. ADAPT extraction, provider parsing, schemas, quotation matching, grounding validation and adaptation logic are entirely bypassed. Full SDK responses and exact text are saved without parsing or correcting model text. The experiment-integrity checker only verifies artifact preservation and matched requests; it does not accept/reject model content.

Evidence:

- [Raw-response index, prompts and reproduction instructions](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/nova-direct-probe/2026-10-06-comparison/README.md>)
- [Complete request/result manifest](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/nova-direct-probe/2026-10-06-comparison/manifest.json>) — timestamps, original paths, exact SHA-256 hashes, model IDs, settings, request IDs, token usage, latency and output filenames.
- [Pair integrity verification](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/nova-direct-probe/2026-10-06-comparison/verification.json>) — all nine pairs have identical source bytes, prompts and settings; raw text matches the saved full SDK response.
- [Pro base-ID error](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/nova-direct-probe/2026-10-06-comparison/factorial-code-image.pro.attempt-1.error.json>) and [profile verification](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/nova-direct-probe/2026-10-06-comparison/inference-profile.json>).
- [Independent exact arithmetic reference](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/nova-direct-probe/2026-10-06-comparison/arithmetic-reference.json>) — computed from the expressions using Python `math.comb` and `fractions.Fraction`, without executing model code.

Each successful call has a `.request.json`, full `.response.json`, and unedited `.raw.txt`. Metadata does not duplicate PDF/image bytes or log credentials. These raw responses are evidence of model output, not verified learning content.

## Materials and controls

| Case | Actual supplied input | Purpose |
|---|---|---|
| `binomial-pdf` | Original 18-page Binomial PDF | Comprehensive mathematical material understanding |
| `sdn-pdf` | Original 13-page AI/ML in SDN PDF | Prose, concepts, examples, questions and source coverage |
| `hostel-diagram-image` | Original 880 × 694 UML PNG | Visual class members, topology, symbols and cardinalities |
| `factorial-code-image` | Original 774 × 594 Java PNG | Code transcription and recursive execution explanation |
| `hostel-diagram-focused-image` | Same UML PNG | Complete exact inventory and connection inspection |
| `binomial-focused-pdf` | Same complete Binomial PDF | Exact formulas, signs, powers, results and source inconsistencies |
| `binomial-pages-image-control` | Unmodified renderings of physical pages 8, 11, 13 and 15 | Mathematical visual reading without native document processing |
| `exact-math-text-control` | Clear-text worksheet with six source-derived expressions and no worked answers | Separate arithmetic/term-index reasoning from visual decoding |
| `diagram-relationship-control` | Same UML PNG | Narrow stroke tracing: labels, endpoints, directions, multiplicities and symbols |

The first seven cases reuse the previous direct probe's exact prompts, with fresh calls to both models. The two new control prompts contain no expected answers or canonical relationship inventory. Every pair receives the same complete prompt. Prompt files and their hashes are saved. The base prompt asks for comprehensive source-order understanding, exact mathematics/code/relationships, and explicit uncertainty, without JSON or ADAPT-specific evidence requirements.

The image math control has four pages while the native PDF tests have all 18. It therefore demonstrates whether failures persist on rendered pages, not a controlled estimate of the effect of input format alone. The clear-text worksheet is a diagnostic transcription, not a substitute for proving PDF understanding.

## Side-by-side assessment

| Requirement | Nova Lite observed result | Nova Pro observed result | Implication for ADAPT |
|---|---|---|---|
| Prose/concept understanding | Correct SDN objectives, four techniques, four applications and four challenges; retained the concrete examples and final question options | Correct central SDN concepts, techniques, applications and challenges; omitted the objectives, concrete examples and answer options | Both can explain straightforward prose; Pro was less complete for this source/prompt |
| Simple code | Correct Java base cases, recursive expression, input 5 and output 120; did not transcribe the full code | Transcribed operational code and explained base/recursive cases, input and output correctly | Both handled this short familiar example; no evidence about complex code |
| Mathematics | Native broad response largely topic-level; focused/visual responses omitted or changed important mathematics; clean-text sixth-term multiplication wrong | More detailed native explanations, but dropped variables/powers, changed coefficients, introduced incorrect working, and failed three clean-text final answers | Pro's added detail did not provide dependable exact math |
| Diagram relationships | Invented endpoints/inheritance and misplaced labels/multiplicities across broad and focused prompts | Correct superclass relationship in broad response, but invented direct Administrator–Room connection; focused controls also moved labels/endpoints and reversed arrows | Neither recovered a reliable canonical relationship graph |
| Visual understanding | Recognized classes, many members and visible math topics; exact topology and typography unreliable | Often more complete member/type transcription, but exact symbol/number interpretation unreliable | Recognizing visible entities does not demonstrate relationship or equation fidelity |
| Hallucination/invention | Fabricated drawn connections, mixed incompatible arithmetic, and made completeness claims despite omissions | Fabricated connections, silently changed source expressions/solutions, and introduced arithmetic not supported by source | Errors occurred in raw model output, before any ADAPT parsing or validation |
| Source fidelity | Repeated the source's mislabeled fifth term without flagging it; omitted major source details | Sometimes replaced the source's flawed fifth-term solution without disclosing a correction; other replacements were wrong | Neither consistently separates source statements, source errors and its own reasoning |

No actual tables or complex technical illustrations occur in the two PDFs. This run cannot establish table understanding, scanned-document reliability, video capability, multilingual performance, complex-code understanding or general hallucination rates.

## Exact mathematics: source evidence

Physical page 11 is imperfect source material: it calls a `k=5` expression the fifth term of `(4x - 3y)^8`, although it is the sixth term, and contains a stray copied `-20/8 x^6` equality. Its final `-870912 x^3 y^5` is correct for the sixth term. A faithful reader should report the displayed result and label the ordinal inconsistency; a mathematical correction should be explicit. Merely repeating that source error is different from inventing a new value. Page 9 also prints `416x^2` in one copied polynomial, while page 8 and page 9's numerical substitution use `216x^2`; its `80.7842` result is rounded. These source issues are separate from Pro's newly incorrect intermediate powers and arithmetic.

Other source anchors are unambiguous:

- Page 8: `(2x - 3)^4 = 16x^4 - 96x^3 + 216x^2 - 216x + 81`; the requested numerical evaluation is `(-2.998)^4`.
- Page 11, first exercise: `(2 - (1/4)x^2)^6`; fourth term `-(5/2)x^6`, scalar coefficient `-5/2`.
- Page 13: `(1 + 3x)^(-4) = 1 - 12x + 90x^2 - 540x^3 + …`.
- Page 15: `(1 - 2x)^(1/2) = 1 - x - (1/2)x^2 - (1/2)x^3 + …`.

Observed native/visual failures:

| Response | Concrete discrepancy |
|---|---|
| Lite broad native PDF | 438 output tokens; no actual worked expansions/results despite the comprehensive prompt |
| Lite focused native PDF | Calls the full `-20/8 x^6` term a coefficient; repeats the source's mislabeled fifth term without identifying the inconsistency; omits actual negative/fractional expansions |
| Pro broad native PDF | Drops `x^2` to `x` in the first exercise; drops `y` in the second exercise; presents changed fifth-term working as source solution; reports fractional cubic coefficient `-1/3` instead of `-1/2` |
| Pro focused native PDF | Drops `x^2`; introduces `70/2 = 35` for the fifth-term coefficient and reports `725760 x^4 y^4`; replaces `(1-2x)^(1/2)` with an expansion of `(1-x)^(1/2)`; its numeric-evaluation intermediate powers/equalities are also incorrect |
| Lite rendered pages | Drops `x^2`; states `70 × 256 × 81 x^4 y^4 = -870912 x^4 y^4`; changes exponent `-4` to `4`; fractional cubic coefficient becomes `-1/8` |
| Pro rendered pages | Drops the variable entirely from `(2-(1/4)x^2)^6`, flips coefficient `-20/8` to positive, changes `(-2.998)^4` to `(-2.999)^4`, and flips fractional quadratic coefficient `-1/2` to positive; says no unreadable/ambiguous content was identified |

The focused/rendered Pro responses are not safe corrections of source errors: several changes are neither what the source prints nor mathematically correct. Both visual and native paths exhibit substantive errors.

## Exact mathematics: clean-text control

No worked answers were supplied. Independent exact values come from `reference.py`.

| Item | Correct final answer | Lite final answer | Pro final answer |
|---|---|---|---|
| Expand `(2x-3)^4` | `16x^4-96x^3+216x^2-216x+81` | Correct | Correct |
| Fourth term of `(2-(1/4)x^2)^6` | `-(5/2)x^6`; coefficient `-5/2` | Correct | Correct |
| Actual fifth term of `(4x-3y)^8` | `1451520 x^4 y^4` | Correct | Correct |
| Sixth term of `(4x-3y)^8` | `-870912 x^3 y^5` | `-914688 x^3 y^5` — wrong | `-884736 x^3 y^5` — wrong |
| `(1+3x)^(-4)` through cubic | `1-12x+90x^2-540x^3` | Correct | Cubic `-180x^3` — wrong |
| `(1-2x)^(1/2)` through cubic | `1-x-(1/2)x^2-(1/2)x^3` | Correct final expression | Cubic `+(1/8)x^3` — wrong |

These are **five of six correct final answers for Lite and three of six for Pro in one matched worksheet run**, not measured population accuracy. Working must also be evaluated: Lite's fractional expansion contains a false intermediate sign equality even though its final answer is correct, and its negative-power formula incorrectly displays a finite upper limit before deriving the right truncation. Both models write the correct factors `56 × 64 × (-243)` and then compute the wrong sixth-term product. Pro likewise writes the correct factors for the cubic negative/fractional terms but obtains incorrect results.

Thus the observed math failures cannot all be attributed to PDF extraction, OCR, image resolution, ADAPT quotation matching or JSON formatting. Direct clean-text arithmetic also fails. This experiment does not expose Nova's internal document-processing steps, so it cannot identify the internal cause of each native-PDF error.

## Diagram fidelity: actual strokes versus generated relationships

The source has overlapping strokes and a non-ideal generalization marker; acknowledging uncertainty is acceptable. Inventing plausible business relationships is not. Multiplicities below are recorded at their printed endpoints, even when a business interpretation might seem unusual.

| Source anchor | Lite evidence | Pro evidence |
|---|---|---|
| `manages`: Administrator → Hostel, `1..*` near Administrator, `0..*` near Hostel | Focused: Hostel → Person; narrow control: Person ↔ Hostel | Focused: Hostel ↔ Person; narrow control: Hostel → Room |
| `verifies`: Administrator → Payment, `1` near Administrator, `0..*` near Payment | Focused and narrow controls: Administrator → Hostel Application | Focused: Administrator ↔ Hostel; narrow control finds Payment endpoint but changes Administrator multiplicity to `0..*` |
| `allocates`: Administrator → Room Allocation, `1` near Administrator, `0..*` near Allocation | Focused finds Allocation endpoint; narrow control changes it to Room | Focused and narrow controls substitute Room |
| Dashed `Use`: Room Allocation → Payment, `1` at both ends | Focused invents Application → Allocation; narrow control assigns Use to Room–Allocation | Focused assigns Use to Room–Allocation; narrow control Allocation → Room, wrong symbol/multiplicity |
| Student → Application: `makes`, Student `1`, Application `0..*` | Generally finds endpoints, but omits endpoint-specific numbers in focused/narrow responses | Broad: `1 to 1`; narrow control reverses the printed endpoint numbers |
| Branched upward arrow joins Student and Administrator to Person | Focused invents Hostel as Administrator superclass and Room as Allocation superclass; narrow control omits requested arrow analysis | Broad correctly identifies Person as superclass; narrow control reverses the arrow direction from Person toward subclasses |
| Filled diamond on Hostel–Room connection; `1..*` at Room | Broad: `0..*` rooms; focused treats connection as association; narrow control omits diamond | Broad/focused omit symbol; narrow control finds the black diamond/endpoints but labels it aggregation and supplies wrong relationship numbers elsewhere |

There is no direct Administrator–Room stroke and no Hostel–Person stroke. Both models invent these connections across the tests. The source also has Student–Payment, Student–Allocation, Application–Payment and Room–Allocation connections; neither model provides a complete accurate graph with the corresponding endpoint multiplicities and symbol types. The class inventories are much better than their relationship inventories. For example, Pro retains `remove()` and `checkAvailability()` in broad transcription, while Lite broad renames `remove()` to `removeRoom()` and omits `checkAvailability()`.

## Prose and code details

Lite's SDN response preserves all four techniques and their concrete examples: supervised link-failure prediction, unsupervised anomalous flows, reinforcement QoS adjustment, and deep-learning APT detection. It also preserves telecom evening-bandwidth allocation, underperforming-switch rerouting, DDoS isolation and VM resource allocation. Pro preserves the categories/definitions but drops these examples, the four objectives and the final MCQ choices. Both omit the mid-lesson unsupervised-learning question, the introductory reflective question and the train-network analogy. Lite's final claim that specific use cases are absent contradicts the source and its own preceding examples. Pro's assertion that visible content was accurately transcribed does not address these omissions. Neither provides complete page-by-page coverage.

Both Java responses correctly explain `n == 0 || n == 1`, `n * factorial(n - 1)`, `n = 5` and output `120`. Pro reproduces the operational code and gives a source-order inventory, but calls the language Java or C++ despite Java-specific syntax. Lite identifies Java correctly but says the class has a single method before discussing `main`. Neither supplies a complete call/unwind trace. No model code was executed, and passing this short familiar example should not be generalized to arbitrary code or other source images.

## Operational observations

Elapsed times are measured client-side, including network/provider time; they are not isolated inference benchmarks. Calls were sequential. Routing and transient service/network conditions can affect latency.

| Case | Input tokens per model | Lite output tokens | Pro output tokens | Lite seconds | Pro seconds |
|---|---:|---:|---:|---:|---:|
| Binomial native broad | 38,367 | 438 | 2,163 | 22.259 | 43.467 |
| SDN native broad | 22,979 | 1,393 | 925 | 80.384 | 88.773 |
| UML broad | 1,934 | 640 | 1,236 | 10.490 | 13.587 |
| Java image | 1,966 | 527 | 938 | 9.391 | 12.092 |
| UML focused | 2,037 | 850 | 972 | 9.880 | 10.461 |
| Binomial native focused | 38,480 | 770 | 2,195 | 18.040 | 53.210 |
| Four math page images | 3,358 | 572 | 1,015 | 28.808 | 31.129 |
| Exact math text | 565 | 2,231 | 2,106 | 8.846 | 10.001 |
| Narrow relationship control | 2,081 | 473 | 1,074 | 5.374 | 9.642 |

Successful calls consumed 111,767 input tokens per model, 7,894 Lite output tokens and 12,624 Pro output tokens. Dollar costs were not measured. Pro was slower in each matched pair on this run; do not treat these single observations as a service SLA or typical latency estimate.

## Verification, changes and limits

- `node --check run.mjs`: passed.
- `node verify.mjs`: passed for all nine pairs; identical inputs/prompts/settings, current source hashes, exact preserved text, full response files, HTTP 200 and `end_turn` verified. This deliberately does not apply ADAPT validators.
- `reference.py`: independently reproduced the exact reference coefficients with the Python standard library.
- `git status --short`: existing production working-tree changes remain. This task added this documentation artifact and standalone experiment files outside the repository; no production files, dependencies or secrets were changed or committed.
- Application lint, build and E2E tests were not rerun: no application code changed, and those tests cannot establish live model factual fidelity. The relevant checks here are real requests, source inspection, arithmetic reference and experiment integrity.

This is a small, targeted falsification test, not a statistical benchmark. Four original materials and closely related controls do not establish accuracy rates, universality or optimal prompting. Temperature zero does not guarantee future outputs will be identical. Nevertheless, the repeated substantive failures across broad, focused, native, visual and clear-text inputs are sufficient evidence that a simple Lite-to-Pro switch does not solve this material-understanding requirement.

Before choosing a model for general source understanding, evaluate additional candidates or processing strategies against these same exact source anchors. Keep raw source, extracted material, model interpretation and verified facts separate. Do not relax ADAPT's validators to conceal these errors, and do not treat an exact quotation match as proof that surrounding interpretation is correct. Any change to the application's provider or supported-material policy requires a separate product/implementation decision.
