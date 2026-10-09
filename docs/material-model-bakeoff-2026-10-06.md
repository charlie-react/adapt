# Rapid material-understanding bake-off: Sonnet 4.5, Gemini 2.5 Pro, GPT-5

Date: 2026-10-06. **Partial capability evidence; no three-model winner can be established.** Production ADAPT code was bypassed and unchanged.

**Subsequent Claude-only completion:** AWS access was resolved and all four preserved tests returned successfully. The [completed Claude assessment](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/adapt/docs/claude-sonnet-4-5-material-assessment.md>) supersedes this report's pending Claude recommendation: independent arithmetic and UML fidelity failures prevent approval as ADAPT's sole general-purpose understanding authority. The initial responses, errors and observations below remain historical evidence; Gemini/GPT were not configured during the continuation.

## Recommendation

**Hold further integration. Prioritize completing Claude Sonnet 4.5's remaining tests once AWS model access is configured.** Its one successful PDF response is promising, but mathematics calculation, UML relationships and Java interpretation were blocked before model output. Gemini 2.5 Pro and GPT-5 had no configured API authentication, so neither received a capability score. This does not mean they are less capable or globally unavailable.

Claude preserved core mathematical expressions that Nova previously corrupted, but missed an important source inconsistency and made a provenance error. The prompts/settings differ from the earlier Nova experiment, so this observation is not a controlled Claude-versus-Nova ranking. There is insufficient evidence to claim that Claude is the most reliable of the three requested models or safe for arbitrary educational material.

## Four fixed tests and inputs

| Test | Supplied material | Focus |
|---|---|---|
| 01: Exact transcription | Original Binomial PDF and original SDN PDF | Physical Binomial pages 8, 11, 13, 15: exact equations, signs, powers, coefficients, term positions and source errors; a short SDN check covers four techniques/examples, the mid-lesson and reflective questions, and absent technical content |
| 02: Arithmetic/calculation | Same six source-derived clean-text expressions used in the Nova comparison, with no answers supplied | Quartic expansion, fourth-term coefficient, actual fifth/sixth terms, negative-power and fractional-power cubic expansions; isolates calculation from visual decoding |
| 03: UML relationships | Original hostel UML PNG | Every drawn connection, both endpoints, direction, label, symbols and printed endpoint multiplicities; no plausible workflow substituted for strokes |
| 04: Java recursion | Original Java factorial PNG | Code transcription, language/methods, exact base/recursive cases, n=5 call/unwind trace, output and source versus inferred limitations |

All three models have the same intended prompt and source hashes for each test. Only Claude actually received requests. Unavailable requests have explicit local records; they are not fabricated API errors. The SDN check was included in test 01 to retain all four original materials without adding a fifth test. The original PDFs/images have the same hashes as the earlier direct Nova probe.

No ADAPT provider, extraction adapter, response schema, grounding validator, quotation validator, accommodation logic or UI is imported. Native PDFs/images are sent directly through the provider API. Responses are saved without interpreting model-produced schemas or repairing content. Full response envelopes preserve all blocks, including citations.

## Results and access evidence

| Requested model | Exact transcription | Arithmetic | UML | Java |
|---|---|---|---|---|
| Claude Sonnet 4.5 | HTTP 200, `end_turn`; partial fidelity findings below | HTTP 404, use-case prerequisite | HTTP 404, same prerequisite | HTTP 404, same prerequisite |
| Gemini 2.5 Pro | Not sent: no configured authentication | Same | Same | Same |
| GPT-5 | Not sent: no configured authentication | Same | Same | Same |

Claude used `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` through Bedrock Converse at source region `eu-north-1`. `get-inference-profile` returned ACTIVE with the requested Sonnet 4.5 foundation model in six EU destination regions; this establishes the profile, not account-level runtime access. No region/model substitute was used.

The successful request ID was `6230bc94-57eb-4e1d-be6a-0f1686040948`: 58.989 seconds, 59,141 input tokens, 2,124 output tokens. All three later requests returned `ResourceNotFoundException`, HTTP 404, with the same message:

> Model use case details have not been submitted for this account. Fill out the Anthropic use case details form before using the model. If you have already filled out the form, try again in 15 minutes.

Error request IDs:

- Arithmetic: `0b0ae2b3-7c18-4718-8a0e-e4f0119f9047`.
- UML: `804922b1-2d0b-470b-bc68-0747de1e9851`.
- Java: `84688c3e-7ab1-41af-b91d-e45dc8ae3daf`.

AWS documents a one-time Anthropic use-case form for this API and notes that initial calls may temporarily succeed during background activation. That is consistent with the observed sequence; it does not prove the internal reason the first specific request succeeded. The concrete blocker is the prerequisite named in the runtime errors. See [AWS model-access guidance](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

Gemini/OpenAI availability was checked without printing secrets: Process/User/Machine environment presence, repository `.env` filenames, standard Google ADC paths and `gcloud`/`gemini`/`claude` command availability. No configured keys, ADC files or provider CLI commands were found. This search does not establish that the user has no accounts or credentials stored elsewhere. No unrelated credential stores or browser session tokens were used.

## Actual Claude fidelity findings

| Source fact | Observation |
|---|---|
| Page 8 quartic | Correctly preserves `16x^4 - 96x^3 + 216x^2 - 216x + 81` |
| Requested numerical expression | Correctly preserves `(-2.998)^4` |
| Page 11 first exercise | Correctly preserves `(2 - (1/4)x^2)^6`, full fourth term `-(20/8)x^6` and separate scalar coefficient `-20/8` |
| Page 11 displayed second solution | Preserves the source's `k=5` working and `-870912 x^3 y^5` rather than silently substituting another value |
| Stray copied expression | Explicitly identifies that `-20/8 x^6` in the second exercise belongs to the first exercise |
| Fifth/sixth ordinal inconsistency | **Missed:** the source calls its `k=5` expression the fifth term, although it is the sixth; the prompt explicitly asked for term-index inconsistencies |
| Negative-power expansion | Correctly preserves exponent `-4` and `1 - 12x + 90x^2 - 540x^3` |
| Fractional-power expansion | Correctly preserves exponent `1/2` and `1 - x - (1/2)x^2 - (1/2)x^3` |
| Page provenance | **Wrong:** presents the final numerical `80.7842` result under page 8; it appears on physical page 9. The value is rounded, not the exact value |
| SDN source fidelity | Correctly reproduces all four techniques with their actual examples, the mid-lesson question and introductory reflective question |
| Absent SDN content | Correctly says there is no actual code, formal mathematics, table or technical relationship diagram; decorative illustrations are not treated as technical diagrams |

There is also a minor dropped opening parenthesis in one transcribed general formula. No dangerous changed sign/power/coefficient was observed in the requested final mathematical expressions. That is a statement about this single response, not a measured hallucination rate or a clean pass. The calculation test would be required to distinguish reading the displayed answers from independently calculating them.

Independent reference facts remain: the actual fifth term is `1451520 x^4 y^4`; the sixth is `-870912 x^3 y^5`; the fourth scalar coefficient is `-5/2`; the negative/fractional cubic coefficients are `-540` and `-1/2`. These reference answers were not fed to the model.

## Requested comparison by capability

| Capability | Claude Sonnet 4.5 | Gemini 2.5 Pro | GPT-5 |
|---|---|---|---|
| Mathematics | Promising exact PDF transcription; independent arithmetic untested | Unassessed | Unassessed |
| Diagrams/multiplicities | No output; account prerequisite blocked request | Unassessed | Unassessed |
| Code/recursion | No output; account prerequisite blocked request | Unassessed | Unassessed |
| Source fidelity | Good selected equations and SDN coverage; missed ordinal inconsistency and wrong page attribution | Unassessed | Unassessed |
| Hallucination/invention | No changed final equations or invented SDN concepts observed; provenance error remains; insufficient sample for a rate | Unassessed | Unassessed |

## Settings and fairness limitations

- Intended output allowance: 10,000 tokens per request; accounting semantics differ by API.
- Claude: temperature 0, default/no extended thinking, SDK retries disabled, 180-second deadline. PDF citations enabled so Converse uses visual PDF processing rather than text-only extraction, as required by [Anthropic's PDF documentation](https://platform.claude.com/docs/en/build-with-claude/pdf-support). Citations were not validated or forced into an ADAPT evidence contract.
- Prepared Gemini transport: exact `gemini-2.5-pro`, temperature 0, 4,096-token thinking budget, native inline PDF/image inputs. No Gemini request was sent.
- Prepared GPT transport: exact `gpt-5`, medium reasoning, `store: false`, no temperature, native inline PDF/image inputs. Original GPT-5 does not support the temperature setting; see [official GPT-5 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5). No OpenAI request was sent.

These provider-specific reasoning settings are not identical computational budgets. Their support and request acceptance remain unverified for the unavailable APIs. No tools, browsing, executable model output, ADAPT constraints or additional AI judge were used. Formatting was not used as a proxy for correctness.

## Evidence, verification and resumption

- [Raw response/error index and reproduction commands](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/README.md>).
- [Manifest with all 12 planned test/model results and request metadata](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/manifest.json>).
- [Availability evidence](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/availability.json>).
- [Artifact verification](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/verification.json>).

Checks: harness syntax passed; integrity verification passed with **1 successful response, 3 actual API errors and 8 unavailable slots**. It verifies prompt/source parity, unchanged original hashes and exact preserved response text/errors, not model quality. Production application tests/build were not rerun because no application code or dependency changed. Added only this report and standalone diagnostic artifacts outside the repository.

To resume:

1. In Amazon Bedrock's model catalog, select Claude Sonnet 4.5 and submit the Anthropic first-time use-case details for the same AWS account. Use the actual ADAPT educational-accessibility use case and your project/GitHub URL. This is an account setting, not a new credential. The reported prerequisite must be resolved before retrying the three blocked tests. The form was not submitted automatically.
2. Configure existing Gemini API access locally through `GEMINI_API_KEY` or `GOOGLE_API_KEY`, then rerun the four fixed tests with `--model=gemini-2.5-pro`. If using Vertex/ADC instead, an explicitly configured transport is still needed; it was not available or added here.
3. Configure existing OpenAI API access locally through `OPENAI_API_KEY`, then rerun with `--model=gpt-5`. Whether this account has access to the requested model remains untested.

Never paste credentials into chat or commit them. Numbered attempts preserve this run's successful response and failures; no corpus preparation or production rewrite is needed to resume. The final model decision should follow complete arithmetic, UML, code and source-fidelity evidence rather than the promising first PDF response.
