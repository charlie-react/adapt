import test from "node:test";
import assert from "node:assert/strict";
import {createFidelityContract,checkSectionFidelity,checkLessonFidelity,tableParagraphs,fidelityIntroduction,fidelityRequest,resolveFidelityResponse,type ReviewedTable} from "../scripts/pdf-incremental/fidelity";
import {PdfSectionProjection} from "../scripts/pdf-incremental/projection";
import type {LearningMaterial,AdaptedSection} from "../src/lib/learning/types";
const statements=["May use high-capacity fiber-optic links.","A network can involve greater latency.","Some services are unavailable.","A provider must not share learner identity.","Up to 10 devices may connect at 5 GHz.","The guide attributes the result to Ada, not Ben."];
const text="Source facts\n\n"+statements.map(s=>"• "+s).join("\n\n");
const material:LearningMaterial={id:"pdf:fidelity",kind:"pdf",title:"Source facts",fingerprint:"a".repeat(64),units:[{id:"p1",locator:{kind:"pdf",page:1},text},{id:"p2",locator:{kind:"pdf",page:2}}],limitations:[]};
const table:ReviewedTable={sourceId:"p2",page:2,sourceFingerprint:material.fingerprint,review:"codex-visual-review",title:"Ownership",context:"The table describes ownership options.",columns:["Wide network","Local network"],rows:[{label:"Typical ownership",values:["Provider and/or organization","Home/organization"]},{label:"Limit",values:["Up to 10 devices","5 devices"]}]};
const layout=[{sourceId:"p1",titleStart:0,titleEnd:12,bodyStart:14,groupHeadings:[]}];
const contract=createFidelityContract(material,layout,[table],[]);
const prefs={needs:["stepwise"] as ["stepwise"],description:"",focus:""};
function section(i:number):AdaptedSection{const s=contract.sections[i];return {id:s.id,title:s.title,kind:s.kind,paragraphs:[...s.paragraphs],steps:i===0?[...statements]:[],evidence:[{sourceId:s.sourceId,mode:i===0?"text":"visual",quote:i===0?text:""}]};}
function wire(){return {introduction:fidelityIntroduction,sections:[section(0),section(1)].map((s,i)=>({...s,evidence:i===0?[{sourceId:"p1",mode:"text",excerptId:"excerpt-1-1"}]:[{sourceId:"p2",mode:"visual",quote:""}]})),practice:[],limitations:[]};}
test("reported may-to-often failure and related modality, negation, number/unit and attribution changes are rejected",()=>{
  for(const [from,to] of [["May use","Often use"],["can involve","typically involves"],["Some services","All services"],["must not share","may share"],["Up to 10","At least 10"],["5 GHz","6 GHz"],["Ada, not Ben","Ben, not Ada"]]){
    for(const target of ["steps","paragraphs"] as const){const s=section(0);s[target]=s[target].map(p=>p.replace(from,to));assert.throws(()=>checkSectionFidelity(s,contract),`${target}: ${from} -> ${to}`);}
  }
  const paraphrase=section(0);paraphrase.steps=["A network might have greater latency."];assert.throws(()=>checkSectionFidelity(paraphrase,contract)); // Even plausible synonyms aren't claimed semantically verified.
  checkSectionFidelity(section(0),contract);
});
test("table cell attribution and original and/or versus and/or-only relationships cannot change",()=>{
  for(const wrong of ["Provider and organization","Provider or organization","Provider only","Organization only"]){const s=section(1);s.paragraphs=s.paragraphs.map(p=>p.replace("Provider and/or organization",wrong));assert.throws(()=>checkSectionFidelity(s,contract));}
  const swapped=section(1);[swapped.paragraphs[1],swapped.paragraphs[2]]=[swapped.paragraphs[2],swapped.paragraphs[1]];assert.throws(()=>checkSectionFidelity(swapped,contract));
  const appended=section(1);appended.steps=["Wide network is owned by both providers and organizations."];assert.throws(()=>checkSectionFidelity(appended,contract));
  for(const relation of ["Provider and organization","Provider or organization","Neither provider nor organization","Provider and/or organization"]){
    const source={...table,rows:[{label:"Ownership",values:[relation,"Home"]}]};const c=createFidelityContract(material,layout,[source],[]);const s={...section(1),paragraphs:tableParagraphs(source)};checkSectionFidelity(s,c);
    s.paragraphs[1]=s.paragraphs[1].replace(relation,"Changed relationship");assert.throws(()=>checkSectionFidelity(s,c));
  }
});
test("unknown visual content, wrong fingerprint/page, inconsistent shape and unreviewed source never get a contract",()=>{
  for(const changed of [{...table,page:3},{...table,sourceFingerprint:"b".repeat(64)},{...table,review:"unverified" as ReviewedTable["review"]},{...table,rows:[{label:"Ownership",values:["Incomplete"]}]}])assert.throws(()=>createFidelityContract(material,layout,[changed],[]));
  assert.throws(()=>createFidelityContract(material,layout,[],[]));
  const missingLayout=layout.map(l=>({...l,groupHeadings:["Missing heading"]}));assert.throws(()=>createFidelityContract(material,missingLayout,[table],[]));
});
test("strict streaming rejects altered factual output before display and preserves reviewed table ordering at completion",()=>{
  const bad=wire();bad.sections[0].steps[0]="Often use high-capacity fiber-optic links.";const p=new PdfSectionProjection(material,prefs,[],contract);assert.throws(()=>p.push(JSON.stringify(bad)));assert.equal(p.sections.length,0);assert.throws(()=>p.finish("end_turn"));
  const q=new PdfSectionProjection(material,prefs,[],contract);assert.equal(q.push(JSON.stringify(wire())).length,1);const complete=q.finish("end_turn");checkLessonFidelity(complete,material,contract);assert.equal(complete.sections.length,2);
  const wrong=wire();wrong.sections[1].paragraphs[1]=wrong.sections[1].paragraphs[1].replace("and/or","and");const r=new PdfSectionProjection(material,prefs,[],contract);assert.throws(()=>r.push(JSON.stringify(wrong)));assert.throws(()=>r.finish("end_turn"));assert.equal(r.sections.length,1);
});
test("source-owned sentence selections retain order, limits, provenance and cannot smuggle new claims in headings or root",()=>{
  const duplicate=section(0);duplicate.steps=[statements[0],statements[0]];assert.throws(()=>checkSectionFidelity(duplicate,contract));
  const reordered=section(0);reordered.steps.reverse();assert.throws(()=>checkSectionFidelity(reordered,contract));
  const wrongTitle=section(0);wrongTitle.title="Always uses fiber";assert.throws(()=>checkSectionFidelity(wrongTitle,contract));
  const input={modelId:"existing-model",messages:[],system:[{text:"existing safety"}],inferenceConfig:{temperature:0,maxTokens:8000}};const original=JSON.stringify(input);const updated=fidelityRequest(input,contract);assert.equal(JSON.stringify(input),original);assert.deepEqual(updated.inferenceConfig,input.inferenceConfig);assert.equal(updated.modelId,input.modelId);
});
function referenceWire(){const v=wire();v.sections.forEach((s,i)=>{const expected=contract.sections[i];s.paragraphs=expected.paragraphs.map((_,n)=>`${expected.sourceId}-paragraph-${n+1}`);s.steps=expected.allowedSteps.map((_,n)=>`${expected.sourceId}-step-${n+1}`);});return v;}
test("reference selection preserves all source wording and table cells without repairing or accepting generated prose",()=>{
  const v=referenceWire(),before=JSON.stringify(v);const resolved=resolveFidelityResponse(v,contract) as ReturnType<typeof wire>;
  assert.equal(JSON.stringify(v),before);assert.deepEqual(resolved.sections.map(s=>s.paragraphs),contract.sections.map(s=>s.paragraphs));
  const p=new PdfSectionProjection(material,prefs,[],contract,true);for(const c of JSON.stringify(v))p.push(c);checkLessonFidelity(p.finish("end_turn"),material,contract);
  for(const mutate of [(x:ReturnType<typeof wire>)=>{x.sections[0].paragraphs=[];},(x:ReturnType<typeof wire>)=>{x.sections[0].paragraphs.push(x.sections[0].paragraphs[0]);},(x:ReturnType<typeof wire>)=>{x.sections[1].paragraphs.reverse();},(x:ReturnType<typeof wire>)=>{x.sections[0].steps=["p2-step-1"];},(x:ReturnType<typeof wire>)=>{x.sections[0].steps=["Often uses fiber"];},(x:ReturnType<typeof wire>)=>{x.sections[1].paragraphs[1]="Provider and organization";},(x:ReturnType<typeof wire>)=>{x.sections[0].steps.reverse();}]){const bad=referenceWire();mutate(bad);assert.throws(()=>resolveFidelityResponse(bad,contract));}
  const privateId=referenceWire();privateId.sections[0].id="PRIVATE DOCUMENT CONTENT";
  assert.throws(()=>resolveFidelityResponse(privateId,contract),error=>error instanceof Error&&error.message==="Unknown source-reference section");
});
