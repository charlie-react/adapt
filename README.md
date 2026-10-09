# ADAPT

ADAPT changes the way learning happens, not what the learner is expected to learn.

The home experience follows **source material → accessibility need → grounded adaptation → accessible learning**. Claude Sonnet 4.5 adapts presentation through simpler wording, connected steps, visual descriptions or listening-friendly statements. Original source content/provenance stays beside the AI explanation; no broad understanding or learning-objective gate is required. PDF, text, PNG/JPEG and MP3/WAV audio share one journey. Audio is transcribed into timestamped text; retained video files need a supplied transcript for adaptation. No learner identity, database, authentication or persistent history is involved. See [the current source-adaptation architecture and limits](docs/source-adaptation-slice.md).

The synthetic binary-tree lesson remains at `/demo` as a deterministic regression baseline.

`AGENTS.md` is the source of truth for engineering and product principles.

## Read Aloud

Use **Read Aloud: Off/On** in the persistent header to enable a page-wide reading mode. It works on the original lesson before any barrier is selected and continues through adaptation and practice. Hover briefly over an outlined region or use Tab to focus it. Moving to another region replaces speech. Moving within one region does not restart it. Pause/Resume and Stop are in the header; Escape also stops speech. Off cancels playback and disables automatic reading. Nothing plays before you enable the mode and enter a reading region.

Speech comes from explicitly registered complete statements, not DOM text fragments. Tree descriptions are natural statements derived from canonical relationships. AI excerpts retain their provenance cue, and practice includes questions, choices, and feedback without grading. Source links and decorative/provider labels are excluded.

The Web Speech API uses browser/device voices with no new provider or dependency. Unsupported browsers and speech errors have an accessible status; text and screen-reader access remain available. Automated tests use silent mocks. Audible playback and assistive-technology interaction still need manual acceptance. See [semantic reading architecture](docs/semantic-reading.md) to register future content.

## Local setup

Use Node.js 22 or later (`unpdf` requires Node 22; development verified with Node 24.20.0).

```sh
npm ci
npm run dev
```

Open http://localhost:3000, bring material and choose how to engage with it. Upload preparation makes no adaptation-model call; MP3/WAV audio is automatically transcribed with Gemini 3.5 Transcribe first. All editable fields support optional browser-native voice input where available. Read Aloud remains in the header. Adaptation needs a working AWS session; unavailable AI is reported honestly and retains the original material. The `/demo` canonical exploration and practice remain usable when Bedrock is unavailable.

## Amazon Bedrock setup

The server uses the AWS SDK's standard credential provider chain. Configure credentials locally through your existing AWS profile/SSO or environment mechanism. Never place credentials in source code, `NEXT_PUBLIC_*` variables, or this README.

Required server configuration:

- `AWS_REGION` (or `AWS_DEFAULT_REGION`): a region supporting the configured Bedrock model/inference profile. Main adaptation is verified in `eu-north-1`.
- Valid standard AWS credentials with permission to invoke that model (`bedrock:InvokeModel`).
- Optional `AWS_PROFILE`: your configured local profile.
- Optional `BEDROCK_ADAPTATION_MODEL_ID`: main learning defaults to `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`, the tested Sonnet 4.5 EU inference profile. The Anthropic first-use form/access must be configured for your account.
- Optional `BEDROCK_MODEL_ID`: the unchanged canonical `/demo` explanation boundary defaults to `amazon.nova-lite-v1:0`.

For PowerShell, after your AWS authentication is configured:

```powershell
$env:AWS_REGION = 'YOUR_REGION'
$env:AWS_PROFILE = 'YOUR_EXISTING_PROFILE' # omit when using default credentials
npm run test:live
npm run dev
```

A standard SSO profile may require `aws sso login --profile YOUR_EXISTING_PROFILE`; a configured AWS CLI login session may require `aws login` to renew it. Secrets and `.env*` files are ignored by Git. Restart the server after changing configuration. The new learning provider can also resolve a region from the SDK's standard configuration chain.

`npm run test:live` checks the unchanged binary-tree provider. The existing learning smoke tool now checks direct Sonnet source adaptation for synthetic text, PNG and PDF inputs:

```sh
node --env-file-if-exists=.env.local --conditions=react-server --import tsx scripts/learning-smoke.ts
```

It incurs model invocations and reports success only after validating actual responses. It prints neither document contents nor credentials.

The canonical `/demo` explanations remain extractive and its relationships remain deterministic. The home-page provider adapts supplied source content directly, using server-owned excerpt references or explicitly labeled visual interpretation. Reference validation does not prove semantic correctness; the original remains ground truth and unclear details must remain uncertain. No prepared production response or new provider transport is configured.

References: [AWS credential chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html), [Bedrock Converse examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html).

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Alternatively use an installed Edge browser for E2E tests:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

E2E tests use the production build on port 3100 and explicitly set `ADAPT_AI_DISABLE=1` so default AWS configuration cannot trigger paid calls. Real-server tests cover honest failure and legacy safety gates; presentation tests mock only provider output. Unit tests exercise the complete new server workflow with an injected provider and the SDK request/response boundary. Automated accessibility checks supplement manual screen-reader and audible/microphone acceptance.

See [vertical-slice architecture and review guide](docs/vertical-slice.md) for boundaries, decisions, and remaining validation.

## PDF extraction compatibility spike

The server-only PDF adapter extracts selectable text with page/block provenance and explicit limitations. It remains separate from the accommodation engine and Bedrock, with no persistent document storage. The original diagnostic endpoint is disabled unless `ADAPT_PDF_SPIKE=1` is set on a local server. See [PDF spike findings and contracts](docs/pdf-extraction-spike.md) for the historical compatibility evidence and provisional budgets; the learner review workflow is described below.

The [material quality and review gate](docs/material-quality.md) adds a generic server-side readiness contract, validates provenance/coverage, and requires explicit limited-scope acceptance before issuing confirmed usable extracted material. It does not connect PDFs to accommodation or AI. Quality decisions against the existing corpus are recorded separately from the original extraction benchmark.

The [source-adaptation slice](docs/source-adaptation-slice.md) supersedes the [broad understanding flow](docs/end-to-end-learning.md), [earlier goal-first journey](docs/universal-learning-journey.md) and [page-audit UI](docs/pdf-upload-review.md). The historical selectable-text quality gate is unchanged. Native source adaptation remains separate from certified extracted text; visual descriptions are interpretations, and original pages remain available. Temporary sessions expire after 15 minutes with no permanent file storage.

## Audio learning material

MP3 and WAV use the same material/support/learning journey. Recordings up to 64 MiB / 30 minutes are transcribed into timestamped, readable source sections; choose **Make spoken content readable** for structured sections and key points. Original audio and transcript provenance remain server-side. No hearing diagnosis or learning objective is required.

Audio transcription defaults to Gemini 3.5 Transcribe using server-only `GEMINI_API_KEY` in the local environment. Restart the server after changing configuration. Claude Sonnet 4.5 still handles adaptation through Bedrock. Set `ADAPT_TRANSCRIPTION_PROVIDER=aws` to restore the retained AWS Transcribe adapter when access is resolved; it uses standard AWS credentials, `transcribe:StartStreamTranscription`, and `ADAPT_TRANSCRIBE_REGION` (default `eu-central-1`). There is no automatic provider switch on failure. See [the Gemini integration](docs/gemini-audio-integration.md). See [audio architecture, setup, limits and verification](docs/audio-material.md).

Current PDF/audio resource budgets and boundary verification are documented in [MVP material limits](docs/mvp-material-limits.md).
