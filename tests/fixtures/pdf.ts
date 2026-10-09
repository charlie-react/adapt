// Small, deterministic, standards-based PDF fixtures built in memory. No generator dependency.
import { createHash } from "node:crypto";
class PdfBuilder {
  objects: Buffer[] = [];
  add(value = "") { this.objects.push(Buffer.from(value, "latin1")); return this.objects.length; }
  set(id: number, value: string | Buffer) { this.objects[id - 1] = typeof value === "string" ? Buffer.from(value, "latin1") : value; }
  stream(value: Buffer, attributes = "") { return this.add(`<< /Length ${value.length} ${attributes} >>\nstream\n${value.toString("latin1")}\nendstream`); }
  build(root: number, trailer = "") {
    const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    const offsets = [0];
    for (const [index, object] of this.objects.entries()) {
      offsets.push(chunks.reduce((length, chunk) => length + chunk.length, 0));
      chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "ascii"), object, Buffer.from("\nendobj\n"));
    }
    const xref = chunks.reduce((length, chunk) => length + chunk.length, 0);
    chunks.push(Buffer.from(`xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${this.objects.length + 1} /Root ${root} 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`));
    return new Uint8Array(Buffer.concat(chunks));
  }
}
const encode = (text: string) => text.replace(/[\\()]/g, "\\$&");
export function textPdf(pages: string[][] = [["Understanding learning.", "A complete sentence. Another complete sentence!"]], tagged = false): Uint8Array {
  const pdf = new PdfBuilder();
  const catalog = pdf.add(), pageTree = pdf.add();
  const font = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const structure = tagged ? pdf.add() : undefined;
  const pageIds: number[] = [], allElements: number[] = [], parents: string[] = [];
  for (const [pageIndex, lines] of pages.entries()) {
    const page = pdf.add(); pageIds.push(page);
    const elements: number[] = [];
    const text = lines.map((line, index) => {
      const role = index === 0 ? "H1" : /^\d+[.)]/.test(line) ? "LI" : "P";
      if (tagged) {
        const element = pdf.add(`<< /Type /StructElem /S /${role} /P ${structure} 0 R /Pg ${page} 0 R /K ${index} >>`);
        elements.push(element); allElements.push(element);
      }
      const size = index === 0 ? 18 : 12;
      return `${tagged ? `/${role} <</MCID ${index}>> BDC\n` : ""}BT /F1 ${size} Tf 50 ${750 - index * 30} Td (${encode(line)}) Tj ET${tagged ? "\nEMC" : ""}`;
    }).join("\n");
    const stream = pdf.stream(Buffer.from(text, "latin1"));
    pdf.set(page, `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R ${tagged ? `/StructParents ${pageIndex}` : ""} >>`);
    parents.push(`${pageIndex} [${elements.map(id => `${id} 0 R`).join(" ")}]`);
  }
  if (structure) pdf.set(structure, `<< /Type /StructTreeRoot /K [${allElements.map(id => `${id} 0 R`).join(" ")}] /ParentTree << /Nums [${parents.join(" ")}] >> >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pageTree} 0 R /Lang (en-NG) /PageLabels << /Nums [0 << /S /r >> 1 << /S /D /St 5 >>] >> ${structure ? `/MarkInfo << /Marked true >> /StructTreeRoot ${structure} 0 R` : ""} >>`);
  pdf.set(pageTree, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`);
  return pdf.build(catalog);
}
export function unicodePdf(): Uint8Array {
  const text = "Café — ‘complete’ sentences! Ω, β, and Ж survive.";
  const pdf = new PdfBuilder();
  const catalog = pdf.add(), pages = pdf.add(), page = pdf.add();
  const chars = [...new Set([...text])];
  const hex = (value: number) => value.toString(16).padStart(4, "0");
  const cmap = pdf.stream(Buffer.from(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /TestUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chars.length} beginbfchar\n${chars.map((char, index) => `<${hex(index + 1)}> <${Buffer.from(char, "utf16le").swap16().toString("hex")}>`).join("\n")}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`));
  const descriptor = pdf.add("<< /Type /FontDescriptor /FontName /TestUnicode /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>");
  const descendant = pdf.add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestUnicode /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 500 /CIDToGIDMap /Identity >>`);
  const font = pdf.add(`<< /Type /Font /Subtype /Type0 /BaseFont /TestUnicode /Encoding /Identity-H /DescendantFonts [${descendant} 0 R] /ToUnicode ${cmap} 0 R >>`);
  const stream = pdf.stream(Buffer.from(`BT /F1 12 Tf 50 700 Td <${[...text].map(char => hex(chars.indexOf(char) + 1)).join("")}> Tj ET`));
  pdf.set(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`);
  pdf.set(pages, `<< /Type /Pages /Count 1 /Kids [${page} 0 R] >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  return pdf.build(catalog);
}
export function imageOnlyPdf(): Uint8Array {
  const pdf = new PdfBuilder();
  const catalog = pdf.add(), pages = pdf.add(), page = pdf.add();
  const image = pdf.stream(Buffer.from([0, 0, 0]), "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8");
  const stream = pdf.stream(Buffer.from("q 150 0 0 150 50 500 cm /Im1 Do Q"));
  pdf.set(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 ${image} 0 R >> >> /Contents ${stream} 0 R >>`);
  pdf.set(pages, `<< /Type /Pages /Count 1 /Kids [${page} 0 R] >>`); pdf.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  return pdf.build(catalog);
}
// PDF standard security handler revision 2: a genuinely encrypted one-page PDF.
function rc4(key: Buffer, data: Buffer): Buffer {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + state[i] + key[i % key.length]) % 256; [state[i], state[j]] = [state[j], state[i]]; }
  let i = 0; j = 0;
  return Buffer.from([...data].map(byte => { i = (i + 1) % 256; j = (j + state[i]) % 256; [state[i], state[j]] = [state[j], state[i]]; return byte ^ state[(state[i] + state[j]) % 256]; }));
}
export function encryptedPdf(): Uint8Array {
  const pad = Buffer.from("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a", "hex");
  const password = (text: string) => Buffer.concat([Buffer.from(text), pad]).subarray(0, 32);
  const md5 = (value: Buffer) => createHash("md5").update(value).digest();
  const owner = rc4(md5(password("fixture-owner")).subarray(0, 5), password("fixture-reader"));
  const permissions = Buffer.alloc(4); permissions.writeInt32LE(-4);
  const id = Buffer.alloc(16, 7);
  const key = md5(Buffer.concat([password("fixture-reader"), owner, permissions, id])).subarray(0, 5);
  const user = rc4(key, pad);
  const pdf = new PdfBuilder();
  const catalog = pdf.add(), pages = pdf.add(), page = pdf.add();
  const font = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const streamId = pdf.objects.length + 1;
  const suffix = Buffer.from([streamId, 0, 0, 0, 0]);
  const streamKey = md5(Buffer.concat([key, suffix])).subarray(0, 10);
  const stream = pdf.stream(rc4(streamKey, Buffer.from("BT /F1 12 Tf 50 700 Td (Private test text.) Tj ET")));
  const encryption = pdf.add(`<< /Filter /Standard /V 1 /R 2 /O <${owner.toString("hex")}> /U <${user.toString("hex")}> /P -4 >>`);
  pdf.set(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`);
  pdf.set(pages, `<< /Type /Pages /Count 1 /Kids [${page} 0 R] >>`); pdf.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  return pdf.build(catalog, `/Encrypt ${encryption} 0 R /ID [<${id.toString("hex")}> <${id.toString("hex")}>]`);
}
