# Audio 503 diagnosis — 13 October 2026

## Confirmed cause

One approved live diagnostic reproduced the failure through the current upload/session/adaptation handlers. The original entrepreneurship WAV's SHA-256 matched the previously successful release report. Its saved Gemini transcript was reused with validated source timestamps; **Gemini was not called again**. The current Claude provider was invoked once through the standard AWS credential chain.

| Stage | Observed result |
| --- | --- |
| WAV validation, decoded-audio reuse, saved transcript attachment and source-ready session | HTTP 200; one transcript unit |
| Source preparation and adaptation request construction | Reached the current Bedrock client |
| AWS credential acquisition/refresh | `CredentialsProviderError: Your session has expired. Please reauthenticate.` after approximately 733 ms |
| Claude generation, response parsing and lesson validation | Not reached; no model response or token usage returned |
| Adaptation HTTP response | 503, `AI_UNAVAILABLE`, no fabricated lesson |

Safe captured evidence is in [the live diagnostic](audio-regression-live-2026-10-13.json). It contains no document text, credentials, cookies or account identifiers. `calls: 1` records one SDK send attempt, not a completed authenticated model invocation. No billing amount was reported.

The exact error originates in installed `@aws-sdk/credential-provider-login/dist-cjs/index.js`: its `TOKEN_EXPIRED` refresh failure becomes this `CredentialsProviderError`. This is expired AWS login authentication, not a Bedrock model/IAM decision, Gemini failure, transcript validation failure or demonstrated audio-sectioning regression.

## Rollback and comparison

- Current source no longer contains `audioSectionPlan`, the optional topic prompt, sentence registry or topic resolver. No matching topic-plan markers were found in the inspected server JavaScript artifacts either.
- Earlier decoded-audio reuse, complete server-owned transcript paragraph/key-point references, strict validation and displayed-answer practice remain present.
- Latest Git commit is `a5665be` (`mvp`); the newer audio optimisation and PDF/practice work are uncommitted. Git history therefore does not provide an exact committed snapshot of the last successful optimised audio path. No reset/revert to that older commit was performed.
- The 13 October release/final reports recorded successful live audio adaptation. Their saved lesson text and key points pass current offline validation and provider-reference replay. Those review files deliberately omit evidence quotations; replay reconstructed known-source evidence rather than pretending to have the original raw response.
- Existing development logs contain no underlying adaptation exception, and no Codex app terminal is attached. Previously, the service replaced the exception with a generic 503 and discarded its cause. That diagnostic gap was reproduced by a failing regression test.

## Minimal change and required recovery

The service now retains the original exception as the **server-only** `RequestFailure.cause`. For this exact expired-session error, it logs a fixed credential-stage recovery message. It never logs arbitrary exception objects, secrets or source content. HTTP still returns only the existing learner-facing code/message. Providers, models, credentials, environment, transcript contract, validation, UI and PDF behaviour were not changed.

**The actual operational fix is renewing the existing AWS login with `aws login` in the terminal where the AWS CLI is installed.** Do not paste credentials into chat. Retry creating the lesson after renewal; restart the development server if it retains an old credential/client state. This investigation did not refresh credentials or restart a shared server. Its shell could not locate the AWS CLI, so no CLI authentication or identity commands were run here.

The regression covers upload success followed by expired-auth 503, server cause retention, private learner errors and safe logs, unchanged session/revision and transcript, then successful adaptation and three grounded practice questions when the mocked credential availability is restored. It confirms retry behaviour without retranscription; it does not establish renewed live AWS access.

## Verification boundary

The focused audio/transcription/reference/practice run passed 30 tests. Final full-suite, lint, typecheck and build results are recorded below after completion. Real post-login MP3/WAV adaptation still needs a learner retry/manual check or separately authorised live verification. No second model call is authorised by this diagnostic, and no claim of live recovery is made from mocked success. Read Aloud and voice/UI code were not changed.

Final checks actually run:

- `npm test`: **158 passed**, zero failures; includes audio acceptance/failure/provenance, transcript fidelity, Read Aloud/voice utilities, PDF regressions and practice.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; production compilation, TypeScript and static page generation completed.
- Scoped `git diff --check -- src/lib/learning/service.ts`: passed. Unrelated working-tree changes were preserved. No dependency/model/environment changes or commit were made.
- Browser E2E, actual audible playback and screen-reader rehearsal were **not rerun in this investigation**. The only live SDK attempt failed during credential refresh; no live adapted lesson was produced.
