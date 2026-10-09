"use client";
import { Readable } from "./read-aloud";
import type { ReviewPage, ReviewSummary } from "@/lib/material-review/types";
import { readinessLabels } from "@/lib/material-review/types";

export function MaterialReview({ summary, page, onPage, busy }: { summary: ReviewSummary; page?: ReviewPage; onPage(index: number): void; busy: boolean }) {
  const quality = summary.quality;
  return <>
    <Readable label="Material quality" units={[`${readinessLabels[quality.readiness]}.`, `${quality.coverage?.textUnits ?? 0} of ${quality.coverage?.expectedUnits ?? 0} source pages contain extracted text. This is text coverage, not proof of content understanding.`]}>
      <p className="badge">{readinessLabels[quality.readiness]}</p>
      <p>{quality.coverage?.textUnits ?? 0} of {quality.coverage?.expectedUnits ?? 0} source pages contain extracted text.</p>
      <p className="small">Text coverage does not measure how much of the lesson ADAPT understands. Review status: {summary.reviewStatus === "confirmed" ? "Confirmed for selectable-text scope" : "Awaiting acceptance of text scope"}.</p>
    </Readable>
    <h3>Limitations to review</h3>
    <ul className="review-reasons">{quality.reasons.map(reason => {
      const pages = reason.unitIds.map(id => quality.units.find(unit => unit.id === id)?.locator.index).filter(index => index !== undefined);
      const where = pages.length ? `Source ${pages.length === 1 ? "page" : "pages"} ${pages.join(", ")}.` : "Whole material.";
      return <li key={reason.id}><Readable label={`${reason.severity === "blocking" ? "Blocking issue" : "Material warning"}: ${where}`} units={[where, reason.learnerMessage]}>
        <strong>{reason.severity === "blocking" ? "Prevents confirmation" : "Warning"} · {where}</strong><p>{reason.learnerMessage}</p>
      </Readable></li>;
    })}</ul>
    {quality.readiness === "not-ready" && <Readable label="Material blocked" units={["This material cannot proceed to accommodation. You can inspect the extracted pages, but ADAPT will not omit or repair uncertain content. Try another accessible source."]}><p className="review-blocked">This material cannot proceed to accommodation. You can inspect the extracted pages, but ADAPT will not omit or repair uncertain content. Try another accessible source.</p></Readable>}
    <h3>Extracted pages</h3>
    <label htmlFor="review-page">Source page to review</label>{" "}
    <select id="review-page" value={page?.unit.locator.index ?? ""} onChange={event => onPage(Number(event.target.value))} disabled={busy}>
      <option value="" disabled>Choose a page</option>
      {quality.units.map(unit => <option key={unit.id} value={unit.locator.index}>Page {unit.locator.index}{unit.locator.label ? ` (source label ${unit.locator.label})` : ""}</option>)}
    </select>
    <p className="small">Original page numbers are preserved. No pages have been omitted.</p>
    {page && <section aria-labelledby="review-page-heading" className="review-page">
      <h4 id="review-page-heading">Source page {page.unit.locator.index}{page.unit.locator.label ? ` · Source label ${page.unit.locator.label}` : ""}</h4>
      <p className="small">Extracted text · not AI-generated. Paragraph boundaries and headings may be inferred from layout.</p>
      {!page.blocks.length ? <Readable label="Empty source page" units={[`Source page ${page.unit.locator.index} has no extracted selectable text. Visual content has not been understood.`]}><p>No selectable text was extracted from this page. Its visual content has not been understood.</p></Readable>
        : page.blocks.map((block, index) => <article key={block.id} className="review-block" data-source-block={block.id}>
          <p className="small">Page {page.unit.locator.index} · Extracted block {index + 1} · {block.structureBasis === "document-tags" ? "Structure from document tags" : "Heuristic or unverified structure"}</p>
          <Readable label={`Source page ${page.unit.locator.index}, extracted block ${index + 1}`} units={[`Extracted text from source page ${page.unit.locator.index}.`, block.text]}><p className="extracted-text">{block.text}</p></Readable>
        </article>)}
    </section>}
  </>;
}


