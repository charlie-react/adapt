# Direct Nova Lite educational-material probe

Date: October 6, 2026 (Africa/Lagos). Model: `amazon.nova-lite-v1:0`. Region: `eu-north-1`. Scope: direct capability testing, not an ADAPT implementation change.

## Assessment

Nova Lite demonstrated useful reading of the supplied SDN prose and a short Java factorial example. It recognized mathematical topics and many UML class names/attributes. It did **not** demonstrate reliable comprehensive mathematical or relationship understanding: native-PDF mathematics was shallow, and more focused/image-based attempts introduced incorrect expressions or connections while asserting confidence.

ADAPT parsing, schemas, quotation matching, grounding validators and adaptation logic cannot have caused these observed omissions/errors: none was involved. This does not establish the cause of every current ADAPT rejection or prove Nova's capabilities across arbitrary materials. It shows that fixing response handling alone is insufficient to ensure factual learning-content fidelity.

Recommendation: keep Nova Lite as a candidate for bounded prose/simple-code tasks, with source-faithfulness checks. These observations do not support trusting one unrestricted Nova Lite response as the sole authoritative interpreter of mathematical PDFs or UML topology. Preserve ADAPT's validation; investigate targeted analysis and compare models on the exact failure cases before making a provider decision. No provider, architecture or product policy was changed here.

## Method and reproducibility

The standalone [runner](../../nova-direct-probe/2026-10-06/run.mjs) uses only Node built-ins and the already-installed AWS SDK. It resolves the existing standard local AWS credential/region chain. It imports no ADAPT source module. Each original material is submitted in its own `ConverseCommand`: original PDF bytes as a native document block, original PNG bytes as an image block, plus a free-form comprehensive-understanding prompt. This follows the documented [Nova Converse API](https://docs.aws.amazon.com/nova/latest/userguide/using-converse-api.html).

Settings: temperature 0, maximum 10,000 output tokens, one SDK attempt per invocation, 180-second local deadline. No ADAPT six-section/output-size constraint or response contract was imposed. The prompt explicitly requests source-order coverage, important concepts, equations/steps/results, diagram endpoints/directions/multiplicities, code and uncertainty; it prohibits shallow summaries and invented content. The exact prompt, source hashes, settings, request IDs, usage, latency and all attempts are in the [manifest](../../nova-direct-probe/2026-10-06/manifest.json).

Full SDK responses and exact model text are saved without parsing, fence removal, repair, rejection, or content filtering. Error records omit credentials. Source inspection used pypdf and Poppler independently for human comparison; extracted text was **not** sent to Nova. All 18 binomial and 13 SDN pages were rendered and visually inspected through contact sheets, with detailed equation pages inspected at full render resolution. Original source files were not modified; no embedded links/actions were followed.

There were seven successful invocations and one initial DNS failure. Every successful response was HTTP 200 with `stopReason: end_turn`, not output-budget truncation. The focused controls were additional independent requests, not fabricated repairs to the original outputs.

## Raw responses and measurements

| Request | Input tokens | Output tokens | Latency | Raw model text | Full SDK response |
| --- | ---: | ---: | ---: | --- | --- |
| Binomial PDF, 18 pages, retry | 38,367 | 438 | 16.723 s | [raw text](../../nova-direct-probe/2026-10-06/binomial-pdf.attempt-2.raw.txt) | [JSON](../../nova-direct-probe/2026-10-06/binomial-pdf.attempt-2.response.json) |
| AI/ML in SDN PDF, 13 pages | 22,979 | 1,393 | 31.409 s | [raw text](../../nova-direct-probe/2026-10-06/sdn-pdf.raw.txt) | [JSON](../../nova-direct-probe/2026-10-06/sdn-pdf.response.json) |
| Hostel class-diagram PNG | 1,934 | 732 | 7.897 s | [raw text](../../nova-direct-probe/2026-10-06/hostel-diagram-image.raw.txt) | [JSON](../../nova-direct-probe/2026-10-06/hostel-diagram-image.response.json) |
| Factorial-recursion PNG | 1,966 | 660 | 5.583 s | [raw text](../../nova-direct-probe/2026-10-06/factorial-code-image.raw.txt) | [JSON](../../nova-direct-probe/2026-10-06/factorial-code-image.response.json) |
| Focused hostel-diagram control | 2,037 | 840 | 6.274 s | [raw text](../../nova-direct-probe/2026-10-06/hostel-diagram-focused-image.raw.txt) | [JSON](../../nova-direct-probe/2026-10-06/hostel-diagram-focused-image.response.json) |
| Focused native binomial-PDF control | 38,480 | 770 | 18.210 s | [raw text](../../nova-direct-probe/2026-10-06/binomial-focused-pdf.raw.txt) | [JSON](../../nova-direct-probe/2026-10-06/binomial-focused-pdf.response.json) |
| Binomial physical pages 8, 11, 13, 15 as images | 3,358 | 608 | 8.090 s | [raw text](../../nova-direct-probe/2026-10-06/binomial-pages-image-control.raw.txt) | [JSON](../../nova-direct-probe/2026-10-06/binomial-pages-image-control.response.json) |

The selected-page image control changes presentation and scope as well as supplying page labels. It is not a perfectly isolated PDF-versus-image experiment and does not reveal Bedrock's internal PDF processing. It tests whether clearer, narrowly scoped visual input rescues the observed mathematics omissions.

## Source comparison

### Binomial PDF

Source: `CSC203LL_Y2_01_08_Expanding Binomial Expressions.pdf`, 18 physical pages. Contains finite/generalized expansions, binomial coefficients, worked examples, numerical evaluation, coefficient/term exercises and negative/fractional-power examples. It has important displayed mathematics, not merely prose about the topic.

- Broad response recognized the topics but returned only 438 tokens. It omitted the actual worked polynomials, numeric evaluation, coefficient values, negative/fractional results, page inventory and uncertainty list despite explicit instructions and ample output allowance.
- Focused native-PDF response correctly supplied `(x+y)^5` and `16x^4 - 96x^3 + 216x^2 - 216x + 81`. It still omitted the shown `(-2.998)^4 ≈ 80.7842` evaluation and actual negative/fractional expansions, repeated its overview, and called `-20/8 x^6` a coefficient. The source's fourth-term coefficient is the scalar `-20/8 = -5/2`; the monomial is the full term.
- The source itself contains an error on physical page 11: a requested **5th** term is worked with index 5, producing the **6th** term `-870912 x^3 y^5`. The actual fifth term uses index 4 and is `1451520 x^4 y^4`. The source also has an apparent carried-over expression from the preceding exercise. The native focused response repeated the mislabeled source result without flagging it. This is an inherited source inconsistency, not a novel hallucinated coefficient.
- The image control correctly read page 8's quartic polynomial, but on page 11 changed `(2 - (1/4)x^2)^6` to `(2 - (1/4)x)^6`, changing a sixth-power term to a cubic one. Its second calculation wrote `70 × 256 × 81` then incorrectly simplified to `1470 × 256`.
- On physical page 13 it changed the source exponent **-4** in `(1+3x)^-4` to **+4**, while still giving the alternating infinite-series coefficients appropriate to the negative exponent. This is internally inconsistent and changes the content.
- On physical page 15 it gave the wrong cubic expression for `(1-2x)^(1/2)`. The displayed/source-correct first four terms are `1 - x - (1/2)x^2 - (1/2)x^3`; Nova's cubic expression loses factors and changes its sign. It nevertheless said it followed the source closely and preserved powers/signs/positions.

Independent reference arithmetic is recorded in [arithmetic-reference.json](../../nova-direct-probe/2026-10-06/arithmetic-reference.json). These calculations informed this assessment only; no Nova response was filtered or changed.

### AI/ML in SDN PDF

Source: `AI-and-Machine-Learning-in-SDN-SEN305.pdf`, 13 physical pages. Mainly prose, examples, questions and illustrative photographs/graphics; no technical equations, code listing or relationship diagram comparable to the UML image.

- Accurately covered the four objectives, automation/prediction/routing/security, supervised/unsupervised/reinforcement/deep learning, all four application categories and the four challenge categories.
- Preserved concrete examples such as link-failure prediction, clustering traffic flows, QoS adjustment, APT detection, telecom bandwidth allocation, switch rerouting, DDoS isolation and VM allocation. It also retained references and final multiple-choice/open questions. This is useful material-specific understanding rather than only a title summary.
- Omitted the mid-lesson unsupervised-anomaly question (page 7), the reflective question about AI-driven network decisions (page 2), the train-network analogy (page 3), and page-by-page inventory. These are learning interactions/context missing from a supposedly comprehensive read.
- Its closing claim that there are no specific use cases conflicts with the source's examples and its own earlier explanation. Absence of named implementations/trained models is different from absence of use cases.
- Illustrative imagery was not meaningfully described. There is no basis here to claim that it understood complex PDF diagrams/tables, because this document does not test them.

### Hostel class-diagram image

Source: `Untitled-Diagram-drawio-draw-io-07-08-2026_01_57_PM.png`, original 880 × 694 image.

- Broad response identified all eight classes and many attributes/methods, but omitted types and several important details. It renamed the visible Hostel method `remove()` to `removeRoom()` and omitted Room's `checkAvailability()`.
- It attached the **manages** label to Hostel→Room, whereas the visible manages connection is between Hostel Administrator and Hostel. It invented a Hostel Application→Room Allocation **Use** relationship; the dashed Use connection is Room Allocation→Payment. It omitted inheritance and endpoint multiplicities.
- The focused control recovered most names/types/methods, but invented Hostel→Person and Hostel Administrator→Room connections, reversed the inheritance meaning into “Person is a Student”/“Person is a Hostel Administrator,” and again misidentified associations/dependencies. Source lines point upward from the two specializations toward Person; there is no Hostel→Person line.
- It asserted an application/payment multiplicity `0..*` where the visible connection has `1` at both ends. It did not faithfully inventory both endpoint multiplicities or the visible diamond/dashed dependency symbols, despite the focused request.
- Both responses asserted no unreadable/ambiguous content rather than marking uncertain connections. Class-label OCR is useful; it is not proof of relationship fidelity. The directly observed false connections would change the competency being taught.

### Factorial-recursion code image

Source: `codex-clipboard-e19ef0cd-7dec-4431-a893-4b3cce537c3a.png`, original 774 × 594 image.

- Correctly identified Java, `FactorialRecursion`, the `n == 0 || n == 1` base case, `return n * factorial(n - 1)`, the main-method input 5, and factorial result 120.
- Produced a faithful operational code listing and explained the recursion/base/recursive cases. It rewrote/added comments rather than making a completely literal transcription.
- The opening “single method” description is inaccurate: both `factorial` and `main` are visible and later explained. It did not supply a detailed call/unwind trace.
- This is positive evidence for this short familiar code example, not validation of arbitrary code, programs or execution. No code from the image or Nova response was executed.

## Error and limits

The initial binomial request failed locally with `ERR_HTTP2_STREAM_CANCEL`, caused by `getaddrinfo ENOTFOUND bedrock-runtime.eu-north-1.amazonaws.com`. There was no Bedrock HTTP response for that attempt. [The actual safe error](../../nova-direct-probe/2026-10-06/binomial-pdf.error.json) is preserved; retry succeeded. Successful calls establish working authentication/model access for this probe. No region/profile/credential changes were made.

Seven completed calls across four original materials and three focused controls are not a statistical benchmark. Temperature 0 does not establish repeatability. No opaque quality score is assigned. The results demonstrate observed strengths, omissions and concrete errors, and separate source mistakes, local transport failure and model-output quality from ADAPT implementation behavior.

Production ADAPT code, dependencies and original source files were unchanged. Only standalone diagnostic artifacts were created beside the repository and this evidence report was added. The runner passes `node --check`; requests and comparisons were actually executed. Application lint/build/E2E were not rerun because there is no application-code change.

## Reproduce without overwriting prior attempts

Run from the `adapt` repository, using the existing AWS setup:

```powershell
node --env-file-if-exists=.env.local ../nova-direct-probe/2026-10-06/run.mjs
node --env-file-if-exists=.env.local ../nova-direct-probe/2026-10-06/run.mjs --only=binomial-pdf
node --env-file-if-exists=.env.local ../nova-direct-probe/2026-10-06/run.mjs --focus-diagram
node --env-file-if-exists=.env.local ../nova-direct-probe/2026-10-06/run.mjs --focus-math
node --env-file-if-exists=.env.local ../nova-direct-probe/2026-10-06/run.mjs --math-image-control
```

Each command makes real paid calls; no need to run all commands just to read the saved results. Later attempts get separate filenames and append to the manifest. Run commands sequentially because they share that manifest. The image control requires the already-prepared local page renderings; `inspect-sources.py` reproduces them with the bundled Python/pypdf/Pillow and available Poppler.
