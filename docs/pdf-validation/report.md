# PDF corpus validation: resumed assessment

Assessment date: 3 October 2026. **Conditional go for retaining the PDF parser foundation; fix the identified normalization/warning gaps before relying on it in learner review. No-go for unattended AI analysis or general PDF understanding.** No upload/review UI or extraction fixes were implemented in this task.

## Recovered state and work completed

The interrupted session left six valid validation-tool changes, 20 prepared corpus entries, and all 20 matching cached PDF hashes. No results file existed; the four controls in `prepare-controls.ts` had not been registered. The completed preparation was reused without regeneration or downloads. The missing controls were added, bringing the corpus to **24 documents**, then evaluation ran to completion. Existing changes were preserved; there was no reset or commit.

The six original files were inspected along with AGENTS.md, extraction contracts/worker/normalizer, existing fixtures/tests, and the compatibility spike documentation. The evaluator, metrics, preparation and download scripts were internally consistent with the prepared bytes. A content-free parser audit and metric validation tests were added to support diagnosis. Application source was unchanged, verified by a source-tree SHA-256 before/after evaluation.

## Corpus and reproducible evidence

`manifest.json` records categories, expected profiles established before extraction, source URLs/licenses, byte hashes, independent pypdf inventory, and original physical-page mappings for the chapter excerpt. `results.json` records per-page/block provenance, text hashes/counts, warnings, quality checks, latency, memory and deterministic repeat comparisons. It contains no extracted document text. `parser-audit.json` compares restricted parser output with normalization using counts and coordinates only.

The corpus has 19 synthetic/control inputs and five public inputs, counting a full book and its separately evaluated chapter excerpt. It spans lecture-style prose, two MIT slide decks, a textbook chapter, a scientific paper, tagged headings/lists, columns, tables, equations, diagrams, code, embedded Unicode fonts, genuine rasterized lesson pages, mixed text/scan pages, repetition and malformed/resource-boundary cases. It is a deliberately varied diagnostic corpus, not a statistical sample of all educational PDFs. Public files stay in the ignored local cache and are not redistributed as repository fixtures.

Public sources:

- [MIT 6.041 lecture 1](https://ocw.mit.edu/courses/6-041-probabilistic-systems-analysis-and-applied-probability-spring-2006/e93a3d8242ae1c6e75f7ea9c0a2aa3bf_lec01.pdf): slides with lists, tables, diagrams and probability notation.
- [MIT 18.175 lecture 1](https://ocw.mit.edu/courses/18-175-theory-of-probability-spring-2014/e793116b0f70b437cca5e9cf75754cab_MIT18_175S14_Lecture1.pdf): mathematical slides.
- [Attention Is All You Need, v7](https://arxiv.org/pdf/1706.03762v7): scientific prose and complex figures/tables/equations. Controlled fixtures provide the explicit column-order oracle; the paper's entire reading order was not manually certified.
- [Think Python 2e](https://greenteapress.com/thinkpython2/thinkpython2.pdf): full-book resource rejection and an eight-page chapter-2 excerpt. The manifest records the original source pages separately from excerpt page numbers.

## Method

Environment: Windows x64, Node 24.20.0, Next.js 16.3.8, unpdf 1.8.1 / PDF.js 6.1.200. The real server-only adapter ran directly, unchanged, with the existing limits: 5 MiB, 20 pages, 100,000 characters, item/structure limits and ten-second deadlines. No AWS calls occurred.

Each document ran in a fresh Node process, with two adapter calls and identical-result fingerprints. Timings exclude Node startup and file reading. RSS was sampled every 10 ms across both calls; it includes runtime, parser workers, native allocations and evaluator activity. It is not worker heap, incremental memory per request, or an upper memory bound. Sampling may miss peaks; resourceUsage high-water values are retained when the platform provides them. Concurrent-load/deployment isolation was not benchmarked.

Anchor recall checks only known phrases, not all words. Tiny/single-character blocks, repeated blocks, hyphen joins and replacement characters are review signals, not quality grades. Repetition may be legitimate headers, mathematical symbols or slide overlays. Successful text extraction never establishes table, equation, code or diagram understanding. Failure results have unknown/null page coverage, rather than misleading zero empty-page rates.

## Results

All **24 expected outcome classes matched**; all **24 repeat results were deterministic**. There were **17 text results** (12 scoped supported, 5 partial) and **7 expected typed rejections**. Successful documents contained **65 pages, 64 with text, and 59,956 extracted characters**. All successful provenance links and expected page counts passed; all selected anchors were present. These facts do not imply that all semantic/layout checks passed.

| Document | Outcome / pages | Blocks / characters | Observed quality |
| --- | --- | --- | --- |
| lecture-clean | supported / 1 | 3 / 174 | All anchors and lists survive; same-size heading merges with prose |
| columns-ordered | supported / 1 | 6 / 109 | Expected order passes; requested column uncertainty warning absent |
| columns-interleaved | supported / 1 | 3 / 112 | All anchors present, order fails; column warning absent |
| table-untagged | supported text scope / 1 | 4 / 67 | Cell text survives; cell associations unsupported |
| maths-layout | supported text scope / 1 | 7 / 103 | Fragmented notation; superscript/fraction structure unsupported |
| diagram-labelled | supported text scope / 1 | 2 / 87 | Labels survive; arrow relationship not represented |
| code-indentation | supported text scope / 1 | 4 / 77 | Lexical anchors survive; five expected lines/indentation not preserved |
| unicode-embedded-font | supported / 1 | 1 / 46 | Exact punctuation/non-ASCII statement passes |
| poor-paint-order | partial / 1 | 2 / 28 | Source painting order fails reading-order oracle; warning present |
| scan-image-only | NO_READABLE_TEXT | unknown | Legible raster lesson is honestly rejected; no OCR |
| mixed-text-scan | partial / 2 | 3 / 174 | Text page survives; page 2 explicitly NO_PAGE_TEXT; 50% text coverage |
| repeated-boilerplate | supported / 3 | 6 / 327 | Two repeated blocks; legitimate source footer repetition |
| truncated | INVALID_PDF | unknown | Incomplete source trailer rejected |
| leading-junk | NOT_PDF | unknown | Deliberate strict header policy; pypdf can recover this source |
| over-page-budget | RESOURCE_LIMIT | unknown | Valid 21-page source exceeds policy |
| mit-probability-slides | partial / 14 | 198 / 2,838 | 125 tiny blocks, 52 single-character blocks, 69 repeats; order/structure warnings |
| mit-theory-slides | partial / 12 | 188 / 3,575 | 24 replacement characters, 116 tiny blocks, 57 single-character blocks |
| attention-paper | partial / 15 | 811 / 38,953 | 517 tiny blocks, 127 single-character blocks, 348 repeats, 16 hyphen joins |
| think-python-full | RESOURCE_LIMIT | unknown | Valid 244-page book exceeds policy |
| think-python-chapter2 | supported text scope / 8 | 135 / 13,157 | Prose anchors survive; 12 hyphen joins and mixed code/prose remain review concerns |
| tagged-heading-list | supported / 1 | 4 / 80 | Exact boundaries, heading and list tags preserved |
| unicode-cmap | supported / 1 | 1 / 49 | Exact ToUnicode control passes |
| encrypted-control | PASSWORD_PROTECTED | unknown | Honest rejection; no credential handling |
| empty-control | EMPTY_INPUT | unknown | No empty lesson produced |

Successful first-call extraction took **214–1,266 ms** in this run. The paper was slowest and had the largest sampled process RSS: **137.7 MiB**, with a maximum observed baseline-to-peak increase of **81.4 MiB**. Public slides sampled approximately 87/115 MiB; the chapter approximately 91 MiB. Do not multiply these deltas into a capacity guarantee or treat the 128 MiB worker old-generation limit as a total RSS ceiling.

## Diagnosis: implementation gaps versus source/parser limits

1. **Implementation warning gap:** interleaved columns become three mixed-row blocks without `READING_ORDER_UNCERTAIN`. The audit finds six nonempty text items, two x positions and three whitespace spans wider than 48 points. The normalizer advances its line end across these spans, bypassing its large-gap check. The source paints row-by-row; ambiguity is inherent, but unqualified extraction status and absent specific warning are implementation weaknesses. Correct conservative detection before attempting automatic column reordering.
2. **Implementation representation gap:** code has three x positions (indentation geometry) in parser output but no leading whitespace in normalized blocks, and only four blocks for five source lines. The current paragraph heuristics trim/merge content and drop layout needed by code. This is not evidence that unpdf failed to extract the code words. Preserve line/indentation information or explicitly mark code formatting unsupported; do not create executable code from extracted blocks.
3. **Upstream decoding limitation:** all 24 mathematical-slide replacement characters already exist in restricted PDF.js output, with identical counts after normalization, on physical pages 4–8. The adapter correctly warns. The audit does not establish whether the exact underlying cause is deficient source font mapping or a PDF.js font-decoding incompatibility; do not call it a proven corrupt source or normalization bug.
4. **Inherent layout/semantic limitations:** drawing order need not equal reading order; vector arrows have no textual relationship; equations can be distributed glyphs; untagged tables have no reliable cell associations. Untagged examples can still return scoped `supported` plus generic TEXT_ONLY, which must never become a learner-facing claim of full understanding.
5. **Policy rejections:** full books/21-page inputs hit the current page budget. Leading-junk recovery is intentionally disallowed. Truncation and encryption are honest rejection cases, not unexplained parser crashes.

No source loss was inferred merely from the difference between pypdf and PDF.js character counts. The current inventory/anchors are insufficient to prove full transcription accuracy. Likewise, tiny/repeated public blocks do not by themselves prove fabricated duplication.

## Minimal next steps and decision

**P0, before trustworthy review:** fix conservative column/gap warning detection (including whitespace bridge items and transitions across completed lines); expose uncertain layout and scoped text coverage explicitly. Add focused regressions for the observed case. Do not silently sort columns based on guesses.

**P1, before code-bearing materials feed analysis:** retain line/indentation provenance or explicitly flag formatting loss. Evaluate grouping/hyphenation against a small manually annotated prose/code sample, keeping source text separate from normalization proposals. Never silently repair equations or turn inferred layout into authoritative objectives.

**P1, before public upload:** measure adversarial decompression and concurrent memory, verify hosting/worker/package tracing, and choose deployment isolation/limits. This local RSS run establishes observations, not upload safety at scale.

**P2:** expand real-world document coverage and a human-reviewed page-level transcription/order oracle, including additional writing directions and scan-with-text-layer PDFs. No need to replace unpdf based on this corpus alone.

Recommendation: retain the extraction boundary and unpdf. Proceed to a deliberately limited manual upload/review layer only after P0 and a decision about code formatting, with source comparison, explicit warnings and rejection/partial states. Do not proceed to automatic objective inference or adaptation based on these text blocks alone. Those product decisions remain for human approval.

## Reproduction and checks

From the repository root, **when the current cache/manifest already exists**, run only:

```powershell
node --conditions=react-server --import tsx scripts/pdf-validation/evaluate.ts
node --conditions=react-server --import tsx scripts/pdf-validation/audit.ts
npm test
npm run typecheck
npm run lint
```

For a new machine, prepare with `scripts/pdf-validation/download.ps1`, then `prepare.py` using pypdf 6.10.0, reportlab 4.4.9 and Pillow 12.3.0, then `node --import tsx scripts/pdf-validation/prepare-controls.ts`. The Windows generator uses Arial and records the font hash. Verify generated bytes against the recorded manifest; differences require a reviewed manifest rather than pretending corpus identity is unchanged. The preparation dependencies are evaluation tooling, not project runtime dependencies.

No application/UI files were changed in the resumed task. New audit and metric-test tooling plus this report supplement the existing scripts, manifest and results. Existing application regressions, type checking and lint are checked independently of extraction-quality outcomes; passing tests does not erase the corpus's observed limitations.

Verified checks in this resumed run: all **36 existing unit/integration tests** passed, both **new metric tests** passed, full-project lint passed, targeted lint for the new tooling passed, type checking passed, and `git diff --check` passed. Final integrity checks confirmed all 24 cached hashes and the evaluated application source SHA-256 still match. Production build and browser E2E were not rerun because this task changed no application code; their prior spike results are not counted as new validation evidence.
