import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileMaterial, textMaterial } from "../src/lib/learning/material";
import { verifiedPdfContract, withVerifiedPdfProgress } from "../src/lib/learning/pdf-incremental/provider";
import { fidelityIntroduction } from "../src/lib/learning/pdf-incremental/fidelity";
import { createLearningStore } from "../src/lib/learning/service";
import { createLearningHandlers } from "../src/lib/learning/http";
import { sourceExcerpts } from "../src/lib/learning/provider-response";
import { fixtureProvider } from "./fixtures/learning";
import type { LearningMaterial, AdaptedSection } from "../src/lib/learning/types";
const prefs = { needs: ["stepwise"] as ["stepwise"], description: "", focus: "" };
const prepared = readFile(new URL("./fixtures/reviewed-networking.pdf", import.meta.url)).then(bytes => fileMaterial(new Uint8Array(bytes), "Networking.pdf"));
function wire(material: LearningMaterial) {
  const { contract } = verifiedPdfContract(material, prefs, true)!;
  const excerpts = sourceExcerpts(material, { includeShort: true });
  return { introduction: fidelityIntroduction, sections: contract.sections.map(s => ({ id:s.id,title:s.title,kind:s.kind,paragraphs:s.paragraphs.map((_,i)=>`${s.sourceId}-paragraph-${i+1}`),steps:[],evidence:s.kind === "table" ? [{sourceId:s.sourceId,mode:"visual",quote:""}] : [{sourceId:s.sourceId,mode:"text",excerptId:excerpts.find(e=>e.sourceId===s.sourceId)!.id}] })), practice:[],limitations:[] };
}
function candidate(material: LearningMaterial, pause?: () => Promise<void>, invalid = false) {
  const raw = wire(material); if (invalid) raw.sections[1].paragraphs[0] = "invented";
  return withVerifiedPdfProgress(fixtureProvider, { enabled:true, transport:async()=>({$metadata:{},stream:(async function*(){
    yield {contentBlockDelta:{contentBlockIndex:0,delta:{text:JSON.stringify(raw)}}}; if(pause) await pause(); yield {messageStop:{stopReason:"end_turn" as const}};
  })()}) });
}
function completeProvider(material: LearningMaterial) {
  const {contract}=verifiedPdfContract(material,prefs,true)!;
  return {...fixtureProvider,adaptSource:async()=>({introduction:fidelityIntroduction,sections:contract.sections.map(s=>({...s,steps:[],evidence:[{sourceId:s.sourceId,mode:s.kind==="table"?"visual":"text",quote:material.units.find(u=>u.id===s.sourceId)?.text?.slice(0,100)??""}]})).map(({sourceId:_,allowedSteps:__,origin:___,...s})=>{void _;void __;void ___;return s;}),practice:[],limitations:material.limitations})};
}
test("only the reviewed bytes/layout and exact rehearsed preference are eligible",async()=>{
  const material = await prepared;
  assert.ok(verifiedPdfContract(material,prefs,true));
  for(const changed of [{...material,bytes:new Uint8Array([1])},{...material,fingerprint:"a".repeat(64)},{...material,units:material.units.slice(1)},{...material,kind:"image" as const},textMaterial("Unknown source material.")]) assert.equal(verifiedPdfContract(changed,prefs,true),undefined);
  assert.equal(verifiedPdfContract(material,prefs,false),undefined);
  const changedExtraction=structuredClone(material);changedExtraction.units[4].text=changedExtraction.units[4].text!.replace("May use","Often uses");
  assert.equal(verifiedPdfContract(changedExtraction,prefs,true),undefined);
  for(const needs of [["plain-language"],["stepwise","listen"]] as const) assert.equal(verifiedPdfContract(material,{...prefs,needs:[...needs]},true),undefined);
  assert.equal(verifiedPdfContract(material,{...prefs,description:"Simplify"},true),undefined);
  assert.equal(verifiedPdfContract(material,{...prefs,focus:"Different focus"},true),undefined);
});
test("ineligible documents use exactly the existing provider with no partial publications",async()=>{
  const material = textMaterial("A root has no parent. Leaves have no children."), published:AdaptedSection[]=[];
  let full=0,stream=0;
  const base={...fixtureProvider,adaptSource:async(...args:Parameters<NonNullable<typeof fixtureProvider.adaptSource>>)=>{full++;return fixtureProvider.adaptSource!(...args);}};
  const provider=withVerifiedPdfProgress(base,{enabled:true,transport:async()=>{stream++;throw new Error("Must not stream");}});
  await provider.adaptSourceProgress!(material,prefs,new AbortController().signal,s=>published.push(s));
  assert.equal(full,1);assert.equal(stream,0);assert.equal(published.length,0);
});
test("sections are independently grounded; only full validation commits and enables practice",async()=>{
  const material=await prepared,store=createLearningStore(),a=store.create(material,{sourceOnly:true}),b=store.create(material,{sourceOnly:true});
  let release!:()=>void;const gate=new Promise<void>(r=>release=r),published:AdaptedSection[]=[];
  const pending=store.adapt(a.key,material.fingerprint,0,prefs,candidate(material,()=>gate),undefined,s=>published.push(s));
  while(!published.length) await new Promise(r=>setTimeout(r,5));
  assert.equal(published.length,8);assert.equal(store.snapshot(a.key).experience,undefined);assert.equal(store.snapshot(b.key).experience,undefined);
  await assert.rejects(store.practice(a.key,material.fingerprint,0,fixtureProvider));
  await assert.rejects(store.practice(b.key,material.fingerprint,0,fixtureProvider));
  release();const complete=await pending;assert.equal(complete.experience!.sections.length,11);assert.equal(complete.revision,1);
  assert.match(complete.experience!.sections[8].paragraphs.join(" "),/Provider and\/or organization/);
  store.remove(a.key);store.remove(b.key);
});
test("invalid references never commit; explicit full-path retry remains available",async()=>{
  const material=await prepared,store=createLearningStore(),entry=store.create(material,{sourceOnly:true});
  await assert.rejects(store.adapt(entry.key,material.fingerprint,0,prefs,candidate(material,undefined,true),undefined,()=>{}));
  assert.equal(store.snapshot(entry.key).experience,undefined);assert.equal(store.snapshot(entry.key).revision,0);
  const full=await store.adapt(entry.key,material.fingerprint,0,prefs,completeProvider(material));assert.ok(full.experience);store.remove(entry.key);
});
test("expiry and cancellation prevent further publication or commitment",async()=>{
  for(const cancel of [true,false]){
    let now=0;const material=await prepared,store=createLearningStore({now:()=>now,ttlMs:10000}),entry=store.create(material,{sourceOnly:true}),abort=new AbortController();
    let release!:()=>void;const gate=new Promise<void>(r=>release=r);
    const pending=store.adapt(entry.key,material.fingerprint,0,prefs,candidate(material,()=>gate),abort.signal,()=>{if(cancel)abort.abort();else now=10001;});
    const rejected=assert.rejects(pending); release();await rejected;
    if(cancel)assert.equal(store.snapshot(entry.key).experience,undefined);else assert.throws(()=>store.snapshot(entry.key));store.remove(entry.key);
  }
});
test("progress endpoint rejects another session fingerprint and unauthorized origins",async()=>{
  const material=await prepared,store=createLearningStore(),entry=store.create(material,{sourceOnly:true}),handlers=createLearningHandlers(store,completeProvider(material),undefined,false);
  const request=(origin:string,fingerprint:string,cookie:string)=>new Request("http://localhost/api/learning/adapt-progress",{method:"POST",headers:{origin,cookie,"content-type":"application/json"},body:JSON.stringify({fingerprint,revision:0,preferences:prefs})});
  assert.equal((await handlers.progress(request("http://evil.test",material.fingerprint,`adapt-learning=${entry.key}`))).status,403);
  assert.equal((await handlers.progress(request("http://localhost","b".repeat(64),`adapt-learning=${entry.key}`))).status,409);
  assert.equal((await handlers.progress(request("http://localhost",material.fingerprint,"adapt-learning=unknown"))).status,410);
  const response=await handlers.progress(request("http://localhost",material.fingerprint,`adapt-learning=${entry.key}`));
  const events=await response.text();assert.ok(events.includes('"type":"complete"'));assert.ok(!events.includes('"type":"section"'));store.remove(entry.key);
});
