"use client";
import { Readable } from "./read-aloud";

import { useRef, useState } from "react";
import type { AccessibleExperience } from "@/lib/engine/types";

export function SemanticExplorer({ experience }: { experience: AccessibleExperience }) {
  const [selectedId, setSelectedId] = useState(experience.items[0]?.id);
  const heading = useRef<HTMLHeadingElement>(null);
  const selected = experience.items.find((item) => item.id === selectedId);
  function explore(id: string) {
    setSelectedId(id);
    requestAnimationFrame(() => heading.current?.focus());
  }
  return <section aria-labelledby="explorer-title">
    <Readable label="Explorer instructions" units={[experience.title, experience.summary]}><h3 id="explorer-title">{experience.title}</h3><p>{experience.summary}</p></Readable>
    
    <ul className="item-picker" aria-label="Choose an item to explore">
      {experience.items.map((item) => <li key={item.id}><button type="button" aria-pressed={item.id === selectedId} onClick={() => explore(item.id)}>{item.title}</button></li>)}
    </ul>
    {selected && <div className="item-details">
      <Readable label={`${selected.title} relationships`} units={selected.spokenStatements ?? [selected.title, ...selected.facts]}><h4 tabIndex={-1} ref={heading}>{selected.title} relationships</h4>
      <ul>{selected.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
      </Readable>
      <ul className="related-items">{selected.related.map((link) => <li key={`${link.itemId}-${link.label}`}><button type="button" onClick={() => explore(link.itemId)}>{link.label}</button></li>)}</ul>
      
    </div>}
  </section>;
}
