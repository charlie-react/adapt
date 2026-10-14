# ADAPT

ADAPT turns PDFs, text, images and audio into accessible learning experiences.<br>
It helps students facing reading, visual, hearing or motor-accessibility barriers.<br>
It changes how learning happens, not what the student is expected to learn.

## Screenshots
<img width="1920" height="2516" alt="image" src="https://github.com/user-attachments/assets/c78bffe3-3dbd-49c3-8ff2-1b74d052d404" />
<img width="1920" height="2306" alt="image" src="https://github.com/user-attachments/assets/ee911622-32ee-45f1-9aaf-2b281d6ba6e7" />
<img width="1920" height="3581" alt="image" src="https://github.com/user-attachments/assets/255980f5-d38a-4a0f-b21f-db96f13724c6" />




## Features that work today

- **Material input:** PDF, pasted text, PNG/JPEG and MP3/uncompressed WAV. No learner account, diagnosis or mandatory objective.
- **Support choices:** simpler explanations, step-by-step organisation, visual descriptions where supported, listening-friendly content and readable spoken lessons.
- **Audio access:** transcription becomes navigable text and key points; the source-preserving pathway checks transcript wording and references.
- **Read Aloud:** activate the header control, then hover or keyboard-focus meaningful content. Pause/resume/stop; no autoplay.
- **Voice input:** dictate into editable fields in supported browsers; text entry remains available.
- **Optional practice:** 3–5 questions grounded in the displayed lesson, explanatory feedback, no grades or scores.
- **Sample lesson:** `/demo` offers the separate deterministic binary-tree experience when live services are unavailable.

## Quick start

Requires **Node.js 22+**, npm and existing Bedrock/Gemini access. Provisioning provider accounts is separate from this five-minute walkthrough. Open a terminal at the downloaded repository root.

### Install

```bash
npm ci
```

This installs the locked dependencies from `package-lock.json`.

### Configure

Set these names in the server environment or private `.env.local`, using your own values:

| Variable name | Purpose |
| --- | --- |
| `AWS_REGION` | Bedrock region supporting the configured model/profile; `AWS_DEFAULT_REGION` is also accepted. |
| `GEMINI_API_KEY` | Audio transcription. |
| `AWS_PROFILE` | Optional existing AWS profile; otherwise use the standard SDK credential chain. |
| `BEDROCK_ADAPTATION_MODEL_ID` | Optional override; the default provider uses Claude Sonnet 4.5. |

AWS credentials require model access/invocation permission. Never commit keys or use `NEXT_PUBLIC_*` for secrets. Restart after configuration changes.

### Run and demo

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000).

1. Upload an approved, non-sensitive, approximately five-minute MP3/WAV lesson. An educational audio demo file is **not bundled**.
2. Choose **Make spoken content readable**, then **Create my learning experience**.
3. Navigate the structured sections and key points instead of repeatedly replaying the recording.
4. Optionally activate Read Aloud or reach the last section and **Check my understanding**.

For a credential-free first look, open [the binary-tree sample](http://localhost:3000/demo). It does not demonstrate live audio processing.

### Test

```bash
npm test
```

Additional verification:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

E2E needs a production build and an installed Playwright-compatible browser; `PLAYWRIGHT_CHANNEL` selects an installed channel. The suite uses port 3100 and disables live model calls. Automated tests do not establish live-provider or actual screen-reader acceptance.

## How it works

- **Prepare:** Next.js/TypeScript Node handlers validate material; `unpdf` supplies available PDF text/page references. Original content and extracted text remain distinct.
- **Transcribe:** the server-only Gemini 3.5 Transcribe adapter produces verbatim text and word timestamps, then validates them.
- **Adapt:** Claude Sonnet 4.5 through Bedrock receives source content and support preferences through a replaceable boundary; audio adaptation uses its validated transcript.
- **Protect:** source references and strict response/completeness checks constrain output. Cookie-protected, in-memory sessions expire after 15 minutes or restart; no application database/history is added.
- **Learn:** React presents semantic sections, browser-native speech/voice input and practice using server-owned references to displayed answers.
- **Codex workflow:** [AGENTS.md](AGENTS.md) and reusable [source-grounding](.agents/skills/adapt-source-grounding-review/SKILL.md), [accessibility](.agents/skills/adapt-accessibility-review/SKILL.md) and [demo-readiness](.agents/skills/adapt-demo-readiness-review/SKILL.md) reviews guide development. No runtime MCP server or scheduled task is required.

## Built with Codex

**Codex generated and iterated on** application modules, provider integrations, source checks, accessible interactions, practice, regression tests, diagnostic tooling and documentation. The [product brief](PRODUCT_BRIEF.md), [build spec](CAPSTONE_SPEC.md) and `docs/` preserve decisions/evidence; Git history records scaffold, engineering-principle and MVP checkpoints.

**The creator decided/reviewed** the target student, source-preservation principle, accessibility priorities, Claude/Gemini roles, MVP exclusions and audio demo.  

**One bug review caught:** regenerated PDF-practice answer quotations differed from the displayed lesson and correctly failed validation. Codex traced ODE/LAN records and implemented server-owned displayed-answer references without relaxing validation. [Diagnosis/fix](docs/pdf-practice-reference-fix-2026-10-12.md) · [regression tests](tests/understanding-practice.test.ts).

Codex supports development; **Gemini transcribes and Claude adapts at runtime**.

## Limitations and next steps

- **Budgets:** PDF 100 pages/4 MiB; audio 30 minutes/64 MiB; text 30,000 characters; images 3 MiB/4,096 pixels per dimension. These are acceptance ceilings, not success guarantees. [Detailed limits](docs/mvp-material-limits.md).
- **Accuracy:** references/schema checks do not prove semantic correctness. Mathematics, diagrams, tables and ambiguous content require review; failures never become fabricated lessons.
- **Accessibility:** browser/device speech support varies. Actual audible playback and screen-reader rehearsal remain manual gates; automated checks are not certification.
- **Privacy:** use non-sensitive material. External providers process content; temporary local sessions do not establish provider retention. Explicit developer diagnostics may save local artifacts.
- **PDF candidate:** default-off incremental reading is restricted to the exact reviewed networking source and tested preferences. [Human acceptance](docs/pdf-incremental-2026-10-13/production-integration.md) remains outstanding; general incremental PDFs are not enabled.
- **Out of scope:** direct video processing, learner accounts/history, LMS integration, formal grading and unverified multilingual/offline support.
