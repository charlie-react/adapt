// Isolated diagnostic viewer; not a Next route or production learner UI.
import { useEffect,useRef,useState } from "react";
import { createRoot } from "react-dom/client";
import { ReadingProvider,ReadAloud,Readable,useStopReadAloud } from "../../src/components/read-aloud";
import type { AdaptedSection, AdaptedExperience } from "../../src/lib/learning/types";
type Phase="idle"|"preparing"|"partial"|"complete"|"failed"|"cancelled";
declare global { interface Window { __pdfMetrics:Record<string,unknown>; __speechLog:string[]; } }
window.__pdfMetrics={};
function Viewer() {
  const [sections,setSections]=useState<AdaptedSection[]>([]),[phase,setPhase]=useState<Phase>("idle"),[active,setActive]=useState(0);
  const [completed,setCompleted]=useState<AdaptedExperience|null>(null);
  const request=useRef<AbortController|null>(null),generation=useRef(0),heading=useRef<HTMLHeadingElement>(null),cancel=useRef<HTMLButtonElement>(null),baseline=useRef<HTMLButtonElement>(null);
  const stop=useStopReadAloud();
  useEffect(()=>{heading.current?.focus();},[active]); // New arrivals do not steal focus.
  useEffect(()=>{
    if(sections.length)requestAnimationFrame(()=>requestAnimationFrame(()=>{
      window.__pdfMetrics.firstSectionMs??=performance.now()-Number(window.__pdfMetrics.started);
      if(sections[active]?.id==="source-2")window.__pdfMetrics.firstUsefulMs??=performance.now()-Number(window.__pdfMetrics.started);
      if(phase==="complete")window.__pdfMetrics.completeVisibleMs??=performance.now()-Number(window.__pdfMetrics.started);
    }));
  },[sections,phase,active]);
  async function start(variant:string) {
    stop();request.current?.abort();const own=++generation.current,controller=new AbortController();request.current=controller;
    setSections([]);setCompleted(null);setActive(0);setPhase("preparing");window.__pdfMetrics={started:performance.now()};
    requestAnimationFrame(()=>cancel.current?.focus());
    try {
      const response=await fetch(`/events?variant=${variant}`,{signal:controller.signal});if(!response.ok || !response.body)throw new Error("Request unavailable");
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="",ended=false;const received:AdaptedSection[]=[];
      while(!ended) {const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});
        let end;while((end=buffer.indexOf("\n\n"))>=0) {
          const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!line.startsWith("data:"))continue;
          const event=JSON.parse(line.slice(5));if(own!==generation.current)return;
          if(event.type==="section") {
            if(event.section.id!==`source-${received.length+1}`)throw new Error("Duplicate or reordered section");
            received.push(event.section);setSections([...received]);setPhase("partial");
          }
          else if(event.type==="complete") {
            if(JSON.stringify(event.experience.sections.slice(0,received.length))!==JSON.stringify(received))throw new Error("Changed partial content");
            setSections(event.experience.sections);setCompleted(event.experience);setPhase("complete");window.__pdfMetrics.server=event.metrics;ended=true;
            if(document.activeElement===cancel.current)requestAnimationFrame(()=>baseline.current?.focus());
          }
          else if(event.type==="error")throw new Error("Lesson incomplete");
        }
      }
      if(!ended)throw new Error("Connection ended early");
    } catch {if(own===generation.current){stop();setPhase(controller.signal.aborted?"cancelled":"failed");if(document.activeElement===cancel.current)requestAnimationFrame(()=>baseline.current?.focus());}}
  }
  const section=sections[active],pending=phase==="partial"||phase==="preparing";
  const announcement=phase==="partial"?"The first parts are ready. The rest of your lesson and notes are still getting ready."
    :phase==="complete"?"Your complete lesson is ready."
    :phase==="failed"?"The rest of your lesson could not be prepared. This is not a complete lesson."
    :phase==="cancelled"?"Preparation stopped. This is not a complete lesson."
    :phase==="preparing"?"Your lesson is getting ready.":"Choose a benchmark to begin.";
  return <div><a href="#main" className="skip-link">Skip to content</a><header className="site-header"><strong>ADAPT · isolated PDF experiment</strong><ReadAloud /></header>
    <main id="main" className="adapt-home" style={{maxWidth:"65rem",margin:"auto",padding:"1rem"}}><h1>Read as your lesson gets ready</h1>
      <div className="lesson-navigation"><button ref={baseline} disabled={pending} onClick={()=>void start("baseline")}>Prepare whole lesson</button><button disabled={pending} onClick={()=>void start("stream")}>Try incremental reading</button><button ref={cancel} disabled={!pending} onClick={()=>{stop();request.current?.abort();setPhase("cancelled");requestAnimationFrame(()=>baseline.current?.focus());}}>Cancel preparation</button></div>
      <div style={{minHeight:"7rem"}}><p role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {phase!=="complete" && sections.length>0 && <p>Only the available parts are ready. Later parts and notes may add context.</p>}</div>
      <nav aria-label="Available lesson sections"><ol>{sections.map((s,i)=><li key={s.id}><button aria-current={active===i?"step":undefined} onClick={()=>{setActive(i);if(i===active)heading.current?.focus();}}>{s.title}</button></li>)}</ol></nav>
      {completed && <Readable label="Lesson introduction" units={[completed.introduction]}><p>{completed.introduction}</p></Readable>}
      {section && <section className="adapt-lesson" data-section-id={section.id} aria-labelledby="part-title"><h2 id="part-title" tabIndex={-1} ref={heading}>{section.title}</h2><Readable label={section.title} units={[section.title,...section.paragraphs]}>{section.paragraphs.map((p,i)=><p key={i}>{p}</p>)}</Readable>
        {!!section.steps.length && <section aria-label="Key points"><h3>Key points</h3><ol>{section.steps.map((s,i)=><li key={i}><Readable label={`Key point ${i+1}`} units={[section.title,s]}><p>{s}</p></Readable></li>)}</ol></section>}
        <div className="lesson-navigation"><button disabled={!active} onClick={()=>setActive(active-1)}>Previous section</button><button disabled={active+1>=sections.length} onClick={()=>setActive(active+1)}>Next section</button></div>
      </section>}
      {phase==="complete" && <p>Your lesson is complete. You can check your understanding.</p>}
      {completed && completed.limitations.length>0 && <details><summary>Lesson notes</summary><Readable label="Lesson notes" units={completed.limitations}>{completed.limitations.map((note,i)=><p key={i}>{note}</p>)}</Readable></details>}
      <button disabled={phase!=="complete"} onClick={()=>void fetch("/practice",{method:"POST"}).then(r=>r.json()).then(v=>{window.__pdfMetrics.practice=v;})}>Check my understanding</button>
    </main></div>;
}
createRoot(document.getElementById("root")!).render(<ReadingProvider><Viewer /></ReadingProvider>);
