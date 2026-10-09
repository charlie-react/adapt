# Learner loading experience

`LoadingExperience` is the shared presentation component for meaningful waits. It is used for material preparation (all supported inputs), creation of the adapted experience, reflection responses, and the sample lesson and its practice feedback. No provider, ingestion, validation, assessment or response contract changes are involved.

The panel treatment layers over the existing form without removing its layout footprint. The underlying content becomes inert and visually hidden while waiting; a keyboard-accessible Cancel action remains available for material/adaptation requests. Existing cancellation and error handling are reused, and the workspace heading receives focus when waiting ends. The compact treatment reserves a small status area beside practice/lesson interactions, avoiding insertion of a new block when a request starts. Finished learning content receives a brief opacity/transform entrance; it does not animate dimensions.

Four friendly messages cycle every six seconds. They express reassurance, not backend stages, completion percentages or an estimated finish time. There is no “almost ready” claim for a request whose duration is unknown. The decorative reading-line motif uses CSS opacity and transforms, without an animation dependency or additional media requests. On long panels the loading content stays near the visible viewport instead of being centered far down the page.

The rotating visual copy and motif are `aria-hidden`. A separate, persistent polite `role="status"` announces “Preparing your learning experience. Please wait.” when active; its text does not change as messages rotate. The timer exists only while active and is cleaned up on completion/unmount. Motion and transitions are disabled under `prefers-reduced-motion`; messages remain readable. Forced-color treatment and normal focus indicators remain available. The global Read Aloud engine is untouched, and decorative loading messages are not registered as learning regions.

Reuse:

```tsx
// Place alongside .loading-underlay within a .loading-surface parent.
<LoadingExperience active={busy} onCancel={cancelRequest} />

// Keep mounted to reserve the compact status area.
<LoadingExperience active={busy} compact />
```

Styling lives in `src/app/loading-experience.css`, imported by the root layout so the same visual language works on the main learner flow and `/demo`. Existing successful and error states retain their behavior.

Browser coverage in `tests/e2e/loading.spec.ts` delays responses to exercise text/PDF/image/audio waiting, six-second message rotation, stable status text, unchanged panel dimensions, successful handoff, compact reflection waiting, keyboard cancellation/focus restoration, narrow layout and reduced motion. Automated accessibility checks run during waits and after reflection. Screenshots are saved as `test-results/loading-desktop.png` and `test-results/loading-narrow.png` for visual inspection. Browser provider responses are controlled fixtures; this presentation change does not require paid live provider calls.

## Verification — 2026-10-08

- All **115 unit/integration tests** passed.
- Repository lint and type checking passed.
- Production build passed. A generated OneDrive build-cache cleanup error occurred on the first attempt; the retry succeeded. No source/configuration workaround was needed.
- All **30 production E2E tests** passed in installed Edge, including the three new loading tests, existing audio workflows, keyboard/automated accessibility checks, Read Aloud and the sample lesson. The existing audio assertion now expects the shared loading announcement instead of the removed status copy.
- The shutdown occurred after the final build completed. On resume, its compiled CSS was checked for the latest viewport and narrow-screen rules, then the full browser suite was completed without rebuilding already finished work.
- Desktop and 320px mobile screenshots were visually inspected. Manual screen-reader testing and audible speech testing were not performed; semantic/automated coverage remains distinct from those checks.

Changed files: the new shared component and stylesheet; root stylesheet import; `adapt-workspace.tsx`, `adapted-learning.tsx`, `lesson-workspace.tsx` and `competency-practice.tsx` integrations; new loading E2E coverage; the audio status-copy assertion; and this document. No dependencies were added.
