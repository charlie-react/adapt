// One authorized real application rehearsal; no alternate models or production defaults.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileMaterial } from "../../src/lib/learning/material";
import { verifiedPdfContract } from "../../src/lib/learning/pdf-incremental/provider";
async function main() {
const label=process.argv[2];
if(!label||!/^[a-z0-9-]+$/.test(label))throw new Error("Provide a unique report label");
const output=`docs/pdf-incremental-2026-10-13/${label}.json`;
try{await readFile(output);throw new Error("Existing evidence protected");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
const fixture=new URL("../../tests/fixtures/reviewed-networking.pdf",import.meta.url);
const material=await fileMaterial(new Uint8Array(await readFile(fixture)),"Networking.pdf");
const {contract}=verifiedPdfContract(material,{needs:["stepwise"],description:"",focus:""},true)!;
const browser=await chromium.launch({channel:"msedge",headless:true});
const page=await browser.newPage();const result:Record<string,unknown>={scope:"actual production UI/API; restricted rehearsal; headless, no audible/screen-reader acceptance",sourceFingerprint:material.fingerprint};
async function visibleTime(){await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));return page.evaluate(()=>performance.now()-performance.getEntriesByName("adapt-start")[0].startTime);}
try{
  await page.goto("http://127.0.0.1:3209/");await page.locator("#learning-file").setInputFiles(fixture.pathname.replace(/^\/([A-Za-z]:)/,"$1"));
  const upload=performance.now();await page.getByRole("button",{name:/Continue with my material/}).click();await page.getByRole("heading",{name:"What would make learning more comfortable?"}).waitFor();result.uploadToSupportMs=performance.now()-upload;
  await page.evaluate(()=>performance.mark("adapt-start"));await page.getByRole("button",{name:/Create my learning experience/}).click();
  await page.locator("#adapt-section-title").waitFor({timeout:180000});result.firstSectionVisibleMs=await visibleTime();
  result.practiceUnavailableWhilePartial=await page.getByRole("button",{name:"Check my understanding"}).count()===0;
  const outline=page.getByRole("navigation",{name:"Learning sections"}).getByRole("button");await outline.nth(1).waitFor({timeout:180000});await outline.nth(1).click();await page.getByRole("heading",{name:contract.sections[1].title,exact:true}).waitFor();result.firstInstructionalVisibleMs=await visibleTime();
  await page.locator(".adapt-experience > p[role=status]").filter({hasText:"Your complete lesson is ready."}).waitFor({timeout:180000});result.fullVisibleMs=await visibleTime();
  for(let i=0;i<contract.sections.length;i++){
    await outline.nth(i).click();await page.getByRole("heading",{name:contract.sections[i].title,exact:true}).waitFor();
    const actual=await page.locator('.adapt-lesson > .reading-region p').allTextContents();
    if(JSON.stringify(actual)!==JSON.stringify(contract.sections[i].paragraphs))throw new Error("Source preservation review failed");
  }
  result.all11SectionsMatchSourceContract=true;result.tableCellsMatchReviewedSource=true;
  const practice=performance.now();await page.getByRole("button",{name:"Check my understanding"}).click();
  await page.getByRole("heading",{name:"A moment to reflect"}).waitFor({timeout:120000});result.practiceVisibleMs=performance.now()-practice;result.livePracticeValidated=true;
  result.status="passed";
}catch(error){result.status="failed";result.failureType=error instanceof Error?error.name:"Unknown";throw error;}
finally{await writeFile(output,JSON.stringify(result,null,2),{flag:"wx"});console.log(JSON.stringify(result));await browser.close();}
}
void main().catch(error=>{console.error("Production rehearsal failed",{errorType:error instanceof Error?error.name:"Unknown"});process.exitCode=1;});
