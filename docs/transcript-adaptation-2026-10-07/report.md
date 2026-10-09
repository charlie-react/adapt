# Colonialism transcript -> hearing-accessible adaptation

## Result

Use with safeguards. The existing ADAPT Claude adaptation layer successfully produced a readable, source-faithful version of this verified transcript. The final live response passed the existing strict provider and service validators. Its three paragraphs reproduce the entire transcript verbatim and in order; six key points provide faithful condensation. No unsupported information was identified in the final introduction, title or key points during manual source comparison. This is evidence for this lecture, not a guarantee across materials.

## Source and execution

Source: ../gemini-3.5-transcribe-2026-10-07/transcript.txt (colonialism lecture, not entrepreneurship). The user independently listened and confirmed the transcript accurate. Model: eu.anthropic.claude-sonnet-4-5-20250929-v1:0 (Claude Sonnet 4.5), via existing AWS configuration.

Existing fileMaterial -> source-only createLearningStore -> store.adapt -> createLearningProvider.adaptSource -> strict validation -> existing experience contract. Need: read-spoken. No learning objective required. No Gemini request, production changes, new provider, schema, or evaluation infrastructure. The final request used learner preferences requesting exact source sentences and preserved qualifiers. Max tokens 8000, temperature 0, latency 11.764 seconds.

Actual final output: exact-source-accessible-lesson.md; structured result: exact-source-adapted-output.json; raw Bedrock response: exact-source-bedrock-response.json; request configuration: exact-source-request-metadata.json. Output was not manually corrected.

## Fidelity and accessibility scope

The full transcript remains unchanged as source, with text-1 provenance and a server-resolved exact source quotation. Every source sentence is present, with dates, resources, introduced structures, exploitation, artificial borders, independence and legacy preserved. Key points are not all verbatim excerpts: they combine or shorten sentences without changing their meaning in this case. They supplement rather than replace the complete lecture.

The text-first result requires no hearing: three topic-grouped paragraphs and six key points use the existing accessible experience shape, with no formal grading. This invocation tests the server adaptation and validation path, not browser keyboard, screen-reader or Read Aloud behavior. No UI changes were made. The transcript was supplied as text to avoid falsely assigning Gemini output Amazon Transcribe provenance. Full audio/timestamp provenance integration remains untested and unimplemented here; existing Gemini word timestamps remain in the transcription artifacts.

## Problems observed

- Initial request failed with DNS ENOTFOUND for the Bedrock endpoint.
- A subsequent request reached the provider but was rejected: validation / Adaptation introduced or changed a source number. That candidate was not captured, so the precise numeric discrepancy is unknown.
- The first validated response added or strengthened claims: weakened became weakened or dismantled; little regard became without considering; contributed to tensions became created lasting tensions. See first-validated-* artifacts. Strict evidence/number/schema validation passed despite these semantic changes. This result is not accepted as source-faithful.
- The final retry kept paragraphs verbatim and preserved the source qualifiers. Manual comparison found no unsupported claims.

## Suitability and verification

Suitable for this transcript-to-readable-learning step with source-preserving instructions and fidelity review. The existing validator checks references, quotations, structure and numbers but does not prove every generated claim is entailed by its referenced source. Default paraphrasing therefore is not yet demonstrated safe for unattended use. Do not confuse a validator pass with factual fidelity.

Checks: live existing adaptation and service validation passed; joined final paragraphs equal the complete original transcript exactly; source remained unchanged; manual key-point and introduction comparison passed; artifacts checked against configured secret values without printing them. Production lint/build/UI regressions were not rerun because this task changed diagnostic docs only. No production behavior or dependency changes.
