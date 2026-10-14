import { readFile,writeFile } from "node:fs/promises";
import { fileMaterial } from "../src/lib/learning/material";
import { decodeAudio,type DecodedAudio } from "../src/lib/learning/audio";
async function main() {
const bytes=new Uint8Array(await readFile("C:/users/besle/Downloads/Entrepreneurship_5_Minute_Lecture.wav"));
const observations: {variant:string;ms:number}[]=[];
let expected: DecodedAudio | undefined;
for(const variant of ["before","after","after","before","before","after"]) {
  global.gc?.(); const start=performance.now(); let reused:DecodedAudio|undefined;
  const material=await fileMaterial(bytes,"lecture.wav",undefined,variant==="after"?a=>{reused=a;}:undefined);
  const decoded=reused??await decodeAudio(material.bytes!);
  observations.push({variant,ms:performance.now()-start});
  if(expected && !Buffer.from(expected.pcm).equals(decoded.pcm)) throw new Error("Decoded content changed");
  expected=decoded;
}
const result={sourceBytes:bytes.length,durationSeconds:expected!.duration,observations,decodedSamplesIdentical:true,scope:"Local preparation+decode only; no Gemini, Claude or browser calls."};
await writeFile("docs/live-pipeline-performance-2026-10-13/decode-reuse.json",JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
}
void main().catch(error=>{console.error(error instanceof Error ? error.name : "BenchmarkError");process.exitCode=1;});
