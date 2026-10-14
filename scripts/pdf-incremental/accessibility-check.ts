// Offline checks of the isolated progressive viewer. No paid calls or production routes.
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PdfSectionProjection } from "./projection";
import { protectedPassages } from "./preservation";
import {createFidelityContract,fidelityIntroduction} from "./fidelity";
import type { LearningMaterial } from "../../src/lib/learning/types";

const material:LearningMaterial={id:"pdf:offline",kind:"pdf",title:"Networks",fingerprint:"a".repeat(64),units:["A local network connects nearby devices.\n\n• May connect nearby devices.","Examples\n\n• A library connects its computers.\n\n• A classroom connects its devices.","Quick revision\n\n• How does a library use its network?\n\n• What does a classroom connect?"].map((text,i)=>({id:`p${i+1}`,locator:{kind:"pdf",page:i+1},text:`Networks, part ${i+1}\n\n${text}`})),limitations:[]};
const prefs={needs:["stepwise"] as ["stepwise"],description:"",focus:""};
const passages=protectedPassages(material);
const raw={introduction:"Read about local networks.",sections:material.units.map((u,i)=>({id:`source-${i+1}`,title:`Networks, part ${i+1}`,kind:"prose",paragraphs:[passages.filter(p=>p.sourceId===u.id).map(p=>p.text).join(" ")||u.text!],steps:[] as string[],evidence:[{sourceId:u.id,mode:"text",excerptId:`excerpt-${i+1}-1`}]})),practice:[],limitations:[]};
const faithful=process.argv.includes("--fidelity");
const contract=faithful?createFidelityContract(material,material.units.map(u=>({sourceId:u.id,titleStart:0,titleEnd:u.text!.indexOf("\n\n"),bodyStart:u.text!.indexOf("\n\n")+2,groupHeadings:[]})),[],passages):undefined;
if(contract){raw.introduction=fidelityIntroduction;raw.sections.forEach((s,i)=>{s.paragraphs=contract.sections[i].paragraphs.map((_,n)=>`${contract.sections[i].sourceId}-paragraph-${n+1}`);s.steps=i===0?[`${contract.sections[i].sourceId}-step-${contract.sections[i].allowedSteps.length}`]:[];});}
const projection=new PdfSectionProjection(material,prefs,passages,contract,Boolean(contract));const sections=projection.push(JSON.stringify(raw));const experience=projection.finish("end_turn");
async function main(){
  const temp=await mkdtemp(join(tmpdir(),"adapt-progressive-check-"));
  await build({entryPoints:["scripts/pdf-incremental/viewer.tsx"],outfile:join(temp,"viewer.js"),bundle:true,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},tsconfig:"tsconfig.json",logLevel:"silent"});
  const css=(await readFile("src/app/globals.css","utf8")).replace('@import "tailwindcss";',"")+await readFile("src/app/adapt.css","utf8");
  let stream:ServerResponse|undefined,variant="";
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url!,"http://127.0.0.1:3208");
    if(url.pathname==="/viewer.js"){res.setHeader("Content-Type","text/javascript");res.end(await readFile(join(temp,"viewer.js")));}
    else if(url.pathname==="/styles.css"){res.setHeader("Content-Type","text/css");res.end(css);}
    else if(url.pathname==="/events"){stream=res;variant=url.searchParams.get("variant")!;res.writeHead(200,{"Content-Type":"text/event-stream"});res.flushHeaders();}
    else {res.setHeader("Content-Type","text/html");res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Progressive checks</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/viewer.js"></script></body></html>');}
  });
  await new Promise<void>(r=>server.listen(3208,"127.0.0.1",r));
  const browser=await chromium.launch({channel:"msedge",headless:true});const context=await browser.newContext();const page=await context.newPage();const checks:string[]=[];
  const send=(event:unknown)=>stream!.write(`data:${JSON.stringify(event)}\n\n`);
  const start=async(name="Try incremental reading")=>{stream=undefined;await page.getByRole("button",{name,exact:true}).click();await expect.poll(()=>Boolean(stream)).toBe(true);};
  const status=page.getByRole("status").filter({hasText:/first parts|complete lesson|getting ready|not a complete/});
  try{
    await page.addInitScript(`window.__speechLog=[]; let current; window.__finishSpeech=()=>{for(let i=0;current&&i<100;i++){const u=current;current=undefined;u.onend?.();}}; class Utterance { constructor(text) { this.text=text; this.onend=null; this.onerror=null; } } Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true}); Object.defineProperty(window,'speechSynthesis',{value:{speak(u){current=u;window.__speechLog.push(u.text)},cancel(){current=undefined;},pause(){},resume(){}},configurable:true});`);
    await page.goto("http://127.0.0.1:3208");await start();
    await expect(page.getByRole("button",{name:"Cancel preparation"})).toBeFocused();
    await expect(page.getByRole("button",{name:"Check my understanding"})).toBeDisabled();
    send({type:"section",section:sections[0]});await expect(status).toContainText("first parts");
    assert.deepEqual(await page.evaluate(()=>window.__speechLog),[]);checks.push("No autoplay; partial lesson cannot start practice");
    await page.getByRole("button",{name:"Read Aloud: Off",exact:true}).click();
    const region=page.locator('[data-section-id="source-1"] .reading-region').first();await expect(region).toHaveAttribute("data-reading-enabled","true");await region.focus();
    try{await expect.poll(()=>page.evaluate(()=>window.__speechLog.length)).toBeGreaterThan(0);}catch(e){console.log(JSON.stringify(await page.evaluate(()=>({focus:document.activeElement?.outerHTML,controls:document.querySelector('.reading-controls')?.outerHTML,spoken:window.__speechLog}))));throw e;}
    const before=await page.evaluate(()=>window.__speechLog.length);const announcement=await status.textContent();
    send({type:"section",section:sections[1]});await expect(page.getByRole("navigation").getByRole("button")).toHaveCount(2);
    await expect(region).toBeFocused();assert.equal(await status.textContent(),announcement);assert.equal(await page.evaluate(()=>window.__speechLog.length),before);
    checks.push("New section preserves focus, does not restart speech, and does not repeat the loading announcement");
    await page.getByRole("navigation").getByRole("button").nth(1).focus();await page.keyboard.press("Enter");await expect(page.locator("#part-title")).toBeFocused();
    const nextRegion=page.locator('[data-section-id="source-2"] .reading-region').first();await nextRegion.focus();
    await expect.poll(()=>page.evaluate(()=>window.__speechLog.length)).toBeGreaterThan(before);
    send({type:"section",section:sections[2]});send({type:"complete",experience,metrics:{}});stream!.end();
    await expect(status).toHaveText("Your complete lesson is ready.");await expect(nextRegion).toBeFocused();
    await expect(page.getByRole("button",{name:"Check my understanding"})).toBeEnabled();checks.push("Keyboard section navigation, newly registered speech, full completion and practice availability");
    for(let i=1;i<3;i++){
      await page.getByRole("navigation").getByRole("button").nth(i).focus();await page.keyboard.press("Enter");await expect(page.locator("#part-title")).toBeFocused();
      for(const p of passages.filter(p=>p.sourceId===`p${i+1}`))await expect(page.locator(".adapt-lesson")).toContainText(p.text);
      const readable=page.locator(`.adapt-lesson[data-section-id="source-${i+1}"] > .reading-region`);
      await readable.focus();await page.evaluate("window.__finishSpeech()");
      for(const p of passages.filter(p=>p.sourceId===`p${i+1}`))assert.ok((await page.evaluate(()=>window.__speechLog)).some(unit=>unit.includes(p.text)));
    }
    checks.push("All protected examples and revision prompts are rendered and queued as meaningful speech units with keyboard heading focus");
    if(contract){
      await page.getByRole("navigation").getByRole("button").first().focus();await page.keyboard.press("Enter");await expect(page.locator("#part-title")).toBeFocused();
      const count=await page.evaluate(()=>window.__speechLog.length);await page.locator('[data-reading-label="Key point 1"]').focus();await page.evaluate("window.__finishSpeech()");
      assert.deepEqual((await page.evaluate(()=>window.__speechLog)).slice(count),["Networks, part 1.","May connect nearby devices."]);
      checks.push("Source-selected key points keep their modality and speak section context for attribution");
    }
    const violations=(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,impact:v.impact}));assert.deepEqual(violations,[]);
    await page.setViewportSize({width:320,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks.push("No axe violations and no horizontal overflow at 320 pixels");
    await start();send({type:"section",section:sections[0]});await expect(status).toContainText("first parts");
    await page.getByRole("button",{name:"Cancel preparation"}).click();await expect(status).toContainText("not a complete lesson");await expect(page.getByRole("button",{name:"Prepare whole lesson",exact:true})).toBeFocused();
    await expect(page.getByRole("button",{name:"Check my understanding"})).toBeDisabled();checks.push("Cancellation keeps incomplete state and recovers focus");
    await start();send({type:"section",section:sections[0]});send({type:"section",section:sections[0]});stream!.end();await expect(status).toContainText("could not be prepared");await expect(page.getByRole("button",{name:"Check my understanding"})).toBeDisabled();checks.push("Duplicate section fails closed");
    await start();send({type:"section",section:sections[0]});stream!.end();await expect(status).toContainText("could not be prepared");checks.push("Connection ending early is never complete");
    await start();send({type:"section",section:sections[0]});send({type:"error"});stream!.end();await expect(status).toContainText("could not be prepared");checks.push("Provider failure retains clearly incomplete state");
    await start("Prepare whole lesson");assert.equal(variant,"baseline");await expect(page.locator("[data-section-id]")).toHaveCount(0);send({type:"complete",experience,metrics:{}});stream!.end();await expect(status).toHaveText("Your complete lesson is ready.");checks.push("Explicit full-lesson fallback/retry clears stale partial content");
    await mkdir("docs/pdf-incremental-2026-10-13",{recursive:true});const label=process.argv[2]||"accessibility";if(!/^[a-z0-9-]+$/.test(label))throw new Error("Invalid check label");const result={checks,axeViolations:violations,manualStillRequired:["Actual audible playback","Screen-reader announcements and heading navigation","Review source fidelity of live generated content"]};await writeFile(`docs/pdf-incremental-2026-10-13/${label}.json`,JSON.stringify(result,null,2),{flag:"wx"});console.log(JSON.stringify(result));
  }finally{await browser.close();stream?.end();await new Promise<void>(r=>server.close(()=>r()));}
}
void main().catch(e=>{console.error(e instanceof Error?e.message:"Offline check failed");process.exitCode=1;});
