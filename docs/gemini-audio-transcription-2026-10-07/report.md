# Direct Gemini educational MP3 transcription test

Date: 2026-10-07 (Africa/Lagos).

**Result: blocked by model availability. Neither permitted model returned a transcript. Transcription accuracy and suitability cannot be assessed from these failures.**

## Material and method

Used the explicitly attached `Colonialism_in_Africa___Exact_60_Seconds.mp3` (927,495 bytes), directly from Downloads. This is the supplied attachment, rather than an assumed entrepreneurship lecture; the filename suggests colonialism, but no claim about the spoken content is made without a transcript or listening reference. “Exact 60 Seconds” is a filename claim, not an independently measured duration in this test.

The standalone `run.mjs` diagnostic sends the original MP3 bytes inline as `audio/mp3` to the Google Gemini REST `generateContent` API. It has **no ADAPT imports**, transcription, preprocessing, grounding validator, schema, adaptation logic or production integration. No new dependency was installed.

Authentication uses `GEMINI_API_KEY`, loaded into the process by Node's `--env-file=.env.local`. The key was not inherited by the initial shell, but an assignment exists in the standard ignored environment file. Its value was never displayed or included in artifacts. Authentication is sent in the `x-goog-api-key` header, not the URL or metadata. Returned text is checked for the exact key and redacted if ever present; both saved API responses required no redaction.

The exact transcription-only prompt and request settings are recorded in each `*.request-metadata.json`. The prompt asks for complete, faithful original-language spoken wording, repetitions, names, dates, numbers, and natural paragraph breaks; no summarisation, teaching, factual correction, translation or invented words. Settings: temperature 0, maximum output tokens 8192, thinking budget 0, request deadline 120 seconds. The audio SHA-256 fingerprint is recorded in `run-summary.json` for reproducibility. Audio bytes/base64 and credentials are not saved in request metadata.

## Actual API outcomes

| Requested model | HTTP / API status | Measured request latency | Transcript |
| --- | --- | --- | --- |
| `gemini-2.5-flash` | 404 / `NOT_FOUND` | 4,882 ms | None |
| `gemini-2.5-flash-lite` | 404 / `NOT_FOUND` | 4,063 ms | None |

The first model-level availability failure triggered the sole permitted fallback availability attempt. Flash-Lite also failed before returning any transcript. No third model was attempted. These are Google API responses, not ADAPT parser/grounding rejections, AWS errors or local decoding failures. The API returned no successful model-version metadata.

Exact Flash error:

```json
{
  "code": 404,
  "message": "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).",
  "status": "NOT_FOUND"
}
```

Exact Flash-Lite error:

```json
{
  "code": 404,
  "message": "This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).",
  "status": "NOT_FOUND"
}
```

Full unmodified response bodies are saved separately as `gemini-2.5-flash.raw-response.json` and `gemini-2.5-flash-lite.raw-response.json`; they contain no transcript. Request metadata and run summary are beside this report.

## Assessment and next decision

This test establishes that **the two requested model IDs are unavailable to the configured API project/key under Google's reported new-user restriction**. It does not establish that Gemini cannot transcribe audio, that this MP3 is unsupported, or that another Gemini model is reliable. A normal content-level result was never returned. Changing ADAPT's production provider based on this outcome would be unsupported by evidence.

The API recommends different model IDs, reproduced verbatim above. Testing either would require an explicit model-choice decision because this task authorises only 2.5 Flash and the 2.5 Flash-Lite fallback. Alternatively, an API project with access to the requested model IDs could rerun the same diagnostic. No additional key or credential is requested in chat.

If a permitted model becomes available, compare its transcript against a human-verified verbatim reference or an actual listening review, especially dates, proper names, negation, omissions, repetitions and paragraph boundaries. A fluent transcript alone is not proof of audio fidelity. No independent reference was supplied, so no word-error rate or accuracy percentage is claimed.

## Reproduce

From the ADAPT repository, using locally configured environment credentials:

```powershell
node --env-file=.env.local docs/gemini-audio-transcription-2026-10-07/run.mjs 'C:\users\besle\Downloads\Colonialism_in_Africa___Exact_60_Seconds.mp3'
```

This sends the educational audio to Google and may incur API charges when a model is accessible. The script exits nonzero when no complete transcript is returned. That occurred here as expected for the two availability failures. The same artifact filenames are overwritten on a rerun; preserve this evidence directory first if retaining multiple attempts is important.

The diagnostic syntax was checked with `node --check`; artifacts were checked for accidental inclusion of the exact configured API key. Production application code, AWS transcription, Claude adaptation, dependencies and existing UI were not modified. Application regression tests were not rerun because this task only adds standalone diagnostic evidence under `docs/`.

Official API method reference: [Google audio input and transcription documentation](https://ai.google.dev/gemini-api/docs/generate-content/audio). The specific availability findings above come from the saved real API responses, not inferred from documentation.
