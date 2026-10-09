# Direct Gemini 3.5 Transcribe MP3 test

Date: 2026-10-07 (Africa/Lagos).

**Result: successful direct transcription with `gemini-3.5-transcribe`. This is a promising candidate for ADAPT's audio ingestion layer, but word-for-word fidelity has not yet been independently verified. No production integration was changed.**

## Source and request

- Source: the existing attached `Colonialism_in_Africa___Exact_60_Seconds.mp3`, 927,495 bytes.
- SHA-256: `a1e479affb031e56356c862c8bb19ec134e3337e6140e9ba21daf7d01be7f660` (same file as the previous failed 2.5-model tests).
- A local, post-request MP3 decoding check measured **57.9106 seconds**, with zero decoder errors. The filename's “Exact 60 Seconds” is therefore not a verified duration. This check did not preprocess the audio sent to Google or use ADAPT's ingestion/transcription code.
- Exact requested and returned model: **`gemini-3.5-transcribe`**.
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/interactions`.
- Sent the original MP3 bytes inline as `audio/mp3`. No Files API upload, cloud bucket or remotely stored interaction was created (`store: false`). This flag does not constitute a broader guarantee about provider data retention.
- Used the existing `GEMINI_API_KEY` loaded by Node from `.env.local`. A boolean-only check confirmed it matched the current file. No credential value, prefix or authentication header was saved or printed.
- Dedicated transcription configuration: `mode.type: "verbatim"`, `timestamp_granularities: ["word"]`. No general-purpose text prompt, summary, adaptation, translation, smart formatting, vocabulary hints or speaker attribution was requested. No fallback model was attempted.

The request follows Google's [dedicated transcription guide](https://ai.google.dev/gemini-api/docs/transcribe) and [Interactions API](https://ai.google.dev/api/interactions-api). The documentation warns that requesting word timestamps may affect recognition accuracy; this run does not measure that trade-off.

## Observed outcome

| Signal | Actual result |
| --- | --- |
| HTTP | **200** |
| Interaction status | **completed** |
| Request latency | **18,590 ms** |
| Transcript | **1,074 characters / 144 whitespace-separated words** |
| Paragraphs | **1** |
| Word annotations | **144** |
| First recognised word starts | **0.100 s** |
| Last recognised word ends | **57.700 s** |
| API/access errors | **None** |
| Additional models called | **None** |

The transcript is about colonialism in Africa, matching the attachment's topic rather than an assumed entrepreneurship lecture. It contains a continuous educational explanation, including the Berlin Conference dates `1884 to 1885`, references to the `19th` and `20th` centuries, and independence during the `1950s and 1960s`. These are **reported transcript contents**, not independently verified matches to the original spoken words or a historical fact check.

It does not include a separate introduction, summary, teaching response, adaptation, or Markdown fence. The complete recognised wording is preserved unedited in `transcript.txt` and in the raw response. No transcript was repaired, rephrased, regrouped or passed through an ADAPT validator.

## Timestamp and source-reference audit

All 144 annotations have parseable start/end offsets, are ordered, do not overlap, and remain within the independently measured audio duration. Every annotation's character offsets select its exact word in the returned transcript. Joining annotation words reproduces the complete transcript, ignoring whitespace only. There were **zero structural timing or text-reference failures**.

These checks establish internal consistency and usefulness for a future audio → transcript provenance boundary. They do **not** establish acoustic alignment accuracy, whether words were omitted/invented, or whether names, negation and dates were heard correctly. Timestamp truth and word-error rate require an independent listening/reference review. This run contains no per-word confidence field in its saved word annotations.

An accounting peculiarity is preserved in the raw response: top-level `usage.total_output_tokens` is **0**, despite actual transcript content; nested candidate token details report **201 text tokens**. A future consumer should assess returned content rather than mistake that top-level usage field for an empty transcript. No production handling was changed here.

## Suitability assessment

**Consider this model for a controlled ADAPT transcription pilot with safeguards.** The live call demonstrates direct MP3 acceptance, substantial readable transcription, and structurally consistent word-level provenance in one request, independent of AWS's transcription restriction and ADAPT's model parsing/validation.

This is not sufficient evidence to certify educational accuracy or replace the production layer immediately. There is no supplied human-verified verbatim reference and no independent listening review, so no accuracy percentage or word-error rate is claimed. The source is one short narration; this run does not test WAV, natural lecture disfluency, multiple speakers, noisy audio, varied accents/languages, equations or specialist terminology. It returns one paragraph rather than learner-ready sections; reversible grouping would belong in the later material/adaptation layer while preserving transcript words and timestamps.

Before production adoption, compare the transcript with a listening/reference review, particularly dates, proper names, numbers, negation and any omissions. Expand to representative educational recordings and WAV acceptance. Keep original audio available, mark transcription as machine-derived, preserve word offsets/timestamps, and fail honestly on access/empty/incomplete responses. These are recommendations only; no provider change or new evaluation infrastructure was implemented.

## Saved evidence and reproduction

- `raw-response.json`: complete API body, unchanged (no key redaction was needed).
- `request-metadata.json`: model, endpoint, source hash and configuration; no audio base64 or key.
- `transcript.txt`: complete extracted transcript, unedited.
- `word-annotations.json`: model-provided timestamp/text annotations, unmodified.
- `run-summary.json`: actual response status, latency and usage.
- `structural-audit.json`: local duration, timing/text-reference checks and secret audit.
- `run.mjs`: standalone diagnostic; no ADAPT imports and no model fallback.

From the repository root:

```powershell
node --env-file=.env.local docs/gemini-3.5-transcribe-2026-10-07/run.mjs 'C:\users\besle\Downloads\Colonialism_in_Africa___Exact_60_Seconds.mp3'
```

Re-running invokes the paid external API and overwrites this directory's result filenames; preserve these artifacts first if comparing runs.

`node --check` passed for the diagnostic. Saved artifacts were checked for the exact configured key; none contain it. No application code, dependencies, AWS settings, Claude provider, accessibility engine or UI changed. Existing application tests/builds were not rerun because this task only adds direct-model diagnostic evidence under `docs/`.
