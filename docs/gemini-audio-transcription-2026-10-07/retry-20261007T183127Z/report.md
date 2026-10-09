# Gemini direct MP3 transcription retry: updated environment key

Date: 2026-10-07 (Africa/Lagos). Evidence directory timestamp: 18:31:27 UTC.

**Outcome: both authorised model IDs remain unavailable. No transcript was returned; audio-transcription accuracy cannot be assessed.**

## What was tested

Retried the exact same attached `Colonialism_in_Africa___Exact_60_Seconds.mp3` (927,495 bytes; SHA-256 `a1e479affb031e56356c862c8bb19ec134e3337e6140e9ba21daf7d01be7f660`) with the updated `GEMINI_API_KEY` configuration. The attachment was used rather than an assumed entrepreneurship recording. The filename's 60-second claim was not independently measured.

A separate boolean-only check confirmed that the key loaded by Node **matches the current `.env.local` value**. No key value or identifying key prefix was displayed, recorded or saved. The key's age or project entitlement was not independently verified.

The diagnostic sent the MP3 bytes directly as inline `audio/mp3` to Gemini's REST `generateContent` API, bypassing all ADAPT production code, audio decoding, AWS transcription, adaptation, schemas and grounding validators. The exact transcription-only prompt and settings were retained from the earlier test: temperature 0, maximum output tokens 8192, thinking budget 0, 120-second request deadline. Request metadata is saved beside the raw responses; it contains the audio hash rather than audio bytes or credentials.

## Actual results

| Model requested | HTTP / API status | Request latency | Transcript |
| --- | --- | --- | --- |
| `gemini-2.5-flash` | 404 / `NOT_FOUND` | 38,561 ms | None |
| `gemini-2.5-flash-lite` | 404 / `NOT_FOUND` | 20,258 ms | None |

Flash returned this exact error:

```json
{
  "code": 404,
  "message": "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).",
  "status": "NOT_FOUND"
}
```

The explicit model-availability failure triggered the sole permitted fallback request. Flash-Lite returned:

```json
{
  "code": 404,
  "message": "This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).",
  "status": "NOT_FOUND"
}
```

Both complete response bodies are preserved unchanged in `*.raw-response.json`. Neither contained the configured key, required redaction, returned a successful model-version identifier, or produced transcript text. No other model was called.

## Assessment

Using the updated key did not remove the reported model-availability restriction. This is a Gemini API failure, not an ADAPT parser, audio preprocessing, validation or AWS-policy failure. It provides no evidence about Gemini's word-level accuracy, omissions, paragraph fidelity or suitability for hearing-accessible learning. There is no transcript to recommend for ADAPT.

The next decision is whether to authorise a different available model (Google recommends the IDs quoted above) or configure access to the exact requested model IDs. No additional credential is requested in chat, and no production-provider change is justified by this failed capability test.

## Reproduction and checks

```powershell
node --env-file=.env.local docs/gemini-audio-transcription-2026-10-07/retry-20261007T183127Z/run.mjs 'C:\users\besle\Downloads\Colonialism_in_Africa___Exact_60_Seconds.mp3'
```

This standalone copy narrows fallback to explicit 404 `NOT_FOUND` responses; authentication, quota or transport failures do not silently switch models. It exits nonzero if no complete transcript is returned. Earlier test evidence remains in the parent directory and was not overwritten.

Diagnostic JavaScript syntax and all retry artifacts were checked; the exact configured API key is absent from saved artifacts. Only this diagnostic evidence directory was added. No ADAPT production code, dependencies, UI, AWS setup or provider boundary was modified. Application tests/builds were not rerun because no application code changed.
