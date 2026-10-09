# Mathematical PDF six-key-point fix

## Change

The source-adaptation provider instructions now treat six key points per section as a hard output maximum. Claude must count each array before returning JSON, combine related source points in their original order rather than drop important information, and retain additional explanation in the existing paragraph budget. Combining page-section slots is prohibited. Mathematical notation, signs, powers, values, examples and meaning must be preserved wherever included; reconstruction, solving, independent verification, correction and reformatting are expressly prohibited. Uncertain exact expressions must remain in the original source rather than be guessed.

The same instructions preserve audio's stricter rule: complete transcript wording stays in paragraphs and every key point remains a continuous source excerpt. No new retry, output truncation, provider, extraction rule, token budget, UI change or validation relaxation was introduced.

## Live verification

The unchanged diagnostic runner exercised actual multipart upload, PDF preparation, native-PDF Bedrock submission, response parsing, evidence resolution, strict provider/service validation and the final HTTP response. All runs used the existing Claude Sonnet 4.5 model, AWS region/profile environment and default `stepwise` preference, with empty description/focus. These are real Bedrock/handler results, not mocked model results or a claim of manual live-browser testing.

| PDF | Before | After | Source pages / returned sections | Maximum key points in any section | Output tokens |
|---|---|---|---|---:|---:|
| ODE seven-page study material | Rejected: 7–8 key points | HTTP 200, validated | 7 / 7 | 6 | 2,747 |
| Expanding Binomial Expressions | Rejected: 7 key points | HTTP 200, validated | 18 / 18 | 6 | 6,147 |
| AI and Machine Learning in SDN | Passed | HTTP 200, validated | 13 / 13 | 4 | 3,705 |

Every provider response completed with `end_turn`. No learner failure message was triggered, so no UI change was necessary. ODE's integrating-factor source example is now grouped into five key points, keeping its supplied equation and result. Binomial's coefficient page stays within six key points while its paragraph retains the complete sequence of source coefficient values. Source hashes match the pre-fix test inputs; original PDF bytes, page provenance, evidence resolution and numeric checks are unchanged.

Raw response, sanitized request metadata, final handler result, extracted source and replay diagnostics are preserved under:

- `docs/math-pdf-diagnosis-2026-10-08/ode-six-point-fix/`
- `docs/math-pdf-diagnosis-2026-10-08/binomial-six-point-fix/`
- `docs/math-pdf-diagnosis-2026-10-08/sdn-six-point-fix/`

The original failed-run evidence remains intact in the sibling diagnosis folders. Credentials are absent from the artifacts; native PDF bytes in request records are replaced by byte length and SHA-256. The existing runner and captured-response inspector were reused without modification.

## Strictness and limits of evidence

The added regression test verifies six grouped key points preserve all eight supplied source statements in order and an exact Unicode mathematical expression. It also sends seven- and eight-point provider responses through the real validator and confirms both still fail at the validation stage. Existing exact-quotation, missing-source, numerical-fidelity, provider-failure and audio-wording tests continue to pass.

The binomial PDF still uses visual references because its existing extraction warnings exclude page text from the prepared material. Passing its existing validator proves response structure and page-reference validity, **not independent verification of every visually interpreted equation**. This narrow fix does not change that documented limitation or claim to solve mathematical extraction/understanding. A prompt is not a guaranteed structural constraint on every future model response; any future violation still fails closed.

## Files and checks

- `src/lib/learning/provider.ts`: hard six-point grouping and source-preservation instructions in the existing source-adaptation response contract. SHA-256 comparison against the diagnosis snapshot confirms this is the only changed production source file.
- `tests/source-adaptation.test.ts`: grouped-point preservation and strict six/seven/eight boundary regression.
- This report and the three new local live-evidence directories.

Verification: **115 unit/integration tests passed**, repository lint passed, `npm run typecheck` passed, and production build passed. **All 27 production E2E tests passed** using installed Edge (`PLAYWRIGHT_CHANNEL=msedge`), including automated accessibility checks, keyboard/narrow-screen journeys, Read Aloud, the demo, PDF provenance/blocking and audio regressions. Browser tests use controlled provider responses; the three live handler/provider runs above separately establish real Claude success.
