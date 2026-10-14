---
name: adapt-accessibility-review
description: Review ADAPT learner UI accessibility for keyboard, focus, semantics, dynamic feedback, Read Aloud, voice input, and responsive interaction changes, or an explicit accessibility review. Does not certify complete WCAG compliance.
---

# Accessibility review

Default to read-only review of the requested learner flow. Do not change UI, speech behavior, configuration, fixtures or dependencies, suppress failing checks, enable a microphone, or upload material without authorization. Report actionable findings rather than silently fixing them. Do not run live provider scripts. Standard verification may create ignored test output; do not save new reports unless requested.

## Scope and references

Find the repository root and read [AGENTS.md](../../../AGENTS.md), relevant UI changes, `package.json` and `playwright.config.ts`. Consult [semantic reading](../../../docs/semantic-reading.md), [loading](../../../docs/loading-experience.md), and [learner UX decisions](../../../docs/learner-ux-cleanup-2026-10-08.md) as applicable. Verify current code where historical descriptions differ; do not restore technical/provider/provenance panels contrary to the approved learner UX.

Inspect the active flow in `src/components/adapt-workspace.tsx`, `adapted-learning.tsx`, `check-understanding.tsx`, `loading-experience.tsx`, `voice-field.tsx`, and `read-aloud.tsx`, plus the relevant styles and `src/app/layout.tsx`. Include `/demo` components if affected, without assuming its controls match the main experience.

## Review actual interactions

- Follow the learner from input through support choice, waiting/error recovery, lesson navigation and optional practice. Inspect native buttons/forms, headings/landmarks, labels, accessible names, disabled/selected states, focus visibility and order. Look for lost focus after controls disappear, keyboard traps, hidden controls in the Tab order, and unnecessarily precise mouse actions.
- Check loading, completion, failure and immediate-feedback announcements: stable live regions, appropriate focus transitions, and whether `aria-busy` delays useful status. Avoid claiming an announcement works from markup alone; identify which behavior is inspected, browser-tested or still needs a screen reader.
- Inspect `src/lib/accessibility/semantic-reading.ts` and `read-aloud.ts`: explicit complete speech units rather than arbitrary DOM fragments, no autoplay, hover and keyboard-focus access, same-region duplicate suppression, transitions, pause/resume, Stop/Escape/Off, cleanup and honest unsupported-browser behavior. Speech supplements usable text; it must not be the only access path.
- Inspect `voice-input.ts` and `VoiceField`: explicit microphone activation, usable editable text when recognition is unavailable/denied, labelled controls, cancellation on leaving, and interruption of Read Aloud before dictation. Never activate real microphone/audio playback as part of an unrequested automated check.
- Review narrow widths, zoom/reflow risks, text contrast, target sizing, reduced motion and forced-colors behavior. Distinguish measured contrast/layout evidence from estimates. Avoid inventing a new design system or requiring a custom ARIA widget where standard controls suffice.

## Verification

Inspect relevant coverage in `tests/semantic-reading.test.ts`, `read-aloud.test.ts`, `voice-input.test.ts`, and `tests/e2e/{adapt,read-aloud,loading,audio,lesson}.spec.ts`. With installed dependencies, a lightweight starting point is:

```powershell
node --conditions=react-server --import tsx --test tests/semantic-reading.test.ts tests/read-aloud.test.ts tests/voice-input.test.ts
```

Use existing Playwright/axe checks when browser verification is in scope and the required production build/browser is available. E2E uses port 3100 and controlled/disabled provider calls; inspect configuration before execution. Do not install browsers/dependencies, rebuild the app, change shared server configuration or run paid calls just to complete a read-only review; report unmet prerequisites and the exact next check instead.

Keep manual checks explicit: actual audible playback, supported browsers/device voices, screen-reader heading/control navigation and dynamic announcements, keyboard-only recovery, zoom, and microphone permissions. Silent speech mocks and zero axe violations do not establish complete accessibility or WCAG compliance.

## Report

Give scope, commands actually executed and their outcomes. Order findings by P1 (blocks a learner interaction), P2 (significant friction/ambiguous access), P3 (smaller improvement). Each finding needs file/line evidence, affected interaction, verified/inferred/manual status and a focused recommendation. Separate automated results from a manual acceptance checklist; no findings means none established within the reviewed scope, not a certification.
