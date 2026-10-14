// Isolated source-preserving experiment, NOT a semantic paraphrase validator.
import type { ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import type { AdaptedExperience, AdaptedSection, LearningMaterial } from "../types";
import type { ProtectedPassage } from "./preservation";
export const fidelityIntroduction="Explore your material one section at a time.";
export type TextLayout={sourceId:string;titleStart:number;titleEnd:number;bodyStart:number;groupHeadings:string[]};
export type ReviewedTable={sourceId:string;page:number;sourceFingerprint:string;review:"codex-visual-review"|"human-reviewed";title:string;context:string;columns:string[];rows:{label:string;values:string[]}[]};
export type FidelitySection={id:string;sourceId:string;title:string;kind:"prose"|"table";paragraphs:string[];allowedSteps:string[];origin:"extracted-text"|"reviewed-visual-transcription"};
export type FidelityContract={sourceFingerprint:string;sections:FidelitySection[];limitations:string[]};

/** Bind each cell to BOTH its entity and attribute. Operators/values aren't rewritten. */
export function tableParagraphs(table:ReviewedTable):string[]{
  if(!table.columns.length||new Set(table.columns).size!==table.columns.length||!table.rows.length||new Set(table.rows.map(r=>r.label)).size!==table.rows.length||table.rows.some(r=>r.values.length!==table.columns.length||r.values.some(v=>!v.trim())))throw new Error("Invalid reviewed table shape");
  return [table.context,...table.columns.map((column,i)=>`${column}. ${table.rows.map(row=>`${row.label}: ${row.values[i]}.`).join(" ")}`)];
}
export function createFidelityContract(material:LearningMaterial,layouts:TextLayout[],tables:ReviewedTable[],protectedContent:ProtectedPassage[]):FidelityContract{
  if(material.kind!=="pdf"||new Set(layouts.map(l=>l.sourceId)).size!==layouts.length||new Set(tables.map(t=>t.sourceId)).size!==tables.length)throw new Error("Invalid fidelity input");
  const sections=material.units.map((unit,i):FidelitySection=>{
    const table=tables.find(t=>t.sourceId===unit.id),layout=layouts.find(l=>l.sourceId===unit.id);
    if(table){
      if(layout||unit.text||table.sourceFingerprint!==material.fingerprint||unit.locator.kind!=="pdf"||unit.locator.page!==table.page||!["codex-visual-review","human-reviewed"].includes(table.review))throw new Error("Unverified or mismatched visual transcription");
      return {id:`source-${i+1}`,sourceId:unit.id,title:table.title,kind:"table",paragraphs:tableParagraphs(table),allowedSteps:[],origin:"reviewed-visual-transcription"};
    }
    if(!unit.text||!layout||![layout.titleStart,layout.titleEnd,layout.bodyStart].every(Number.isInteger)||layout.titleStart<0||layout.titleEnd<=layout.titleStart||layout.bodyStart<layout.titleEnd||layout.bodyStart>=unit.text.length)throw new Error("Missing source-backed text layout");
    const text=unit.text,body=text.slice(layout.bodyStart);const boundaries=[0];
    // Reviewed heading boundaries preserve EVERY remaining source character in order.
    for(const heading of layout.groupHeadings){
      const start=body.indexOf(`\n\n${heading}\n\n`);if(start<0)throw new Error("Reviewed heading missing");boundaries.push(start+2);
    }
    const ordered=[...new Set(boundaries)].sort((a,b)=>a-b);
    const paragraphs=ordered.map((start,index)=>body.slice(start,ordered[index+1]??body.length).replace(/\n\n$/u,""));
    if(paragraphs.join("\n\n")!==body)throw new Error("Source paragraph coverage changed");
    const own=protectedContent.filter(p=>p.sourceId===unit.id);
    const allowedSteps=[...body.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g)].map(m=>m[0].replace(/^[ \t]*[•-][ \t]+/u,"")).filter(s=>/^[A-Z0-9]/u.test(s)&&/[.!?]$/u.test(s)&&s.length<=800&&!own.some(p=>s.includes(p.text)));
    return {id:`source-${i+1}`,sourceId:unit.id,title:text.slice(layout.titleStart,layout.titleEnd),kind:"prose",paragraphs,allowedSteps:[...new Set(allowedSteps)],origin:"extracted-text"};
  });
  if(layouts.length+tables.length!==sections.length||sections.some(s=>s.paragraphs.length<1||s.paragraphs.length>4||s.paragraphs.some(p=>!p.trim()||p.length>1600)||s.title.length>140))throw new Error("Fidelity source exceeds existing schema budget");
  return {sourceFingerprint:material.fingerprint,sections,limitations:[...material.limitations]};
}
export function checkSectionFidelity(section:AdaptedSection,contract:FidelityContract){
  const expected=contract.sections.find(s=>s.id===section.id);
  if(!expected||section.title!==expected.title||section.kind!==expected.kind||JSON.stringify(section.paragraphs)!==JSON.stringify(expected.paragraphs)||section.evidence.some(e=>e.sourceId!==expected.sourceId))throw new Error(`Source-preserving section mismatch: ${section.id}`);
  if(new Set(section.steps).size!==section.steps.length||section.steps.some(step=>!expected.allowedSteps.includes(step)))throw new Error(`Non-source key point: ${section.id}`);
  // A key-point selection must follow the source's order, not change dependencies.
  let previous=-1;for(const step of section.steps){const index=expected.allowedSteps.indexOf(step);if(index<=previous)throw new Error(`Reordered source key points: ${section.id}`);previous=index;}
}
export function checkLessonFidelity(experience:AdaptedExperience,material:LearningMaterial,contract:FidelityContract){
  if(contract.sourceFingerprint!==material.fingerprint||experience.introduction!==fidelityIntroduction||experience.practice.length||experience.sections.length!==contract.sections.length||JSON.stringify(experience.limitations)!==JSON.stringify(contract.limitations))throw new Error("Source-preserving envelope mismatch");
  experience.sections.forEach((section,i)=>{if(section.id!==contract.sections[i].id)throw new Error("Source-preserving order mismatch");checkSectionFidelity(section,contract);});
}
export function fidelityRequest(input:ConverseCommandInput,contract:FidelityContract,references=false):ConverseCommandInput{
  if(references)return {...input,system:[...(input.system??[]),{text:`FINAL BENCHMARK SOURCE-REFERENCE WIRE CONTRACT overrides earlier paragraph/key-point writing instructions and shape examples. Keep existing section keys id,title,kind,paragraphs,steps,evidence, but paragraphs/steps contain ONLY the server IDs below, never learning text. Return introduction EXACTLY ${JSON.stringify(fidelityIntroduction)}, practice: [], limitations: []. Fill every source-N section in order. Copy its title/kind exactly. paragraphs MUST be the COMPLETE supplied paragraphIds array in exact order, with NO omissions, duplicates, new IDs or source text. steps is a selection of 0-6 stepIds for the SAME section in listed order. Choose useful substantive learning points, not administrative introductions; use [] for a table. Do NOT write factual wording, prefixes, summaries, explanations or new metadata. The server expands IDs into their exact source text; this is source-preserving layout/key-point selection, not paraphrase generation or independent reasoning. Evidence retains original server excerpt references/native visual page references. Reviewed visual-transcription IDs are not extracted quotations: use visual evidence with empty quote, never fabricated text evidence. All other schema, grounding, safety and size requirements remain unchanged.\n${JSON.stringify({sourceReferences:contract.sections.map(section=>({id:section.id,title:section.title,kind:section.kind,sourceId:section.sourceId,origin:section.origin,paragraphIds:section.paragraphs.map((_,i)=>`${section.sourceId}-paragraph-${i+1}`),keyPoints:section.allowedSteps.map((text,i)=>({id:`${section.sourceId}-step-${i+1}`,text}))}))})}`} ]};
  return {...input,system:[...(input.system??[]),{text:`FINAL BENCHMARK SOURCE-PRESERVING STEPWISE CONTRACT overrides earlier requests to write paraphrased explanations. Existing lesson schema and all safety/evidence rules remain. Do NOT rewrite factual wording. Return introduction EXACTLY ${JSON.stringify(fidelityIntroduction)}, practice: [], limitations: []. For EVERY section copy id, title, kind and the COMPLETE ordered paragraphs array from sourcePresentation exactly. Never shorten, merge, paraphrase, duplicate, omit, or append any paragraph. Select 0-6 useful statements from allowedSteps for that SAME section, copied exactly once in their listed order; use [] for a table. Never add prefixes like Understand/Recognize/Note, change may/can/some/often/negation, change numbers/units/terminology/attribution, or turn and/or into and or or. Evidence still uses the original server-owned excerpts or native visual page reference. reviewed-visual-transcription is explicitly reviewed fixture data, NOT extracted PDF text: retain visual evidence and never invent quotations/excerpt IDs for it. This is an extractive, source-preserving stepwise experiment, not a request for independent knowledge reconstruction or a guarantee that the source is correct. Don't add sourcePresentation/origin/allowedSteps to the response.\n${JSON.stringify({sourcePresentation:contract.sections})}`} ]};
}
/** Resolve only complete, correctly scoped IDs; never add an omitted reference. */
export function resolveFidelitySection(raw:unknown,contract:FidelityContract):unknown{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid source-reference section");
  const value=raw as Record<string,unknown>,expected=contract.sections.find(s=>s.id===value.id);
  if(!expected)throw new Error("Unknown source-reference section");
  if(!Array.isArray(value.paragraphs)||JSON.stringify(value.paragraphs)!==JSON.stringify(expected.paragraphs.map((_,i)=>`${expected.sourceId}-paragraph-${i+1}`))||!Array.isArray(value.steps)||value.steps.length>6)throw new Error(`Missing or invalid source-reference coverage: ${expected.id}`);
  const pointIds=expected.allowedSteps.map((_,i)=>`${expected.sourceId}-step-${i+1}`);let previous=-1;
  const steps=value.steps.map(id=>{const index=pointIds.indexOf(id as string);if(index<0||index<=previous)throw new Error("Unknown, duplicate, reordered or cross-page key-point reference");previous=index;return expected.allowedSteps[index];});
  return {...value,paragraphs:[...expected.paragraphs],steps};
}
export function resolveFidelityResponse(raw:unknown,contract:FidelityContract):unknown{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid source-reference response");
  const value=raw as Record<string,unknown>;
  if(!Array.isArray(value.sections))throw new Error("Missing source-reference sections");
  return {...value,sections:value.sections.map(section=>resolveFidelitySection(section,contract))};
}
