// Independently validated projection; production eligibility is enforced by provider.ts.
import type { AccessPreferences, AdaptedExperience, AdaptedSection, LearningMaterial } from "../types";
import { LEARNING_LIMITS } from "../limits";
import { parseProviderResponse, resolveProviderEvidence, sourceExcerpts } from "../provider-response";
import { validateSourceAdaptation } from "../validation";
import { checkManifest, checkSectionPreservation, checkLessonPreservation, type ProtectedPassage } from "./preservation";
import {checkSectionFidelity,checkLessonFidelity,resolveFidelitySection,resolveFidelityResponse,type FidelityContract} from "./fidelity";

/** Token-aware lookup: quoted mentions of sections inside text aren't properties. */
function sectionArray(text: string): number | undefined {
  let depth = 0, start = -1, quoted = false, escape = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) {
      if (escape) escape=false;
      else if(c==="\\") escape=true;
      else if(c==='"') {
        quoted=false;
        if(depth===1 && JSON.parse(text.slice(start,i+1))==="sections") {
          const tail=/^\s*:\s*\[/.exec(text.slice(i+1));
          if(tail) {
            const position=i+1+tail[0].length-1;
            const header=JSON.parse(text.slice(0,position)+"[]}");
            if(Object.keys(header).some(k=>!["introduction","sections","practice","limitations"].includes(k))) throw new Error("Unknown root field");
            return position;
          }
        }
      }
    } else if(c==='"') {quoted=true;start=i;}
    else if(c==='{' || c==='[') depth++;
    else if(c==='}' || c===']') depth--;
  }
}
function objectEnd(text:string,start:number): number | undefined {
  let depth=0,quoted=false,escape=false;
  for(let i=start;i<text.length;i++) {
    const c=text[i];
    if(quoted) {if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quoted=false;}
    else if(c==='"')quoted=true;
    else if(c==='{')depth++;
    else if(c==='}' && --depth===0)return i+1;
  }
}
export class PdfSectionProjection {
  private text="";
  private processed=0;
  private visible:AdaptedSection[]=[];
  private terminal=false;
  private held=false;
  constructor(private material:LearningMaterial,private preferences:AccessPreferences,private protectedContent:ProtectedPassage[] = [],private fidelity?:FidelityContract,private references=false) {
    if(material.kind!=="pdf")throw new Error("PDF-only diagnostic");
    checkManifest(material,protectedContent);
  }
  get sections() {return structuredClone(this.visible);}
  push(chunk:string):AdaptedSection[] {
    if(this.terminal)throw new Error("Terminal projection");
    this.text+=chunk;
    if(this.text.length>LEARNING_LIMITS.responseCharacters)throw new Error("Oversized response");
    let text=this.text.trimStart();
    if(text.startsWith("`")) {const fence=/^```(?:json)?[ \t]*\r?\n/i.exec(text);if(!fence)return [];text=text.slice(fence[0].length);}
    if(!text.startsWith("{")) {if(!text.length)return [];throw new Error("Invalid JSON prefix");}
    const position=sectionArray(text);if(position===undefined)return [];
    const added:AdaptedSection[]=[];
    let cursor=position+1,count=0;
    while(cursor<text.length) {
      while(/\s/.test(text[cursor]??""))cursor++;
      if(cursor===text.length)break; // A chunk may end in whitespace before the next comma.
      if(text[cursor]==="]")break;
      if(count) {if(text[cursor]!==",")throw new Error("Invalid section separator");cursor++;while(/\s/.test(text[cursor]??""))cursor++;}
      if(cursor===text.length)break;
      if(text[cursor]!=="{")throw new Error("Invalid section item");
      const end=objectEnd(text,cursor);if(end===undefined)break;
      count++;
      if(count>this.processed) {
        let raw=JSON.parse(text.slice(cursor,end));
        if(this.references){if(!this.fidelity)throw new Error("Missing reference contract");raw=resolveFidelitySection(raw,this.fidelity);}
        const unit=this.material.units[count-1];
        if(!unit || raw.id!==`source-${count}`)throw new Error("Missing, duplicate or reordered source section");
        const scope={...this.material,units:[unit]};
        // Independently validate only this page, never fake whole-document coverage.
        const resolved=resolveProviderEvidence({introduction:"Read this part while the rest of your lesson is getting ready.",sections:[raw],practice:[],limitations:this.material.limitations},"source-adaptation",scope,sourceExcerpts(this.material,{includeShort:true}));
        const section=validateSourceAdaptation(resolved,scope,this.preferences).sections[0];
        checkSectionPreservation(section,this.protectedContent);
        if(this.fidelity)checkSectionFidelity(section,this.fidelity);
        this.processed=count;
        // Preserve order: once a visual section is held, all later sections wait too.
        this.held ||= section.evidence.some(e=>e.mode==="visual");
        if(!this.held) {this.visible.push(section);added.push(section);}
      }
      cursor=end;
    }
    return added;
  }
  finish(stopReason:string):AdaptedExperience {
    if(this.terminal)throw new Error("Terminal projection");
    this.terminal=true;
    if(stopReason!=="end_turn")throw new Error("Incomplete provider response");
    let parsed=parseProviderResponse(this.text);
    if(this.references){if(!this.fidelity)throw new Error("Missing reference contract");parsed=resolveFidelityResponse(parsed,this.fidelity);}
    const value=resolveProviderEvidence(parsed,"source-adaptation",this.material,sourceExcerpts(this.material,{includeShort:true}));
    const complete=validateSourceAdaptation(value,this.material,this.preferences);
    if(complete.sections.length!==this.material.units.length || complete.sections.some((s,i)=>s.id!==`source-${i+1}` || !s.evidence.every(e=>e.sourceId===this.material.units[i].id)))throw new Error("Incomplete or reordered source coverage");
    if(JSON.stringify(complete.sections.slice(0,this.visible.length))!==JSON.stringify(this.visible))throw new Error("Previously exposed sections changed");
    checkLessonPreservation(complete,this.material,this.protectedContent);
    if(this.fidelity)checkLessonFidelity(complete,this.material,this.fidelity);
    return complete;
  }
  fail() {this.terminal=true;}
}
