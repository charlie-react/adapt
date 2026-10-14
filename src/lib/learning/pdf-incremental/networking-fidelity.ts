// Reviewed fixture boundary. This layout/transcription is NOT automatic PDF understanding.
import type { LearningMaterial } from "../types";
import type { ProtectedPassage } from "./preservation";
import {createFidelityContract,type ReviewedTable,type TextLayout} from "./fidelity";
const fingerprint="cc5c2637a0f78bd01f444a8d19e300a9eeed866f33eb84c2c1fc9a1398ac9d01";
export const networkingTable:ReviewedTable={sourceId:"p9",page:9,sourceFingerprint:fingerprint,review:"codex-visual-review",title:"8. LAN vs MAN vs WAN",context:"The primary distinction is geographical scale, but ownership, infrastructure, management and cost also vary.",columns:["LAN","MAN","WAN"],rows:[
  {label:"Typical scope",values:["Room/building/site","City/metropolitan area","Regional/country/global"]},
  {label:"Common technologies",values:["Ethernet, Wi-Fi","Fiber, metropolitan links","Carrier links, internet, private WAN"]},
  {label:"Typical ownership",values:["Home/organization","Organization/provider","Provider and/or organization"]},
  {label:"Management",values:["Local","More distributed","Highly distributed"]},
  {label:"Complexity",values:["Lower","Medium","Higher"]}
]};
const headings=["Learning objectives","Why networks matter","Geographical classification","Characteristics","Examples","Common components","LAN topology","Uses","MAN versus LAN","WAN approaches","Example","Key idea","Quick revision","Key takeaway"];
export function networkingFidelity(material:LearningMaterial,passages:ProtectedPassage[]){
  if(material.fingerprint!==fingerprint||material.units.length!==11)throw new Error("Reviewed networking source changed");
  const layouts:TextLayout[]=material.units.filter(u=>u.text).map(unit=>{
    const text=unit.text!,page=unit.locator.kind==="pdf"?unit.locator.page:0,first=text.indexOf("\n\n"),second=text.indexOf("\n\n",first+2);
    if(text.slice(0,first)!==`LAN, WAN and MAN • Page ${page}`||second<0)throw new Error("Reviewed footer/title layout changed");
    const body=text.slice(second+2);
    return {sourceId:unit.id,titleStart:first+2,titleEnd:second,bodyStart:second+2,groupHeadings:headings.filter(h=>body.includes(`\n\n${h}\n\n`))};
  });
  return createFidelityContract(material,layouts,[networkingTable],passages);
}
