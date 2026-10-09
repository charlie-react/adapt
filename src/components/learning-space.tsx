"use client";
import { useState } from "react";
import type { ReviewPage, ReviewSummary } from "@/lib/material-review/types";
import { Readable } from "./read-aloud";

export function LearningSpace({ summary, page, busy, onPage }: { summary: ReviewSummary; page?: ReviewPage; busy: boolean; onPage(index: number): void }) {
  const [section, setSection] = useState(0);
  const one = summary.session?.preferences?.readingStyle === "one-section";
  const blocks = page ? one ? page.blocks.slice(section, section + 1) : page.blocks : [];
  return <div className="learning-reader">
    <div className="reader-toolbar"><label htmlFor="learning-page">From your material</label><select id="learning-page" value={page?.unit.locator.index ?? ""} disabled={busy} onChange={event => { setSection(0); onPage(Number(event.target.value)); }}><option value="" disabled>Choose a page</option>{summary.quality.units.map(unit => <option key={unit.id} value={unit.locator.index}>Page {unit.locator.index}</option>)}</select><span className="small">{one ? "One section at a time" : "Comfortable reading"}</span></div>
    {!page && <p>Loading your reading space…</p>}
    {page && <>
      <p className="reader-source">Source page {page.unit.locator.index}{page.unit.locator.label ? ` · Original label ${page.unit.locator.label}` : ""}</p>
      {blocks.map(block => <article key={block.id} data-source-block={block.id}><Readable label={`Learning text, page ${page.unit.locator.index}, section ${block.sourceIndex}`} units={[`From source page ${page.unit.locator.index}.`, block.text]}><p className="learning-text">{block.text}</p></Readable></article>)}
      {one && page.blocks.length > 1 && <div className="section-navigation"><button type="button" className="quiet-action" disabled={section === 0 || busy} onClick={() => setSection(section - 1)}>Previous section</button><span>Section {section + 1} of {page.blocks.length}</span><button type="button" disabled={section >= page.blocks.length - 1 || busy} onClick={() => setSection(section + 1)}>Next section</button></div>}
    </>}
  </div>;
}

