import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const fingerprint="a".repeat(64);
const section=(n:number)=>({id:`source-${n}`,title:`Networks part ${n}`,kind:"prose",paragraphs:[n===1?"A LAN connects devices in a local area.":"A WAN connects networks over a wide area."],steps:[],evidence:[{sourceId:`p${n}`,mode:"text",quote:"A network connects devices."}]});
const snapshot={fingerprint,expiresAt:Date.now()+900000,revision:0,material:{id:"pdf:review",kind:"pdf",title:"Networking.pdf",fingerprint,units:[{id:"p1",locator:{kind:"pdf",page:1}},{id:"p2",locator:{kind:"pdf",page:2}}],limitations:[]},analysis:{status:"source-ready"}};
const complete={...snapshot,revision:1,preferences:{needs:["stepwise"],description:"",focus:""},experience:{introduction:"Explore your material one section at a time.",sections:[section(1),section(2)],practice:[],limitations:[]}};
test("production learner UI keeps partial content incomplete, accessible and practice gated",async({page})=>{
  let deliveries=0;
  await page.route("**/api/learning",r=>r.fulfill({json:snapshot}));
  await page.route("**/api/learning/adapt-progress",r=>r.fulfill({contentType:"text/event-stream",body:`data:${JSON.stringify({type:"section",section:section(1)})}\n\ndata:${JSON.stringify({type:"section",section:section(2)})}\n\ndata:${JSON.stringify(++deliveries===1?{type:"error",code:"AI_UNAVAILABLE"}:{type:"complete",snapshot:complete})}\n\n`}));
  await page.route("**/api/learning/adapt",r=>r.fulfill({json:complete}));
  await page.goto("/");await page.locator("#learning-file").setInputFiles({name:"Networking.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4 fixture")});
  await page.getByRole("button",{name:/Continue with my material/}).click();
  await page.getByRole("button",{name:/Create my learning experience/}).click();
  await expect(page.locator(".adapt-experience > p[role=status]")).toContainText("incomplete");
  await expect(page.getByRole("heading",{name:"Networks part 1"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Check my understanding"})).toHaveCount(0);
  const next=page.getByRole("button",{name:"Next section"});await next.focus();await page.keyboard.press("Enter");
  await expect(page.getByRole("heading",{name:"Networks part 2"})).toBeFocused();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Prepare the whole lesson"}).click();
  await expect(page.getByRole("heading",{name:"Networks part 1"})).toBeVisible();
  await page.getByRole("button",{name:"Next section"}).click();
  await expect(page.getByRole("button",{name:"Check my understanding"})).toBeVisible();
});
test("complete progress response preserves the displayed prefix and offers practice only at completion",async({page})=>{
  await page.route("**/api/learning",r=>r.fulfill({json:snapshot}));
  await page.route("**/api/learning/adapt-progress",r=>r.fulfill({contentType:"text/event-stream",body:`data:${JSON.stringify({type:"section",section:section(1)})}\n\ndata:${JSON.stringify({type:"complete",snapshot:complete})}\n\n`}));
  await page.goto("/");await page.locator("#learning-file").setInputFiles({name:"Networking.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4 fixture")});
  await page.getByRole("button",{name:/Continue with my material/}).click();await page.getByRole("button",{name:/Create my learning experience/}).click();
  await expect(page.locator(".adapt-experience > p[role=status]")).toContainText("complete lesson is ready");
  await expect(page.getByRole("heading",{name:"Networks part 1"})).toBeVisible();
  await page.getByRole("button",{name:"Next section"}).click();await expect(page.getByRole("button",{name:"Check my understanding"})).toBeVisible();
});
test("arriving sections preserve keyboard focus and cancellation offers a full-lesson retry",async({page})=>{
  await page.addInitScript(()=>{
    const original=window.fetch;
    window.fetch=async(input,init)=>{
      if(String(input).includes("/api/learning/adapt-progress")){
        let output:ReadableStreamDefaultController<Uint8Array>;
        const body=new ReadableStream<Uint8Array>({start(c){output=c;}});
        (window as unknown as {sendPdf:(v:unknown)=>void}).sendPdf=v=>output.enqueue(new TextEncoder().encode(`data:${JSON.stringify(v)}\n\n`));
        init?.signal?.addEventListener("abort",()=>output.error(new DOMException("Stopped","AbortError")),{once:true});
        return new Response(body,{headers:{"content-type":"text/event-stream"}});
      }
      return original(input,init);
    };
  });
  await page.route("**/api/learning",r=>r.fulfill({json:snapshot}));
  await page.goto("/");await page.locator("#learning-file").setInputFiles({name:"Networking.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4 fixture")});
  await page.getByRole("button",{name:/Continue with my material/}).click();await page.getByRole("button",{name:/Create my learning experience/}).click();
  await page.waitForFunction(()=>"sendPdf" in window);
  await page.evaluate(s=>(window as unknown as {sendPdf:(v:unknown)=>void}).sendPdf({type:"section",section:s}),section(1));
  await expect(page.locator(".adapt-experience > p[role=status]")).toContainText("rest of your lesson");
  const first=page.getByRole("navigation",{name:"Learning sections"}).getByRole("button").first();await first.focus();
  await page.evaluate(s=>(window as unknown as {sendPdf:(v:unknown)=>void}).sendPdf({type:"section",section:s}),section(2));
  await expect(first).toBeFocused();await expect(page.getByRole("button",{name:"Check my understanding"})).toHaveCount(0);
  const stop=page.getByRole("button",{name:"Stop preparing"});await stop.focus();await page.keyboard.press("Enter");
  await expect(page.locator(".adapt-experience > p[role=status]")).toContainText("incomplete");await expect(page.getByRole("button",{name:"Prepare the whole lesson"})).toBeFocused();
});
