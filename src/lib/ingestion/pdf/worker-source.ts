// Static application code, never constructed from PDF content. The worker has no
// URL/file input API: only the validated byte array is supplied to PDF.js.
export const pdfWorkerSource = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  let pdf;
  try {
    const { getDocumentProxy, getResolvedPDFJS } = await import(workerData.moduleUrl);
    const module = await getResolvedPDFJS();
    pdf = await getDocumentProxy(workerData.bytes, {
      verbosity: 0, isEvalSupported: false, stopAtErrors: true,
      useSystemFonts: false, useWorkerFetch: false, useWasm: false,
      disableFontFace: true,
    });
    if (!pdf.numPages) { parentPort.postMessage({ ok: false, code: "NO_READABLE_TEXT" }); return; }
    if (pdf.numPages > workerData.limits.maxPages) { parentPort.postMessage({ ok: false, code: "RESOURCE_LIMIT" }); return; }
    const labels = await pdf.getPageLabels();
    const pages = [];
    let characters = 0, itemCount = 0, structureCount = 0, language;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: true });
      const tree = await page.getStructTree();
      const roles = new Map(), pending = tree ? [[tree, undefined]] : [];
      let unsupportedStructure = false;
      while (pending.length) {
        if (++structureCount > workerData.limits.maxItems) throw Object.assign(new Error(), { code: "RESOURCE_LIMIT" });
        const [node, inherited] = pending.pop();
        const role = /^H[1-6]$|^P$|^LBody$|^LI$/.test(node.role || "") ? node.role : inherited;
        if (/^(Table|Figure|Formula|Code)$/.test(node.role || "")) unsupportedStructure = true;
        if (node.type === "content" && typeof node.id === "string") roles.set(node.id, role);
        for (const child of node.children || []) pending.push([child, role]);
      }
      const items = [], marks = [];
      for (const item of content.items) {
        if (++itemCount > workerData.limits.maxItems) throw Object.assign(new Error(), { code: "RESOURCE_LIMIT" });
        if (typeof item.str !== "string") {
          if (item.type === "endMarkedContent") marks.pop();
          else if (item.type === "beginMarkedContent" || item.type === "beginMarkedContentProps") marks.push(item.id);
          continue;
        }
        characters += item.str.length;
        if (characters > workerData.limits.maxCharacters) throw Object.assign(new Error(), { code: "RESOURCE_LIMIT" });
        const t = item.transform;
        if (!Array.isArray(t) || !t.every(Number.isFinite)) throw new Error("Invalid text coordinates");
        const structureId = roles.has(marks.at(-1)) ? marks.at(-1) : undefined;
        items.push({ text: item.str, x: t[4], y: t[5], width: item.width, fontSize: Math.hypot(t[2], t[3]), hasEOL: item.hasEOL, direction: item.dir, role: roles.get(structureId), structureId, rotated: Math.abs(t[1]) > .1 || Math.abs(t[2]) > .1 });
      }
      if (!language && typeof content.lang === "string" && /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(content.lang)) language = content.lang;
      pages.push({ pageNumber, pageLabel: typeof labels?.[pageNumber - 1] === "string" ? labels[pageNumber - 1].slice(0, 64) : undefined, items, tagged: !!tree, unsupportedStructure });
      page.cleanup();
    }
    parentPort.postMessage({ ok: true, pdf: { pages, sourcePageCount: pdf.numPages, language, pdfjsVersion: module.version } });
  } catch (error) {
    const code = error?.code === "RESOURCE_LIMIT" ? "RESOURCE_LIMIT" : error?.name === "PasswordException" ? "PASSWORD_PROTECTED" : error?.name === "InvalidPDFException" || error?.name === "FormatError" ? "INVALID_PDF" : "EXTRACTION_FAILED";
    parentPort.postMessage({ ok: false, code });
  } finally { if (pdf) await pdf.destroy(); }
})().catch(() => parentPort.postMessage({ ok: false, code: "EXTRACTION_FAILED" }));
`;
