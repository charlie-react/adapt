# Semantic reading architecture

ADAPT's reading mode is a presentation boundary, available independently of learner barriers or adaptation. One `ReadingProvider` in the root layout owns `SemanticReadingEngine` and the existing `ReadAloudController`. The header contains the only reading controls.

Content → explicit `ReadingRegion` (label, units, optional language) → registry → semantic unit queue → browser SpeechSynthesis.

## Registering future content

Wrap a meaningful visible content block with `Readable` and pass its speech units directly from validated content data. Children retain their existing semantic HTML. Do not use `innerText`, `textContent`, DOM traversal, or combine sibling text nodes. Supply punctuation and complete statements; the generic utility adds terminal punctuation to headings/options without it. A unit may include a complete paragraph. The queue never splits a sentence at an arbitrary character limit.

```tsx
<Readable label="Lesson explanation" language="en" units={[
  "How water evaporates.",
  explanation.text,
]}>
  <h2>How water evaporates</h2>
  <p>{explanation.text}</p>
</Readable>
```

For structured materials, derive natural descriptions in the material's presentation/domain boundary. The tree fixture's `spokenNode` uses the same canonical relationships as the visual view. Optional `spokenStatements` accompany generic accessible items; other subjects can provide them or use their existing complete facts. Never infer factual relationships in the reading engine. Include authoritative objectives exactly and label AI excerpts explicitly. PDF/article/lecture views should register visible paragraphs, captions, questions, or explanatory groups from their own validated content model. Hidden panels should not mount readable regions.

Keep regions modest and non-nested. A question and its answer choices form one region; feedback is a separate region. Avoid redundant objectives, links, decorative labels, implementation/provider details, and button boilerplate. No local reading button is needed.

## Interaction and lifetime

Reading starts off on each page load and requires an explicit toggle. Enabling alone does not speak. Regions enter the Tab order only while enabled; ordinary headings, inputs, links, and existing focus behavior remain intact. No ARIA tree widget or mouse-only interaction is introduced. Outlines identify regions without animation, including for reduced-motion users.

Focus reads immediately, including when focus enters a region's child control. Moving among descendants does not restart the same region. Hover requires 200 ms, preventing incidental pointer travel from starting speech. Pointer leave cancels pending hover; leaving a region lets its current statement continue until another region starts or the learner stops. Another region replaces the current queue (including paused speech). Speech does not automatically advance through the whole page.

Stop/Escape interrupts speech without disabling the mode. The same active region remains suppressed until it is left and re-entered; another region can begin reading. Off stops speech and cancels pending hover. Identical rerenders preserve region identity; changing its semantic content or unmounting the active region cancels playback. Page hide and provider cleanup also stop speech. Status messages are polite live announcements; a screen-reader user can leave reading off to avoid competing speech.

Unsupported synthesis disables activation with an explanation. Speech-service errors announce failure; a new region retries. No prepared or AI speech service is substituted. Device/browser voice support and unusually long utterance handling vary; meaningful units should normally be paragraphs or sentences rather than whole documents. Never truncate material merely to satisfy a speech length target.

## Validation

Unit tests cover punctuation/semantic boundaries, long sentence integrity, canonical relationship descriptions, duplicate suppression, transitions, pending hover cancellation, Stop/Off, and lifecycle removal. Browser tests use silent synthesis spies for mouse, keyboard, source/adapted content, AI provenance, questions/options, feedback, unsupported browsers and errors, alongside the existing workflow, Axe accessibility checks and narrow layouts. Manual audible/browser and screen-reader acceptance remains necessary.
