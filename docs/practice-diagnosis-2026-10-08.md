# Practice-generation diagnosis — 8 October 2026

## Finding

There are **two distinct failures**, not an AWS authentication or general Claude availability problem:

1. The current development process retains a pre-practice session store. Its cached object has no `practice` method. Every local practice request fails **before a Claude request exists**.
2. In a fresh handler, Claude sometimes puts original extracted-source wording or regenerated wording into `answerQuote`, instead of an exact quotation from the adapted lesson. Strict validation correctly rejects that output. This was reproduced for ODE, LAN, and binomial PDFs; the colonialism transcript passed.

No production source, provider instructions, validator, UI, or server cache was changed. The original dev server was not restarted. SHA-256 comparisons of every file under `src/` report no changes during each trace. Only diagnostic scripts and local evidence/report artifacts were added.

## Evidence from the actual running server

Port 3000 is served by process 7104, created at 18:12:37. The practice route and updated store source were written later, at 19:08:57 and 19:17:06 respectively.

A temporary, non-pausing debugger probe read **only the cached store's method names/types**, not session contents, environment values, credentials, or learner records. It returned:

```json
{
  "hasCachedStore": true,
  "methods": ["create", "snapshot", "source", "analyze", "adapt", "reflect", "remove"],
  "practiceType": "undefined",
  "adaptType": "function"
}
```

The debugger was disconnected and its temporary listener closed. See [runtime-store.json](practice-diagnosis-2026-10-08/runtime-store.json).

`src/lib/learning/service.ts` retains the store with:

```ts
globalStore.__adaptLearningStore ??= createLearningStore();
```

Development reloads update code but keep this already-created object. `createLearningHandlers()` captures it, and the practice handler calls `store.practice(...)`. That call targets an undefined method. `http.ts` catches the resulting non-`RequestFailure` exception and maps it to `400 INVALID_REQUEST`. The client throws for the non-success response, and `CheckUnderstanding` displays its generic retry message.

A well-formed practice request with no capability cookie returned `400 INVALID_REQUEST` on this existing server. The identical request returned the expected `410 EXPIRED` in both a fresh handler and a separate fresh production-build process on port 3101. The temporary production process was stopped after this control. These requests make no model calls.

Consequently, there is **no raw Claude practice response to inspect for the original local 400 failure**: execution never reaches `LearningProvider.createPractice`.

## Live source-to-lesson-to-practice traces

The diagnostic runner submitted real material to the running server's normal upload and adaptation endpoints, with no mocks. It saved the successfully adapted lesson, sent the actual fingerprint/revision/cookie to practice, and reproduced the local 400.

It then re-ingested the same bytes into a fresh diagnostic store, checked source fingerprints, and replayed that **exact live lesson** through the unchanged adaptation validator. Only this adaptation replay used a recorded result; it did not manufacture a new lesson or call it a fresh adaptation. The subsequent practice call used the actual Claude provider/Converse request and normal HTTP handler/service/parser/evidence/domain validation.

For audio, the first upload performed real transcription. The fresh control reused that upload's actual transcript, timestamps, and provenance via the existing protected source endpoint, verified the transcript fingerprint, and passed through the transcript-only adaptation boundary. It did not re-transcribe or send audio bytes to Claude.

| Material / preference | Live adaptation | Existing-server practice | Fresh-handler practice | Questions / exact lesson quotes |
|---|---:|---:|---:|---:|
| Binomial PDF, stepwise, 18 pages | 200 | 400 | 503 | 5 / 3 |
| ODE seven-page study PDF, stepwise | 200 | 400 | 503 | 5 / 2 |
| LAN/WAN/MAN study PDF, stepwise, 11 actual pages | 200 | 400 | 503 | 5 / 4 |
| Colonialism MP3, stepwise control | 200 | 400 | 200 | 4 / 4 |
| Colonialism MP3, default read-spoken preference | 200 | 400 | 200 | 4 / 4 |

The LAN file used was `LAN_WAN_MAN_10_Page_Study_Material.pdf`; despite its filename it contains 11 pages. The ODE file was `ODE_Mathematics_7_Page_Study_Material.pdf`. These were the matching existing study files in Downloads. The test did not assume these are the exact same preference selections or in-memory lessons from the learner's browser.

Every captured Claude practice response returned **HTTP 200**, `stopReason: end_turn`, and 3–5 questions. All responses passed single-outer-fence JSON parsing and source-evidence resolution. No missing schema fields, invalid source IDs, count overflow, model-access error, token exhaustion, or invalid JSON was observed. The three rejected fresh responses fail specifically at:

```text
ProviderResponseError
stage: validation
message: Answer was not presented in the lesson
```

The unchanged validator requires:

```ts
[...section.paragraphs, ...section.steps].some(content => content.includes(answerQuote))
```

The service converts this rejection to `503 AI_UNAVAILABLE`; the client then shows the same generic message as for the unrelated local 400. The UI text alone therefore cannot identify the failing stage.

## Exact response differences

**Binomial:** `q1-binomial-form` starts its quote with `Binomial expression...`. The actual lesson starts `A binomial expression...`; the quoted substring is not exact because Claude capitalized the interior `b`. `q5-summary-concepts` similarly capitalizes the list's first word. Both fail case-sensitive matching. The other three answers match.

**ODE:** `q1-order-degree` capitalizes `The` where the worked-example step contains interior `the`. `q2-separable-pattern` copies a statement from extracted page p3 that is not a continuous statement in the adapted lesson. `q5-repeated-root` returns:

```text
If there is a repeated root r, then y=(Cn+Cnx)e^(rx).
```

That string occurs exactly in extracted page p6. The learner's actual key point is:

```text
If there is a repeated root r, then the general solution is y=(C₁+C₂x)e^(rx).
```

This is **not merely whitespace or punctuation**. The answer selects a different representation with different constant notation. The diagnosis establishes that discrepancy; it does not independently solve or certify the mathematics, or change extraction. Loosening matching would conceal precisely the representation mismatch practice must avoid.

**LAN:** `q2` returns:

```text
Switch: connects devices on an Ethernet LAN and forwards frames toward their destinations.
```

That is an exact extracted-source statement from p4. The adapted paragraph instead contains `switches that connect devices on an Ethernet LAN and forward frames toward their destinations`. The content is related, but the original-source wording was not what the learner saw. The other four answers match.

**Colonialism:** both tested preferences produced four questions with exact lesson quotations and valid transcript references. Their fresh-handler HTTP responses were 200. Their requests on the existing dev server still returned 400.

Thus the second failure is **Claude's output violating ADAPT's existing response contract**, encouraged by asking it to reproduce an exact adapted quote while also supplying the original source representation. The expected schema and strict validator are internally consistent; the validator is functioning correctly. Merely adding another “verbatim” instruction is not a reliable solution: the current prompt already says “EXACT continuous quote” and “verbatim”.

## Smallest safe fixes — proposed, not implemented

1. **Restart the existing dev server and bring the material again.** This rebuilds the temporary store with `practice`. It needs no credential/provider change. Existing in-memory sessions will be lost, as with any restart. An optional small follow-up is a versioned dev-store cache or interface guard so incompatible cached stores are deliberately recreated when their API changes; do not graft methods from a different store closure onto existing state.
2. **Select answers by server-owned lesson references instead of model-generated `answerQuote` text.** Give each existing adapted paragraph/key point a bounded reference, such as `source-4:paragraph-1`. Ask Claude for 3–5 questions answerable from selected lesson units, returning a reference in its provider wire response. Resolve it server-side to the existing exact paragraph/key-point text, then run the current `validatePractice` and evidence checks unchanged. Unknown, wrong-section, or malformed references must fail closed. Keep the domain/UI `answerQuote` unchanged. Source evidence remains mandatory; audio remains transcript-based. This is a narrow practice-provider response-handling change, not a new adaptation system.

This removes the observed copying/capitalization/extracted-source substitution failure without accepting fuzzy quotes, recomputing equations, paraphrasing answers, or weakening validation. It does **not** mechanically prove the semantic relevance of every generated question; questions still need to be constrained to the selected presented content and checked with representative regression cases.

Offline counterfactual diagnostics manually selected existing lesson paragraphs/key points for the rejected answers and passed all five questions through the **unchanged** validator. ODE's order/degree example and repeated-root statement were selected from their actual key-point blocks. Raw responses were retained unchanged. These counterfactuals are diagnostic evidence only, never supplied to the learner, and are not a claim that an unimplemented reference contract has passed a live test.

## Artifacts, reproducibility, and checks

Local raw responses, exact request payloads with PDF bytes omitted, response metadata, original prepared content, actual adapted lessons, both HTTP results, parsed/resolved responses, per-question differences, and source-integrity checks are under:

- [Binomial raw response](practice-diagnosis-2026-10-08/binomial/claude-response.txt) and [field diagnostics](practice-diagnosis-2026-10-08/binomial/field-diagnostics.json).
- [ODE raw response](practice-diagnosis-2026-10-08/ode/claude-response.txt) and [field diagnostics](practice-diagnosis-2026-10-08/ode/field-diagnostics.json).
- [LAN raw response](practice-diagnosis-2026-10-08/lan/claude-response.txt) and [field diagnostics](practice-diagnosis-2026-10-08/lan/field-diagnostics.json).
- [Colonialism raw response](practice-diagnosis-2026-10-08/colonialism/claude-response.txt).
- [Default hearing-accessibility raw response](practice-diagnosis-2026-10-08/colonialism-read-spoken/claude-response.txt).
- [Runtime cache probe](practice-diagnosis-2026-10-08/runtime-store.json).

These local evidence files intentionally contain the specified educational material and model output. They contain no AWS keys, Gemini keys, session cookies, or native audio/PDF bytes. Console output was limited to statuses, safe errors, and diagnostic differences.

Diagnostic-only additions: `scripts/practice-diagnostic.ts`, `scripts/practice-inspect-response.ts`, this report and its evidence directory. The runner uses existing AWS/environment configuration and the existing Sonnet 4.5 model, without installing dependencies or modifying production code.

Example commands (use a new slug to retain earlier evidence; the first contacts the running dev server and makes live service calls):

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/practice-diagnostic.ts 'C:\Users\besle\Downloads\ODE_Mathematics_7_Page_Study_Material.pdf' ode-new-run
node --conditions=react-server --import tsx scripts/practice-inspect-response.ts ode-new-run
node --conditions=react-server --import tsx --test tests/understanding-practice.test.ts
npm run typecheck
npx eslint scripts/practice-diagnostic.ts scripts/practice-inspect-response.ts
```

The five existing practice unit/integration tests, type checking, and diagnostic-script lint pass. Final integrity verification checked 79 production files with no changes; see [production-integrity.json](practice-diagnosis-2026-10-08/production-integrity.json). A production rebuild/full browser regression run was unnecessary for diagnosis: every production source hash is unchanged. Existing tests initialize fresh stores and controlled responses, so they did not exercise an old store retained across dev reloads or the observed real-source/lesson quotation substitutions.

When implementing the fix, add regressions for an incompatible cached store, original-source quotes absent from the lesson, capitalization and Unicode notation differences, known/unknown/cross-section answer references, unchanged 3–5 limits and evidence requirements, and transcript-only audio practice. Re-run live ODE/LAN/colonialism requests before claiming the fix succeeds.
