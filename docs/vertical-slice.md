# First accommodation slice

## Scope and decisions

The approved goal is an accessible accommodation workflow, not a binary-tree product. A synthetic lesson provides the explicit objective: identify the root, parent/child relationships, and leaves. ADAPT preserves that objective exactly. Objective inference, richer ingestion, voice input, grading, storage, and authentication are deferred.

The fixture uses six labelled nodes, including a node with a right child and no left child, to make relationship preservation observable. No binary-search ordering is implied. Practice is open-reference, retryable, disposable, and returns source-grounded feedback without grades or performance records.

## Boundaries

- `lib/engine/types.ts`: generic material, objective, barrier, strategy, experience, and practice contracts.
- `lib/engine/pipeline.ts`: ingestion → analysis → authoritative objective selection → confirmed barrier/strategy matching → accommodation → explanation validation → practice.
- `lib/fixtures/binary-tree.ts`: canonical data, structural validation, source descriptions, semantic conversion, visual coordinates, questions, and response semantics. Tree-specific operations never enter the generic engine.
- `lib/fixtures/binary-tree-source.tsx`: original fixture diagram and source descriptions, server rendered from that data.
- `lib/ai/provider.ts`: replaceable explanation contract and generic extractive grounding validation.
- `lib/ai/bedrock.ts`: server-only Nova Lite Converse adapter. SDK transport injection enables tests without a second production provider.
- `lib/runtime.ts`: server-only composition of the fixture registry and configured provider.
- `app/api/*`: bounded JSON requests and server-side orchestration/practice.
- `components/*`: standard accessible controls rendering the generic experience/practice data.

Adding another subject means supplying a material adapter and source presentation. It does not require changing pipeline orchestration. Adding arbitrary ingestion later will require appropriate validation and domain analysis; this fixture does not pretend to solve those problems already.

## Grounding trade-off

Unrestricted model prose with valid citations can still hallucinate. The chosen initial boundary therefore permits only complete verbatim source sentences/segments. Nova Lite selects and orders them based on the supplied objective, semantic representation, and confirmed barrier. This is a live AI-selected explanation, not free-form paraphrasing. Richer generated explanations would require stronger semantic evaluations before relaxing the contract.

Tree relationships are constructed deterministically. The source renderer, descriptions, explorer, and practice answer semantics derive from the same canonical data. Provider input uses defensive copies; providers cannot mutate the preserved objective or experience. Model output is rendered only as React text, never raw HTML.

## Failure and privacy behavior

No identity fields are accepted. The provider receives only synthetic source data, objective, language, semantic relationships, and confirmed barrier. There is no prompt/history logging or persistence. An invalid request is rejected before model invocation. Oversized JSON is bounded at 4 KiB. The model has a 15-second deadline, a token limit, and one SDK attempt. Missing region, unavailable credentials, model denial, malformed JSON, unsupported excerpts, and timeouts all leave the source-derived experience and practice available with an honest explanation-unavailable message.

No production deployment or paid endpoint hardening is included. Rate limiting and abuse controls should be decided before exposing a live model endpoint publicly.

## Evaluation and accessibility review

Read Aloud is a site-wide presentation feature using the browser Web Speech API. The root layout hosts one reading provider and persistent header controls. Explicit readable regions register meaningful units with a generic semantic reading engine; no DOM extraction occurs. Mouse hover and keyboard focus choose regions after the learner enables reading mode. Pause/resume, Stop/Escape, Off, lifecycle cancellation, and honest fallback remain available. Complete units reach synthesis without arbitrary length splitting. Canonical tree data supplies presentation-only natural spoken relationships; objectives, adaptation, practice, and Bedrock behavior remain unchanged. See [semantic reading architecture](semantic-reading.md).

Unit/integration tests check source structure, every relationship and leaf, the authoritative objective, supported barrier matching, grounding, provider mutation/failure, practice semantics, and invalid requests. An additional unrelated-subject adapter proves that engine contracts do not depend on trees.

Browser tests check keyboard-only selection, explorer navigation and focus, all four practice competencies, retry feedback, source navigation, errors, automated accessibility, and a 320-pixel viewport. Static source content remains readable without JavaScript; interactive exploration requires it. Source links target visible descriptions.

Manual assistive-technology acceptance remains necessary: with NVDA or another screen reader, verify heading/landmark navigation, diagram description, checkbox label, result focus, node relationships, source links, radio/checkbox groups, and live feedback. Check readable zoom and forced colors. Automated tests cannot establish the entire screen-reader experience or pedagogical validity.

Live Bedrock acceptance requires configured AWS access and `npm run test:live`. Mocked SDK responses do not establish live model availability or latency. No credential should be pasted into chat or committed.
