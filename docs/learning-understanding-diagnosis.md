# Live material-understanding failure diagnosis

Resolution: [the provider response-contract fix](learning-provider-response-contract.md) is now implemented and live-verified. The remainder of this artifact records the diagnosis before that fix.

Date: October 5, 2026. Scope: diagnosis only, using fixed synthetic text, PNG and PDF sources. Application behavior, provider implementation, UI, validators, quality gates and source data were not changed.

## Finding

AWS authentication and model invocation now work for the observed requests. The first repeatable failure is **response parsing in src/lib/learning/provider.ts:23**: Nova returns a complete JSON object inside a Markdown JSON fence, and the provider calls JSON.parse on the entire fenced string.

There are also genuine schema/grounding violations behind that first failure. Removing fences alone will not resolve every observed request. Validation is correctly rejecting those violations; it must not be disabled or loosened.

## How the live trace was performed

scripts/learning-diagnostic.ts calls the actual createLearningHandlers upload handler, which performs the same bounded-body/input validation, source preprocessing and store analysis used by POST /api/learning. The injected transport is an observer around a **real BedrockRuntimeClient.send(ConverseCommand)**. No model response is mocked.

The trace uses an in-process Web Request through the route's actual handler, not a captured private browser upload. It observes the preprocessing input, native content-block types, response metadata, parsing failure and resulting learner snapshot. The UI mapping was then traced in the actual component. Credentials, prompts, document text, model paragraphs and capability cookies are never printed or saved. Raw model content stays in memory only for isolated parsing/validation checks.

The sources are the existing 152-character synthetic tree lesson, a real 1,429-byte PNG diagram and a real 1,129-byte one-page PDF. This PDF fixture uses an overlong single line; the local parser supplied 70 extracted characters. That fixture-specific text scope is not a general claim about all PDF extraction.

## Observed end-to-end stages

| Stage | Observed evidence |
| --- | --- |
| Input/preprocessing | Text became one text unit containing 152 characters. PNG became one image unit and retained its original bytes. PDF safely opened through the existing worker, produced p1/page provenance and retained original PDF bytes. |
| Nova request | Text content blocks: text,text. PNG: text,image,text. PDF: text,document,text. Model was amazon.nova-lite-v1:0. |
| Nova response | All three reproduced successful HTTP 200 responses, text output and stopReason end_turn. Credentials, model access and native PNG/PDF request formats were accepted in these requests. |
| Parsing | Each returned exactly one complete outer Markdown JSON fence. JSON.parse rejected its leading backticks with SyntaxError. Schema validation was not reached in the normal application path. |
| Service | analyze catches provider/parsing/validation errors together and returns analysis.status unavailable, clearing AI experience rather than fabricating content. HTTP response is 200 with the unavailable snapshot. |
| Learner | adapt-workspace.tsx maps unavailable to “We couldn’t finish understanding this yet.” Different internal errors therefore look identical. |

Representative safe AWS request IDs from the field-level trace:

- Text: 8b904885-c75e-4ae5-b78d-61e18ea809d0 (HTTP 200, end_turn, 338 output tokens).
- PNG: 8974bf6c-0e63-4347-9a51-6d623a7db7f6 (HTTP 200, end_turn, 397 output tokens).
- PDF: 33b7baf5-c940-4227-b487-4084763867f3 (HTTP 200, end_turn, 259 output tokens).

No AWS permission, region, model-access or inference-profile change is supported by these successful observations. One later text retry encountered a transient ENOTFOUND for bedrock-runtime.eu-north-1.amazonaws.com; subsequent image/PDF calls and the repeated text call succeeded. That separate network error is recorded, not presented as the common parsing/schema cause.

Video was not invoked in this diagnosis. Its use of the same parser is a code-established common dependency, not live video evidence.

## Exact defects found inside the JSON

The JSON inside the envelope parsed normally and contained the expected root keys with zero extra root keys. The unchanged validator then found:

| Source | Returned structure | Required structure / failure |
| --- | --- | --- |
| Text | Evidence keys sourceId,status,quote; mode absent. Quotes of 96 and 55 characters exactly matched the supplied text. | Evidence must contain sourceId,mode,quote. status belongs to coverage. Rejected as Invalid structured response. |
| Image | Section kind visual; evidence mode visual with a known image ID and empty quote. | visual is an evidence mode. Section kind must be prose,code,diagram,equation,table,image,video or example. Rejected as Unknown content kind. |
| PDF | Evidence again used status instead of mode. A 71-character quote did not occur in the 70-character supplied extracted source text. Whitespace normalization did not make it match. | Wrong evidence fields reject first. Once the contract clarified fields, the unchanged validator rejected the quote as Ungrounded quotation. A subsequent response had one exact 48-character quote and another non-matching 23-character quote. |

The provider prompt currently describes pseudo-object shapes in prose. The observed model conflates evidence.mode with coverage.status, and content kind with evidence mode. This is a provider output-contract mismatch, not evidence that the browser omitted the material.

The PDF response illustrates an additional distinction: text that Nova interprets from the native original document is not automatically an exact quotation of ADAPT's separately supplied extracted source unit. Adding punctuation/completing a clipped word or copying a different native representation must not be treated as a verified extracted-text quote.

## Useful output rejected by the contract

A repeated real text request (d4340922-ed76-4d08-b017-d31c5af2c1c7, HTTP 200/end_turn) returned an exactly source-matching 96-character quote and one otherwise valid section.

In a **diagnostic-only clone**, changing only the wrong evidence key to mode text made the unchanged validateUnderstanding function pass. The source, quote and paragraph values were unchanged, and the original application snapshot stayed unavailable. This is evidence of a schema mismatch rejecting useful source-referenced output, not permission to silently repair production evidence.

A separate --contract-probe added a literal JSON example and explicit field/enum distinctions only to the diagnostic request. After isolating the outer fence:

- Text passed all unchanged schema/grounding checks with an exact 152-character source quote (request 20ba1d2a-89b1-4a22-8a15-47c641df81dc).
- Image passed with kind diagram, mode visual, a known image source reference and retained limitation (059c511e-cf02-43fe-b8a6-616f1eb9c2d1).
- PDF continued to fail exact quoting (8f388d70-b6a2-41a9-a4b8-1f2cc26226f8). Even an additional native-page evidence instruction did not reliably stop it from producing a mismatched text quote (a37f8d57-5616-43c4-bf7c-1e15819b0b3a).

The probe still returned Markdown fences, so **the real application result remained unavailable throughout**. These are isolated format/contract experiments, not a passing live learner workflow or a proof of full semantic correctness.

## Smallest concrete fix proposal

Keep the learning architecture, service, UI, source authority and validators intact. Limit the fix to the learning-provider response/request boundary:

1. Parse either bare JSON or one complete outer JSON fence. Remove only that transport wrapper, then use JSON.parse and the same strict schema/grounding validation. Reject surrounding prose, multiple/truncated fences, malformed JSON, incomplete responses and oversized output. Do not search for arbitrary braces or parse partial output.
2. Replace prose-only pseudo-schema descriptions with explicit typed/literal output contracts for understand/adapt/reflect. Separate section.kind, evidence.mode and coverage.status; enumerate valid values, exact keys and ID rules. The live probe supports this correction for text/image.
3. Preserve strict quotation checking. The PDF probe shows that stronger prompt wording alone does not guarantee exact source quotations. If the boundary needs reliable quoted citations, have Nova select **server-owned excerpt references**, then resolve only known references to their exact source strings inside the provider adapter before the existing validator. Alternatively use native page interpretation references where appropriate and honestly label them as interpretations; the probe shows free-form instructions alone are not sufficiently reliable. Do not trim, normalize, complete, fabricate or replace a failed quotation to pass validation. Unmatched/unknown references must continue to fail honestly.

The third item is a narrow citation-output protocol change, not a new input adapter or learning subsystem. It requires an implementation review because the current raw model contract contains quote strings. No such protocol change has been implemented here.

Stripping fences without addressing the schema mismatch is insufficient. Dropping unknown fields, treating status as mode automatically, accepting kind visual, or permitting non-matching quotes would conceal defects and is not recommended.

## Reproduce safely

Run from the repository with standard locally configured AWS credentials:

    node --env-file-if-exists=.env.local --conditions=react-server --import tsx scripts/learning-diagnostic.ts

Use --text-only for one original-contract request. --contract-probe is explicitly an isolated experimental request clarification; --pdf-only limits it to the PDF fixture. These are real paid Bedrock invocations. The command exits nonzero when the actual learner result is not ready, even if an isolated inner JSON check passes.

The existing learning smoke script also reproduced the leading-backtick SyntaxError for text, image and PDF. Its mocked SDK unit cases used clean schema-compliant bare JSON, which explains why passing automated tests did not establish real formatting compatibility.

## Changes and checks

Only these new diagnostic artifacts were added:

- scripts/learning-diagnostic.ts — real-handler/real-Bedrock stage trace with structural-only output and isolated checks.
- tests/learning-diagnostic.test.ts — envelope boundaries, non-mutating counterfactual and continued grounding/extra-field rejection.
- docs/learning-understanding-diagnosis.md — this evidence trail and fix proposal.

npm test: 74/74 passed, including the existing 71 tests. npm run lint and npm run typecheck: passed for the diagnostic additions and existing application. No application code, dependency, provider selection or validator behavior was modified; production rebuild/E2E are not required for this diagnosis-only change.
