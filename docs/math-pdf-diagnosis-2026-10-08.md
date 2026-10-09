# Mathematical PDF failure diagnosis — 2026-10-08

## Finding

**Both reproduced mathematical-PDF requests fail in `validateSourceAdaptation`, because Claude returns more than six `steps` in a section.** Upload, extraction, Bedrock authentication, native PDF submission, completed provider output, fenced-JSON parsing, and evidence resolution all succeed. The provider wraps the validator's `Invalid list` error as `ProviderResponseError(stage="validation")`. The service maps that to `AI_UNAVAILABLE` / HTTP 503; the browser displays its generic failure message and never commits the invalid experience.

This is an observed response-contract violation, not evidence that the PDFs are too large or that mathematics cannot be extracted at all. A separate visual-only source-fidelity limitation is documented below. No production code or policy was changed.

## Live requests and controls

All requests used the current default learner preference (`stepwise`, empty description/focus), the existing AWS environment in `eu-north-1`, the existing Sonnet 4.5 provider, and the unchanged upload/adaptation handlers. There was no separate understanding call, new model, altered prompt, retry, or validation bypass.

| Source | Original bytes / pages | Upload | Bedrock / completion | Input / output tokens | Adaptation HTTP result | Exact blocking field(s), zero-based indexes |
|---|---:|---|---|---:|---|---|
| ODE seven-page study material | 34,712 / 7 | 200 | 200 / `end_turn` | 18,990 / 2,785 | 503 `AI_UNAVAILABLE` | `sections[3].steps`: 7; `[4]`: 8; `[5]`: 7; `[6]`: 8; maximum 6 |
| Expanding Binomial Expressions | 386,171 / 18 | 200 | 200 / `end_turn` | 38,229 / 6,272 | 503 `AI_UNAVAILABLE` | `sections[5].steps`: 7; maximum 6 |
| AI and Machine Learning in SDN, non-math control | 2,071,062 / 13 | 200 | 200 / `end_turn` | 29,998 / 3,327 | **200; 13 validated sections** | None |

Observed client request times were approximately 46.8, 92.2 and 66.9 seconds respectively. Every request used `maxTokens: 8000`, temperature 0. No output reached that ceiling; no context-overflow, access, quota, timeout, incomplete response, unmatched quotation, or JSON-parsing error occurred in these three runs. Those observations do not guarantee every future request succeeds.

Bedrock request IDs:

- ODE: `5dcbb92f-0399-4f38-a314-85f5fd75df90`.
- Binomial: `2b8b5ed6-bf72-4a74-838c-f633a59a782b`.
- SDN control: `380fa4b6-f1e0-40c2-a5e4-093764b65199`.

## Complete production-path trace

1. **Upload:** `createLearningHandlers().upload` receives a real multipart `File` plus the empty transcript field, verifies the request origin, bounds the body and calls `fileMaterial`. Both math files are real PDF bytes, safely below the 4 MiB learner cap.
2. **Extraction:** the existing isolated `inspectPdfSource` worker parses all pages. `pageBlocks` preserves deterministic IDs and physical page provenance. Actual text items, normalized blocks and warnings were saved locally, without printing document bodies to terminal logs.
3. **Source preparation:** `fileMaterial` retains original bytes and page references. It includes normalized text only on pages without reading-order, decoding, code-formatting or unsupported-structure warnings. Upload produces `analysis.status="source-ready"`; no AI objective gate is involved.
4. **Claude request:** the provider sends the original native PDF, server-owned text excerpts when available, a required page-section map, and the learner preferences. Exact requests are saved with PDF bytes replaced by their byte length and SHA-256; credentials are never included.
5. **Claude response:** live Bedrock returns completed responses. Both math responses have a single outer JSON fence, which the existing parser accepts. ODE has seven sections and matching server excerpt references; binomial has eighteen sections and valid visual page references. Raw output is preserved before ADAPT parsing.
6. **Validation:** `src/lib/learning/validation.ts`'s `section()` calls `list(v.steps, 0, 6, ...)`. The first rejected ODE array has seven items; the first rejected binomial array also has seven. The system prompt already explicitly requires 0–6 steps, but the model does not obey it. The diagnostic replays the captured bytes through the unchanged parser, evidence resolver and validator and gets the same error without another model call.
7. **Service and learner result:** `src/lib/learning/service.ts` catches the error and returns `AI_UNAVAILABLE`; `http.ts` emits HTTP 503. `AdaptWorkspace.request` throws `LearnerActionError(result.code)`. Since `learner-messages.ts` has no special `AI_UNAVAILABLE` entry, the visible text is **“We couldn’t finish that. Please try again.”** No experience is committed, so `AdaptedLearning` is not rendered. The same handler path returns a usable experience for SDN.

The diagnostic invokes the actual HTTP handler functions with Web `Request`/`FormData` objects and a fresh real store. Only the provider transport is wrapped to save the actual AWS response before returning it unchanged. This is a real Bedrock/production-handler trace, **not a claim of a separately driven live browser session**; final client behavior was traced in the current component code.

## Extracted mathematics and source fidelity

### ODE: reliable text reaches the provider

All seven pages retain text: 5,400 prepared characters. The only normalization warning is `INFERRED_STRUCTURE`, which does not cause text exclusion. Physical page 3 was rendered and inspected against the actual extracted blocks and Claude output. For example, the extraction retains:

> Solve dy/dx = 3x²y. Separate: dy/y = 3x² dx. Integrate: ln|y| = x³ + C. Therefore: y = Ce^(x³).

Claude's `source-3` step repeats those source expressions within an explanation. That section itself has five steps and is not the failure. The first failing section is physical page 4, where Claude produces seven steps for the integrating-factor method and source example. The prepared source includes the corresponding original expressions, including `μ(x) = e^(∫P(x)dx)` and `y=2+Ce^(-2x)`.

The numeric-literal check is enabled for this document; the diagnostic found no generated numeric tokens absent from the prepared source. That token-membership check is **not equation-equivalence or mathematical correctness validation**. No independent solving was used in this diagnosis.

### Binomial: extraction succeeds, but prepared text is intentionally excluded

All eighteen pages produce normalized text blocks, but **every page has `UNSUPPORTED_STRUCTURE`**. Pages 8 and 13 also have `READING_ORDER_UNCERTAIN`. The current whole-page preparation rule consequently omits `unit.text` for all eighteen pages. This is a concrete conservative consequence of the existing rule, not an extraction-worker crash or an empty original document. Even the title page has unsupported tags, so this signal is not specific proof that every character on a page is unreadable.

The mathematical layout is fragmented in the extracted blocks: page 6 has 75 blocks for 420 text characters, page 8 has 145 for 568, and page 11 has 80 for 442. This is consistent with separately positioned mathematical glyphs; it is not a reliable equation transcription. Raw positioned text items and normalized blocks are preserved in the evidence folder.

Claude still receives the **complete original PDF** and uses visual references. Its response re-expresses mathematical calculations in prose. Physical page 11 was rendered and inspected: the source displays fractions, powers, binomial coefficients and the result `−870 912x³y⁵`; Claude verbalizes the calculation and result in its section. This is visual interpretation, not a server-verified exact transcription. The numeric-literal check is disabled when page text is unavailable, by the current validator's explicit condition. Visual evidence resolution validates the source/page reference, not the truth of a generated equation.

**Separate risk, not the immediate rejection:** the response reproduces equations/calculations despite the existing instruction to refer to the original for exact expressions. Simply admitting longer step arrays would not establish mathematical fidelity. This investigation does not certify every generated calculation or relationship, and does not recommend reconstructing math from these fragments.

## Did the recent PDF-limit change cause this?

The reproduced ODE and binomial documents have 7 and 18 pages, below the previous 20-page cap, and neither approaches the current byte limit. Their current output budgets are the unchanged small-source 8,000 tokens. Extracted content is also below the former parser character/item ceilings; extraction finished successfully. The 16,000-token branch for PDFs over 24 pages never ran.

The changed limits described in `docs/mvp-material-limits.md` increased total permitted pages/sections, response size, parser work and deadlines, and added audio-specific preservation instructions. They did **not** increase the per-section six-step limit. SDN also succeeds under the current configuration.

Therefore **a size-limit or token-exhaustion regression does not explain these two observed failures**. The evidence demonstrates an existing model/strict-output-contract mismatch exposed by math-heavy stepwise responses. There is no preserved earlier successful response for these exact files/preferences that establishes when the overrun first appeared. Prompt/context changes could affect model behavior, so this report does not claim a historical before/after causal proof or that temperature 0 guarantees identical outputs.

## Smallest safe fix to review next — not implemented

1. **Keep the strict six-step validator.** Make the provider-side stepwise instruction unambiguous: at most six connected key points per page; retain additional source explanation within the existing paragraph budget; never drop source content or re-create worked calculations to fit. Apply the same rule to the required section-map instruction so it cannot be overlooked. Re-run these exact files with the unchanged validator. A prompt-only adjustment needs live evidence; it is not a guaranteed fix.
2. If strict contract overruns persist, add **one bounded corrective retry through the same provider** for a precisely identified array-count error. The retry should regenerate compliant presentation grouping from the unchanged source, not repair equations or invent missing content. Revalidate the entire result, including evidence and source coverage; fail honestly if still invalid. Do not silently slice excess steps, raise limits merely to accept this output, or bypass validation. This is the smallest containment proposal beyond a prompt-only change, not a broad pipeline redesign.
3. Keep exact mathematics source-owned. Do not treat successful visual page references as verified generated mathematics. Preserve access to original expressions rather than asking Claude to reconstruct them. The visual-only whole-page rule and missing exact-math presentation warrant a focused follow-up, separate from the immediate array-count failure; do not remove uncertainty flags to make text look reliable.

Before a production fix is accepted, add regression cases for six versus seven steps, a safe invalid-count retry or fail-closed outcome, no truncation/omitted page content, and the actual ODE/binomial response shapes. Retain exact-quotation, numeric-fidelity and visual-evidence tests. Confirm both live math paths and the SDN control rather than relying solely on synthetic provider mocks.

## Evidence and reproduction

Local evidence: `docs/math-pdf-diagnosis-2026-10-08/{ode,binomial,sdn-control}/`.

Each contains `extracted-pages.json`, `prepared-source.json`, `request.json` (original PDF bytes replaced with a fingerprint/length), `raw-response.json`, `raw-response.txt`, `response-metadata.json`, `upload-result.json`, `adapt-result.json`, `result.json`, and `field-diagnostics.json`. ODE and binomial also contain inspected source-page PNGs. These are educational source/model-output artifacts, not credentials; do not reuse this capture approach indiscriminately with private learner documents. No document text is sent to terminal logging by the diagnostic scripts. Normal production logging is unchanged.

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/math-pdf-diagnostic.ts 'C:\Users\besle\Downloads\ODE_Mathematics_7_Page_Study_Material.pdf' ode
node --env-file=.env.local --conditions=react-server --import tsx scripts/math-pdf-diagnostic.ts 'C:\Users\besle\Downloads\CSC203LL_Y2_01_08_Expanding Binomial Expressions.pdf' binomial
node --env-file=.env.local --conditions=react-server --import tsx scripts/math-pdf-diagnostic.ts 'C:\Users\besle\Downloads\AI-and-Machine-Learning-in-SDN-SEN305.pdf' sdn-control
node --conditions=react-server --import tsx scripts/math-pdf-inspect-response.ts ode
node --conditions=react-server --import tsx scripts/math-pdf-inspect-response.ts binomial
node --conditions=react-server --import tsx scripts/math-pdf-inspect-response.ts sdn-control
```

The first three commands make paid live requests and overwrite the corresponding diagnostic evidence. The latter three replay saved responses locally with strict validation. Original PDFs are read in place and are not modified. API keys, credential files and full environment values are never printed or copied into artifacts.

## Checks and change scope

- Three real handler/provider traces completed, with outcomes above.
- Captured-response replay reproduced both validation failures and SDN success.
- Targeted ESLint passed for both diagnostic scripts.
- `npx tsc --noEmit --incremental false` passed.
- Existing source-adaptation/provider regression tests: **18 passed, 0 failed**.
- No production build or E2E rerun was needed for this diagnostic-only task; no new production behavior is claimed.
- Changes are limited to this report, the two focused diagnostic scripts and local evidence. Production `src/` file hashes were recorded before and checked after the investigation; see the evidence-folder integrity record.
