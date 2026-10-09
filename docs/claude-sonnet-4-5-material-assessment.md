# Claude Sonnet 4.5: completed material-understanding assessment

Date: 2026-10-06. All four preserved tests completed through AWS Bedrock. Production ADAPT code and dependencies were unchanged.

## Recommendation

**Don't use Claude Sonnet 4.5 as ADAPT's sole, general-purpose material-understanding authority on the evidence from these tests.** It preserved important PDF equations and handled the supplied Java example correctly, but independently calculated one binomial coefficient incorrectly and confidently misrepresented several UML relationships. Those mistakes change what an accommodation would teach, particularly when the learner cannot inspect the original diagram.

**Use with safeguards is a defensible narrower role:** explaining already verified prose, code or canonical relationships, with separately verified mathematics, source-owned provenance and an explicit unsupported/uncertain path. That is not approval for unrestricted diagram or mathematical understanding. No provider integration or product policy was changed.

This is a targeted falsification exercise, not a representative benchmark or measured general accuracy rate. There is one completed response per fixed test in the final run, plus the earlier successful PDF response. No other models were invoked or configured during this continuation.

## Method and access

The existing standalone harness sent the original Binomial and SDN PDFs, the original UML image, the original Java recursion image, and the same six-question clean-text mathematics control. Prompts and settings were unchanged from the preserved bake-off. No ADAPT extraction, provider parser, schema, quotation validator, grounding validator, accommodation logic or UI participated.

- Invocation: `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`, corresponding to Claude Sonnet 4.5, through Bedrock Converse from `eu-north-1`.
- Settings: temperature 0, maximum output 10,000 tokens, default/no extended thinking, no tools, SDK retries disabled, 180-second deadline.
- PDF citations were enabled for visual PDF processing. Full response envelopes retain citation blocks; their presence was not treated as proof of accurate provenance. See [Anthropic PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support).
- Original file hashes match the earlier probes. The PDFs were supplied natively, not replaced by ADAPT's extracted text.
- Mathematics was checked independently using Python's integer arithmetic, `math.comb` and `fractions.Fraction`. Model-produced code was not executed. Diagram findings were checked against the original image and PDF findings against rendered physical pages.

AWS initially rejected requests because the Anthropic use-case form was missing. The required form was submitted using ADAPT's public project identity and documented educational accessibility purpose. Immediate retries still failed during activation. AWS subsequently reported authorization, agreement, entitlement and regional availability as available, and all four subsequent calls returned HTTP 200 with `end_turn`. No credentials were created, printed or saved, and no IAM changes were made. This sequence and the original errors are preserved in [access evidence](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/claude-access-setup.json>). See [AWS model-access guidance](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

## Results

| Fixed test | Observed result | Final-run latency | Input / output tokens |
|---|---|---:|---:|
| 01: Binomial transcription + SDN source fidelity | Partial: core final equations and SDN examples preserved; term inconsistency missed, page attribution wrong, choose notation changed | 49.265 s | 59,141 / 2,107 |
| 02: Independent arithmetic | Five of six final answers correct; sixth-term multiplication wrong | 15.740 s | 397 / 1,565 |
| 03: UML relationships/multiplicities | Failed: labels, direction, composition and multiplicities altered; two relationships omitted | 16.690 s | 1,107 / 1,100 |
| 04: Java recursion/code | Passed this example: source transcription, base case, recursion, trace and output correct | 13.758 s | 845 / 718 |

### Mathematics and source fidelity

| Check | Independently verified/source fact | Claude result |
|---|---|---|
| Quartic expansion | `16x^4 - 96x^3 + 216x^2 - 216x + 81` | Correct in PDF and clean-text tests |
| Fourth term of `(2 - x^2/4)^6` | Term `-5x^6/2`; scalar coefficient `-5/2` | Correct and distinguished |
| Actual fifth term of `(4x - 3y)^8` | `1451520x^4y^4` | Correct in calculation test |
| Sixth term of `(4x - 3y)^8` | `56 * 64 * (-243) = -870912`, giving `-870912x^3y^5` | **Wrong: `-871424x^3y^5`**, despite correct factors |
| `(1 + 3x)^(-4)` through cubic | `1 - 12x + 90x^2 - 540x^3` | Correct |
| `(1 - 2x)^(1/2)` through cubic | `1 - x - x^2/2 - x^3/2` | Correct |

The sixth-term failure occurred on clear text with no supplied answers. It is a model calculation failure, not OCR, PDF decoding or an ADAPT validation problem. Copying the correct displayed PDF answer in test 01 did not establish independent arithmetic reliability.

Physical Binomial page 11 itself calls a `k=5` expression the fifth term, although it is the sixth, and contains an unrelated copied `-20/8 x^6` equality. Claude identified the copied expression but again missed the fifth/sixth inconsistency despite an explicit prompt. It also transcribed stacked binomial choose notation as `(6/3)` and `(8/5)`, which reads as division rather than a combination. Correct subsequent factorial working does not make that exact transcription faithful.

The numerical `80.7842` result is rounded and appears on physical page 9; Claude placed it under page 8. Physical page 9 also has a source `416x^2` typo in an intermediate repeated polynomial. Source mistakes must remain distinct from model-generated mistakes; an accessible explanation must not silently promote either to verified mathematics.

The SDN check preserved all four named techniques and their actual examples: link-failure prediction, traffic-flow clustering/anomaly detection, reinforcement-learning QoS adjustment and deep-learning APT detection. It retained the mid-lesson and introductory reflective questions and did not invent code, equations, tables or technical relationship diagrams absent from that lesson. This was a focused source-fidelity check, not a comprehensive technical exam.

### Diagram relationships

Claude recognized all eight class names, but naming boxes did not establish graph understanding. The following source-visible errors are enough to reject autonomous diagram conversion:

| Original UML image | Claude's response |
|---|---|
| Administrator -> Hostel, `manages`, `1..*` at Administrator and `0..*` at Hostel | Omits this relationship and moves `manages` onto Hostel--Room |
| Student -> Payment, `makes`, `1` at Student and `0..*` at Payment | Omits this relationship and assigns its label/cardinality to Application--Payment |
| Application--Payment, unlabeled, `1` at both ends | Says `makes`, with `0..*` at Payment |
| Room Allocation -> Payment, dashed `Use`, arrow toward Payment, `1` at both ends | Reverses the arrow toward Allocation and changes Allocation to `0..*` |
| Filled composition diamond at Hostel on Hostel--Room; `1..*` at Room, no printed Hostel multiplicity on this line | Calls Hostel--Room a plain `manages` association and transfers the diamond to Allocation--Room |
| Room--Allocation, plain line, `1` at both ends | Invents a composition diamond on Allocation |
| Student--Allocation, Student `1`, Allocation `0..1` | Says `1` at both ends |
| Visible arrows toward Application, Payment and Allocation on their respective labeled associations | Calls these plain lines without arrow direction |

The inheritance branch points toward Person, but its marker is not a clean conventional hollow triangle. This ambiguity is not needed to establish the failure above. Crossed lines and small labels make this a demanding source; difficulty should produce uncertainty, not reassigned symbols or claims of exactness.

The response concludes that all multiplicities were transcribed exactly. That claim is contradicted by the image. These are factual inventions/alterations within real class pairs, not merely response-format differences.

### Java/code

Claude accurately transcribed the supplied Java factorial class, `factorial` and `main`, the `n == 0 || n == 1` base case, `n * factorial(n - 1)`, `n = 5`, and the printed output. Its call sequence was `5 -> 4 -> 3 -> 2 -> 1`; return values were `1, 2, 6, 24, 120`.

It correctly noted that the source has no negative-input or integer-overflow checks and separated those inferred limitations from source content. Its wording that negative recursion continues indefinitely is imprecise; ordinary execution would fail with stack overflow before exhausting integer values. No material code-transcription or positive trace error was observed. This familiar single example does not establish general code reliability.

## What this means for ADAPT

Source citations and fluent explanations are insufficient safeguards: the response assigned a result to the wrong page and asserted exact diagram multiplicities while changing them. Asking the learner who needs a visual accommodation to verify the original diagram cannot be the primary safety mechanism.

Before any limited integration, independently verified mathematical expressions/calculations and diagram relationships would need to remain factual inputs; provenance should be owned by ADAPT's source records. Claude could explain those facts, with strict checks and an honest unsupported path. Unknown diagrams, equations and source inconsistencies would require qualified verification or blocking rather than an unverified accessible lesson. These are recommendations, not newly implemented controls.

Broader evidence is still needed for unseen code, dense diagrams, tables, other mathematics and languages. No quality score, general hallucination rate, cost estimate or three-model ranking is claimed. Observed errors already disqualify this configuration as the unrestricted sole understanding engine; more samples are needed to approve narrower uses.

## Raw evidence and checks

Final successful responses, without correction:

- [PDF/SDN response](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/01-exact-transcription.claude-sonnet-4.5.attempt-3.raw.txt>).
- [Arithmetic response](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/02-arithmetic.claude-sonnet-4.5.attempt-3.raw.txt>).
- [UML response](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/03-uml-relationships.claude-sonnet-4.5.attempt-3.raw.txt>).
- [Java response](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/04-java-recursion.claude-sonnet-4.5.attempt-3.raw.txt>).
- [Full manifest, including earlier errors](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/manifest.json>); matching `.request.json` and `.response.json` files preserve settings, hashes, request IDs and complete API blocks.
- [Artifact integrity verification](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/material-bakeoff/2026-10-06/verification.json>); [independent arithmetic reference](<C:/Users/besle/OneDrive/Documents/ChatGPT/ADAPT/nova-direct-probe/2026-10-06-comparison/arithmetic-reference.json>).

Commands/checks: the preserved four-test runner completed all four calls; `node --check .\run.mjs`, `node --check .\verify.mjs`, `node .\verify.mjs` and the independent `reference.py` computation passed. Verification confirms unchanged source bytes, matching intended prompts/inputs, HTTP 200, preserved raw text/envelopes and errors. It is not a factual acceptance validator. Earlier failed attempts remain intact. No Gemini/GPT setup was attempted in this continuation.

No production application code or dependencies changed; application lint/build/E2E were therefore not rerun or claimed as evidence of model correctness. Added this assessment and a completion link to the historical partial bake-off report; retained diagnostic artifacts outside the repository. AWS access setup is complete for the tested profile. No further credential action is needed to reproduce these Claude calls.
