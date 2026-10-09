import { readFile, writeFile } from 'node:fs/promises';
import { decodeAudio } from '../src/lib/learning/audio';
import { fileMaterial } from '../src/lib/learning/material';
import { createGeminiTranscriber } from '../src/lib/learning/gemini-transcription';
import { attachTranscription, transcribeAudio } from '../src/lib/learning/transcription';
import { createLearningProvider } from '../src/lib/learning/provider';
import { safeDiagnostic } from './bedrock-smoke';
async function main() {
 const original=await readFile('C:/Users/besle/Downloads/Colonialism_in_Africa___Exact_60_Seconds.mp3');
 let startOffset=0,endOffset=original.length;
 if(original.toString('ascii',0,3)==='ID3') startOffset=10+(original[6]<<21|original[7]<<14|original[8]<<7|original[9])+(original[3]===4&&(original[5]&16)?10:0);
 if(original.toString('ascii',endOffset-128,endOffset-125)==='TAG')endOffset-=128;
 const bytes=Buffer.concat(Array.from({length:31},()=>original.subarray(startOffset,endOffset)));
 const report:Record<string,unknown>={test:'Live approximately 30-minute MP3 -> Gemini -> existing Claude adaptation',source:'Existing approved colonialism recording repeated 31 times as a controlled duration fixture; not a varied 30-minute lecture.',bytes:bytes.length};
 let stage='decode';const started=performance.now();
 try {
   const decoded=await decodeAudio(bytes);report.duration=decoded.duration;
   const source=await fileMaterial(bytes,'controlled-long-lecture.mp3');
   stage='transcription';const provider=createGeminiTranscriber();const at=performance.now();
   const segments=await transcribeAudio(decoded,provider,AbortSignal.timeout(600000),bytes);await writeFile('test-results/material-limit-transcript.tmp.json',JSON.stringify(segments));report.transcriptionMs=Math.round(performance.now()-at);report.transcriptCharacters=segments.reduce((n,s)=>n+s.text.length,0);report.words=segments.reduce((n,s)=>n+(s.words?.length??0),0);console.log(JSON.stringify({stage:'transcribed',...report}));
   stage='adaptation';const material=attachTranscription(source,segments,provider);const before=performance.now();
   const adapted=await createLearningProvider({region:process.env.AWS_REGION}).adaptSource!(material,{needs:['read-spoken'],description:'I need readable content instead of audio.',focus:''},AbortSignal.timeout(600000)) as {sections:{paragraphs:string[]}[]};
   report.adaptationMs=Math.round(performance.now()-before);report.sections=adapted.sections.length;report.completeTranscriptPreserved=true;report.success=true;
 }catch(error){report.success=false;report.stage=stage;report.error=safeDiagnostic(error);}
 report.elapsedMs=Math.round(performance.now()-started);await writeFile('docs/mvp-material-limit-live-audio.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
void main();
