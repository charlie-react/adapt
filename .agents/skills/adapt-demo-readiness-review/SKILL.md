---
name: adapt-demo-readiness-review
description: Review ADAPT's implemented learner journey, supported inputs, setup, recovery, tests, and README claims before a demo/submission or after major flow changes. Read-only readiness assessment, not deployment or a trivial-copy review.
---

# Demo readiness review

Assess the intended demo, not every possible future feature. Default to read-only: do not deploy, restart a shared server, change app/model/environment configuration, install dependencies, mutate external resources, or silently repair failures. Never print secrets, environment-variable values, cookies or private material. Do not invoke live adaptation/transcription unless explicitly authorized.

## Establish the demo scope

From the repository root inspect [AGENTS.md](../../../AGENTS.md), [README](../../../README.md), `package.json`, `playwright.config.ts`, Git status/diff and the intended input/support choices. Preserve the working tree. Use [source adaptation](../../../docs/source-adaptation-slice.md), [material limits](../../../docs/mvp-material-limits.md), [audio integration](../../../docs/gemini-audio-integration.md), [practice](../../../docs/check-understanding.md), and [UX decisions](../../../docs/learner-ux-cleanup-2026-10-08.md) only as relevant. Historical reports are evidence of past runs, not current readiness.

If the intended material/browser is unspecified, state a bounded rehearsal scope using existing non-sensitive fixtures and list any real-material validation still needed. Do not expand scope to new formats or infer a learning objective.

## Inspect the implemented journey

- Trace material submission, support preferences, loading/cancellation, adapted sections, optional practice, and retry/start-over paths. Inspect the actual route/service/provider boundaries and UI, not only README descriptions. Keep `/demo` as the separate deterministic regression surface; it is not proof that arbitrary uploaded material adapts successfully.
- Cross-check accepted types, byte/page/duration limits and simultaneous work/deadlines in `material.ts`, `limits.ts`, audio/PDF adapters and the file chooser. Limits are conjunctive; an acceptance cap is not a successful-service guarantee. Video backend/transcript support does not make video an advertised learner upload type.
- Check Claude adaptation and Gemini transcription remain distinct from Codex's development role. Verify configured model defaults and variable names against code. Inspect only credential/configuration presence if needed; do not read `.env` contents, enumerate environment values, obtain new credentials or authenticate services for the reviewer.
- Check protected temporary sessions, expiry/restart/stale-state behavior, source ownership, rejection of invalid output, learner-friendly failures and absence of fabricated success. Evaluate known diagnostics against current code rather than assuming either that all old failures remain or that they were fixed.
- Check keyboard access, global Read Aloud, editable voice-input alternatives, responsive lesson navigation and low-pressure practice. Refer a detailed source-fidelity or accessibility issue to its corresponding skill; do not automatically launch all three or call a UI check a full accessibility audit.
- Compare README feature/privacy/setup claims with the implementation and linked files. Identify stale or uncommitted claims, absent demo inputs, dependence on a specific machine, unavailable provider access, or unsupported success assertions.

## Verification and rehearsal

Inspect relevant `tests/learning.test.ts`, `source-adaptation.test.ts`, `understanding-practice.test.ts`, `gemini-transcription.test.ts`, `engine.test.ts` and E2E suites. Select checks appropriate to the demo. With existing dependencies, this local check exercises source adaptation and the deterministic baseline without live service calls:

```powershell
node --conditions=react-server --import tsx --test tests/source-adaptation.test.ts tests/engine.test.ts
```

Confirm `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` exist; do not run the full stack automatically for a narrow review. Typegen/build/E2E can write generated output. If broader verification is requested, use the existing scripts and installed browser, retain failures and record the actual revision and results. Do not count a prior build or mocked success as a current live rehearsal. `npm run test:live` exercises the demo provider; `scripts/learning-smoke.ts` exercises the separate main adaptation provider and incurs model calls.

List real-device/live-service/manual prerequisites without performing unauthorized work. In particular, distinguish untested maximum-length audio from a demonstrated short recording, and visual-reference validation from independently checked mathematical/diagram accuracy.

## Report

Return **ready**, **conditional**, or **not ready** for the explicitly reviewed demo scope, with the evidence and conditions supporting that decision. Never give unqualified readiness when critical intended interactions remain untested. List P1 demo blockers, P2 rehearsal/recovery risks and P3 presentation gaps. Each finding needs affected file/line, verified/inferred/blocked status, learner/demo consequence and the smallest action. End with commands run/results, a short repeatable rehearsal sequence and remaining verification. Do not invent test counts, timings or screenshots.
