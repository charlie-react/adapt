"use client";
import { useEffect, useRef, useState } from "react";
import type { AdaptedSection, LearningSnapshot, UnderstandingQuestion } from "@/lib/learning/types";
import { Readable } from "./read-aloud";
import { CheckUnderstanding } from "./check-understanding";
export function AdaptedLearning({ snapshot, practice, partialSections }: { snapshot: LearningSnapshot; partialSections?: AdaptedSection[]; practice(): Promise<{ questions: UnderstandingQuestion[] }> }) {
  const [active, setActive] = useState(0), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [active]);
  const experience = snapshot.experience, sections = experience?.sections ?? partialSections ?? [], section = sections[active];
  if (!section) return null;
  return <>
    {snapshot.preferences?.focus && <Readable label="Your learning focus" units={[`Your chosen focus: ${snapshot.preferences.focus}`]}><p className="learning-focus"><span>Your focus</span>{snapshot.preferences.focus}</p></Readable>}
    {experience && <Readable label="Adapted learning introduction" units={[experience.introduction]}><p className="experience-introduction">{experience.introduction}</p></Readable>}
    <div className="experience-layout"><nav className="learning-outline" aria-label="Learning sections"><p className="adapt-eyebrow">Explore at your pace</p><ol>{sections.map((item, index) => <li key={item.id}><button type="button" aria-current={active === index ? "step" : undefined} onClick={() => setActive(index)}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{item.title}</button></li>)}</ol><p className="outline-help">Prefer listening? Turn on Read Aloud in the header, then focus a learning region.</p></nav>
      <div className="lesson-content"><section className="adapt-lesson" aria-labelledby="adapt-section-title"><p className="adapt-eyebrow">Your learning experience</p><h2 id="adapt-section-title" tabIndex={-1} ref={heading}>{section.title}</h2><Readable label={section.title} units={[section.title, ...section.paragraphs]}>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</Readable>{section.steps.length > 0 && <section aria-label="Key points"><h3>Key points</h3><ol className="semantic-steps">{section.steps.map((step, index) => <li key={index}><Readable label={`Key point ${index + 1}`} units={partialSections ? [section.title, step] : [step]}><p>{step}</p></Readable></li>)}</ol></section>}<div className="lesson-navigation"><button type="button" className="adapt-secondary" disabled={active === 0} onClick={() => setActive(active - 1)}>Previous</button><span>{active + 1} of {sections.length}</span><button type="button" disabled={active === sections.length - 1} onClick={() => setActive(active + 1)}>Next section</button></div></section></div>
    </div>{experience && <CheckUnderstanding available={active === sections.length - 1} generate={practice} />}
  </>;
}
