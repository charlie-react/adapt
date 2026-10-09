# PDF extraction compatibility spike

## Scope and decision

Use **unpdf 1.8.1**, pinned in package.json and package-lock.json, with its bundled **PDF.js 6.1.200**. The package requires Node >=22. Extraction was verified on Windows, Node 24.20.0, Next.js 16.3.8 and Turbopack, in both development and production runtime contexts. No canvas, OCR, PDF generator dependency, external service, storage, or learning pipeline integration was added.

The spike establishes byte-based selectable-text extraction, not PDF understanding or learning-objective identification. The existing fixture, accommodation engine, provider boundary, practice, and semantic reading code are untouched.

Alternatives were adding a direct PDF.js dependency/worker setup or replacing the PDF parser. The bundled unpdf implementation works with the current environment after addressing native package resolution; a second library is unnecessary for this spike.

## Boundary and contracts

`UploadInput → InputAdapter.ingest → IngestionResult`

- `UploadInput`: bytes, declared media type, optional display name. MIME is an adapter-selection hint; actual PDF validation uses bytes.
- `SourceLocator`: physical one-based page number, optional document page label, one-based block index. Physical page number remains authoritative when labels differ.
- `ExtractedBlock`: deterministic ID, extracted text, `origin: extracted`, paragraph/heading/list kind, structure basis and locator. Tag-derived and layout-inferred classifications are explicitly distinguished.
- `IngestedMaterial`: source byte hash/size/media type, extraction/library versions, ordered pages referencing blocks, optional language, warnings, and scoped coverage status.
- `IngestionResult`: either material or a typed error with a safe message. There is no successful empty lesson result.

Document IDs use `pdf-v1:<SHA-256 of original bytes>`; block IDs append `:p<physical page>:b<block index>`. IDs are stable for identical bytes and extraction version. A future normalization change that changes boundaries must version the extractor. A changed source file is a new source identity.

Original bytes are transient and are not stored in the result. The source descriptor records their identity separately from extracted text. Structure labels carry their basis; they are not authoritative objectives or AI analysis. Future AI output must use a separate contract and retain references to this provenance. Do not render extracted content, filenames, page labels, or metadata as HTML.

## Extraction and honest limitations

The adapter reads page text and document structure tags only. It preserves parser stream order, groups baseline fragments using their coordinates, preserves punctuation/Unicode, and retains separate tagged paragraph boundaries. Tagged headings/list items are supported; font sizes, bullet prefixes and line spacing provide explicitly warned fallback heuristics for untagged text. Column/direction/rotation ambiguity produces `READING_ORDER_UNCERTAIN`; undecodable replacement characters produce `TEXT_DECODE_WARNING`.

`coverage: supported` means the **selectable-text extraction scope** passed these checks. It never means all visual content was captured or understood. Every success has `TEXT_ONLY`. Mixed text/blank pages are partial, with page-specific `NO_PAGE_TEXT`; tagged figures/tables/formulas/code produce partial `UNSUPPORTED_STRUCTURE`. Untagged visual structures may be undetectable. Tag correctness, reading order, heading detection and multilingual support are not universally guaranteed.

| Case | Result |
| --- | --- |
| Complete, ordinary selectable-text PDF | Text blocks per physical page, with stable provenance |
| Tagged headings/lists and paragraph boundaries | Document-tag classifications retained |
| Untagged ordinary layout | Explicitly inferred boundaries/classifications |
| ToUnicode font mapping | Accents, smart quotes, em dash, Greek and Cyrillic preserved in tested fixture |
| Text page plus blank/image page | Partial extraction with page warning |
| Empty byte input | `EMPTY_INPUT` |
| Non-PDF bytes despite filename/MIME | `NOT_PDF` |
| Truncated or malformed document | `INVALID_PDF` where identifiable; other parser errors remain `EXTRACTION_FAILED` |
| Password-protected PDF | `PASSWORD_PROTECTED`; no password prompt or credential handling |
| Entirely blank/image-only/scanned PDF | `NO_READABLE_TEXT`; no OCR or invented text |
| Diagrams, tables, mathematics, embedded attachments/actions | Not interpreted or processed |

Validation intentionally requires a PDF header at byte zero and a complete final `startxref`/`%%EOF` trailer. Nonstandard/recoverable files with leading junk, unusual trailing data, or missing trailers are rejected rather than silently repaired. This restrictive spike policy needs review against a representative corpus before final product rules are chosen.

## Resource and privacy controls

Provisional engineering budgets: **5 MiB**, **20 pages**, **100,000 text characters**, **20,000 text/marked-content items and 20,000 structure nodes**, **10 seconds**, and **two concurrent workers per process**. Server callers may lower budgets but cannot raise them. These are spike limits, not finalized product policy.

The opt-in HTTP probe bounds bytes while streaming, irrespective of Content-Length, and admits two active requests per process. Its ten-second deadline covers receipt and extraction. Node workers have a 128 MiB V8 old-generation limit and 4 MiB stack limit. Abort, timeout, resource failure, and excess concurrency return typed results; timeout/abort terminate the worker rather than merely abandoning a promise.

The V8 limit is **not a total process/native/ArrayBuffer memory cap** or an OS security sandbox. PDF.js can allocate/decompress data before item limits can be checked. Deployment-specific memory isolation, burst limits and adversarial compression testing must precede public uploads. Per-process concurrency is not a distributed queue or global rate limiter.

PDF.js receives bytes only, never a URL or filesystem path for a document. Evaluation, worker fetching, system fonts, font-face rendering and WASM are disabled. Only application-owned static worker code executes; PDF JavaScript actions, embedded URLs and attachments are never requested or executed. Display names are stripped of path components/control characters; PDF metadata is not used for titles. Parser stdout/stderr are drained without forwarding source-derived diagnostics. Uploaded bytes and extracted contents are not logged. Responses are `Cache-Control: no-store`; there is no persistent file storage or third-party call.

## Compatibility findings

The first production build compiled successfully but actual extraction failed. Inspecting the generated route revealed Turbopack rewriting static `require.resolve("unpdf")` into a numeric module ID. The worker needs a real filesystem URL. Externalizing unpdf alone did not fix that rewrite.

Binding native `createRequire(...).resolve` and calling the bound resolver at runtime fixes the worker path in development and production. The final implementation needs **no changes to next.config.ts**, including no `serverExternalPackages`. The package must be installed and available to the Node runtime. Standalone/serverless artifact tracing and deployment packaging have not been verified; resolve those for the chosen hosting target before deployment.

Development verification used an isolated temporary source copy and server on 3101 because the developer's existing server held Next's dev lock. It used the same source, dependency installation, Node version and Turbopack; temporary files/server were removed afterward. Production verification used the actual repository's `next build` and `next start` on 3100 via Playwright.

The corpus consists of actual complete PDF byte fixtures parsed by the real library, not mocked parser responses: a tagged two-page lesson, ToUnicode text, blank and mixed pages, an image XObject, a standard revision-2 encrypted PDF, and malformed/truncated inputs. These fixtures are constructed in memory without a generator dependency. This is evidence of compatibility, not a claim that arbitrary textbooks already work.

## Reproduction

The opt-in raw-byte POST route `/api/ingestion/pdf-spike` is a local compatibility tool, **not a public upload workflow**. With no flag it returns 404. Enable it only on a loopback-bound local server. Do not enable it on a public deployment.

In PowerShell, with any existing development server for this repository stopped:

```powershell
$env:ADAPT_PDF_SPIKE = '1'
npm run dev -- --hostname 127.0.0.1 --port 3101
```

In a second terminal:

```powershell
node --import tsx scripts/pdf-spike.ts http://127.0.0.1:3101
```

The script submits synthetic fixtures to loopback only, verifies content/provenance and failures, and prints a version/count summary. It does not accept a user document path or print extracted content. Restart without the flag after diagnostic use.

Production and regression checks:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

Playwright enables the diagnostic endpoint on its own production test server. Normal startup remains disabled. No AWS credentials or model invocation are needed.

Final results: **36 unit/integration tests pass**, including ten PDF tests covering validation, extraction, boundaries, Unicode, provenance, failures, budgets, cancellation, concurrency and HTTP gating/stream limits. **All 12 production E2E tests pass**, including two PDF runtime checks and the existing lesson, keyboard, Read Aloud, narrow-screen and automated axe accessibility regressions. Lint, type checking and production build pass. Development runtime diagnostic passes with unpdf 1.8.1 / PDF.js 6.1.200.

## Before an upload/review UI

Follow-on work: representative [corpus validation](pdf-validation/report.md) is complete. The [material-quality gate](material-quality.md) now represents readiness, column/code uncertainty and explicit review separately from extraction. Extraction version 2 retains the source page count and adds warning detection without repairing text; the original version-1 spike/corpus evidence remains historical. The library and resource budgets are unchanged. No upload/review UI or PDF accommodation has been built.

1. Evaluate representative real educational documents, including compressed/object-stream PDFs, embedded fonts, malformed tags, multi-column text and different writing directions. Measure timing/peak memory to choose product budgets and deployment isolation.
2. Verify the selected hosting target supports workers, deadlines and installed/traced package assets. Edge runtime is not supported by this adapter.
3. Design accessible review of page provenance, partial coverage, extraction errors and inferred boundaries. Require visible confirmation/correction before downstream content analysis; do not infer objectives during upload.
4. Decide upload abuse controls, retention/deletion policy and permitted document limits. There is no document persistence in this spike.
5. Define how a future analysis stage distinguishes authoritative source objectives from AI suggestions. OCR, diagrams, tables and mathematics require separate evaluated capabilities, not silent additions to selectable-text coverage.

## Files changed in this spike

Added:

- `src/lib/ingestion/types.ts`: generic ingestion contracts.
- `src/lib/ingestion/errors.ts`: typed, content-safe failures.
- `src/lib/ingestion/pdf/contracts.ts`: PDF parser records and provisional budgets.
- `src/lib/ingestion/pdf/adapter.ts`: server-only validation, worker lifecycle and provenance.
- `src/lib/ingestion/pdf/worker-source.ts`: bounded PDF.js extraction.
- `src/lib/ingestion/pdf/normalize.ts`: explicit blocks and structure/coverage warnings.
- `src/app/api/ingestion/pdf-spike/route.ts`: disabled-by-default streaming diagnostic endpoint.
- `scripts/pdf-spike.ts`: loopback runtime compatibility diagnostic.
- `tests/fixtures/pdf.ts`: in-memory real PDF fixtures.
- `tests/pdf-ingestion.test.ts`: parser, provenance, failure and budget tests.
- `tests/pdf-blocks.test.ts`: grouping, tagged boundaries and uncertainty tests.
- `tests/pdf-http.test.ts`: opt-in endpoint, byte validation and streaming budgets.
- `tests/e2e/pdf-spike.spec.ts`: actual production Next runtime tests.
- `docs/pdf-extraction-spike.md`: findings, reproduction and remaining work.

Updated: `package.json` and `package-lock.json` to pin unpdf; `playwright.config.ts` to enable the diagnostic endpoint on the test server only; `README.md` to document the spike and updated Node requirement. `next.config.ts`, `AGENTS.md`, existing learning/AI/UI/Read Aloud files are unchanged by this spike. Pre-existing uncommitted work was preserved.
