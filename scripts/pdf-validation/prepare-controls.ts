import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { textPdf, unicodePdf, encryptedPdf } from "../../tests/fixtures/pdf";
async function main() {
  const filename = "docs/pdf-validation/manifest.json";
  const manifest = JSON.parse(await readFile(filename, "utf8"));
  const controls = [
    { id: "tagged-heading-list", bytes: textPdf([["Learning together", "A complete statement.", "1. Observe the source.", "2. Explain the idea."]], true), categories: ["headings", "lists", "document-tags"], expected: { outcome: "text", pages: 1, anchors: ["Learning together", "A complete statement.", "1. Observe the source.", "2. Explain the idea."], profile: "Existing independent tagged control: heading and list structure should survive.", exactBlocks: ["Learning together", "A complete statement.", "1. Observe the source.", "2. Explain the idea."] } },
    { id: "unicode-cmap", bytes: unicodePdf(), categories: ["unicode", "non-latin", "font-cmap"], expected: { outcome: "text", pages: 1, anchors: ["Café — ‘complete’ sentences! Ω, β, and Ж survive."], profile: "Existing exact ToUnicode mapping control.", exactBlocks: ["Café — ‘complete’ sentences! Ω, β, and Ж survive."] } },
    { id: "encrypted-control", bytes: encryptedPdf(), categories: ["password-protected"], expected: { outcome: "PASSWORD_PROTECTED", pages: 1, profile: "Existing genuine encrypted fixture; no password should be requested or invented." } },
    { id: "empty-control", bytes: new Uint8Array(), categories: ["empty"], expected: { outcome: "EMPTY_INPUT", pages: 0, profile: "No successful empty lesson." } },
  ];
  manifest.documents = manifest.documents.filter((document: { id: string }) => !controls.some(control => control.id === document.id));
  for (const control of controls) {
    const file = `.pdf-corpus-cache/${control.id}.pdf`;
    await writeFile(file, control.bytes);
    manifest.documents.push({ id: control.id, file, sha256: createHash("sha256").update(control.bytes).digest("hex"), bytes: control.bytes.byteLength, categories: control.categories,
      source: { kind: "synthetic", license: "Project-owned existing spike fixture" }, sourcePageCount: control.expected.pages, sourcePageMap: control.expected.pages ? [1] : [], expected: control.expected,
      independentInventory: { basis: "Known fixture construction", tagged: control.id === "tagged-heading-list" } });
  }
  await writeFile(filename, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Registered ${controls.length} existing spike controls; ${manifest.documents.length} total corpus documents.`);
}
void main().catch(() => { console.error("Corpus control preparation failed."); process.exitCode = 1; });
