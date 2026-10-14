import test from "node:test";
import assert from "node:assert/strict";
import { protectedPassages, preservationRequest, checkManifest, checkLessonPreservation } from "../scripts/pdf-incremental/preservation";
import { PdfSectionProjection } from "../scripts/pdf-incremental/projection";
import type { LearningMaterial } from "../src/lib/learning/types";
import { createLearningStore } from "../src/lib/learning/service";
import { fixtureProvider } from "./fixtures/learning";

// Exact passages from the approved networking source; reduced regression material.
const texts=[
  "Examples\n\n• A university connecting campuses across one city.\n\n• A government organization connecting offices throughout a metropolitan area.\n\n• A provider's metropolitan network linking customers and facilities.",
  "Examples\n\n• A multinational company connecting offices in different countries.\n\n• A bank connecting branches across regions.\n\n• An organization connecting users and facilities across continents.",
  "Quick revision\n\n• 1. What is the main distinction between LAN, MAN and WAN?\n\n• 2. Give three examples of LAN environments.\n\n• 3. Why might a university use a MAN?\n\n• 4. Why can WAN management be more complex than LAN management?\n\n• 5. What role does a router play between separate networks?\n\n• 6. Explain how LANs, MANs and WANs can work together.\n\nKey takeaway\n\n• Think: LAN = local, MAN = metropolitan, WAN = wide."
];
const material:LearningMaterial={id:"pdf:preservation",kind:"pdf",title:"Network regression",fingerprint:"a".repeat(64),units:texts.map((text,i)=>({id:`p${[5,7,11][i]}`,locator:{kind:"pdf",page:[5,7,11][i]},text})),limitations:[]};
const prefs={needs:["stepwise"] as ["stepwise"],description:"",focus:""};
const manifest=protectedPassages(material);
function wire(){return {introduction:"Read the network material.",sections:material.units.map((u,i)=>({id:`source-${i+1}`,title:"Network learning",kind:"prose",paragraphs:[manifest.filter(p=>p.sourceId===u.id).map(p=>p.text).join(" ")],steps:[],evidence:[{sourceId:u.id,mode:"text",excerptId:`excerpt-${i+1}-1`}]})),practice:[],limitations:[]};}
test("source inventory retains every example and original question with exact page offsets",()=>{
  assert.equal(manifest.length,12);assert.equal(manifest.filter(p=>p.kind==="example").length,6);
  assert.equal(manifest.filter(p=>p.kind==="revision").length,6);
  checkManifest(material,manifest);assert.deepEqual(protectedPassages(material),manifest);
  for(const p of manifest)assert.equal(material.units.find(u=>u.id===p.sourceId)!.text!.slice(p.start,p.end),p.text);
  const wrapped={...material,units:[{...material.units[0],text:"Examples\n\n• An example continued\n\non another extracted block."}]};
  assert.throws(()=>protectedPassages(wrapped));
  assert.throws(()=>checkManifest(material,[...manifest].reverse()));
  assert.throws(()=>checkManifest(material,[{...manifest[0],text:"Changed source"}]));
});
test("reviewed fact groups cannot be reduced to labels that omit their concrete learning details",()=>{
  const factSource={...material,units:[{...material.units[0],text:"Why networks matter\n\n• Resource sharing: files, printers, applications and internet connections can be shared.\n\n• Communication: users and systems can exchange information.\n\n• Centralized services: organizations can provide shared storage, authentication and applications.\n\n• Scalability: additional devices and locations can be connected as requirements grow."}]};
  const required=protectedPassages(factSource,{factHeadings:["Why networks matter"]});assert.equal(required.length,4);
  const v={...wire(),sections:[{...wire().sections[0],paragraphs:["Networks provide resource sharing, communication, centralized services and scalability."]}]};
  assert.throws(()=>new PdfSectionProjection(factSource,prefs,required).push(JSON.stringify(v)));
  v.sections[0].paragraphs=[required.map(p=>p.text).join(" ")];const p=new PdfSectionProjection(factSource,prefs,required);p.push(JSON.stringify(v));assert.equal(p.finish("end_turn").sections.length,1);
});
test("complete source examples and six revision prompts survive fragmented generation, assembly and full validation",()=>{
  const p=new PdfSectionProjection(material,prefs,manifest);let visible=0;
  for(const c of JSON.stringify(wire(),null,2))visible+=p.push(c).length;
  assert.equal(visible,3);const complete=p.finish("end_turn");checkLessonPreservation(complete,material,manifest);
  assert.deepEqual(complete.sections.map(s=>s.paragraphs),wire().sections.map(s=>s.paragraphs));
});
test("every missing, duplicated, reordered or altered example/question is withheld, never complete",()=>{
  for(const protectedItem of manifest){
    const page=material.units.findIndex(u=>u.id===protectedItem.sourceId);
    for(const change of ["missing","duplicate","changed","order"]){
      const v=wire();const section=v.sections[page];const own=manifest.filter(p=>p.sourceId===protectedItem.sourceId);
      if(change==="missing")section.paragraphs[0]=section.paragraphs[0].replace(protectedItem.text,"");
      if(change==="duplicate")section.paragraphs[0]+=" "+protectedItem.text;
      if(change==="changed")section.paragraphs[0]=section.paragraphs[0].replace(protectedItem.text,protectedItem.text.replace(/\.$|\?$/, "!"));
      if(change==="order")section.paragraphs=[own.map(p=>p.text).reverse().join(" ")];
      const p=new PdfSectionProjection(material,prefs,manifest);assert.throws(()=>p.push(JSON.stringify(v)),`${change}: ${protectedItem.id}`);
      assert.throws(()=>p.finish("end_turn"));assert.ok(p.sections.length<=page);
    }
  }
  const checklist=wire();checklist.sections[2].paragraphs=["LAN is local, MAN is metropolitan, WAN is wide."];
  assert.throws(()=>new PdfSectionProjection(material,prefs,manifest).push(JSON.stringify(checklist)));
});
test("benchmark instructions extend only the isolated request; no model output/source repair or new lesson fields",()=>{
  const input={modelId:"existing-model",system:[{text:"Existing safety"}],messages:[{role:"user" as const,content:[{text:"Existing source"}]}],inferenceConfig:{maxTokens:8000,temperature:0}};
  const original=JSON.stringify(input),next=preservationRequest(input,material,manifest);
  assert.equal(JSON.stringify(input),original);assert.deepEqual(next.messages,input.messages);assert.deepEqual(next.inferenceConfig,input.inferenceConfig);assert.equal(next.modelId,input.modelId);assert.equal(next.system!.length,2);
  const completeProjection=new PdfSectionProjection(material,prefs,manifest);completeProjection.push(JSON.stringify(wire()));const complete=completeProjection.finish("end_turn");
  const wrongPage=structuredClone(complete);wrongPage.sections[0].steps=[manifest[3].text];assert.throws(()=>checkLessonPreservation(wrongPage,material,manifest));
  const incomplete=structuredClone(complete);incomplete.sections.pop();assert.throws(()=>checkLessonPreservation(incomplete,material,manifest));
});
test("missing protected source prevents session completion/practice, and a complete retry keeps original answers available",async()=>{
  const store=createLearningStore();const entry=store.create(material,{sourceOnly:true});
  const broken=wire();broken.sections[2].paragraphs=["LAN is local, MAN is metropolitan, WAN is wide."];
  await assert.rejects(store.adapt(entry.key,entry.snapshot.fingerprint,0,prefs,{...fixtureProvider,adaptSource:async()=>{
    const p=new PdfSectionProjection(material,prefs,manifest);p.push(JSON.stringify(broken));return p.finish("end_turn");
  }}));
  assert.equal(store.snapshot(entry.key).experience,undefined);
  await assert.rejects(store.practice(entry.key,entry.snapshot.fingerprint,0,fixtureProvider));
  const valid=await store.adapt(entry.key,entry.snapshot.fingerprint,0,prefs,{...fixtureProvider,adaptSource:async()=>{
    const p=new PdfSectionProjection(material,prefs,manifest);p.push(JSON.stringify(wire()));return p.finish("end_turn");
  }});
  assert.equal(valid.experience?.sections.length,3);assert.equal(valid.experience!.sections[2].paragraphs[0].includes(manifest[11].text),true);store.remove(entry.key);
});
