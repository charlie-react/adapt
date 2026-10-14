# ADAPT — Current-MVP build and acceptance spec

 ** Moonshot by TechCabal 2026, Lagos, 28–29 October; a live demo of a few minutes. This spec describes the implemented MVP and remaining acceptance work, not a new build scope.

## Problem and users

Educational content can be inaccessible because of its presentation: spoken audio, difficult visual relationships or dense explanations. ADAPT changes access and interaction while retaining the source's meaning and learning demands. It is a learning accommodation, not a generic chatbot, PDF summarizer or independent reconstruction of subject knowledge.

**Target learner:** a student, Ayodeji, who struggles to access conventional learning materials because of a reading, visual, hearing or motor-accessibility barrier. Implemented support choices address step-by-step organisation, simpler explanations, visual descriptions, listening preferences and readable spoken content, without asking for diagnoses or mandatory learning objectives. Browser voice input supplements editable fields; it is not a claim of complete voice-only navigation.

**Example:** a student has a five-minute audio recording of a lesson. Instead of replaying it repeatedly to locate important information, ADAPT transforms it into structured learning text while preserving the original meaning and key details.

**Wow moment:** watch a five-minute lecture become accessible learning content in about 10 seconds, then show the learner navigating the result. This is the current MVP's showcase direction, not a request for another feature or provider.

**Evidence boundary:** the target, example and wow moment were explicitly supplied by the owner. They are not a claim of a named participant interview or measured learning outcomes. The owner reported approximately 10-second completion in recent manual tests of one-minute and five-minute clips; a new instrumented five-minute rehearsal has not been run for these documents. The earlier colonialism transcript remains a source-fidelity regression example, not an assumption about which five-minute file will be demonstrated.

## Five verifiable acceptance criteria

1. **Material to lesson:** a student can upload a permitted PDF, PNG/JPEG or MP3/WAV, or provide text; select support for their access needs and receive a lesson without supplying an objective or diagnosis. Exercise the actual HTTP session flow and a live approved material. Invalid, oversized or unusable input produces an actionable message, never a fabricated lesson.
2. **Source preservation and audio access:** the hearing-accessibility path retains the validated transcript wording and source timestamps/references; included answers remain traceable to source and displayed content. Source-preserving output rejects alterations or omissions. General generated explanations additionally require human fidelity review: schema/reference checks alone do not establish semantic correctness.
3. **Accessible interaction:** operate the complete journey by keyboard; verify visible focus, headings, labels and quiet dynamic announcements. Read Aloud starts only on learner activation and supports pause/resume/stop; unsupported speech/voice input leaves usable text controls. Automated checks pass **and actual audible/screen-reader rehearsal is recorded** before accessibility acceptance.
4. **Optional practice:** only a complete, validated lesson can prepare 3–5 questions. Every answer resolves to evidence in the displayed lesson. Friendly explanatory feedback is accessible; there are no scores, grades, timers or competitive features. Audio questions require no hearing of the source recording.
5. **Live audio wow moment:** use an approved recording with a verified duration of approximately five minutes. Generate its complete, validated structured learning content live, preserve important source details, and navigate between sections with usable focus. Rehearse the roughly 10-second target on the actual file and demo environment; record actual timing rather than claiming the target passed from earlier manual reports. Do not use prepared responses as live generation. Practice, if shown, is timed separately and is not included in the 10-second claim.

 

## Architecture sketch — five boundaries

- **Input/preparation:** Next.js Node route handlers accept bounded uploads or text; `material.ts` validates actual bytes. The server-only `unpdf` adapter provides available PDF text/page references; audio decoding validates media duration/format. Original bytes, parsed text, transcript and interpretations remain distinct.
- **Speech to source text:** the replaceable `AudioTranscriber` boundary uses Gemini `gemini-3.5-transcribe` through the Interactions API for verbatim transcription with word timestamps. The retained AWS adapter is not the default and is not an automatic fallback. Claude receives the validated transcript for adaptation.
- **Adaptation and integrity:** the existing Bedrock provider uses Claude Sonnet 4.5. Server-owned source/excerpt and displayed-answer references, strict response validation and coverage checks constrain results. The restricted PDF reader expands verified source IDs before validation/rendering; the original full-lesson provider remains available.
- **Session and learner experience:** protected cookies identify isolated, process-local sessions expiring after 15 minutes. React renders complete or explicitly partial content through the existing accessible lesson/navigation and semantic reading layer. Browser-native speech and recognition are presentation/input tools; practice uses only committed lesson content. No database, persistent material store or queue is required.
- **Codex development workflow:** `AGENTS.md`, tests and `docs/` govern constrained implementation and evidence. Reusable reviews are [adapt-source-grounding-review](.agents/skills/adapt-source-grounding-review/SKILL.md), [adapt-accessibility-review](.agents/skills/adapt-accessibility-review/SKILL.md) and [adapt-demo-readiness-review](.agents/skills/adapt-demo-readiness-review/SKILL.md). These are development instructions, not runtime AI. The inspected application uses SDK/HTTP services, **not runtime MCP servers or scheduled tasks**; none are added by this spec.

## Data sources, limits and configuration

| Source/service | Implemented boundary and limits |
| --- | --- |
| Learner PDF | Up to 100 pages **and** 4 MiB. Worker extraction is bounded to 30 seconds/128 MiB heap; dense PDFs can exhaust model context sooner. Selectable text extraction is not proof of understanding visual structures. |
| Learner text | Up to 30,000 characters; text is untrusted source data, not application instructions. |
| PNG/JPEG | Up to 3 MiB; maximum dimension 4,096 pixels. Visual descriptions remain interpretations, not authoritative reconstruction of relationships. |
| MP3/uncompressed WAV | Up to 64 MiB **and** 30 minutes; minimum 0.5 seconds. Transcript cap: 60,000 characters/10,000 word annotations; provider response capped at 8 MiB. Invalid timestamps/wording fail rather than being repaired. Maximum-length acceptance is not a live-success guarantee. |
| Reviewed networking PDF | Fingerprint plus reviewed representation/manifest hashes must match. Only the tested `stepwise` preference with empty extra description/focus qualifies. `ADAPT_VERIFIED_PDF_INCREMENTAL=networking-rehearsal` opts in; unset means ordinary full processing. Human source and real-device acceptance remain outstanding. |
| Bedrock adaptation | Standard server-side AWS credential chain; `AWS_REGION` (or existing default-region configuration), optional `AWS_PROFILE`, optional `BEDROCK_ADAPTATION_MODEL_ID`. Default model/profile: `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`. No key or credential goes to the browser. |
| Gemini transcription | Server-side `GEMINI_API_KEY`; model `gemini-3.5-transcribe`; fixed Interactions API endpoint. No adaptation/reasoning task is delegated to Gemini. |
| Browser speech/recognition | Existing browser/device capability, not another purchased AI service. Voices, microphone permissions and support vary; usable text and keyboard alternatives remain required. |

**Rate limits:** local protection allows two concurrent uploads and two adaptations, up to eight retained sessions and a 256 MiB retained-source budget. These are application limits, not vendor throughput guarantees. Actual Bedrock requests/tokens quotas depend on account, model and region; obtain the effective values in [AWS Service Quotas](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html). Gemini quotas are project/model/tier dependent, not per API key; inspect the active project in AI Studio. Exact account quotas have **not been inspected** for this brief, so no numeric vendor allowance is assumed. [Google rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits).

**Nigeria and regional availability:** Google lists Nigeria as supported for Gemini API/AI Studio; this does not guarantee access to every model or a particular quota. [Supported countries](https://ai.google.dev/gemini-api/docs/available-regions). The project's Bedrock flow has been verified using `eu-north-1` (Stockholm); AWS lists that source region for the EU Sonnet 4.5 inference profile, which can route across listed EU destinations. This is not Nigerian data residency. IAM/model access, organization policies and venue connectivity still require verification. [AWS model/region documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-5.html).

Public provider documentation was checked on 13 October 2026. It is not a new live account/access test. Existing [material limits](docs/mvp-material-limits.md), code and model configuration remain the implementation reference. Use approved, non-sensitive material; do not expose credentials, learner identity or uploaded contents in diagnostic logs.

## Eight tasks with checks

 

1.   **Bound material acceptance.** Check byte validation and boundary tests for PDF/text/images/audio, including malformed and over-limit inputs; retain video's hidden/out-of-scope UI status.
2.   **Prepare faithful audio source.** Check Gemini transcript wording, annotation offsets/times and audio fingerprint against strict parser tests and the previously owner-confirmed colonialism transcript. Retain this earlier regression evidence; verify the actual five-minute showcase file in task 8. Do not claim every 30-minute lecture succeeds.
3.   **Adapt through the existing Claude boundary.** Check source references, coverage, validation, optional objectives and provider failure paths; preserve current models and audio optimisations.
4.   **Reuse accessible learner interaction.** Check keyboard/focus, semantic Read Aloud, editable voice-input alternatives and responsive UI through existing unit/E2E coverage. Human acceptance remains task 8.
5.   **Offer grounded optional practice.** Check 3–5 questions, displayed-answer references, friendly feedback and lesson-preserving retry; include PDF and audio regressions.
6.   **Integrate only the verified PDF candidate.** Check eligibility hashes, independently validated sections, whole-document completion, practice gating, session isolation and explicit full-path recovery. Keep general/default incremental enablement off.
7.   **Record implementation verification.** Latest recorded integration evidence: 157 unit/integration tests, 36 full E2E cases, 12 final-build focused cases, lint/typecheck/build and a live networking-PDF lesson/practice check passed. These are historical results from the integration task, not newly run for these Markdown files. Preserve failed/intermediate evidence too.
8.   **Accept and rehearse the confirmed showcase.** Use the selected audio file; verify its duration, important content and live timing, then navigate the generated result by keyboard. Perform actual audible Read Aloud and screen-reader checks; verify account quotas, credential renewal, host budgets and venue connectivity. Rehearse recovery and power/network interruptions.  

## Out of scope

New input formats or direct video processing; authentication, persistent learner histories/material storage, LMS integration or queues; formal grading and competitive assessment; mandatory objectives/objective inference; corrected-subset PDF workflows; general incremental eligibility; new model comparisons/providers; guaranteed mathematical/diagram interpretation; unverified multilingual or offline support; prepared responses presented as live generation.

## Risks and unresolved decisions

- **Source fidelity:** validated references/schema do not prove semantic equivalence of free-form explanations. Mathematics, diagrams and ambiguous content require review; never repair the source through invented claims.
- **Accessibility acceptance:** automated speech mocks/axe checks do not establish audible playback or actual screen-reader behaviour. These manual gates remain open.
- **Latency and connectivity:**  
- **Long audio and dense documents:** accepted sizes may still fail provider context, transcription timing or strict completeness checks. 
- **Service access/cost:** keys, IAM/SCP permissions, quotas and model availability can change.spec.
- **Temporary hosting/state:** restart or 15-minute expiry loses the session. Host body-size/time limits and memory must support actual requests; retained-source limits do not bound all decoding/base64 process memory. Local OneDrive/generated-build conflicts and power interruptions need recovery rehearsal.
- **Privacy:** materials pass to external services for their tasks. No application database/history is added, but application temporary storage does not establish a provider's retention policy. Avoid unnecessary personal information.
 

## Evidence links

- [Project instructions](AGENTS.md), [current product/setup](README.md), [source adaptation](docs/source-adaptation-slice.md), [practice](docs/check-understanding.md).
- [Gemini integration](docs/gemini-audio-integration.md), [material limits and live limitations](docs/mvp-material-limits.md), [semantic reading](docs/semantic-reading.md).
  

**Changes for this task:** PRODUCT_BRIEF.md and CAPSTONE_SPEC.md only. No application behaviour, configuration, provider calls, dependencies or other files are changed.
