"""Prepare public/synthetic, non-private PDFs and independent expected profiles.
Evaluation-only dependencies: pypdf 6.10.0, reportlab 4.4.9, Pillow 12.3.0.
No application dependency or extraction implementation is changed.
"""
import hashlib
import io
import json
import logging
from pathlib import Path
import urllib.request

import PIL
from PIL import Image, ImageDraw, ImageFont
import pypdf
from pypdf import PdfReader, PdfWriter
import reportlab
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[2]
logging.getLogger("pypdf").setLevel(logging.CRITICAL)
CACHE = ROOT / ".pdf-corpus-cache"
OUT = ROOT / "docs/pdf-validation"
CACHE.mkdir(exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
records = []
font_path = Path("C:/Windows/Fonts/arial.ttf")
if not font_path.exists():
    raise RuntimeError("Set up an equivalent Unicode TrueType font before preparing this Windows corpus")
pdfmetrics.registerFont(TTFont("CorpusUnicode", str(font_path)))

def register(doc_id, data, categories, expectation, source=None, page_map=None):
    target = CACHE / f"{doc_id}.pdf"
    target.write_bytes(data)
    independent = {"parser": "pypdf", "version": pypdf.__version__}
    try:
        reader = PdfReader(io.BytesIO(data))
        count = len(reader.pages)
        independent.update(pageCount=count, encrypted=reader.is_encrypted,
                           tagged="/StructTreeRoot" in reader.trailer["/Root"])
        # Retain counts, not source text. pypdf is an independent inventory aid,
        # not an oracle for visual reading order or mathematical meaning.
        independent["pageCharacters"] = [len(page.extract_text() or "") for page in reader.pages] if count <= 20 else None
    except Exception:
        count = expectation.get("pages")
        independent["unreadable"] = True
    records.append({"id": doc_id, "file": str(target.relative_to(ROOT)).replace("\\", "/"),
                    "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
                    "categories": categories, "source": source or {"kind": "synthetic", "license": "Project-owned validation fixture"},
                    "sourcePageCount": count, "sourcePageMap": page_map or list(range(1, (count or 0) + 1)),
                    "expected": expectation, "independentInventory": independent})

def pdf(draw):
    output = io.BytesIO()
    c = canvas.Canvas(output, pagesize=(612, 792), pageCompression=1, invariant=1)
    c.setTitle("Synthetic educational validation material")
    draw(c)
    c.save()
    return output.getvalue()

def lines(c, entries, font="Helvetica", x=50, y=740, step=18):
    c.setFont(font, 12)
    for index, text in enumerate(entries):
        c.drawString(x, y - index * step, text)

def expected(pages=1, anchors=None, **kwargs):
    return {"outcome": "text", "pages": pages, "anchors": anchors or [],
            "profile": "Selectable text should survive; layout labels are inferred, not authoritative.", **kwargs}

clean = ["Lecture: learning with evidence.", "We observe the source before drawing a conclusion.", "A second statement explains the same idea.", "1. Observe the material.", "2. Explain the evidence."]
register("lecture-clean", pdf(lambda c: lines(c, clean)), ["lecture-notes", "headings", "lists", "single-column", "compressed-streams"], expected(anchors=clean))

left = ["LEFT1: First idea.", "LEFT2: Second idea.", "LEFT3: Conclusion."]
right = ["RIGHT1: Another idea.", "RIGHT2: Evidence.", "RIGHT3: Summary."]
def columns(c, interleaved):
    c.setFont("Helvetica", 11)
    for index in range(3):
        c.drawString(45, 700 - index * 20, left[index])
        if interleaved:
            c.drawString(320, 700 - index * 20, right[index])
    if not interleaved:
        for index in range(3):
            c.drawString(320, 700 - index * 20, right[index])
for mode in [False, True]:
    register("columns-interleaved" if mode else "columns-ordered", pdf(lambda c, m=mode: columns(c, m)),
             ["multi-column", "poorly-structured" if mode else "clean-layout"],
             expected(anchors=left + right, order=left + right, requireWarning="READING_ORDER_UNCERTAIN",
                      profile="Visual columns read left top-to-bottom then right. Interleaved painting order must not be mistaken for verified reading order."))

def table(c):
    c.setFont("Helvetica", 12)
    c.drawString(50, 740, "Table: study resources.")
    for i, row in enumerate([("Material", "Pages", "Minutes"), ("Notes", "4", "15"), ("Chapter", "8", "30")]):
        for x, cell in zip([50, 230, 370], row):
            c.drawString(x, 700 - i * 22, cell)
    for y in [715, 690, 668, 644]:
        c.line(45, y, 470, y)
register("table-untagged", pdf(table), ["tables", "untagged-visual-structure"], expected(anchors=["Material", "Notes", "Chapter"], unsupported=["table cell associations"], profile="Cell labels may extract; row/column semantics are not supported and must not be inferred from success."))

def maths(c):
    lines(c, ["Lecture: mathematics notation."])
    c.drawString(50, 690, "E = mc")
    c.setFont("Helvetica", 8); c.drawString(92, 697, "2")
    c.setFont("Helvetica", 12); c.drawString(50, 650, "f(x) =")
    c.drawString(100, 661, "x + 1"); c.line(97, 655, 140, 655); c.drawString(114, 640, "2")
    c.setFont("CorpusUnicode", 12); c.drawString(50, 600, "Σ, ∫, Ω and β are notation, not interpreted equations.")
register("maths-layout", pdf(maths), ["mathematical-notation", "superscript", "fractions", "unicode"], expected(anchors=["Lecture: mathematics notation."], unsupported=["formula structure", "fraction/superscript semantics"], profile="Glyphs may survive; equation structure and meaning are explicitly unsupported."))

def diagram(c):
    lines(c, ["Diagram: water movement.", "Labels describe the drawing but not its arrows."])
    for x, label in [(120, "Reservoir"), (360, "Field")]:
        c.rect(x - 40, 580, 110, 50); c.drawString(x - 30, 600, label)
    c.line(190, 605, 315, 605); c.line(315, 605, 305, 613); c.line(315, 605, 305, 597)
register("diagram-labelled", pdf(diagram), ["diagrams", "vector-graphics"], expected(anchors=["Reservoir", "Field"], unsupported=["arrow relationship"], profile="Labels are extractable; the relationship shown by the arrow is not represented."))

code = ["def total(values):", "    result = 0", "    for value in values:", "        result += value", "    return result"]
register("code-indentation", pdf(lambda c: lines(c, code, font="Courier", step=14)), ["source-code", "indentation"], expected(anchors=[line.strip() for line in code], exactBlocks=code, unsupported=["executable code semantics"], profile="Lexical code should survive, but preserving line boundaries and indentation is essential; detect normalization losses."))

unicode = "Café — naïve; ‘quoted’ words. Ω, β, Ж; résumé!"
register("unicode-embedded-font", pdf(lambda c: lines(c, [unicode], font="CorpusUnicode")), ["unicode", "embedded-font", "punctuation"], expected(anchors=[unicode], exactBlocks=[unicode]))

def shuffled(c):
    c.setFont("Helvetica", 12)
    words = [("Learning", 50), ("needs", 110), ("clear", 150), ("evidence.", 185)]
    for index in [2, 0, 3, 1]:
        word, x = words[index]; c.drawString(x, 700, word)
register("poor-paint-order", pdf(shuffled), ["poorly-structured", "reading-order"], expected(anchors=["Learning", "needs", "clear", "evidence."], order=["Learning", "needs", "clear", "evidence."], profile="Visually coherent sentence; scrambled content-stream order is an inherent source difficulty that should be warned about."))

scan = Image.new("RGB", (1224, 1584), "white")
ImageDraw.Draw(scan).multiline_text((100, 140), "Lecture: observation\n1. Read the material.\n2. Explain the evidence.\nThis page is a scan, not selectable text.", font=ImageFont.truetype(str(font_path), 32), fill="black", spacing=22)
def scanned(c):
    c.drawImage(ImageReader(scan), 0, 0, width=612, height=792)
register("scan-image-only", pdf(scanned), ["scanned", "image-only"], {"outcome": "NO_READABLE_TEXT", "pages": 1, "profile": "A legible rasterized lesson without OCR must fail honestly, not become an empty lesson."})
def mixed(c):
    lines(c, clean); c.showPage(); scanned(c)
register("mixed-text-scan", pdf(mixed), ["lecture-notes", "scanned", "mixed-pages"], expected(pages=2, anchors=clean, coverage="partial", emptyPages=[2], profile="First page extracts; second raster page is empty with page-specific NO_PAGE_TEXT."))

def repeated(c):
    for page in range(3):
        lines(c, ["Course notes", f"Lesson section {page + 1}.", "This page contains a complete explanation."])
        c.drawString(50, 40, "Learning department - course handout")
        c.showPage()
register("repeated-boilerplate", pdf(repeated), ["lecture-notes", "headers", "footers", "repetition"], expected(pages=3, anchors=["Lesson section 1.", "Lesson section 2.", "Lesson section 3."], profile="Repeated headers/footer are source boilerplate; repetition detection is a review signal, not proof of parser duplication."))

# Boundary fixtures derived from valid bytes, with provenance recorded.
valid = pdf(lambda c: lines(c, clean))
register("truncated", valid[:-80], ["malformed"], {"outcome": "INVALID_PDF", "pages": 1, "profile": "Missing trailer should fail validation; incomplete source."})
register("leading-junk", b"JUNK\n" + valid, ["recoverable-nonstandard"], {"outcome": "NOT_PDF", "pages": 1, "profile": "The spike deliberately rejects leading junk; independent parser recoverability does not make this a library failure."})
register("over-page-budget", pdf(lambda c: [(lines(c, [f"Page {i + 1}: bounded lesson."]), c.showPage()) for i in range(21)]), ["resource-boundary"], {"outcome": "RESOURCE_LIMIT", "pages": 21, "profile": "Valid PDF rejected by the current 20-page policy, not failed extraction quality."})

sources = [
    ("mit-probability-slides", "https://ocw.mit.edu/courses/6-041-probabilistic-systems-analysis-and-applied-probability-spring-2006/e93a3d8242ae1c6e75f7ea9c0a2aa3bf_lec01.pdf", ["lecture-notes", "slide-deck", "tables", "mathematics", "diagrams", "lists"], "MIT OCW, 6.041 Spring 2006 lecture 1", "CC BY-NC-SA 4.0 (OCW terms; retain attribution)", expected(pages=14, anchors=["Motivation", "Sample Space"], unsupported=["table associations", "diagram relationships", "formula semantics"], profile="Text-heavy slides with tables/visuals; fragmented bullets and labels are likely. No claim of interpreting visuals.")),
    ("mit-theory-slides", "https://ocw.mit.edu/courses/18-175-theory-of-probability-spring-2014/e793116b0f70b437cca5e9cf75754cab_MIT18_175S14_Lecture1.pdf", ["slide-deck", "mathematical-notation", "unicode"], "MIT OCW, 18.175 Spring 2014 lecture 1", "CC BY-NC-SA 4.0 (OCW terms; retain attribution)", expected(pages=12, anchors=["Probability"], unsupported=["equation meaning"], profile="Mathematical slides; extracted symbols do not preserve all mathematical structure.")),
    ("attention-paper", "https://arxiv.org/pdf/1706.03762v7", ["academic-paper", "multi-column", "tables", "mathematics", "diagrams", "embedded-fonts"], "Vaswani et al., Attention Is All You Need, arXiv 1706.03762v7", "Public arXiv copy; local evaluation only, do not redistribute source PDF", expected(pages=15, anchors=["Abstract", "Introduction"], unsupported=["tables", "equations", "diagram meaning"], profile="Long-form scientific paper with complex visual material; layout order and line breaks require source comparison.")),
    ("think-python-full", "https://greenteapress.com/thinkpython2/thinkpython2.pdf", ["textbook", "over-page-budget", "source-code"], "Allen B. Downey, Think Python 2e, version 2.4.0", "CC BY-NC 3.0", {"outcome": "RESOURCE_LIMIT", "pages": 244, "profile": "Complete open textbook exceeds 20 pages; evaluate selected chapters separately without changing application limits."}),
]
for doc_id, url, categories, title, license_text, expectation in sources:
    target = CACHE / f"{doc_id}.pdf"
    if target.exists():
        data = target.read_bytes()
    else:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ADAPT-PDF-Validation/1.0"}), timeout=30) as response:
            data = response.read(20 * 1024 * 1024 + 1)
        if len(data) > 20 * 1024 * 1024 or not data.startswith(b"%PDF-"):
            raise RuntimeError(f"Public fixture download rejected: {doc_id}")
    register(doc_id, data, categories, expectation, {"kind": "public", "title": title, "url": url, "license": license_text})
    if doc_id == "think-python-full":
        reader = PdfReader(io.BytesIO(data))
        # Chapter 2 boundaries are located from source text, not ADAPT output.
        start = next(i for i, p in enumerate(reader.pages) if (p.extract_text() or "").startswith("Chapter 2\n"))
        end = next(i for i in range(start + 1, len(reader.pages)) if (reader.pages[i].extract_text() or "").startswith("Chapter 3\n"))
        writer = PdfWriter()
        for page in reader.pages[start:end]: writer.add_page(page)
        output = io.BytesIO(); writer.write(output)
        register("think-python-chapter2", output.getvalue(), ["textbook-chapter", "headings", "source-code", "mathematics", "embedded-fonts"], expected(pages=end - start, anchors=["Variables", "Debugging"], unsupported=["code indentation semantics", "mathematical structure"], profile="Real textbook chapter; expect running headers, line hyphenation, code and prose. Verify boundaries rather than equating text volume with understanding."), {"kind": "public-excerpt", "title": title + ", chapter 2", "url": url, "license": license_text, "derivation": f"pypdf {pypdf.__version__}, original physical pages {start + 1}-{end}"}, list(range(start + 1, end + 1)))

manifest = {"schemaVersion": 1, "generator": {"pypdf": pypdf.__version__, "reportlab": reportlab.Version, "Pillow": PIL.__version__, "fontSha256": hashlib.sha256(font_path.read_bytes()).hexdigest()}, "documents": records}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Prepared {len(records)} corpus documents; only fixture counts are logged.")
