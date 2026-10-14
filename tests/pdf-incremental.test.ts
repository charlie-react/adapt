import test from "node:test";
import assert from "node:assert/strict";
import { PdfSectionProjection } from "../scripts/pdf-incremental/projection";
import { createLearningStore } from "../src/lib/learning/service";
import { fixtureProvider } from "./fixtures/learning";
import type { LearningMaterial } from "../src/lib/learning/types";
const material:LearningMaterial={id:"pdf:test",kind:"pdf",title:"Networks",fingerprint:"a".repeat(64),units:[{id:"p1",locator:{kind:"pdf",page:1},text:"A local network connects nearby devices."},{id:"p2",locator:{kind:"pdf",page:2},text:"A wide area network connects distant networks."},{id:"p3",locator:{kind:"pdf",page:3}}],limitations:["Some visual details may be unclear."]};
const prefs={needs:["stepwise"] as ["stepwise"],description:"",focus:""};
function wire(){return {introduction:'Read about networks, including the word "sections" and braces { }.',sections:material.units.map((u,i)=>({id:`source-${i+1}`,title:"Networks",kind:u.text?"prose":"table",paragraphs:[u.text??"The original shows a comparison table."],steps:[],evidence:[u.text?{sourceId:u.id,mode:"text",excerptId:`excerpt-${i+1}-1`}:{sourceId:u.id,mode:"visual",quote:""}]})),practice:[],limitations:material.limitations};}
test("fragmented, escaped and fenced JSON exposes only independently validated complete text sections",()=>{
  for(const fence of [false,true]) {const p=new PdfSectionProjection(material,prefs);const json=JSON.stringify(wire(),null,2);const text=fence?"```json\n"+json+"\n```":json;let exposed=0;
    for(const char of text)exposed+=p.push(char).length;
    assert.equal(exposed,2);assert.equal(p.sections.length,2);assert.equal(p.finish("end_turn").sections.length,3);
  }
});
test("wrong evidence, duplicates, wrong order, extra fields, wrong numbers and oversized data fail closed",()=>{
  for(const change of [ (v:ReturnType<typeof wire>)=>{v.sections[0].evidence[0].sourceId="p2";},(v:ReturnType<typeof wire>)=>{v.sections[1].id="source-1";},(v:ReturnType<typeof wire>)=>{v.sections.reverse();},(v:ReturnType<typeof wire>)=>{v.sections[0].paragraphs=["A network has 999 devices."];},(v:ReturnType<typeof wire>)=>{Object.assign(v.sections[0],{hidden:"extra"});},(v:ReturnType<typeof wire>)=>{v.sections[0].evidence[0].excerptId="unknown";} ]) {
    const v=wire();change(v);assert.throws(()=>new PdfSectionProjection(material,prefs).push(JSON.stringify(v)));
  }
  assert.throws(()=>new PdfSectionProjection(material,prefs).push("x".repeat(240001)));
});
test("truncation, absent pages, invalid final root and failure can never become complete",()=>{
  for(const reason of ["max_tokens","stop_sequence",""]) {const p=new PdfSectionProjection(material,prefs);p.push(JSON.stringify(wire()));assert.throws(()=>p.finish(reason));}
  const p=new PdfSectionProjection(material,prefs);p.push(JSON.stringify(wire()).slice(0,-10));assert.throws(()=>p.finish("end_turn"));
  const missing=wire();missing.sections.pop();const q=new PdfSectionProjection(material,prefs);q.push(JSON.stringify(missing));assert.throws(()=>q.finish("end_turn"));
  const extra={...wire(),hidden:"extra"};const r=new PdfSectionProjection(material,prefs);r.push(JSON.stringify(extra));assert.throws(()=>r.finish("end_turn"));
  const failed=new PdfSectionProjection(material,prefs);failed.fail();assert.throws(()=>failed.push("{}"));assert.throws(()=>failed.finish("end_turn"));
});
test("real session rejects cancellation and expiry without committing partial content; fresh retry still works",async()=>{
  let now=0;const store=createLearningStore({now:()=>now,ttlMs:100});const entry=store.create(material,{sourceOnly:true});
  const controller=new AbortController();let release!:()=>void;
  const partial={...fixtureProvider,adaptSource:async()=>{await new Promise<void>(resolve=>{release=resolve;});return wire();}};
  const job=store.adapt(entry.key,material.fingerprint,0,prefs,partial,controller.signal);await Promise.resolve();controller.abort();await assert.rejects(job);release();assert.equal(store.snapshot(entry.key).experience,undefined);
  now=101;assert.throws(()=>store.snapshot(entry.key));
  const fresh=store.create(material,{sourceOnly:true});const complete=new PdfSectionProjection(material,prefs);complete.push(JSON.stringify(wire()));
  const retry=await store.adapt(fresh.key,material.fingerprint,0,prefs,{...fixtureProvider,adaptSource:async()=>complete.finish("end_turn")});assert.equal(retry.experience?.sections.length,3);store.remove(fresh.key);
});
