import { readFile,writeFile,mkdir,mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BedrockRuntimeClient,ConverseStreamCommand,type ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { createLearningProvider,CLAUDE_ADAPTATION_MODEL_ID } from "../../src/lib/learning/provider";
import { fileMaterial } from "../../src/lib/learning/material";
import { createLearningStore } from "../../src/lib/learning/service";
import { PdfSectionProjection } from "./projection";
import { protectedPassages, preservationRequest, manifestFingerprint, checkLessonPreservation } from "./preservation";
import { parseProviderResponse } from "../../src/lib/learning/provider-response";
import {networkingFidelity} from "./networking-fidelity";
import {fidelityRequest,checkLessonFidelity,resolveFidelityResponse} from "./fidelity";
import type { LearningSnapshot } from "../../src/lib/learning/types";
const directory="docs/pdf-incremental-2026-10-13",root="http://127.0.0.1:3207";
const prefs={needs:["stepwise"] as ["stepwise"],description:"",focus:""};
const safe=(e:unknown)=>e instanceof Error?{name:e.name,message:e.message.replace(/arn:[^\s]+/g,"[ARN]").replace(/\b\d{12}\b/g,"[ACCOUNT]").replace(/(?:sk-|AKIA|ASIA|AIza)[A-Za-z0-9_-]+/g,"[REDACTED]").slice(0,240)}:{name:"Unknown"};
async function main() {
  const label=process.argv[2]||"pair-1";if(!/^[a-z0-9-]+$/.test(label))throw new Error("Invalid run label");
  await mkdir(directory,{recursive:true});const resultPath=join(directory,`${label}.json`);
  try {await readFile(resultPath);throw new Error("Existing results protected");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
  const review=await mkdtemp(join(tmpdir(),"adapt-incremental-"));
  const input=new Uint8Array(await readFile("C:/users/besle/Downloads/LAN_WAN_MAN_10_Page_Study_Material.pdf"));
  const fingerprint=createHash("sha256").update(input).digest("hex");if(fingerprint!=="cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01")throw new Error("Approved PDF differs");
  const start=performance.now();const material=await fileMaterial(input,"Networking.pdf"),preparationMs=performance.now()-start;
  const references=process.argv.includes("--fidelity-refs"),faithful=process.argv.includes("--fidelity")||references,preservation=process.argv.includes("--preserve")||faithful,reverse=process.argv.includes("--reverse")||label.endsWith("5");
  // Source-reviewed benchmark requirement, not a generic inference about all PDFs.
  const passages=protectedPassages(material,{factHeadings:["Why networks matter"]});
  if(passages.length!==23)throw new Error("Networking source passage inventory changed; review required");
  const contract=faithful?networkingFidelity(material,passages):undefined;
  const beforeHashes=Object.fromEntries(await Promise.all(["provider","validation","http","service"].map(async p=>[p,createHash("sha256").update(await readFile(`src/lib/learning/${p}.ts`)).digest("hex")])));
  await build({entryPoints:["scripts/pdf-incremental/viewer.tsx"],outfile:join(review,"viewer.js"),bundle:true,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},tsconfig:"tsconfig.json",logLevel:"silent"});
  const css=(await readFile("src/app/globals.css","utf8")).replace('@import "tailwindcss";',"") + await readFile("src/app/adapt.css","utf8");
  const client=new BedrockRuntimeClient({region:process.env.AWS_REGION||process.env.AWS_DEFAULT_REGION,maxAttempts:1});
  let practicing=false;
  let active=false,current:{store:ReturnType<typeof createLearningStore>;key:string;snapshot:LearningSnapshot;provider:ReturnType<typeof createLearningProvider>}|undefined;
  const metrics:Record<string,unknown>[]=[];
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url!,root);
    if(url.pathname==="/"){res.setHeader("Content-Type","text/html");res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ADAPT PDF diagnostic</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/viewer.js"></script></body></html>');return;}
    if(url.pathname==="/styles.css"){res.setHeader("Content-Type","text/css");res.end(css);return;}
    if(url.pathname==="/viewer.js"){res.setHeader("Content-Type","text/javascript");res.end(await readFile(join(review,"viewer.js")));return;}
    if(req.headers["sec-fetch-site"]!=="same-origin"){res.writeHead(403);res.end();return;}
    if(url.pathname==="/practice"){
      res.setHeader("Content-Type","application/json");
      try {if(!current?.snapshot.experience)throw new Error("Not complete");const s=current;const before=performance.now();practicing=true;const result=await s.store.practice(s.key,s.snapshot.fingerprint,s.snapshot.revision,s.provider);practicing=false;await writeFile(join(review,`${metrics.at(-1)!.variant}-practice.json`),JSON.stringify(result.questions.map(({evidence,...q})=>({...q,references:evidence.map(e=>({sourceId:e.sourceId,mode:e.mode}))}))));res.end(JSON.stringify({questions:result.questions.length,validated:true,ms:performance.now()-before}));}
      catch(e){practicing=false;res.statusCode=409;res.end(JSON.stringify({failure:safe(e)}));}return;
    }
    if(url.pathname!=="/events" || active || !["baseline","stream"].includes(url.searchParams.get("variant")!)){res.writeHead(409);res.end();return;}
    active=true;current?.store.remove(current.key);
    const variant=url.searchParams.get("variant")!,timing:Record<string,unknown>={variant};metrics.push(timing);let wire="";
    const controller=new AbortController();res.on("close",()=>controller.abort());res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-store","X-Accel-Buffering":"no"});
    const send=(value:unknown)=>{controller.signal.throwIfAborted();res.write(`data:${JSON.stringify(value)}\n\n`);};
    const store=createLearningStore(),entry=store.create(material,{sourceOnly:true});
    const standard=createLearningProvider({modelId:process.env.BEDROCK_ADAPTATION_MODEL_ID||CLAUDE_ADAPTATION_MODEL_ID},async(command,signal)=>{if(!practicing)timing.requestHash=createHash("sha256").update(JSON.stringify(command.input)).digest("hex");const t=performance.now();const result=await client.send(command,{abortSignal:signal});if(practicing){timing.practiceProviderMs=performance.now()-t;timing.practiceUsage=result.usage;}else{timing.providerMs=performance.now()-t;timing.usage=result.usage;timing.reportedMs=result.metrics?.latencyMs;wire=(result.output?.message?.content??[]).map(b=>b.text??b.citationsContent?.content?.map(c=>c.text??"").join("")??"").join("");}return result;});
    const provider=variant==="baseline"?standard:{...standard,adaptSource:async(source:typeof material,preferences:typeof prefs,signal:AbortSignal)=>{
      let command:ConverseCommand|undefined;const capture=new Error("Capture");
      const builder=createLearningProvider({modelId:process.env.BEDROCK_ADAPTATION_MODEL_ID||CLAUDE_ADAPTATION_MODEL_ID},async c=>{command=c;throw capture;});
      try{await builder.adaptSource!(source,preferences,signal);}catch(e){if(e!==capture)throw e;}
      if(!command)throw new Error("Missing production request");
      timing.originalRequestHash=createHash("sha256").update(JSON.stringify(command.input)).digest("hex");
      const preserved=preservation?preservationRequest(command.input,source,passages):command.input;
      const input=contract?fidelityRequest(command.input,contract,references):preserved;
      timing.requestHash=createHash("sha256").update(JSON.stringify(input)).digest("hex");const projection=new PdfSectionProjection(source,preferences,preservation?passages:[],contract,references);const t=performance.now();let stopReason="";
      try {
        const response=await client.send(new ConverseStreamCommand(input),{abortSignal:signal});
        if(!response.stream)throw new Error("No provider stream");
        for await(const event of response.stream) {
          signal.throwIfAborted();store.snapshot(entry.key); // Recheck expiry before exposing any data.
          if(event.contentBlockDelta?.delta?.text!==undefined) {
            wire+=event.contentBlockDelta.delta.text;
            for(const section of projection.push(event.contentBlockDelta.delta.text)) {timing.firstValidatedMs??=performance.now()-t;const events=(timing.sectionEvents??=[]) as unknown[];events.push({id:section.id,validatedMs:performance.now()-t});send({type:"section",section});}
          }else if(event.contentBlockDelta?.delta?.citation){/* Native citations preserved in request; canonical evidence is resolved separately. */}
          else if(event.messageStop)stopReason=event.messageStop.stopReason??"";
          else if(event.metadata){timing.usage=event.metadata.usage;timing.reportedMs=event.metadata.metrics?.latencyMs;}
          else if(event.internalServerException||event.modelStreamErrorException||event.serviceUnavailableException||event.throttlingException||event.validationException)throw new Error(`Provider stream failure: ${Object.keys(event)[0]}`);
        }
        timing.providerMs=performance.now()-t;return projection.finish(stopReason);
      }catch(e){projection.fail();timing.failure=safe(e);throw e;}
    }};
    current={store,key:entry.key,snapshot:entry.snapshot,provider};
    try {
      const t=performance.now();const snapshot=await store.adapt(entry.key,entry.snapshot.fingerprint,0,prefs,provider,controller.signal);
      current.snapshot=snapshot;timing.completeValidatedMs=performance.now()-t;timing.coverage=snapshot.experience!.sections.flatMap(s=>s.evidence.map(e=>e.sourceId));timing.sectionIds=snapshot.experience!.sections.map(s=>s.id);
      const parsed=parseProviderResponse(wire);
      const raw=(variant==="stream"&&references&&contract?resolveFidelityResponse(parsed,contract):parsed) as {sections:{id:string;paragraphs:string[];steps:string[]}[]};
      const content=(sections:{id:string;paragraphs:string[];steps:string[]}[])=>JSON.stringify(sections.map(({id,paragraphs,steps})=>({id,paragraphs,steps})));
      timing.generationToAssemblyUnchanged=content(raw.sections)===content(snapshot.experience!.sections);timing.referenceExpansion=variant==="stream"&&references;
      const presented=snapshot.experience!.sections.flatMap(s=>[...s.paragraphs,...s.steps]).join("\n");
      timing.exactPassagesPresent=passages.filter(p=>presented.includes(p.text)).length;timing.requiredPassages=passages.length;
      if(variant==="stream"&&preservation){checkLessonPreservation(snapshot.experience!,material,passages);timing.preservationValidated=true;}
      if(variant==="stream"&&contract){checkLessonFidelity(snapshot.experience!,material,contract);timing.fidelityValidated=true;timing.visualReview="codex-visual-review; human confirmation outstanding";}
      await writeFile(join(review,`${variant}-wire.txt`),wire);
      await writeFile(join(review,`${variant}-lesson.json`),JSON.stringify({...snapshot.experience,sections:snapshot.experience!.sections.map(({evidence,...s})=>({...s,references:evidence.map(e=>({sourceId:e.sourceId,mode:e.mode}))}))}));
      send({type:"complete",experience:snapshot.experience,metrics:timing});
    }catch(e){timing.failure??=safe(e);if(wire)await writeFile(join(review,`${variant}-wire.txt`),wire);try{send({type:"error"});}catch{}}
    finally{active=false;res.end();}
  });
  await new Promise<void>(resolve=>server.listen(3207,"127.0.0.1",resolve));
  const browser=await chromium.launch({channel:"msedge",headless:true});
  try {
    for(const variant of reverse?["stream","baseline"]:["baseline","stream"]){
      const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(180000);
      await page.addInitScript(`window.__speechLog=[]; class Utterance { constructor(text) { this.text=text; this.onend=null; } } Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true}); Object.defineProperty(window,'speechSynthesis',{value:{speak(u){window.__speechLog.push(u.text);queueMicrotask(()=>u.onend?.());},cancel(){},pause(){},resume(){}},configurable:true});`);
      await page.goto(root);await page.getByRole("button",{name:variant==="baseline"?"Prepare whole lesson":"Try incremental reading",exact:true}).click();
      const ready=await Promise.race([page.locator('[data-section-id="source-1"]').waitFor().then(()=>true),page.getByRole("status").filter({hasText:"could not be prepared"}).waitFor().then(()=>false)]);
      if(ready){
        // Measure useful content before running potentially slow accessibility checks.
        const instructionReady=await Promise.race([page.getByRole("navigation",{name:"Available lesson sections"}).getByRole("button").nth(1).waitFor().then(()=>true),page.getByRole("status").filter({hasText:"could not be prepared"}).waitFor().then(()=>false)]);
        if(!instructionReady){Object.assign(metrics.at(-1)!,{browser:await page.evaluate(()=>window.__pdfMetrics),incomplete:true});await context.close();continue;}
        await page.getByRole("navigation",{name:"Available lesson sections"}).getByRole("button").nth(1).focus();await page.keyboard.press("Enter");
        await page.locator('[data-section-id="source-2"]').waitFor();
        const focused=await page.locator("#part-title").evaluate(e=>document.activeElement===e);
        await page.waitForFunction(()=>Boolean(window.__pdfMetrics.firstUsefulMs));
        await page.getByRole("button",{name:"Read Aloud: Off",exact:true}).click();
        await page.locator(".reading-region[data-reading-enabled]").first().waitFor();await page.locator(".reading-region[data-reading-enabled]").first().focus();
        await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
        await page.getByRole("group",{name:"Read Aloud controls",exact:true}).getByRole("button").first().focus();
        await page.locator(".reading-region[data-reading-enabled]").first().focus();
        let speechWorked=true;try{await page.waitForFunction(()=>window.__speechLog.length>0,undefined,{timeout:3000});}catch{speechWorked=false;}
        await page.getByRole("button",{name:"Next section",exact:true}).waitFor();
        // Advance only when the source-2 navigation button becomes available.
        await page.getByRole("navigation",{name:"Available lesson sections"}).getByRole("button").nth(1).waitFor();
        await page.getByRole("navigation",{name:"Available lesson sections"}).getByRole("button").nth(1).focus();await page.keyboard.press("Enter");
        await page.locator('[data-section-id="source-2"]').waitFor();
        const completed=await Promise.race([page.getByRole("status").filter({hasText:"Your complete lesson is ready."}).waitFor().then(()=>true),page.getByRole("status").filter({hasText:"could not be prepared"}).waitFor().then(()=>false)]);
        if(!completed){Object.assign(metrics.at(-1)!,{browser:await page.evaluate(()=>window.__pdfMetrics),incomplete:true});await context.close();continue;}
        await page.waitForFunction(()=>Boolean(window.__pdfMetrics.completeVisibleMs));
        const browserMetrics=await page.evaluate(()=>window.__pdfMetrics);Object.assign(metrics.at(-1)!,{browser:browserMetrics,keyboardHeadingFocus:focused,silentReadAloud:speechWorked});
        metrics.at(-1)!.axeViolations=(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,impact:v.impact}));
        await page.setViewportSize({width:320,height:800});metrics.at(-1)!.narrowNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
        let renderedMatches=true;
        for(let i=0;i<current!.snapshot.experience!.sections.length;i++){
          const expected=current!.snapshot.experience!.sections[i];
          await page.getByRole("navigation",{name:"Available lesson sections"}).getByRole("button").nth(i).click();
          await page.locator(`[data-section-id="${expected.id}"]`).waitFor();
          const paragraphs=await page.locator('.adapt-lesson > .reading-region > p').allTextContents(),steps=await page.locator('.adapt-lesson section[aria-label="Key points"] li p').allTextContents();
          renderedMatches&&=JSON.stringify({paragraphs,steps})===JSON.stringify({paragraphs:expected.paragraphs,steps:expected.steps});
        }
        metrics.at(-1)!.assemblyToRenderedUnchanged=renderedMatches;
        await page.getByRole("button",{name:"Check my understanding",exact:true}).click();await page.waitForFunction(()=>Boolean(window.__pdfMetrics.practice));metrics.at(-1)!.practice=await page.evaluate(()=>window.__pdfMetrics.practice);
      }
      await context.close();
    }
  }finally{await browser.close();current?.store.remove(current.key);client.destroy();await new Promise<void>(r=>server.close(()=>r()));
    const after=Object.fromEntries(await Promise.all(Object.keys(beforeHashes).map(async p=>[p,createHash("sha256").update(await readFile(`src/lib/learning/${p}.ts`)).digest("hex")])));
    const result={label,fingerprint,preparationMs,prefs,preservation,faithful,references,manifestHash:manifestFingerprint(passages),fidelityHash:contract?createHash("sha256").update(JSON.stringify(contract)).digest("hex"):undefined,reviewDirectory:review,productionUnchanged:JSON.stringify(beforeHashes)===JSON.stringify(after),metrics};await writeFile(resultPath,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
}
void main().catch(e=>{console.error(JSON.stringify(safe(e)));process.exitCode=1;});
